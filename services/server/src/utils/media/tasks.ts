import { createHash } from "node:crypto";
import { ownerId, currentAccount, runAs } from "@/utils/accounts/context";
import { generateMedia } from "./generation";
import type { GeneratedMedia, MediaGenerationRequest } from "@toonflow/tools-scaffold/runtime";
import { lockWorkspaceFiles, readWorkspaceFile, resolveWorkspacePath, writeWorkspaceFile } from "@/utils/workspace/files";

type Destination = { canvas: string; nodeId: string };
type MediaTask = { owner: string; fingerprint: string; status: "running" | "succeeded" | "failed"; controller: AbortController;
  result?: GeneratedMedia[]; error?: string; completedAt?: number; detached: boolean; publish?: Promise<void>; promise: Promise<GeneratedMedia[]>; detach?: () => void };
const tasks = new Map<string, MediaTask>();

function find(id: string) {
  const task = tasks.get(id);
  if (!task || task.owner !== ownerId()) throw Object.assign(new Error("生成任务不存在或不属于当前账号"), { status: 404 });
  return task;
}
export function status(id: string) {
  const task = find(id);
  return { status: task.status, ...(task.result ? { files: task.result } : {}), ...(task.error ? { error: task.error } : {}) };
}
export function stop(id: string) { const task = find(id); if (task.status === "running") task.controller.abort(); return { status: task.status }; }

export function start(id: string, cwd: string, kind: "image" | "video" | "audio", input: MediaGenerationRequest, destination?: Destination) {
  for (const [key, task] of tasks) if (task.completedAt && task.completedAt + 3600_000 < Date.now()) tasks.delete(key);
  const owner = ownerId();
  const fingerprint = createHash("sha256").update(JSON.stringify({ owner, cwd, kind, input, destination })).digest("hex");
  const existing = tasks.get(id);
  if (existing) {
    if (existing.owner !== owner || existing.fingerprint !== fingerprint) throw Object.assign(new Error("任务编号已使用，不会重复提交模型"), { status: 409 });
    return existing;
  }
  if (tasks.size >= 1000 || [...tasks.values()].filter(task => task.owner === owner && task.status === "running").length >= 20) {
    throw Object.assign(new Error("生成任务已达当前实例上限，请等待已有任务完成"), { status: 429 });
  }
  const initiating = currentAccount();
  const context = initiating ? { ...initiating, background: true } : undefined;
  const task: MediaTask = { owner, fingerprint, status: "running", controller: new AbortController(), detached: false, promise: Promise.resolve([]) };
  async function publish() {
    if (!destination || !task.result?.[0]) return;
    const path = (await resolveWorkspacePath(cwd, destination.canvas)).path;
    const release = lockWorkspaceFiles([path]);
    try {
      const bytes = await readWorkspaceFile(path);
      if (bytes.length > 16 * 1024 * 1024) throw new Error("原画布超过16 MiB，生成文件已保存");
      const canvas = JSON.parse(bytes.toString("utf8"));
      if (!canvas?.toonflowCanvas || !Array.isArray(canvas.nodes)) throw new Error("原画布格式无效，生成文件已保存");
      const node = canvas.nodes.find((item: { id: string }) => item.id === destination.nodeId);
      if (!node) return;
      const file = task.result[0];
      node.data ??= {};
      node.data.outputs = { ...node.data.outputs, [kind]: { dataType: kind.toUpperCase(), value: { url: file.path, mimeType: file.mimeType } } };
      await writeWorkspaceFile(path, JSON.stringify(canvas));
    } finally { release(); }
  }
  const restore = () => {
    if (!task.publish && task.result && task.detached) {
      const operation = () => publish().catch(cause => {
        const warning = `生成文件已保存，但原节点更新失败：${cause instanceof Error ? cause.message : "请检查原项目"}`;
        task.error = warning;
        if (task.result?.[0]) task.result[0].warning = [task.result[0].warning, warning].filter(Boolean).join("；");
      });
      task.publish = context ? runAs(context, operation) : operation();
    }
    return task.publish;
  };
  const execute = async () => {
    try {
      task.result = await generateMedia(cwd, kind, input, task.controller.signal);
      await restore();
      task.status = "succeeded";
      return task.result;
    } catch (cause) {
      task.status = "failed";
      task.error = cause instanceof Error ? cause.message : "生成失败";
      throw cause;
    } finally { task.completedAt = Date.now(); }
  };
  task.promise = context ? runAs(context, execute) : execute();
  // ACT: 仅单进程任务表，保留完成状态一小时；重启不恢复队列，不自动重提收费任务。
  tasks.set(id, task);
  void task.promise.catch(() => {});
  return Object.assign(task, { detach() { task.detached = true; void restore(); } });
}
