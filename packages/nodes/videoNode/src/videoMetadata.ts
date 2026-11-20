/** 只读取本地视频元数据，原文件保持不变，不进行转码或截取。 */
export function readVideoDuration(file: Blob, signal?: AbortSignal) {
  return new Promise<number>((resolve, reject) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    let settled = false;
    const timer = setTimeout(() => finish(new Error("视频时长读取超时，请重新添加视频")), 15000);
    const cancel = () => finish(signal?.reason ?? new Error("已取消读取视频"));
    function finish(error?: unknown, duration?: number) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      video.onloadedmetadata = null;
      video.onerror = null;
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      if (error) reject(error); else resolve(duration!);
    }
    video.onloadedmetadata = () => {
      if (!Number.isFinite(video.duration) || video.duration <= 0) finish(new Error("无法读取有效视频时长，请替换视频"));
      else finish(undefined, video.duration);
    };
    video.onerror = () => finish(new Error("视频时长读取失败，请替换视频"));
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) { cancel(); return; }
    video.preload = "metadata";
    video.src = url;
    video.load();
  });
}
