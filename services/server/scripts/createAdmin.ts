import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { createHash, randomUUID } from "node:crypto";
import { extname, isAbsolute, join, relative, sep } from "node:path";
import { lstat, readFile, realpath, readdir } from "@toonflow/file";
import { z } from "zod";
import * as database from "../src/utils/database";
import * as secrets from "../src/utils/database/secrets";
import { passwordSchema, usernameSchema, writeConfiguration } from "../src/utils/accounts";
import { isMediaPath } from "../src/utils/mediaStorage/files";
import { mediaType, validateMedia, maxMediaBytes } from "../src/utils/mediaStorage";

// ACT: 只由维护者在容器本地交互执行；不接受密码参数、HTTP初始化或自动迁移。
if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("管理员初始化必须在受控交互终端执行");
const rootPath = process.env.TOONFLOW_DATA_DIR;
if (!rootPath || !isAbsolute(rootPath)) throw new Error("请显式设置绝对路径 TOONFLOW_DATA_DIR");
if ((await lstat(rootPath)).isSymbolicLink()) throw new Error("数据目录不能是符号链接");
const root = await realpath(rootPath);
await database.initialize();
await secrets.initialize();
await database.health();
const [existing] = await database.run(sql => sql`SELECT COUNT(*) AS total FROM users`);
if (Number(existing.total)) throw new Error("实例已有账号，未重置密码或重新认领旧资料");
const sourceHash = createHash("sha256");

async function readLegacy(path: string, fallback: unknown) {
  const file = join(root, path);
  const info = await lstat(file).catch((cause: NodeJS.ErrnoException) => { if (cause.code === "ENOENT") return undefined; throw cause; });
  if (!info) { sourceHash.update(path).update(":missing\n"); return fallback; }
  if (!info.isFile() || info.isSymbolicLink() || info.size > 16 * 1024 * 1024) throw new Error(`来源不是有效的普通JSON文件：${path}`);
  const actual = await realpath(file);
  if (actual !== file) throw new Error(`来源路径包含符号链接：${path}`);
  const bytes = await readFile(actual);
  if (bytes.byteLength > 16 * 1024 * 1024) throw new Error("旧索引超过16 MiB，未导入");
  sourceHash.update(path).update("\0").update(bytes).update("\n");
  return JSON.parse(bytes.toString("utf8"));
}

const configuration = z.record(z.string(), z.json()).parse(await readLegacy("settings.json", {}));
for (const key of Object.keys(configuration)) if (!["settings", "disabledSkills", "toolConfigs", "nodeConfigs", "extConfigs"].includes(key)) delete configuration[key];
const settings = z.record(z.string(), z.json()).parse(configuration.settings ?? {});
// 实例监听和更新配置继续由原conf单例保管，不导入个人配置或回传浏览器。
for (const key of ["mcp", "desktopUpdateSource", "desktopUpdateCustomUrl"]) delete settings[key];
const legacyStores = z.record(z.string(), z.json()).parse(settings.stores ?? {});
const stores = z.object({ "toonflow.projectList": z.json().optional(), "aiStudio.assetTags": z.json().optional() }).strict()
  .parse(await readLegacy("studioState.json", Object.fromEntries(Object.entries(legacyStores).filter(([key]) => ["toonflow.projectList", "aiStudio.assetTags"].includes(key)))));
