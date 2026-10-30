import useWorkspaceFiles from "@/lib/workspaceFiles";
import { browserWorkspaceMode } from "@/lib/browserWorkspaceFiles";
import { templateDirectory, type CreationTemplate, type TemplateProject } from "@/lib/creationTemplates";
import { readCanvasFiles } from "@/pages/workspace/panels/canvas/canvasFiles";

function safePath(path: string) {
  return !!path && !path.startsWith("/") && !/[\\:\0]/.test(path) && path.split("/").every(part => !!part && part !== "." && part !== "..");
}
async function digest(bytes: ArrayBuffer) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(value => value.toString(16).padStart(2, "0")).join("");
}
async function collectPaths(directory: string) {
  const files = useWorkspaceFiles(directory), paths: string[] = [];
  async function collect(path = "") {
    for (const entry of (await files.list(path)).entries) {
      if (!path && entry.name === ".agent") continue;
      if (!safePath(entry.path)) throw new Error("项目包含不安全文件路径，无法制作模板");
      if (entry.type === "directory") await collect(entry.path); else paths.push(entry.path);
    }
  }
  await collect(); return paths.sort();
}
function validateReferences(value: unknown, paths: Set<string>, key = "") {
  if (typeof value === "string" && value) {
    if (/^(apiKey|authorization|password|accessToken|secret)$/i.test(key)) throw new Error("项目包含凭据字段，不能保存为模板");
    if (/^(url|path|textPath|filePath|directory)$/i.test(key)) {
      if (!safePath(value) || (!paths.has(value) && ![...paths].some(path => path.startsWith(`${value}/`)))) throw new Error(`项目引用未保存到项目内的文件：${value.slice(0, 100)}。请先导入素材再制作模板`);
    }
  } else if (Array.isArray(value)) value.forEach(item => validateReferences(item, paths, key));
  else if (value && typeof value === "object") for (const [name, item] of Object.entries(value)) validateReferences(item, paths, name);
}
function validateCanvasSnapshot(contents: Map<string, ArrayBuffer>, project: TemplateProject) {
  for (const path of project.canvases) {
    const bytes = contents.get(path);
    if (!bytes) throw new Error(`模板缺少画布：${path}`);
    const canvas = JSON.parse(new TextDecoder().decode(bytes));
    if (canvas?.toonflowCanvas !== true || !Array.isArray(canvas.nodes) || !Array.isArray(canvas.edges)
      || !canvas.viewport || ![canvas.viewport.x, canvas.viewport.y, canvas.viewport.zoom].every(Number.isFinite) || canvas.viewport.zoom <= 0
      || canvas.nodes.some((node: { id: string; type: string; position: { x: number; y: number } }) => !node || typeof node.id !== "string" || !safePath(node.id) || node.id.includes("/") || typeof node.type !== "string" || !node.position || ![node.position.x, node.position.y].every(Number.isFinite))) throw new Error(`模板画布格式无效：${path}`);
    const ids = new Set(canvas.nodes.map((node: { id: string }) => node.id));
    if (ids.size !== canvas.nodes.length || canvas.nodes.some((node: { parentNode?: string }) => node.parentNode !== undefined && !ids.has(node.parentNode))
      || canvas.edges.some((edge: { id: string; source: string; target: string }) => !edge || typeof edge.id !== "string" || !ids.has(edge.source) || !ids.has(edge.target))
      || new Set(canvas.edges.map((edge: { id: string }) => edge.id)).size !== canvas.edges.length) throw new Error(`模板节点或连线不完整：${path}`);
  }
}
export async function captureTemplateProject(directory: string) {
  if (!browserWorkspaceMode || !directory.startsWith("browser://")) throw new Error("项目模板目前支持当前浏览器内的项目");
  const files = useWorkspaceFiles(directory), paths = await collectPaths(directory);
  const canvases = await readCanvasFiles(files);
  if (!canvases.length || !canvases.some(canvas => canvas.data.nodes.length)) throw new Error("项目中没有可保存的画布节点");
  const contents = new Map<string, ArrayBuffer>(), manifest: TemplateProject = { files: [], canvases: canvases.map(canvas => canvas.id) };
  const pathSet = new Set(paths);
  // ACT: 当前浏览器项目规模采用完整文件快照，包含未被当前节点选中的历史素材；排除 Agent 会话与内存凭据。
  for (const path of paths) {
    const bytes = await files.read(path);
    if (path.endsWith(".json")) validateReferences(JSON.parse(new TextDecoder().decode(bytes)), pathSet);
    contents.set(path, bytes); manifest.files.push({ path, sha256: await digest(bytes) });
  }
  if (JSON.stringify(await collectPaths(directory)) !== JSON.stringify(paths)) throw new Error("制作模板期间项目发生变化，请停止编辑后重试");
  for (const file of manifest.files) if (await digest(await files.read(file.path)) !== file.sha256) throw new Error("制作模板期间项目发生变化，请停止编辑后重试");
  validateCanvasSnapshot(contents, manifest);
  return { files: contents, project: manifest };
}
export async function readTemplateProject(template: CreationTemplate) {
  const project = template.project;
  if (!/^template[a-f0-9]+$/.test(template.id) || !project || !Array.isArray(project.files) || !project.files.length || !Array.isArray(project.canvases) || !project.canvases.length
    || project.files.some(file => !file || typeof file.path !== "string" || !safePath(file.path) || file.path.startsWith(".agent/") || !/^[a-f0-9]{64}$/.test(file.sha256))
    || new Set(project.files.map(file => file.path)).size !== project.files.length
    || project.canvases.some(path => !project.files.some(file => file.path === path))) throw new Error("模板项目快照无效或不完整");
  const files = useWorkspaceFiles(templateDirectory), contents = new Map<string, ArrayBuffer>();
  for (const file of project.files) {
    const bytes = await files.read(`assets/${template.id}/project/${file.path}`);
    if (await digest(bytes) !== file.sha256) throw new Error(`模板文件损坏：${file.path}`);
    contents.set(file.path, bytes);
  }
  const paths = new Set(contents.keys());
  for (const [path, bytes] of contents) if (path.endsWith(".json")) validateReferences(JSON.parse(new TextDecoder().decode(bytes)), paths);
  validateCanvasSnapshot(contents, project);
  return { contents, project };
}
export async function copyTemplateProject(template: CreationTemplate) {
  if (!browserWorkspaceMode) throw new Error("项目模板复制目前仅支持浏览器项目");
  const { contents, project } = await readTemplateProject(template);
  const directory = `browser://${crypto.randomUUID()}`, files = useWorkspaceFiles(directory);
  const created: string[] = [], directories = new Set<string>();
  try {
    await files.list();
    for (const [path, bytes] of contents) {
      const parts = path.split("/"); parts.pop();
      for (let i = 1; i <= parts.length; i++) {
        const parent = parts.slice(0, i).join("/");
        if (!directories.has(parent)) { await files.mkdir(parent); directories.add(parent); }
      }
      await files.write(path, bytes, true); created.push(path);
    }
    for (const file of project.files) if (await digest(await files.read(file.path)) !== file.sha256) throw new Error(`副本校验失败：${file.path}`);
    const canvases = await readCanvasFiles(files);
    if (JSON.stringify(canvases.map(canvas => canvas.id).sort()) !== JSON.stringify([...project.canvases].sort())) throw new Error("副本画布不完整");
    return directory;
  } catch (error) {
    let cleanupFailed = false;
    for (const path of [...created, ...[...directories].sort((a, b) => b.length - a.length)]) {
      await files.remove(path, true).catch(error => { if (error.code !== "ENOENT") cleanupFailed = true; });
    }
    throw new Error(`${error instanceof Error ? error.message : "复制项目失败"}${cleanupFailed ? "；部分临时文件清理失败，项目未加入列表" : "；未创建可打开的项目"}`);
  }
}
