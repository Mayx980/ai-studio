import { createLocalWorkspaceFiles } from "@/lib/localWorkspaceFiles";
import type { NativeWorkspaceReader } from "@/ports/prototype";
import { studioFetch } from "./studioFetch";

export function createBrowserWorkspaceFiles(getDirectory: () => string, nativeFiles: NativeWorkspaceReader) {
  return createLocalWorkspaceFiles(getDirectory, nativeFiles, { databaseName: "aiStudio.workspaces", readMedia: studioFetch, nativeImport: true });
}
