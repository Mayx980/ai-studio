import { StudioError } from "@/ports";
import { ElMessage } from "element-plus";
import { studioFetch } from "./studioFetch";
import type { TextSnapshot } from "@/lib/workspaceFiles";
import type { NativeWorkspaceReader } from "@/ports/prototype";

// ACT: 当前设计原型使用浏览器工作区；目录字符串仅作项目标识，不作为系统写入路径。
type Entry = { directory: string; path: string; type: "file" | "directory"; blob?: Blob; revision?: string; encoding?: TextSnapshot["encoding"] };
const initializing = new Map<string, Promise<void>>();

function fileError(code: string, message: string) {
  const status = code === "ENOENT" ? 404 : 409;
  return new StudioError(message, { message, data: { code } }, status, {}, false, code);
}
function relativePath(path: string) {
  if (typeof path !== "string" || /^[\\/]/.test(path) || path.includes("\0") || path.split(/[\\/]/).includes("..")) throw new Error("浏览器项目内的文件路径无效");
  return path.replaceAll("\\", "/").split("/").filter(part => part && part !== ".").join("/");
}
function parentPath(path: string) { return path.slice(0, Math.max(0, path.lastIndexOf("/"))); }
async function revision(blob: Blob) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()))].map(value => value.toString(16).padStart(2, "0")).join("");
}
async function access<T>(directory: string, action: (entries: Map<string, Entry>, store: IDBObjectStore) => T): Promise<T> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("aiStudio.workspaces", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("files", { keyPath: ["directory", "path"] }).createIndex("directory", "directory");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction("files", "readwrite");
      const store = transaction.objectStore("files");
      const request = store.index("directory").getAll(directory);
      let value: T;
      let failure: unknown;
      request.onsuccess = () => {
        try { value = action(new Map((request.result as Entry[]).map(entry => [entry.path, entry])), store); }
        catch (error) { failure = error; transaction.abort(); }
      };
      transaction.oncomplete = () => resolve(value);
      transaction.onabort = () => reject(failure ?? transaction.error ?? new Error("浏览器保存失败，请检查存储空间及浏览器设置"));
    });
  } finally { database.close(); }
}

