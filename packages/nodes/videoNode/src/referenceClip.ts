/** 浏览器素材通过内容传输截取，不将浏览器项目标识当作宿主磁盘路径。 */
export async function clipReferenceVideo(file: File, range: { start: number; end: number }, signal?: AbortSignal) {
  if (!Number.isFinite(range.start) || !Number.isFinite(range.end) || range.start < 0 || range.end <= range.start) throw new Error("参考片段范围无效");
  const query = new URLSearchParams({ start: String(range.start), end: String(range.end) });
  let response: Response;
  try { response = await fetch(`/api/ffmpeg/clip?${query}`, { method: "POST", body: file, headers: { "Content-Type": file.type, "x-toonflow-workspace": "1" }, signal }); }
  catch (error) {
    if (signal?.aborted) throw error;
    throw new Error("无法连接本机视频片段服务，请检查预览服务。输入和片段选择已保留。", { cause: error });
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => undefined);
    throw new Error(payload?.message || `参考片段准备失败（HTTP ${response.status}），选择已保留，请重试`);
  }
  if (!response.headers.get("content-type")?.startsWith("video/mp4")) throw new Error("片段服务未返回视频，请检查本机预览服务。选择已保留。");
  const result = new File([await response.blob()], `${file.name.replace(/\.[^.]+$/, "")}片段.mp4`, { type: "video/mp4" });
  if (!result.size) throw new Error("参考片段为空，请重试");
  return result;
}
