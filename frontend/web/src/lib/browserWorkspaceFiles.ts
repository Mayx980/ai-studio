import { prototype, type NativeWorkspaceReader } from "@/ports/prototype";

export const browserWorkspaceMode = prototype.workspaceMode;
export const studioCreationMode = prototype.supportsCreation;
export function createBrowserWorkspaceFiles(getDirectory: () => string, nativeFiles: NativeWorkspaceReader) {
  return prototype.createWorkspaceFiles(getDirectory, nativeFiles);
}
