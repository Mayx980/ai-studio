import { raw, Router } from "express";
import { z } from "zod";
import { mkdtemp, readFile, rm, writeFile } from "@toonflow/file";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateFields } from "@/lib/middleware";
import u from "@/utils";

let activeClips = 0;
const querySchema = { start: z.string().regex(/^\d+(?:\.\d+)?$/), end: z.string().regex(/^\d+(?:\.\d+)?$/) };

// 浏览器工作区传输文件内容，不接受客户端磁盘路径；临时文件仅存于本次独立目录。
export default Router().post("/", (req, _res, next) => { u.mcpControl.assertAppRequest(req); next(); }, raw({ type: "video/*", limit: "100mb" }), validateFields(querySchema, "query"), async (req, res) => {
  const start = Number(req.query.start), end = Number(req.query.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end - start > 30) throw Object.assign(new Error("参考片段须为不超过30秒的有效连续范围"), { status: 400 });
  if (!Buffer.isBuffer(req.body) || !req.body.length) throw Object.assign(new Error("请上传非空的视频文件"), { status: 400 });
  if (activeClips >= 2) throw Object.assign(new Error("片段处理中，请稍后重试"), { status: 429 });
  activeClips++;
  let directory: string | undefined;
  const controller = new AbortController();
  const cancel = () => controller.abort();
  res.once("close", cancel);
  req.once("aborted", cancel);
  try {
    directory = await mkdtemp(join(tmpdir(), "afxenReferenceClip"));
    const source = join(directory, "source"), output = join(directory, "clip.mp4");
    await writeFile(source, req.body, { flag: "wx", mode: 0o600 });
    const ffmpeg = await u.ffmpeg.createWorkspaceFfmpeg(directory, controller.signal);
    const metadata = await new Promise<import("@toonflow/ffmpeg/types").FfprobeData>((resolve, reject) => ffmpeg(source).ffprobe({ options: ["-protocol_whitelist", "file,pipe", "-format_whitelist", "mov,matroska,webm,avi"] }, (error, data) => error ? reject(Object.assign(new Error("无法读取参考视频，请使用 MP4、MOV、WebM 或 AVI 文件"), { status: 400, cause: error })) : resolve(data)));
    const video = metadata.streams.find(stream => stream.codec_type === "video" && !stream.disposition?.attached_pic);
    const duration = Number(metadata.format.duration ?? video?.duration);
    if (!video || !Number.isFinite(duration) || end > duration + 0.05) throw Object.assign(new Error("视频片段超出可用画面范围，请重新选择"), { status: 400 });
    if (!video.width || !video.height || video.width > 8192 || video.height > 8192 || video.width * video.height > 33554432) throw Object.assign(new Error("参考视频画面尺寸超出处理范围，请缩小视频后重试"), { status: 400 });
    controller.signal.throwIfAborted();
    const command = ffmpeg({ source, timeout: 120 }).inputOptions("-protocol_whitelist", "file,pipe", "-format_whitelist", "mov,matroska,webm,avi").seekInput(start).duration(end - start).videoCodec("libx264").audioCodec("aac").format("mp4")
      .videoFilters("pad=ceil(iw/2)*2:ceil(ih/2)*2")
      .outputOptions("-map", `0:${video.index}`, "-map", "0:a:0?", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart").output(output);
    const stop = () => command.kill("SIGKILL");
    controller.signal.addEventListener("abort", stop, { once: true });
    try {
      await new Promise<void>((resolve, reject) => {
        command.on("start", () => { if (controller.signal.aborted) stop(); });
        command.on("error", reject).on("end", () => resolve()).run();
      });
    } finally { controller.signal.removeEventListener("abort", stop); }
    controller.signal.throwIfAborted();
    const content = await readFile(output);
    res.set({ "Content-Type": "video/mp4", "Cache-Control": "no-store" }).send(content);
  } finally {
    res.removeListener("close", cancel);
    req.removeListener("aborted", cancel);
    activeClips--;
    if (directory) await rm(directory, { recursive: true, force: true });
  }
});