export function createBrowserWorkspaceFiles(getDirectory: () => string, nativeFiles: NativeWorkspaceReader) {
  async function initialize() {
    const directory = getDirectory();
    let pending = initializing.get(directory);
    if (!pending) {
      pending = (async () => {
        if (await access(directory, entries => entries.has(""))) return;
        const imported: Entry[] = [{ directory, path: "", type: "directory" }];
        // 只读迁移旧项目。旧目录不可读取时保留原目录，浏览器项目可独立使用。
        if (!directory.startsWith("browser:")) {
          try {
            const collect = async (path = "") => {
              const { entries } = await nativeFiles.list(path, AbortSignal.timeout(15000), directory);
              for (const entry of entries) {
                const name = relativePath(entry.path);
                if (entry.type === "directory") { imported.push({ directory, path: name, type: "directory" }); await collect(name); }
                else {
                  const blob = new Blob([await nativeFiles.read(name, directory)]);
                  imported.push({ directory, path: name, type: "file", blob, revision: await revision(blob) });
                }
              }
            };
            await collect();
          } catch {
            imported.splice(1);
            ElMessage.warning("旧目录无法读取，已创建独立的浏览器项目；旧目录中的文件未改动，也未导入。");
          }
        }
        await access(directory, (entries, store) => {
          if (!entries.has("")) for (const entry of imported) store.put(entry);
        });
      })();
      initializing.set(directory, pending);
      void pending.catch(() => initializing.delete(directory));
    }
    await pending;
    return directory;
  }
  async function list(path = "", signal?: AbortSignal) {
    signal?.throwIfAborted();
    const directory = await initialize();
    path = relativePath(path);
    return access(directory, entries => {
      if (entries.get(path)?.type !== "directory") throw fileError("ENOENT", "浏览器项目目录不存在");
      const children = [...entries.values()].filter(entry => entry.path && parentPath(entry.path) === path);
      return { directory, empty: children.length === 0, entries: children.map(entry => ({ name: entry.path.split("/").at(-1)!, path: entry.path, type: entry.type })).sort((a, b) => a.name.localeCompare(b.name)) };
    });
  }
  async function readBlob(path: string) {
    const directory = await initialize();
    path = relativePath(path);
    return access(directory, entries => {
      const entry = entries.get(path);
      if (entry?.type !== "file" || !entry.blob) throw fileError("ENOENT", "浏览器项目文件不存在");
      return entry.blob;
    });
  }
  async function read(path: string) { return (await readBlob(path)).arrayBuffer(); }
  async function write(path: string, content: string | Blob | ArrayBuffer, exclusive = false, expectedRevision?: string, encoding?: TextSnapshot["encoding"]) {
    const directory = await initialize();
    path = relativePath(path);
    if (!path) throw new Error("不能覆盖浏览器项目根目录");
    const blob = content instanceof Blob ? content : new Blob([content]);
    const nextRevision = await revision(blob);
    return access(directory, (entries, store) => {
      if (entries.get(parentPath(path))?.type !== "directory") throw fileError("ENOENT", "请先创建目标文件夹");
      const current = entries.get(path);
      if (exclusive && current) throw fileError("EEXIST", "这个名称已存在，原内容未被覆盖");
      if (current?.type === "directory") throw fileError("EISDIR", "目标是文件夹");
      if (expectedRevision && current?.revision !== expectedRevision) throw fileError("ESTALE", "文件已被其他页面修改，当前内容未覆盖，请重新载入");
      store.put({ directory, path, type: "file", blob, revision: nextRevision, encoding } satisfies Entry);
      return nextRevision;
    });
  }
  async function mkdir(path: string) {
    const directory = await initialize();
    path = relativePath(path);
    await access(directory, (entries, store) => {
      if (entries.has(path)) throw fileError("EEXIST", "文件夹已经存在");
      if (entries.get(parentPath(path))?.type !== "directory") throw fileError("ENOENT", "父文件夹不存在");
      store.put({ directory, path, type: "directory" } satisfies Entry);
    });
  }
  async function transfer(path: string, target: string, move: boolean) {
    const directory = await initialize();
    path = relativePath(path); target = relativePath(target);
    if (!path || !target || target.startsWith(`${path}/`)) throw new Error("不能移动或复制项目根目录及自身子目录");
    await access(directory, (entries, store) => {
      if (!entries.has(path)) throw fileError("ENOENT", "源文件不存在");
      if (move && path === target) return;
      if (entries.has(target)) throw fileError("EEXIST", "目标名称已经存在");
      if (entries.get(parentPath(target))?.type !== "directory") throw fileError("ENOENT", "目标文件夹不存在");
      for (const entry of entries.values()) if (entry.path === path || entry.path.startsWith(`${path}/`)) {
        store.put({ ...entry, path: target + entry.path.slice(path.length) });
        if (move) store.delete([directory, entry.path]);
      }
    });
  }
  async function remove(path: string, recursive = false) {
    const directory = await initialize();
    path = relativePath(path);
    if (!path) throw new Error("不能删除浏览器项目根目录");
    await access(directory, (entries, store) => {
      if (!entries.has(path)) throw fileError("ENOENT", "文件不存在");
      const children = [...entries.keys()].filter(key => key.startsWith(`${path}/`));
      if (children.length && !recursive) throw fileError("ENOTEMPTY", "文件夹不为空");
      for (const key of [path, ...children]) store.delete([directory, key]);
    });
  }
  async function readTextSnapshot(path: string, maxBytes?: number): Promise<TextSnapshot> {
    const directory = await initialize();
    const metadata = await access(directory, entries => {
      const entry = entries.get(relativePath(path));
      if (entry?.type !== "file" || !entry.blob) throw fileError("ENOENT", "浏览器项目文件不存在");
      return entry;
    });
    const blob = metadata.blob!;
    const bytes = new Uint8Array(await blob.slice(0, maxBytes).arrayBuffer());
    const encoding = metadata.encoding ?? (bytes[0] === 255 && bytes[1] === 254 ? "utf-16le" : bytes[0] === 254 && bytes[1] === 255 ? "utf-16be" : bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191 ? "utf-8-bom" : "utf-8");
    return { text: new TextDecoder(encoding === "utf-8-bom" ? "utf-8" : encoding).decode(bytes), revision: metadata.revision!, encoding };
  }
  async function writeTextSnapshot(path: string, text: string, snapshot: Pick<TextSnapshot, "revision" | "encoding">) {
    let bytes = new TextEncoder().encode(text);
    if (snapshot.encoding === "utf-8-bom") bytes = new Uint8Array([239, 187, 191, ...bytes]);
    if (snapshot.encoding === "utf-16le" || snapshot.encoding === "utf-16be") {
      const result = new Uint8Array(2 + text.length * 2);
      const view = new DataView(result.buffer);
      view.setUint16(0, 0xfeff, snapshot.encoding === "utf-16le");
      for (let i = 0; i < text.length; i++) view.setUint16(2 + i * 2, text.charCodeAt(i), snapshot.encoding === "utf-16le");
      bytes = result;
    }
    return write(path, new Blob([bytes]), false, snapshot.revision, snapshot.encoding);
  }
  async function importImage(url: string) {
    const response = await studioFetch(url);
    if (!response.ok) throw new Error(`读取图片失败（HTTP ${response.status}）`);
    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) throw new Error("结果不是图片");
    await mkdir("assets").catch(error => { if (error.code !== "EEXIST") throw error; });
    const path = `assets/${crypto.randomUUID()}.${blob.type.split("/")[1]}`;
    await write(path, blob, true);
    return { path, mimeType: blob.type };
  }
  return { list, read, write, mkdir, remove, rename: (path: string, target: string) => transfer(path, target, true), copy: (path: string, target: string) => transfer(path, target, false), readTextSnapshot, writeTextSnapshot, importImage };
}
