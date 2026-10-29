import { imageDimensions } from "@toonflow/node-shared/generationDefaults";
type MediaInput = { type: "url"; url: string } | { type: "base64"; data: string; mimeType?: string } | { type: "binary"; data: Uint8Array; mimeType?: string };
type MediaAsset = { mediaType: string; type: string; url?: string; data?: string; mimeType?: string };
type ImageRequest = { model: string; prompt: string; images?: MediaInput[]; mask?: unknown; quality?: unknown; outputFormat?: string; n?: number; ratio?: string; size?: string; other?: Record<string, unknown> };
type Context = { config: { apiKey?: string; endpoint?: string }; signal?: AbortSignal; tool: { fetch: typeof fetch; errorMessage: (value: unknown) => string } };
export default {
  id: "aliyunBailianQwenImage30Pro",
  label: "阿里云百炼·千问图像生成 3.0 Pro",
  version: "2.0.1",
  readme: `接入阿里云百炼 qwen-image-3.0-pro，支持文生图和参考图片编辑。使用 DashScope 原生异步任务协议，需要填写百炼 API Key，以及业务空间专属域名，默认业务空间地址为 https://llm-d7hnbcsabhzqr44p.cn-beijing.maas.aliyuncs.com。域名需与模型和 API Key 所属地域一致。图片结果 URL 有效期有限，请及时保存。

图片编辑支持最多 3 张参考图，参考图需为公网 HTTP(S) URL 或 Base64；本适配器会将 ai-studio 提供的内存图片转换为 Base64 传入，不会上传到第三方存储。接口不支持 mask、multipart 编辑或非 PNG 输出。`,
  rules: [
    { type: "input", field: "apiKey", title: "百炼 API Key", value: "", props: { type: "password", showPassword: true, autocomplete: "off" } },
    { type: "input", field: "endpoint", title: "业务空间接口地址", value: "https://llm-d7hnbcsabhzqr44p.cn-beijing.maas.aliyuncs.com", props: { type: "text", autocomplete: "off", placeholder: "https://llm-d7hnbcsabhzqr44p.cn-beijing.maas.aliyuncs.com" } },
  ],
  models: [{ id: "qwen-image-3.0-pro", label: "千问图像生成 3.0 Pro", type: "image", mode: ["text", "singleImage", "multiReference"], imageRatios: ["1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16", "21:9", "9:21", "2:1", "4:1"], imageSizes: [...Object.values(imageDimensions).flat(), "1K", "2K", "auto"] }],
  async generateImage(this: Context, request: ImageRequest): Promise<MediaAsset[]> {
    this.signal?.throwIfAborted();
    const apiKey = this.config.apiKey?.trim();
    if (!apiKey) throw new Error("请先填写百炼 API Key");
    if (!request.model?.trim()) throw new Error("请选择已配置的模型");
    const prompt = request.prompt?.trim();
    if (!prompt) throw new Error("请输入图片提示词");
    if (prompt.length > 20000) throw new Error("提示词过长，请缩短后重试");
    if (request.mask) throw new Error("千问 DashScope 原生接口不支持 mask 蒙版");
    if (request.quality !== undefined) throw new Error("接口文档未提供 quality 参数，请在提示词中描述画质要求");
    if (request.outputFormat && request.outputFormat.toLowerCase() !== "png") throw new Error("qwen-image-3.0-pro 输出 PNG，暂不支持指定其他格式");
    if (request.n !== undefined && (!Number.isInteger(request.n) || request.n < 1 || request.n > 6)) {
      throw new Error("生成数量 n 必须是 1 到 6 的整数");
    }

    const endpoint = this.config.endpoint?.trim().replace(/\/+$/, "");
    if (!endpoint) throw new Error("请填写业务空间接口地址，例如 https://你的WorkspaceId.cn-beijing.maas.aliyuncs.com");
    if (!/^https:\/\//i.test(endpoint)) throw new Error("业务空间接口地址必须使用 HTTPS");
    if (/\[workspace-id\]|你的WorkspaceId|<WorkspaceId>/i.test(endpoint)) throw new Error("请将接口地址中的示例 WorkspaceId 替换为真实业务空间 ID");

    const toBase64 = (bytes: Uint8Array): string => {
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
      return btoa(binary);
    };
    const imageToApiValue = (image: MediaInput): string => {
      if (image.type === "url") {
        if (!/^https?:\/\//i.test(image.url)) throw new Error("参考图片 URL 必须是 HTTP(S) 地址");
        return image.url;
      }
      if (image.type === "base64") {
        const data = image.data.trim();
        if (data.startsWith("data:")) return data;
        return `data:${image.mimeType || "image/png"};base64,${data}`;
      }
      if (image.type === "binary") {
        if (image.data.byteLength > 10 * 1024 * 1024) throw new Error("单张参考图片不能超过 10 MB");
        return `data:${image.mimeType || "image/png"};base64,${toBase64(image.data)}`;
      }
      throw new Error("不支持的参考图片格式");
    };

    const images = request.images ?? [];
    if (images.length > 3) throw new Error("qwen-image-3.0-pro 最多支持 3 张参考图片");
    const content: Array<Record<string, string>> = [];
    for (const image of images) content.push({ image: imageToApiValue(image) });
    content.push({ text: prompt });

    const parameters: Record<string, unknown> = {
      prompt_extend: true,
      n: request.n ?? 1,
    };
    const ratioSizes: Record<string, string> = {
      "1:1": "1024*1024",
      "3:2": "1248*832",
      "2:3": "832*1248",
      "4:3": "1184*888",
      "3:4": "888*1184",
      "16:9": "1360*768",
      "9:16": "768*1360",
      "21:9": "1536*656",
      "9:21": "656*1536",
      "2:1": "1024*512",
      "4:1": "2048*512",
    };
    if (request.ratio !== undefined) {
      const baseSize = ratioSizes[request.ratio.trim()];
      if (!baseSize) throw new Error("当前支持的宽高比：1:1、3:2、2:3、4:3、3:4、16:9、9:16、21:9、9:21、2:1、4:1");
      const requestedSize = request.size?.trim().toLowerCase();
      if (requestedSize && !["auto", "1k", "2k"].includes(requestedSize) && !/^\d{3,4}[x*]\d{3,4}$/.test(requestedSize)) {
        throw new Error("图片尺寸请使用 auto、1K、2K 或类似 1024x1024 的格式");
      }
      if (requestedSize && /^\d{3,4}[x*]\d{3,4}$/.test(requestedSize)) {
        parameters.size = requestedSize.replace("x", "*");
      } else if (requestedSize === "2k") {
        const [width, height] = baseSize.split("*").map(Number);
        parameters.size = `${width * 2}*${height * 2}`;
      } else {
        parameters.size = baseSize;
      }
    } else if (request.size !== undefined) {
      const size = request.size.trim().toLowerCase();
      if (size === "auto") {
        // omit size to let the model choose a resolution
      } else if (/^\d{3,4}[x*]\d{3,4}$/.test(size)) {
        parameters.size = size.replace("x", "*");
      } else if (size === "1k") {
        parameters.size = "1024*1024";
      } else if (size === "2k") {
        parameters.size = "2048*2048";
      } else {
        throw new Error("图片尺寸请使用 auto、1K、2K 或类似 1024x1024 的格式");
      }
    }

    // 百炼 Qwen 3.0 协议允许 512²～2048² 像素、最长边比例不超过 8:1；全景沿用同一尺寸校验。
    if (typeof parameters.size === "string") {
      const [width, height] = parameters.size.split("*").map(Number);
      if (!width || !height || width * height < 512 * 512 || width * height > 2048 * 2048 || Math.max(width / height, height / width) > 8) throw new Error("图片总像素须在 512²～2048² 之间，最长边比例不超过 8:1");
    }
    const other = request.other ?? {};
    const supportedOther = ["negative_prompt", "seed", "prompt_extend", "prompt_extend_mode", "enable_thinking", "watermark"];
    for (const key of Object.keys(other)) {
      if (!supportedOther.includes(key)) throw new Error(`当前适配器不支持额外参数：${key}`);
      const value = other[key];
      if (key === "negative_prompt") {
        if (typeof value !== "string") throw new Error("negative_prompt 必须是字符串");
        parameters[key] = value;
      } else if (key === "seed") {
        if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 2147483647) throw new Error("seed 必须是 0 到 2147483647 的整数");
        parameters[key] = value;
      } else if (["prompt_extend", "enable_thinking", "watermark"].includes(key)) {
        if (typeof value !== "boolean") throw new Error(`${key} 必须是布尔值`);
        parameters[key] = value;
      } else if (key === "prompt_extend_mode") {
        if (value !== "direct" && value !== "agent") throw new Error("prompt_extend_mode 只能是 direct 或 agent");
        if (value === "agent" && images.length) throw new Error("agent 提示词增强仅支持文生图，图片编辑请使用 direct");
        parameters[key] = value;
      }
    }

    const body = {
      model: request.model,
      input: { messages: [{ role: "user", content }] },
      parameters,
    };
    const timeout = AbortSignal.timeout(600000);
    const signal = AbortSignal.any([timeout, ...(this.signal ? [this.signal] : [])]);
    const asynchronous = ["qwen-image-3.0-pro", "qwen-image-3.0", "qwen-image-2.1-pro", "qwen-image-2.1-turbo"].includes(request.model);
    const readResponse = async (response: Response, action: string): Promise<unknown> => {
      const text = await response.text();
      let value: unknown;
      try { value = JSON.parse(text); } catch { value = undefined; }
      if (!response.ok) {
        const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
        const message = typeof record.message === "string" ? record.message : typeof record.code === "string" ? record.code : text.trim() && !/^\s*</.test(text) ? text : "供应商未返回有效 JSON 错误详情";
        const requestId = typeof record.request_id === "string" ? `；请求编号：${record.request_id}` : "";
        throw new Error(`${action}失败（HTTP ${response.status}）：${message.slice(0, 800)}${requestId}`.replaceAll(apiKey, "[Key]"));
      }
      if (!value || typeof value !== "object") throw new Error(`${action}未返回有效 JSON，请检查厂商响应，勿重复提交生成`);
      return value;
    };
    const response = await this.tool.fetch(`${endpoint}/api/v1/services/aigc/${asynchronous ? "image-generation" : "multimodal-generation"}/generation`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", ...(asynchronous ? { "X-DashScope-Async": "enable" } : {}) },
      body: JSON.stringify(body),
      signal,
    });
    let raw = await readResponse(response, "千问图片生成");
    if (asynchronous) {
      const taskId = (raw as { output?: { task_id?: unknown } }).output?.task_id;
      if (typeof taskId !== "string" || !taskId.trim() || taskId.length > 512) throw new Error("千问接口未返回有效任务编号，请检查厂商记录，勿重复提交生成");
      try {
        while (true) {
          signal.throwIfAborted();
          const result = await readResponse(await this.tool.fetch(`${endpoint}/api/v1/tasks/${encodeURIComponent(taskId)}`, { headers: { Authorization: `Bearer ${apiKey}` }, signal }), "查询千问图片任务");
          const output = (result as { output?: { task_status?: string; message?: string; code?: string } }).output;
          if (output?.task_status === "SUCCEEDED") { raw = result; break; }
          if (!["PENDING", "RUNNING"].includes(output?.task_status ?? "")) throw new Error(output?.message || output?.code || `图片任务状态：${output?.task_status || "无效"}`);
          await new Promise<void>((resolve, reject) => {
            const cleanup = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); };
            const abort = () => { cleanup(); reject(signal.reason); };
            const timer = setTimeout(() => { cleanup(); resolve(); }, 5000);
            signal.addEventListener("abort", abort, { once: true });
            if (signal.aborted) abort();
          });
        }
      } catch (reason) {
        if (this.signal?.aborted) throw reason;
        const message = timeout.aborted ? "等待图片生成超过 10 分钟，远端任务可能仍在运行，请先检查厂商记录" : reason instanceof Error ? reason.message : "图片任务查询失败";
        throw new Error(`${message}；任务编号：${taskId}。请勿重复提交生成。`.replaceAll(apiKey, "[Key]"));
      }
    }
    if (!raw || typeof raw !== "object" || !("output" in raw)) throw new Error("千问接口未返回有效的 output 结果");
    const output = (raw as { output?: unknown }).output;
    if (!output || typeof output !== "object" || !("choices" in output) || !Array.isArray((output as { choices?: unknown }).choices)) {
      throw new Error("千问接口返回的 output.choices 格式无效");
    }
    const choices = (output as { choices: unknown[] }).choices;
    const assets: MediaAsset[] = [];
    for (const choice of choices) {
      if (!choice || typeof choice !== "object" || !("message" in choice)) continue;
      const message = (choice as { message?: unknown }).message;
      if (!message || typeof message !== "object" || !("content" in message) || !Array.isArray((message as { content?: unknown }).content)) continue;
      for (const part of (message as { content: unknown[] }).content) {
        if (!part || typeof part !== "object" || !("image" in part) || typeof (part as { image?: unknown }).image !== "string") continue;
        const url = (part as { image: string }).image;
        if (url.startsWith("data:")) {
          const match = url.match(/^data:([^;]+);base64,(.+)$/);
          if (!match) throw new Error("千问接口返回了无效的 Base64 图片数据");
          assets.push({ mediaType: "image", type: "base64", data: match[2], mimeType: match[1] });
        } else {
          let parsed: URL;
          try { parsed = new URL(url); } catch { throw new Error("千问接口返回了无效的图片 URL"); }
          if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("千问接口返回的图片 URL 协议无效");
          assets.push({ mediaType: "image", type: "url", url });
        }
      }
    }
    if (!assets.length) {
      const code = (raw as { code?: unknown }).code;
      const message = (raw as { message?: unknown }).message;
      throw new Error(`千问接口没有返回图片${code ? `（${String(code)}）` : ""}${message ? `：${String(message)}` : ""}`);
    }
    signal.throwIfAborted();
    return assets;
  },
};
