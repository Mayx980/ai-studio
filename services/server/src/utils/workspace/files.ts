import { constants, copyFile, lstat, mkdir, rename, unlink, realpath, writeAtomic, readdir, rm, rmdir } from "@toonflow/file";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type { Request } from "express";
import { resolveWorkspace } from "@/utils/workspace";
import { authorizePath } from "@/utils/accounts/context";
import * as mediaFiles from "@/utils/mediaStorage/files";
import { assertWriteAccess } from "@/utils/accounts";

export const readWorkspaceFile = mediaFiles.read;
export const statWorkspaceFile = mediaFiles.info;

export async function listWorkspaceFiles(path: string) {
  const entries = await readdir(path, { withFileTypes: true });
  const values = new Map(entries.filter(entry => !entry.name.startsWith(".afxenMedia")).map(entry => [entry.name, { name: entry.name, isFile: () => entry.isFile(), isDirectory: () => entry.isDirectory(), isSymbolicLink: () => entry.isSymbolicLink() }]));
  for (const entry of await mediaFiles.list(path)) {
    if (entry.status === "active") values.set(entry.name, { name: entry.name, isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false });
    else if (entry.status !== "pending") values.delete(entry.name);
  }
  return [...values.values()];
}

export async function removeWorkspaceFile(path: string, recursive = false) {
  await assertWriteAccess();
  if (await mediaFiles.remove(path, recursive)) return;
  if ((await lstat(path)).isDirectory() && !recursive) await rmdir(path);
  else await rm(path, { recursive });
}

export async function writeWorkspaceFile(path: string, content: string | Uint8Array, exclusive = false) {
  await assertWriteAccess();
  if (await mediaFiles.save(path, typeof content === "string" ? Buffer.from(content) : content, exclusive)) return;
  await writeAtomic(path, content, { exclusive });
}

export async function copyWorkspaceFile(source: string, target: string) {
  await assertWriteAccess();
  const info = await statWorkspaceFile(source);
  if (info.isSymbolicLink() || (!info.isFile() && !info.isDirectory())) throw Object.assign(new Error("只能复制普通文件或文件夹"), { status: 403 });
  if (!info.isDirectory()) {
    if (mediaFiles.isMediaPath(target) || mediaFiles.isLibraryIndex(source) || await mediaFiles.lookup(source)) return writeWorkspaceFile(target, await readWorkspaceFile(source), true);
    return copyFile(source, target, constants.COPYFILE_EXCL);
  }
  if (isWithin(source, target)) throw Object.assign(new Error("不能把文件夹复制到自身或子目录"), { status: 400 });
  await mkdir(target);
  try {
    for (const entry of await listWorkspaceFiles(source)) {
      if (entry.isSymbolicLink() || (!entry.isFile() && !entry.isDirectory())) throw new Error("不能复制包含符号链接或特殊文件的文件夹");
      const checked = await resolveWorkspacePath(source, entry.name);
      await copyWorkspaceFile(checked.path, resolve(target, entry.name));
    }
  } catch (cause) {
    // ACT: 失败保留已复制内容，不递归回滚删除可能被外部加入文件的目标目录。
    throw Object.assign(new Error(`复制未完成，已复制的内容保留在 ${target}。${cause instanceof Error ? cause.message : "请检查文件权限后重试"}`, { cause }), { code: "ECOPYINCOMPLETE" });
  }
}

