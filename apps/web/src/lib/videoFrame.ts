export async function captureVideoFrame(video: HTMLVideoElement, position: "first" | "last" | "current" = "current") {
  async function waitFor(event: "loadeddata" | "seeked", action?: () => void) {
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); video.removeEventListener(event, ready); video.removeEventListener("error", fail); };
      const ready = () => { cleanup(); resolve(); }, fail = () => { cleanup(); reject(new Error("视频画面读取失败，请确认视频可正常播放后重试")); };
      const timer = setTimeout(fail, 15000);
      video.addEventListener(event, ready, { once: true }); video.addEventListener("error", fail, { once: true });
      try { action?.(); } catch { fail(); }
    });
  }
  video.pause();
  if (video.readyState < 2) await waitFor("loadeddata", () => video.load());
  if (position !== "current") {
    if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error("视频时长无效，无法提取首尾帧");
    const time = position === "first" ? 0 : Math.max(0, video.duration - 0.04);
    if (Math.abs(video.currentTime - time) > 0.001) await waitFor("seeked", () => { video.currentTime = time; });
  }
  const canvas = document.createElement("canvas"); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  const context = canvas.getContext("2d");
  if (!context || !canvas.width || !canvas.height) throw new Error("视频没有可读取的画面");
  context.drawImage(video, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("视频画面转换失败")), "image/png"));
  return new File([blob], position === "last" ? "视频尾帧.png" : position === "first" ? "视频首帧.png" : "视频参考画面.png", { type: "image/png" });
}
