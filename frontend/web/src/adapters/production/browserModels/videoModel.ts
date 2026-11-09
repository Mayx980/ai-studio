import { browserModelDefinitions } from "@/lib/browserModelDefinitions";


export default {
  id: "aliyunWan3Video",
  label: "阿里云百炼 - 万相 3.0 视频",
  version: "2.0.0",
  readme: "支持万相 3.0 文生视频、单图生视频，以及参考图片/参考视频生成。素材可直接使用 AFXEN 传入的本地文件；适配器会自动上传至百炼临时存储。临时素材地址有效期 48 小时。",
  rules: [
    {
      type: "input",
      field: "apiKey",
      title: "阿里云百炼 API Key",
      value: "",
      props: { type: "password", showPassword: true, autocomplete: "off" },
    },
  ],
  models: browserModelDefinitions.video.models,
  async generateVideo(this: any, request: any): Promise<any[]> {
    const apiKey = String(this.config?.apiKey ?? "").trim();
    if (!apiKey) throw new Error("请先在 AFXEN 供应商配置中填写阿里云百炼 API Key。");
    if (!request.model?.trim()) throw new Error("请选择已配置的模型");
    if (typeof request.prompt !== "string" || !request.prompt.trim()) throw new Error("请填写视频提示词。");

    const workspaceId = "llm-d7hnbcsabhzqr44p";
    const modelName = request.model === "wan3Video" ? "wan3.0-video" : request.model;
    const apiBase = `${String(this.config?.endpoint || `https://${workspaceId}.cn-beijing.maas.aliyuncs.com`).replace(/\/+$/, "")}/api/v1`;
    const controllerSignals: AbortSignal[] = [AbortSignal.timeout(30 * 60 * 1000)];
    if (this.signal) controllerSignals.push(this.signal);
    const signal = AbortSignal.any(controllerSignals);

    const throwIfAborted = () => signal.throwIfAborted();
    const readJson = async (response: Response, context: string): Promise<any> => {
      const raw = await response.text();
      let value: any = null;
      try { value = raw ? JSON.parse(raw) : {}; } catch { /* handled below */ }
      if (!response.ok) {
        const detail = value?.message || value?.code || raw || `HTTP ${response.status}`;
        throw new Error(`${context}失败：${String(detail).slice(0, 700)}`);
      }
      if (!value || typeof value !== "object") throw new Error(`${context}失败：接口没有返回有效 JSON。`);
      return value;
    };
    const sleep = async (ms: number) => {
      throwIfAborted();
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(done, ms);
        function cleanup() { clearTimeout(timer); signal.removeEventListener("abort", aborted); }
        function done() { cleanup(); resolve(); }
        function aborted() { cleanup(); reject(signal.reason ?? new Error("操作已取消")); }
        signal.addEventListener("abort", aborted, { once: true });
        if (signal.aborted) aborted();
      });
      throwIfAborted();
    };

    const safeName = (name: string | undefined, fallback: string) => {
      const base = (name || fallback).split(/[\\/]/).pop() || fallback;
      return base.replace(/[^\w.\-\u4e00-\u9fff]/g, "_").slice(-120) || fallback;
    };
    const base64Bytes = (value: string): Uint8Array => {
      const cleaned = value.replace(/^data:[^,]*;base64,/i, "").replace(/\s/g, "");
      return Uint8Array.from(atob(cleaned), char => char.charCodeAt(0));
    };
    const mediaBytes = (media: any): { bytes: Uint8Array; mimeType: string; name: string } => {
      if (!media || typeof media !== "object") throw new Error("收到的参考素材格式不正确。");
      const mimeType = String(media.mimeType || (typeof media.url === "string" && /\.png(?:\?|$)/i.test(media.url) ? "image/png" : "application/octet-stream"));
      if (media.type === "binary" && media.data instanceof Uint8Array) {
        return { bytes: media.data, mimeType, name: safeName(media.name, mimeType.startsWith("video/") ? "reference.mp4" : "reference.bin") };
      }
      if (media.type === "base64" && typeof media.data === "string") {
        return { bytes: base64Bytes(media.data), mimeType, name: safeName(media.name, mimeType.startsWith("video/") ? "reference.mp4" : "reference.bin") };
      }
      if (media.type === "url" && typeof media.url === "string" && media.url.startsWith("data:")) {
        const match = media.url.match(/^data:([^;,]+)?(?:;[^,]*)?,(.*)$/s);
        if (!match) throw new Error("本地素材的数据地址无法解析。");
        const detectedMime = match[1] || mimeType;
        const bytes = /;base64,/i.test(media.url) ? base64Bytes(media.url) : new TextEncoder().encode(decodeURIComponent(match[2]));
        return { bytes, mimeType: detectedMime, name: safeName(media.name, detectedMime.startsWith("video/") ? "reference.mp4" : "reference.bin") };
      }
      throw new Error("无法读取本地素材内容；请重新选择图片或视频后重试。");
    };

    const uploadLocalMedia = async (media: any, kind: "image" | "video"): Promise<string> => {
      throwIfAborted();
      if (media?.type === "url" && typeof media.url === "string" && /^https?:\/\//i.test(media.url)) return media.url;
      const file = mediaBytes(media);
      if (file.bytes.byteLength === 0) throw new Error("参考素材为空，请重新上传。");
      const maxBytes = kind === "video" ? 100 * 1024 * 1024 : 20 * 1024 * 1024;
      if (file.bytes.byteLength > maxBytes) throw new Error(kind === "video" ? "参考视频不能超过 100 MB。" : "参考图片不能超过 20 MB。");
      if (kind === "video" && !["video/mp4", "video/quicktime"].includes(file.mimeType)) {
        throw new Error("参考视频仅支持 MP4 或 MOV 格式，请转换格式后重试。");
      }
      if (kind === "image" && !["image/jpeg", "image/jpg", "image/png", "image/bmp", "image/webp"].includes(file.mimeType.toLowerCase())) {
        throw new Error("参考图片仅支持 JPG、PNG、BMP 或 WEBP 格式。");
      }

      const policyUrl = new URL("https://dashscope.aliyuncs.com/api/v1/uploads");
      policyUrl.searchParams.set("action", "getPolicy");
      policyUrl.searchParams.set("model", modelName);
      const policyResponse = await this.tool.fetch(policyUrl.toString(), {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        signal,
      });
      const policyResult = await readJson(policyResponse, "获取素材上传凭证");
      const policy = policyResult?.data;
      if (!policy?.upload_host || !policy?.upload_dir || !policy?.policy || !policy?.signature || !policy?.oss_access_key_id) {
        throw new Error("阿里云返回的上传凭证不完整，无法上传素材。");
      }
      if (Number(policy.max_file_size_mb) > 0 && file.bytes.byteLength > Number(policy.max_file_size_mb) * 1024 * 1024) {
        throw new Error(`当前模型允许上传的单文件大小不超过 ${policy.max_file_size_mb} MB。`);
      }
      const randomSuffix = `${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
      const fileName = `${randomSuffix}_${file.name}`;
      const key = `${String(policy.upload_dir).replace(/\/$/, "")}/${fileName}`;
      const boundary = `----ai-studioBoundary${randomSuffix.replace(/\D/g, "")}`;
      const fields: [string, string][] = [
        ["OSSAccessKeyId", String(policy.oss_access_key_id)],
        ["Signature", String(policy.signature)],
        ["policy", String(policy.policy)],
        ["x-oss-object-acl", String(policy.x_oss_object_acl || "private")],
        ["x-oss-forbid-overwrite", String(policy.x_oss_forbid_overwrite ?? "true")],
        ["key", key],
        ["success_action_status", "200"],
      ];
      const chunks: BlobPart[] = [];
      for (const [name, value] of fields) {
        chunks.push(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`);
      }
      chunks.push(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName.replace(/["\r\n]/g, "_")}"\r\nContent-Type: ${file.mimeType}\r\n\r\n`);
      chunks.push(new Uint8Array(file.bytes).buffer);
      chunks.push(`\r\n--${boundary}--\r\n`);
      const body = new Blob(chunks, { type: `multipart/form-data; boundary=${boundary}` });
      const uploadResponse = await this.tool.fetch(String(policy.upload_host), {
        method: "POST",
        headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
        body,
        signal,
      });
      if (!uploadResponse.ok) {
        const detail = (await uploadResponse.text().catch(() => "")).slice(0, 400);
        throw new Error(`上传素材失败：HTTP ${uploadResponse.status}${detail ? `，${detail}` : ""}`);
      }
      return `oss://${key}`;
    };

    const mode = request.mode;
    const images = Array.isArray(request.images) ? request.images : [];
    const videos = Array.isArray(request.videos) ? request.videos : [];
    const media: { type: string; url: string }[] = [];
    if (request.lastFrame) throw new Error("当前已配置的能力不包含尾帧模式，请勿传入尾帧图片。");

    if (mode === "text") {
      if (images.length || videos.length || request.firstFrame) throw new Error("文生视频模式不能同时传入参考素材；请切换到对应的图片或参考素材模式。");
    } else if (mode === "singleImage") {
      if (videos.length || images.length > 1 || (request.firstFrame && images.length)) throw new Error("图片生视频模式只支持一张图片，且不能同时传入参考视频。");
      const image = request.firstFrame || images[0];
      if (!image) throw new Error("图片生视频需要先上传一张图片。");
      media.push({ type: "first_frame", url: await uploadLocalMedia(image, "image") });
    } else {
      const referenceMode = Array.isArray(mode) || mode === undefined;
      if (!referenceMode) throw new Error("当前视频生成模式不受支持。");
      if (request.firstFrame) throw new Error("参考素材模式不支持首帧字段；请把图片作为参考图片上传。");
      if (images.length > 10) throw new Error("参考图片最多支持 10 张。");
      if (videos.length > 5) throw new Error("参考视频最多支持 5 段。");
      if (!images.length && !videos.length) throw new Error("参考素材模式至少需要一张参考图片或一段参考视频。");
      for (const image of images) media.push({ type: "reference_image", url: await uploadLocalMedia(image, "image") });
      for (const video of videos) media.push({ type: "reference_video", url: await uploadLocalMedia(video, "video") });
    }

    const resolutionRaw = String(request.resolution ?? "480P").toUpperCase();
    const resolutionMap: Record<string, string> = { "1080P": "1080P", "720P": "720P", "480P": "480P" };
    const resolution = resolutionMap[resolutionRaw];
    if (!resolution) throw new Error("分辨率仅支持 1080P、720P 或 480P。");
    const ratio = String(request.ratio ?? "adaptive");
    if (!["adaptive", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16", "2:3", "3:2"].includes(ratio)) throw new Error("视频比例不受支持。");
    const duration = request.duration === undefined ? 5 : Number(request.duration);
    if (!Number.isInteger(duration) || (duration !== -1 && (duration < 2 || duration > 30))) throw new Error("视频时长请设置为 -1 或 2–30 秒的整数。");
    const other = request.other && typeof request.other === "object" ? request.other : {};
    const unsupportedOther = Object.keys(other).filter((key) => !["seed", "prompt_extend"].includes(key));
    if (unsupportedOther.length) throw new Error(`当前适配器不支持这些额外参数：${unsupportedOther.join("、")}。`);
    const parameters: Record<string, unknown> = {
      resolution,
      ratio,
      duration,
      audio: request.generateAudio ?? true,
      watermark: request.watermark ?? false,
      prompt_extend: typeof other.prompt_extend === "boolean" ? other.prompt_extend : true,
    };
    if (other.seed !== undefined) {
      const seed = Number(other.seed);
      if (!Number.isInteger(seed) || seed < 0) throw new Error("seed 必须是非负整数。");
      parameters.seed = seed;
    }
    const payload: any = { model: modelName, input: { prompt: request.prompt.trim() }, parameters };
    if (media.length) payload.input.media = media;

    throwIfAborted();
    const createResponse = await this.tool.fetch(`${apiBase}/services/aigc/video-generation/video-synthesis`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-DashScope-Async": "enable",
        "X-DashScope-OssResourceResolve": "enable",
      },
      body: JSON.stringify(payload),
      signal,
    });
    const createResult = await readJson(createResponse, "提交万相视频生成任务");
    const taskId = createResult?.output?.task_id;
    if (typeof taskId !== "string" || !taskId) throw new Error("万相接口没有返回任务编号，无法查询生成结果。");

    const deadline = Date.now() + 30 * 60 * 1000;
    while (Date.now() < deadline) {
      const taskResponse = await this.tool.fetch(`${apiBase}/tasks/${encodeURIComponent(taskId)}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "X-DashScope-OssResourceResolve": "enable",
        },
        signal,
      });
      const taskResult = await readJson(taskResponse, "查询万相视频生成任务");
      const output = taskResult?.output;
      const status = String(output?.task_status ?? "").toUpperCase();
      if (status === "SUCCEEDED") {
        const videoUrl = output?.video_url;
        if (typeof videoUrl !== "string" || !/^https?:\/\//i.test(videoUrl)) throw new Error("任务已完成，但接口没有返回可访问的视频地址。");
        throwIfAborted();
        return [{ mediaType: "video", type: "url", url: videoUrl, mimeType: "video/mp4", name: "wan3-video.mp4" }];
      }
      if (["FAILED", "CANCELED", "UNKNOWN"].includes(status)) {
        const detail = output?.message || output?.code || taskResult?.message || status;
        throw new Error(`万相视频生成${status === "CANCELED" ? "已取消" : "失败"}：${String(detail).slice(0, 700)}`);
      }
      if (!["PENDING", "RUNNING"].includes(status)) throw new Error(`万相返回了无法识别的任务状态：${status || "空状态"}。`);
      await sleep(5000);
    }
    throw new Error("等待万相视频生成超过 30 分钟，已停止等待。远端任务可能仍在运行；请稍后在百炼任务记录中查看，避免重复提交。");
  },
};
