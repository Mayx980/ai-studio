import { createHash, randomUUID } from "node:crypto";
import { dirname, extname, join, relative, sep } from "node:path";
import { lstat, readFile, mkdtemp, rm, writeAtomic } from "@toonflow/file";
import { authorizePath, requireAccount, userRoot, usesAccounts } from "@/utils/accounts/context";
import * as database from "@/utils/database";
import * as storage from "./index";
import { z } from "zod";
import { assertWriteAccess } from "@/utils/accounts";

export type MediaRecord = { id: string; userId: string; logicalPath: string; pathHash: string; storageKind: "local" | "oss";
  bucket: string | null; object: string | null; mimeType: string; size: number; revision: string; status: string; createdAt: number };

export function isMediaPath(path: string) { return /\.(png|jpe?g|webp|gif|avif|bmp|tiff?|svg|ico|mp4|webm|mov|m4v|ogv|mp3|wav|ogg|m4a|aac|flac|opus|pcm)$/i.test(path); }
function digest(value: string | Uint8Array) { return createHash("sha256").update(value).digest("hex"); }
function userDataPath(path: string) {
  if (!usesAccounts()) return false;
  const value = relative(userRoot(), path).split(sep).join("/");
  return ["workspaces", "assets", "templates", "singleAgent", "ai", "personalization", "memories"].includes(value.split("/")[0]!) || value === "AGENTS.md";
}
function location(path: string) {
  authorizePath(path);
  const logicalPath = relative(userRoot(), path).split(sep).join("/");
  return { userId: requireAccount().user.id, logicalPath, pathHash: digest(logicalPath) };
}
function missing() { return Object.assign(new Error("找不到这个媒体文件"), { status: 404, code: "ENOENT" }); }

function libraryIndex(path: string) {
  if (!usesAccounts()) return;
  const candidate = relative(userRoot(), path).split(sep).join("/");
  const [library, name, extra] = candidate.split("/");
  if (!extra && library === "templates" && ["templates.json", "removedTemplates.json"].includes(name!)) return { ...location(path), library, name: name! };
}
export function isLibraryIndex(path: string) { return !!libraryIndex(path); }

export async function withLocalFile<T>(path: string, operation: (path: string) => Promise<T>, signal?: AbortSignal): Promise<T> {
  const record = await lookup(path);
  if (record?.storageKind !== "oss") return operation(path);
  const bytes = await read(path, signal);
  const directory = await mkdtemp(join(dirname(path), ".afxenMedia"));
  try {
    const local = join(directory, `source${extname(path)}`);
    await writeAtomic(local, bytes, { exclusive: true });
    signal?.throwIfAborted();
    return await operation(local);
  } finally { await rm(directory, { recursive: true }); }
}

async function readLibrary(path: string) {
  const index = libraryIndex(path);
  if (!index) return;
  return database.run(async sql => {
    const [row] = await sql`SELECT content, deleted FROM libraryStates WHERE userId = ${index.userId} AND library = ${index.library} AND name = ${index.name}`;
    if (!row || row.deleted) throw missing();
    return Buffer.from(row.content, "utf8");
  });
}

export async function lookup(path: string, includeInactive = false): Promise<MediaRecord | undefined> {
  if (!userDataPath(path)) return;
  const value = location(path);
  return database.run(async sql => {
    const [row] = await sql`SELECT * FROM mediaFiles WHERE userId = ${value.userId} AND pathHash = ${value.pathHash}
      ORDER BY (status = 'active') DESC, createdAt DESC, id DESC LIMIT 1`;
    if (row && (row.logicalPath !== value.logicalPath || (!includeInactive && row.status !== "active"))) throw missing();
    return row as MediaRecord | undefined;
  });
}

export async function read(path: string, signal?: AbortSignal) {
  authorizePath(path);
  const content = await readLibrary(path);
  if (content) return content;
  const record = await lookup(path);
  if (record?.storageKind !== "oss") return readFile(path, { signal });
  const bytes = await storage.read(record.bucket!, record.object!, signal, record.mimeType);
  if (bytes.byteLength !== Number(record.size) || digest(bytes) !== record.revision) throw Object.assign(new Error("云媒体完整性校验失败，未使用损坏内容"), { status: 502 });
  return bytes;
}

