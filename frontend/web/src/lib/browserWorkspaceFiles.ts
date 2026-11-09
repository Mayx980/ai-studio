import { prototype, type NativeWorkspaceReader } from "@/ports/prototype";

export const browserWorkspaceMode = prototype.workspaceMode;
export function createBrowserWorkspaceFiles(getDirectory: () => string, nativeFiles: NativeWorkspaceReader) {
  return prototype.createWorkspaceFiles(getDirectory, nativeFiles);
}