const projectState = stores["toonflow.projectList"];
if (projectState) {
  const value = z.object({ projectList: z.array(z.object({ directory: z.string(), name: z.string(), lastOpenedAt: z.number() }).passthrough()) }).passthrough().parse(projectState);
  for (const project of value.projectList) {
    const path = await realpath(project.directory);
    const offset = relative(join(root, "workspaces"), path);
    if (offset === ".." || offset.startsWith(`..${sep}`) || isAbsolute(offset) || !(await lstat(path)).isDirectory()) throw new Error("旧项目不在服务器workspaces内，未接管");
  }
}
const templates = z.array(z.object({ id: z.string(), name: z.string(), prompt: z.string(), category: z.string(), kind: z.enum(["image", "video"]),
  media: z.object({ path: z.string(), mimeType: z.string(), name: z.string() }).passthrough(), references: z.array(z.object({ path: z.string(), mimeType: z.string(), name: z.string() }).passthrough()),
}).passthrough()).parse(await readLegacy("templates/templates.json", []));
const removedTemplates = z.array(z.string()).parse(await readLegacy("templates/removedTemplates.json", []));
settings.stores = Object.fromEntries(Object.entries(legacyStores).filter(([key]) => !["toonflow.projectList", "aiStudio.assetTags"].includes(key)));
configuration.settings = settings;
const media: { id: string; logicalPath: string; pathHash: string; mimeType: string; size: number; revision: string; modified: number }[] = [];
async function inspectMedia(path: string) {
  const info = await lstat(path);
  if (info.isSymbolicLink() || await realpath(path) !== path) throw new Error("旧资料包含符号链接，未接管");
  if (info.isDirectory()) {
    for (const name of await readdir(path)) {
      if (name.startsWith(".afxenMedia")) throw new Error("发现未完成媒体处理结果，请人工处理后再接管");
      await inspectMedia(join(path, name));
    }
    return;
  }
  if (!info.isFile()) throw new Error("旧资料包含特殊文件，未接管");
  if (info.size > maxMediaBytes) { if (isMediaPath(path)) throw new Error("旧媒体超过100 MiB，请先人工核对"); return; }
  const bytes = await readFile(path);
  if (!isMediaPath(path) && !/^(image|video|audio)\//.test(mediaType(bytes))) return;
  const mimeType = validateMedia(bytes, extname(path).toLowerCase() === ".pcm" ? "audio/pcm" : undefined);
  const logicalPath = relative(root, path).split(sep).join("/");
  const revision = createHash("sha256").update(bytes).digest("hex");
  sourceHash.update(logicalPath).update("\0").update(revision).update("\n");
  media.push({ id: randomUUID(), logicalPath, pathHash: createHash("sha256").update(logicalPath).digest("hex"), mimeType, size: bytes.length, revision, modified: info.mtimeMs });
  if (media.length > 100000) throw new Error("旧媒体超过10万条，请另行规划批次接管；本次未写入");
}
for (const name of ["workspaces", "assets", "templates", "singleAgent", "ai", "personalization", "memories"]) {
  const path = join(root, name);
  const info = await lstat(path).catch((cause: NodeJS.ErrnoException) => { if (cause.code === "ENOENT") return undefined; throw cause; });
  if (info) await inspectMedia(path);
}
const sourceDigest = sourceHash.digest("hex");
let hidden = false;
const output = new Writable({ write(chunk, _encoding, callback) { if (!hidden) process.stdout.write(chunk); callback(); } });
const terminal = createInterface({ input: process.stdin, output, terminal: true });
try {
  const username = usernameSchema.parse((await terminal.question("初始管理员用户名（3–64位字母/数字/点）：")).trim()).toLowerCase();
  const name = z.string().min(1).max(80).parse((await terminal.question("显示名称：")).trim());
  process.stdout.write("密码（15–128字符，输入隐藏）：");
  hidden = true;
  const password = passwordSchema.parse(await terminal.question(""));
  process.stdout.write("\n再次输入密码：");
  if (await terminal.question("") !== password) throw new Error("两次密码不一致，未创建账号");
  hidden = false;
  process.stdout.write("\n");
  const passwordHash = await Bun.password.hash(password, { algorithm: "argon2id" });
  const id = randomUUID();
  await database.run(sql => sql.begin(async transaction => {
    await transaction`SELECT version FROM schemaMigrations WHERE version = 1 FOR UPDATE`;
    const [current] = await transaction`SELECT COUNT(*) AS total FROM users`;
    if (Number(current.total)) throw new Error("其它初始化已建立账号，本次未写入");
    await transaction`INSERT INTO users (id, username, name, role, enabled, passwordHash, authVersion, mustChangePassword, legacyRoot, createdAt)
      VALUES (${id}, ${username}, ${name}, 'admin', 1, ${passwordHash}, 1, 0, 1, ${Date.now()})`;
    await writeConfiguration(transaction, id, configuration);
    const state = JSON.stringify(stores);
    await transaction`INSERT INTO creationStates (userId, payload, revision) VALUES (${id}, ${state}, ${createHash("sha256").update(state).digest("hex")})`;
    for (const [key, value] of [["templates.json", templates], ["removedTemplates.json", removedTemplates]] as const) {
      const content = JSON.stringify(value);
      await transaction`INSERT INTO libraryStates (userId, library, name, content, revision) VALUES (${id}, 'templates', ${key}, ${content}, ${createHash("sha256").update(content).digest("hex")})`;
    }
    await transaction`INSERT INTO dataImports (id, userId, sourceDigest, completedAt) VALUES ('legacyShared', ${id}, ${sourceDigest}, ${Date.now()})`;
    for (const item of media) {
      const path = join(root, item.logicalPath);
      const info = await lstat(path);
      if (info.isSymbolicLink() || info.size !== item.size || info.mtimeMs !== item.modified || await realpath(path) !== path
        || createHash("sha256").update(await readFile(path)).digest("hex") !== item.revision) throw new Error("旧媒体在接管期间发生变化，事务未提交；请停止旧实例后重试");
      await transaction`INSERT INTO mediaFiles (id, userId, logicalPath, pathHash, locationHash, storageKind, bucket, object, mimeType, size, revision, status, createdAt)
        VALUES (${item.id}, ${id}, ${item.logicalPath}, ${item.pathHash}, ${item.pathHash}, 'local', NULL, NULL, ${item.mimeType}, ${item.size}, ${item.revision}, 'active', ${Date.now()})`;
    }
    const [verified] = await transaction`SELECT id, legacyRoot FROM users WHERE id = ${id}`;
    if (!verified?.legacyRoot) throw new Error("管理员接管回读不一致");
  }));
  console.log("初始管理员及旧资料归属已提交；原文件未改动。请登录后核对项目、资产及模型配置。");
} finally { terminal.close(); }