export async function renameWorkspaceFile(source: string, target: string) {
  await assertWriteAccess();
  if (mediaFiles.isLibraryIndex(source) || mediaFiles.isLibraryIndex(target)) throw Object.assign(new Error("模板索引固定由数据库管理，不能移动或重命名"), { status: 403 });
  const info = await statWorkspaceFile(source);
  if (source === target || (process.platform === "win32" && source.toLowerCase() === target.toLowerCase())) {
    if (source !== target) await rename(source, target);
    return;
  }
  const destination = await statWorkspaceFile(target).catch((cause: NodeJS.ErrnoException) => { if (cause.code === "ENOENT") return undefined; throw cause; });
  if (destination) throw Object.assign(new Error("已存在同名文件或目录"), { code: "EEXIST" });
  const media = await mediaFiles.lookup(source);
  if (media?.storageKind === "oss") { await mediaFiles.move(source, target); return; }
  if (info.isDirectory()) {
    const exists = await lstat(target).catch((err: NodeJS.ErrnoException) => { if (err.code === "ENOENT") return null; throw err; });
    if (exists) throw Object.assign(new Error("已存在同名文件或目录"), { code: "EEXIST" });
    await rename(source, target);
    try { await mediaFiles.move(source, target); }
    catch (cause) { throw Object.assign(new Error(`目录已移动到 ${target}，媒体索引更新失败；请保留目录并联系管理员，不要重复移动`, { cause }), { status: 503, code: "EMOVEINCOMPLETE" }); }
    return;
  }
  await copyFile(source, target, constants.COPYFILE_EXCL);
  // ACT: 目标完整写入后才移除源文件；移除失败只回滚本次目标。
  try { await unlink(source); }
  catch (err) {
    await unlink(target).catch(error => console.warn(`重命名回滚失败：${target}`, error));
    throw err;
  }
  try { await mediaFiles.move(source, target); }
  catch (cause) { throw Object.assign(new Error(`文件已移动到 ${target}，媒体索引更新失败；请保留文件并联系管理员，不要重复移动`, { cause }), { status: 503, code: "EMOVEINCOMPLETE" }); }
}

export function isWithin(root: string, path: string) {
  const offset = relative(root, path);
  return offset !== ".." && !offset.startsWith(`..${sep}`) && !isAbsolute(offset);
}

export async function resolveWorkspaceFile(req: Request, directory: string, path: string) {
  const root = await resolveWorkspace(req, directory);
  return resolveWorkspacePath(root, path);
}

export async function resolveWorkspacePath(root: string, path: string, allowMissingParents = false, systemRead = false) {
  if (isAbsolute(path) || path.split(/[\\/]/).some(part => part === ".." || /[<>:"|?*\x00-\x1f]/.test(part)
    || (process.platform === "win32" && part !== "." && (/[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))))) {
    throw Object.assign(new Error("文件路径无效"), { status: 400 });
  }
  const target = resolve(root, path);
  const info = await lstat(target).catch((err: NodeJS.ErrnoException) => { if (err.code === "ENOENT") return null; throw err; });
  if (info?.isSymbolicLink()) throw Object.assign(new Error("不能通过符号链接操作文件"), { status: 403 });
  let parent = dirname(target);
  if (!info && allowMissingParents) {
    while (!(await lstat(parent).catch((err: NodeJS.ErrnoException) => { if (err.code === "ENOENT") return null; throw err; }))) parent = dirname(parent);
  }
  const actual = info ? await realpath(target) : resolve(await realpath(parent), relative(parent, target));
  if (!isWithin(root, actual)) throw Object.assign(new Error("只能操作当前工作区内的文件"), { status: 403 });
  authorizePath(actual, systemRead);
  return { directory: root, path: actual };
}

// ACT: 桌面和独立 Server 均为单进程；锁防止并发文件操作互相覆盖。
const busyFiles = new Set<string>();
export function lockWorkspaceFiles(paths: string[]) {
  const keys = paths.map(path => process.platform === "win32" ? resolve(path).toLowerCase() : resolve(path));
  if (keys.some(path => [...busyFiles].some(busy => isWithin(path, busy) || isWithin(busy, path)))) {
    throw Object.assign(new Error("文件正在使用，请等待操作完成"), { status: 409, code: "EBUSY" });
  }
  keys.forEach(path => busyFiles.add(path));
  return () => keys.forEach(path => busyFiles.delete(path));
}

export function protectWorkspaceRoot(directory: string, path: string) {
  if (directory === path) throw Object.assign(new Error("不能修改工作区根目录"), { status: 400 });
}
