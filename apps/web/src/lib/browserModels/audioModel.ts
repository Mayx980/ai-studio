type ModelType = "text" | "image" | "video" | "audio";
interface ProviderModel { id: string; label: string; type: ModelType; mode?: string[]; }
type MediaInput =
  | { type: "url"; url: string; mimeType?: string; name?: string }
  | { type: "base64"; data: string; mimeType: string; name?: string }
  | { type: "binary"; data: Uint8Array; mimeType: string; name?: string };
interface AudioRequest {
  model: string; text?: string; prompt?: string;
  audios?: (MediaInput & { text?: string })[]; images?: MediaInput[];
  voice?: string; speed?: number; volume?: number; pitch?: number;
  emotion?: string; language?: string; normalizeText?: boolean;
  format?: string; sampleRate?: number; bitrateKbps?: number;
  other?: Record<string, unknown>;
}
type MediaAsset = MediaInput & { mediaType: "image" | "video" | "audio" };
type Context = { config: { apiKey?: string }; signal?: AbortSignal; tool: { fetch: typeof fetch } };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}
function asText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function safeAbortSignal(parent?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(3 * 60 * 1000);
  return parent ? AbortSignal.any([timeout, parent]) : timeout;
}
async function readJson(response: Response): Promise<Record<string, unknown>> {
  let body: unknown;
  try { body = await response.json(); }
  catch { throw new Error(`火山引擎音频接口返回了无法解析的 JSON（HTTP ${response.status}）`); }
  if (!isRecord(body)) throw new Error(`火山引擎音频接口返回格式不正确（HTTP ${response.status}）`);
  return body;
}
function errorFromBody(body: Record<string, unknown>, fallback: string): Error {
  const code = body.code == null ? "" : String(body.code);
  const message = asText(body.message);
  return new Error([fallback, code ? `错误码 ${code}` : "", message].filter(Boolean).join("："));
}
function mimeTypeFor(format: "mp3" | "wav"): string {
  return format === "mp3" ? "audio/mpeg" : "audio/wav";
}
function validateSampleRate(format: "mp3" | "wav", rate: number): void {
  const allowed = format === "mp3"
    ? [8000, 16000, 24000, 32000, 44100, 48000]
    : [8000, 16000, 24000, 32000, 40000, 44100, 48000];
  if (!allowed.includes(rate)) throw new Error(`${format.toUpperCase()} 采样率仅支持：${allowed.join("、")} Hz`);
}