export async function info(path: string) {
  const content = await readLibrary(path);
  if (content) return { size: content.length, mtimeMs: 0, ctimeMs: 0, isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false };
  const record = await lookup(path);
  if (!record || record.storageKind === "local") return lstat(path);
  return { size: Number(record.size), mtimeMs: Number(record.createdAt), ctimeMs: Number(record.createdAt),
    isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false };
}

export async function save(path: string, bytes: Uint8Array, exclusive: boolean) {
  const index = libraryIndex(path);
  if (index) {
    if (bytes.byteLength > 16 * 1024 * 1024) throw Object.assign(new Error("模板索引超过16 MiB"), { status: 413 });
    const content = Buffer.from(bytes).toString("utf8");
    const value = z.array(z.json()).parse(JSON.parse(content));
    if (index.name === "removedTemplates.json") z.array(z.string()).parse(value);
    await database.run(sql => sql.begin(async transaction => {
      await assertWriteAccess(transaction);
      const [row] = await transaction`SELECT revision, deleted FROM libraryStates WHERE userId = ${index.userId} AND library = ${index.library} AND name = ${index.name} FOR UPDATE`;
      if (exclusive && row && !row.deleted) throw Object.assign(new Error("索引已存在，未覆盖"), { status: 409, code: "EEXIST" });
      if (row) await transaction`UPDATE libraryStates SET content = ${content}, revision = ${digest(content)}, deleted = 0 WHERE userId = ${index.userId} AND library = ${index.library} AND name = ${index.name}`;
      else await transaction`INSERT INTO libraryStates (userId, library, name, content, revision) VALUES (${index.userId}, ${index.library}, ${index.name}, ${content}, ${digest(content)})`;
    }));
    return true;
  }
  if (!userDataPath(path)) return false;
  const existing = await lookup(path, true);
  if (!existing && !isMediaPath(path) && !/^(image|video|audio)\//.test(storage.mediaType(bytes))) return false;
  const config = storage.requireConfiguration();
  const mimeType = storage.validateMedia(bytes, extname(path).toLowerCase() === ".pcm" ? "audio/pcm" : undefined);
  const value = location(path);
  let previous = existing?.status === "active" ? existing : undefined;
  const local = !existing && await lstat(path).catch((cause: NodeJS.ErrnoException) => { if (cause.code === "ENOENT") return undefined; throw cause; });
  if (exclusive && (previous || local)) throw Object.assign(new Error("已存在同名媒体，原内容未覆盖"), { status: 409, code: "EEXIST" });
  if (local && (!local.isFile() || local.isSymbolicLink())) throw Object.assign(new Error("目标不是普通文件"), { status: 403 });
  if (local) {
    if (local.size > storage.maxMediaBytes) throw Object.assign(new Error("原媒体超过100 MiB，未覆盖"), { status: 413 });
    const original = await readFile(path);
    const localType = storage.validateMedia(original, extname(path).toLowerCase() === ".pcm" ? "audio/pcm" : undefined);
    const localId = randomUUID();
    await database.run(sql => sql`INSERT INTO mediaFiles (id, userId, logicalPath, pathHash, locationHash, storageKind, bucket, object, mimeType, size, revision, status, createdAt)
      VALUES (${localId}, ${value.userId}, ${value.logicalPath}, ${value.pathHash}, ${value.pathHash}, 'local', NULL, NULL, ${localType}, ${original.length}, ${digest(original)}, 'active', ${Date.now()})`);
    previous = await lookup(path);
  }
  const id = randomUUID();
  const object = `${config.prefix}/users/${value.userId}/${id}`;
  const revision = digest(bytes);
  // ACT: 先登记本次不可变对象的待处理位置。上传结果未知或SQL发布失败时保留记录，绝不假称已回收云对象。
  await database.run(sql => sql`INSERT INTO mediaFiles (id, userId, logicalPath, pathHash, locationHash, storageKind, bucket, object, mimeType, size, revision, status, createdAt)
    VALUES (${id}, ${value.userId}, ${value.logicalPath}, ${value.pathHash}, NULL, 'oss', ${config.bucket}, ${object}, ${mimeType}, ${bytes.byteLength}, ${revision}, 'pending', ${Date.now()})`);
  await storage.save(object, bytes, mimeType);
  try {
    await database.run(sql => sql.begin(async transaction => {
      await assertWriteAccess(transaction);
      const [current] = await transaction`SELECT id, revision FROM mediaFiles WHERE userId = ${value.userId} AND locationHash = ${value.pathHash} FOR UPDATE`;
      if ((current?.id ?? null) !== (previous?.id ?? null) || (current && current.revision !== previous?.revision)) {
        throw Object.assign(new Error("媒体已被其它页面修改，未覆盖当前版本"), { status: 409, code: "ESTALE" });
      }
      if (current) await transaction`UPDATE mediaFiles SET status = 'retired', locationHash = NULL WHERE id = ${current.id} AND userId = ${value.userId}`;
      await transaction`UPDATE mediaFiles SET status = 'active', locationHash = ${value.pathHash} WHERE id = ${id} AND userId = ${value.userId} AND status = 'pending'`;
    }));
  } catch (cause) {
    throw Object.assign(new Error(`云媒体已上传，但业务发布未完成；未覆盖既有内容。待处理媒体编号：${id}`, { cause }), { status: (cause as { status?: number }).status ?? 503, code: "EMEDIAPENDING" });
  }
  return true;
}

export async function list(directory: string) {
  if (!userDataPath(directory)) return [];
  const value = location(directory);
  const prefix = `${value.logicalPath}/`;
  return database.run(async sql => {
    const rows: { logicalPath: string; status: string }[] = await sql`SELECT logicalPath, status FROM mediaFiles WHERE userId = ${value.userId}
      AND LEFT(logicalPath, ${prefix.length}) = ${prefix} ORDER BY createdAt, id LIMIT 10001`;
    if (rows.length > 10000) throw Object.assign(new Error("目录媒体记录超过一万项，请选择具体子目录"), { status: 413 });
    const entries = new Map<string, { name: string; status: string }>();
    for (const row of rows) {
      const name = row.logicalPath.slice(prefix.length);
      if (!name.includes("/") && entries.get(name)?.status !== "active") entries.set(name, { name, status: row.status });
    }
    if (["templates", "assets"].includes(value.logicalPath)) {
      const indexes: { name: string; deleted: number }[] = await sql`SELECT name, deleted FROM libraryStates WHERE userId = ${value.userId} AND library = ${value.logicalPath}`;
      for (const index of indexes) entries.set(index.name, { name: index.name, status: index.deleted ? "deleted" : "active" });
    }
    return [...entries.values()];
  });
}

export async function remove(path: string, recursive: boolean) {
  if (!userDataPath(path)) return false;
  const index = libraryIndex(path);
  if (index) {
    await database.run(sql => sql`UPDATE libraryStates SET deleted = 1 WHERE userId = ${index.userId} AND library = ${index.library} AND name = ${index.name}`);
    return true;
  }
  const value = location(path);
  const prefix = `${value.logicalPath}/`;
  return database.run(sql => sql.begin(async transaction => {
    const rows: { id: string; logicalPath: string }[] = await transaction`SELECT id, logicalPath FROM mediaFiles WHERE userId = ${value.userId} AND status = 'active'
      AND (logicalPath = ${value.logicalPath} OR LEFT(logicalPath, ${prefix.length}) = ${prefix}) FOR UPDATE`;
    if (!recursive && rows.some(row => row.logicalPath !== value.logicalPath)) throw Object.assign(new Error("文件夹仍有媒体内容"), { status: 409, code: "ENOTEMPTY" });
    for (const row of rows) await transaction`UPDATE mediaFiles SET status = 'deleted', locationHash = NULL WHERE id = ${row.id} AND userId = ${value.userId}`;
    return rows.some(row => row.logicalPath === value.logicalPath);
  }));
}

export async function move(source: string, target: string) {
  if (!userDataPath(source)) return;
  const from = location(source), to = location(target);
  const prefix = `${from.logicalPath}/`;
  await database.run(sql => sql.begin(async transaction => {
    const rows: { id: string; logicalPath: string }[] = await transaction`SELECT id, logicalPath FROM mediaFiles WHERE userId = ${from.userId} AND status = 'active'
      AND (logicalPath = ${from.logicalPath} OR LEFT(logicalPath, ${prefix.length}) = ${prefix}) FOR UPDATE`;
    for (const row of rows) {
      const path = `${to.logicalPath}${row.logicalPath.slice(from.logicalPath.length)}`;
      await transaction`UPDATE mediaFiles SET logicalPath = ${path}, pathHash = ${digest(path)}, locationHash = ${digest(path)} WHERE id = ${row.id} AND userId = ${from.userId}`;
    }
  }));
}

export async function copy(source: string, target: string) {
  const record = await lookup(source);
  if (!record) return false;
  await save(target, await read(source), true);
  return true;
}
