import { browserModelDefinitions } from "@/lib/browserModelDefinitions";
type AudioRequest = {
  model: string;
  audios?: unknown[]; images?: unknown[]; voice?: string;
  text?: string;
  prompt?: string;
  format?: string;
  sampleRate?: number;
  speed?: number;
  volume?: number;
  pitch?: number;
  language?: string;
  other?: Record<string, unknown>;
};

type Context = {
  config: { apiKey?: string };
  signal?: AbortSignal;
  tool: { fetch: typeof fetch };
};

type MediaAsset = {
  mediaType: "audio";
  type: "base64";
  data: string;
  mimeType: string;
};

export default {
  id: "volcengineSeedAudio",
  label: "火山引擎 Seed-Audio",
  version: "2.0.0",
  readme: "基于火山引擎 Seed-Audio 模型的非流式音频生成接口，支持纯文本生成，涵盖多种音效与音色创作维度。",
  rules: [
    {
      type: "input",
      field: "apiKey",
      title: "API Key",
      value: "",
      props: { type: "password", showPassword: true, autocomplete: "off" },
    },
  ],
  models: browserModelDefinitions.audio.models,
  async generateAudio(this: Context, request: AudioRequest): Promise<MediaAsset[]> {
    this.signal?.throwIfAborted();
    const apiKey = this.config.apiKey?.trim();
    if (!apiKey) throw new Error("请填写 API Key");
    if (!request.model?.trim()) throw new Error("请选择已配置的音频模型");
    if (request.audios?.length || request.images?.length) throw new Error("当前音频协议仅支持文字输入");
    if (request.voice?.trim()) throw new Error("上传的音频适配器不支持独立音色参数，请在提示词中说明");
    if ([request.speed, request.volume, request.pitch, request.sampleRate].some(value => value !== undefined && !Number.isFinite(value))) throw new Error("音频参数必须是有效数字");
    if (request.other && Object.keys(request.other).length) throw new Error("当前音频适配器不接受额外参数");

    const textPrompt = request.text || request.prompt;
    if (!textPrompt || !textPrompt.trim()) throw new Error("请输入待合成的文本内容或提示词");

    const format = request.format || "wav";
    if (!["wav", "mp3", "pcm", "ogg_opus"].includes(format)) throw new Error("音频格式不支持");
    const audioConfig: Record<string, unknown> = {
      format,
    };

    if (request.sampleRate !== undefined) {
      audioConfig.sample_rate = request.sampleRate;
    }
    if (request.speed !== undefined) {
      // 映射 speed (1为正常，此处转为平台刻度 -50 到 100)
      const speechRate = Math.round((request.speed - 1) * 100);
      audioConfig.speech_rate = Math.max(-50, Math.min(100, speechRate));
    }
    if (request.volume !== undefined) {
      const loudnessRate = Math.round(request.volume * 50);
      audioConfig.loudness_rate = Math.max(-50, Math.min(100, loudnessRate));
    }
    if (request.pitch !== undefined) {
      const pitchRate = Math.round(request.pitch);
      audioConfig.pitch_rate = Math.max(-12, Math.min(12, pitchRate));
    }

    const payload: Record<string, unknown> = {
      model: request.model,
      text_prompt: textPrompt,
      audio_config: audioConfig,
      ...(request.other ?? {}),
    };

    const signal = AbortSignal.any([AbortSignal.timeout(120000), ...(this.signal ? [this.signal] : [])]);
    const response = await this.tool.fetch("https://openspeech.bytedance.com/api/v3/tts/create", {
      method: "POST",
      headers: {
        "X-Api-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal,
    });

    if (!response.ok) {
      throw new Error("音频生成请求失败，HTTP " + response.status);
    }

    const result = (await response.json()) as {
      code?: number;
      message?: string;
      audio?: string;
    };

    if (result.code !== undefined && result.code !== 0) {
      throw new Error(`接口返回错误: ${result.message || result.code}`);
    }

    if (!result.audio || typeof result.audio !== "string") {
      throw new Error("接口未返回有效的音频数据");
    }

    signal.throwIfAborted();

    const mimeMap: Record<string, string> = {
      wav: "audio/wav",
      mp3: "audio/mpeg",
      pcm: "audio/L16",
      ogg_opus: "audio/ogg",
    };

    return [
      {
        mediaType: "audio",
        type: "base64",
        data: result.audio,
        mimeType: mimeMap[format] || "audio/wav",
      },
    ];
  },
};