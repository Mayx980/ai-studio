import { createHash, randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { lstat, mkdir, readFile, realpath, rmdir } from "@toonflow/file";
import { z } from "zod";
import conf from "@/utils/conf";
import { lockWorkspaceFiles, resolveWorkspacePath, writeWorkspaceFile } from "@/utils/workspace/files";

const storeKeys = ["toonflow.projectList", "aiStudio.assetTags"] as const;
const storesSchema = z.partialRecord(z.enum(storeKeys), z.json());
const maxStateBytes = 16 * 1024 * 1024;
export const stateSchema = z.object({ revision: z.string().regex(/^[a-f0-9]{64}$/), stores: storesSchema });

function revision(content: Uint8Array) {
  return createHash("sha256").update(content).digest("hex");
}

async function statePath() {
  return (await resolveWorkspacePath(dirname(conf.path), "studioState.json")).path;
}

async function loadState(path: string) {
  const info = await lstat(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (info) {
    if (!info.isFile()) throw new Error("创作索引必须是普通文件");
    if (info.size > maxStateBytes) throw Object.assign(new Error("创作索引超过 16 MiB，请保留文件并联系维护者"), { status: 413 });
    const content = await readFile(path);
    if (content.length > maxStateBytes) throw Object.assign(new Error("创作索引超过 16 MiB"), { status: 413 });
    return { stores: storesSchema.parse(JSON.parse(content.toString("utf8"))), revision: revision(content), present: true };
  }
  const legacy = conf.get("settings.stores");
  const stores = storesSchema.parse(legacy && typeof legacy === "object" && !Array.isArray(legacy)
    ? Object.fromEntries(Object.entries(legacy).filter(([key]) => storeKeys.some(item => item === key))) : {});
  return { stores, revision: revision(Buffer.from(JSON.stringify(stores))), present: false };
}

export async function readState() {
  const { stores, revision } = await loadState(await statePath());
  return { stores, revision };
}

export async function saveState(expectedRevision: string, value: unknown) {
  const stores = storesSchema.parse(value);
  const content = Buffer.from(`${JSON.stringify(stores, null, 2)}\n`);
  if (content.length > maxStateBytes) throw Object.assign(new Error("创作索引超过 16 MiB"), { status: 413 });
  const path = await statePath();
  const release = lockWorkspaceFiles([path]);
  try {
    const current = await loadState(path);
    if (current.revision !== expectedRevision) {
      throw Object.assign(new Error("共享数据已被其它页面修改，当前内容未覆盖服务端；请保留当前内容并刷新后重试"), { status: 409, code: "ESTALE" });
    }
    // ACT: 单进程完整快照上限 16 MiB；更大规模应改为业务独立索引，不能放宽冲突校验。
    await writeWorkspaceFile(path, content, !current.present);
    return { stores, revision: revision(content) };
  } finally { release(); }
}

export async function createWorkspace(name: string, initializeCanvas = true) {
  const title = name.trim();
  if (!title || title.length > 80) throw Object.assign(new Error("请输入1–80个字符的项目名称"), { status: 400 });
  const root = (await resolveWorkspacePath(dirname(conf.path), "workspaces")).path;
  await mkdir(root, { recursive: true });
  const directory = join(await realpath(root), `project${randomUUID().replaceAll("-", "")}`);
  // ACT: 显示名在共享索引中维护；磁盘 ID 不随项目重命名变化。
  await mkdir(directory);
  try {
    if (initializeCanvas) await writeWorkspaceFile(join(directory, "画布1.json"), `${JSON.stringify({ toonflowCanvas: true, nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }, null, 2)}\n`, true);
    return { directory };
  } catch (cause) {
    try { await rmdir(directory); }
    catch { throw new Error(`项目创建未完成，目录中的内容保留在 ${directory}`, { cause }); }
    throw cause;
  }
}
