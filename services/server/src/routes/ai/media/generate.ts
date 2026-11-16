import { Router } from "express";
import { z } from "zod";
import { audioGenerationSchema, imageGenerationSchema, videoGenerationSchema } from "@toonflow/tool-media-generation/runtime";
import { validateFields } from "@/lib/middleware";
import { success, error, errorFromCause } from "@/lib/responseFormat";
import u from "@/utils";
import { translateMessage, validationOptions } from "@/lib/i18n";

export default Router().post("/", validateFields({
  directory: z.string().min(1).max(4096), mediaType: z.enum(["image", "video", "audio"]),
  requestId: z.uuid(), destination: z.object({ canvas: z.string().min(1).max(4096), nodeId: z.string().min(1).max(200) }).strict().optional(),
}), async (req, res) => {
  u.mcpControl.assertAppRequest(req);
  const { directory, mediaType, requestId, destination, ...request } = req.body;
  const parsed = (mediaType === "image" ? imageGenerationSchema : mediaType === "video" ? videoGenerationSchema : audioGenerationSchema).safeParse(request, validationOptions());
  if (!parsed.success) {
    res.status(400).json(error("参数错误", parsed.error.issues.map(issue => ({ ...issue, message: translateMessage(issue.message) })), 400));
    return;
  }
  const cwd = await u.workspace.resolveWorkspace(req, directory);
  if (destination) await u.workspaceFile.resolveWorkspacePath(cwd, destination.canvas);
  if (req.aborted || res.destroyed) throw Object.assign(new Error("请求已中断，未提交模型"), { status: 499 });
  const task = u.mediaTasks.start(requestId, cwd, mediaType, parsed.data, destination);
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const close = () => { clearInterval(heartbeat); if (!res.writableFinished) task.detach?.(); };
  res.once("close", close);
  req.once("aborted", close);
  req.socket.once("close", close);
  try {
    res.set({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" });
    res.flushHeaders();
    // ACT: JSON 允许前导空白，保活时保留现有 response.json() 契约。
    heartbeat = setInterval(() => { if (!res.destroyed && !res.writableEnded && !res.writableNeedDrain) res.write("\n"); }, 20000);
    const files = await task.promise;
    if (!res.destroyed) res.write(JSON.stringify(success(files)));
  } catch (err) {
    if (!res.destroyed) res.write(JSON.stringify(errorFromCause(err)));
  } finally {
    clearInterval(heartbeat);
    res.off("close", close);
    req.off("aborted", close);
    req.socket.off("close", close);
    res.end();
  }
});
