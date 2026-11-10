import { studio } from "@/ports";
import type { BrowserWorkspaceFiles } from "@/ports/prototype";
import type { TextSnapshot } from "@/lib/workspaceFiles";

export function createAssetFiles(getDirectory: () => string): BrowserWorkspaceFiles | undefined {
  const directory = getDirectory();
  const library = directory === "studio://assets" ? "assets" : directory === "studio://templates" ? "templates" : undefined;
  if (!library) return;
  return {
    async list(path = "", signal) {
      const { data } = await studio.listAssets<{ data: { entries: { name: string; path: string; type: "file" | "directory" }[] } }>({ params: { library, path, recursive: false }, signal });
      return { directory, empty: !data.data.entries.length, entries: data.data.entries };
    },
    async read(path) { return (await studio.readAsset<ArrayBuffer>({ params: { library, path }, responseType: "arraybuffer" })).data; },
    async write(path, content, _exclusive, revision, encoding) {
      // 素材库只允许新建或持有旧版本的替换，不能先取新版本来覆盖旧内容。
      const { data } = await studio.saveAsset<{ data: { revision: string } }>(content, { params: { library, path, expectedRevision: revision, encoding }, headers: { "Content-Type": "application/octet-stream" } });
      return data.data.revision;
    },
    async mkdir(path) { await studio.createAssetFolder({ library, path }); },
    async remove(path, recursive = false) { await studio.removeAsset({ data: { library, path, recursive } }); },
    async rename(path, target) { await studio.renameAsset({ library, path, target }); },
    async copy(path, target) { await studio.copyAsset({ library, path, target }); },
    async readTextSnapshot(path, maxBytes) { return (await studio.readAsset<{ data: TextSnapshot }>({ params: { library, path, snapshot: true, maxBytes } })).data.data; },
    async writeTextSnapshot(path, text, snapshot) { return this.write(path, text, false, snapshot.revision, snapshot.encoding); },
    async importImage() { throw new Error("请先将模型结果保存到项目，再保存到资产库"); },
  };
}