export default {
  id: "volcengine",
  label: "火山引擎·Seed Audio 1.0",
  version: "2.0.0",
  readme: `接入火山引擎 Seed Audio 1.0 纯文字音频生成接口。

请填写火山引擎新版控制台的 API Key。接口固定为 https://openspeech.bytedance.com/api/v3/tts/create，使用 X-Api-Key 单头鉴权。

仅支持纯文字生成，不接入参考音频或参考图片。输入文字或提示词最多 3000 字符。默认输出 MP3，也可以选择 WAV；MP3 默认采样率为 44100 Hz，WAV 默认采样率为 40000 Hz。生成音频最长 120 秒，接口返回的音频 URL 有效期为 2 小时。`,
  rules: [{
    type: "input", field: "apiKey", title: "火山引擎 API Key", value: "",
    props: { type: "password", showPassword: true, autocomplete: "off" },
  }],
  models: [{
    id: "seed-audio-1.0",
    label: "Seed Audio 1.0 纯文字生成音频",
    type: "audio",
    mode: ["text"],
  }] as ProviderModel[],

  async generateAudio(this: Context, request: AudioRequest): Promise<MediaAsset[]> {
    this.signal?.throwIfAborted();
    const apiKey = this.config.apiKey?.trim();
    if (!apiKey) throw new Error("请先填写火山引擎 API Key");
    if (request.model !== "seed-audio-1.0") throw new Error(`不支持的火山引擎音频模型：${request.model}`);
    if ((request.audios?.length ?? 0) > 0 || (request.images?.length ?? 0) > 0) {
      throw new Error("当前适配器仅支持纯文字生成，不支持参考音频或参考图片");
    }
    if (request.emotion) throw new Error("当前适配器未映射 emotion 参数，请将情绪要求写入提示词");
    if (request.language) throw new Error("当前适配器未映射独立 language 参数，请在提示词中说明生成语言");
    if (request.normalizeText !== undefined) throw new Error("接口文档未提供 normalizeText 参数");
    if (request.bitrateKbps !== undefined) throw new Error("接口文档未提供 MP3 比特率设置，不能应用 bitrateKbps");
    if (request.other && Object.keys(request.other).length) {
      throw new Error(`当前适配器不支持这些附加参数：${Object.keys(request.other).join("、")}`);
    }

    const text = request.text?.trim() ?? "";
    const prompt = request.prompt?.trim() ?? "";
    if (!text && !prompt) throw new Error("请输入要生成的文字或音频提示词");
    const textPrompt = text && prompt
      ? `${prompt}\n\n请按上述要求生成音频，并清晰表达以下文本：\n${text}`
      : (text || prompt);
    if (textPrompt.length > 3000) throw new Error(`合成提示词最多支持 3000 个字符，当前为 ${textPrompt.length} 个字符`);

    const formatValue = (request.format || "mp3").trim().toLowerCase();
    if (formatValue !== "mp3" && formatValue !== "wav") throw new Error("输出格式仅支持 MP3 或 WAV");
    const format = formatValue as "mp3" | "wav";
    const audioConfig: Record<string, unknown> = { format };

    if (request.sampleRate !== undefined) {
      if (!Number.isInteger(request.sampleRate)) throw new Error("采样率必须为整数");
      validateSampleRate(format, request.sampleRate);
      audioConfig.sample_rate = request.sampleRate;
    }
    if (request.speed !== undefined) {
      if (!Number.isFinite(request.speed) || request.speed < 0.5 || request.speed > 2) {
        throw new Error("语速倍率范围为 0.5–2.0，1.0 表示正常语速");
      }
      audioConfig.speech_rate = Math.round((request.speed - 1) * 100);
    }
    if (request.volume !== undefined) {
      if (!Number.isFinite(request.volume)) throw new Error("音量必须是有效数字（dB）");
      const rate = Math.round((Math.pow(10, request.volume / 20) - 1) * 100);
      if (rate < -50 || rate > 100) throw new Error("音量增益超出接口可映射范围（约 -6 至 +6 dB）");
      audioConfig.loudness_rate = rate;
    }
    if (request.pitch !== undefined) {
      if (!Number.isFinite(request.pitch) || request.pitch < -12 || request.pitch > 12) {
        throw new Error("音调偏移范围为 -12 至 +12 个半音");
      }
      audioConfig.pitch_rate = Math.round(request.pitch);
    }

    const body: Record<string, unknown> = {
      model: "seed-audio-1.0", text_prompt: textPrompt, audio_config: audioConfig,
    };
    if (request.voice?.trim()) body.speaker = request.voice.trim();

    const signal = safeAbortSignal(this.signal);
    const response = await this.tool.fetch("https://openspeech.bytedance.com/api/v3/tts/create", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
      body: JSON.stringify(body),
      signal,
    });
    const result = await readJson(response);
    if (!response.ok) throw errorFromBody(result, `火山引擎音频生成失败（HTTP ${response.status}）`);
    signal.throwIfAborted();

    const audio = asText(result.audio);
    const url = asText(result.url);
    if (audio) {
      return [{
        mediaType: "audio", type: "base64",
        data: audio.replace(/^data:[^,]*;base64,/i, ""),
        mimeType: mimeTypeFor(format), name: `seed-audio-1.0.${format}`,
      }];
    }
    if (url && /^https?:\/\//i.test(url)) {
      return [{
        mediaType: "audio", type: "url", url,
        mimeType: mimeTypeFor(format), name: `seed-audio-1.0.${format}`,
      }];
    }
    throw errorFromBody(result, "火山引擎接口未返回音频数据或有效音频 URL");
  },
};
