/// <reference path="./types.d.ts" />

import tfRouterLanguage from "./src/language/tfRouter";
import deepSeek from "./src/language/deepSeek";
import tfRouterMedia from "./src/media/tfRouter";
import apiMart from "./src/media/apiMart";
import metaso from "./src/media/metaso";
import compshare from "./src/media/compshare";

import aliyunImage from "./src/media/aliyunImage";
import aliyunVideo from "./src/media/aliyunVideo";
import seedAudio from "./src/media/seedAudio";

export type Provider = ProviderDefinition;
export type ProviderPrice = NonNullable<Awaited<ReturnType<NonNullable<Provider["getPrice"]>>>>;
export type ProviderPriceRequest = Parameters<NonNullable<Provider["getPrice"]>>[0];
export type ProviderPriceReference = NonNullable<ProviderPriceRequest["images"]>[number];
export type ProviderBalance = Awaited<ReturnType<NonNullable<Provider["getBalance"]>>>;
export type ProviderTools = ProviderContext["tool"];
export type AudioConvertOptions = Parameters<ProviderTools["audio"]["convert"]>[1];
export type { FfmpegFactory, FfmpegCommand } from "@toonflow/ffmpeg/types";

const commonLanguageProviders = [
  ["aliyunBailianQwenText", "阿里云百炼", "https://dashscope.aliyuncs.com/compatible-mode/v1", "qwen3.8-flash"],
  ["siliconflow", "硅基流动", "https://api.siliconflow.cn/v1", ""],
  ["moonshot", "月之暗面 Kimi", "https://api.moonshot.cn/v1", ""],
  ["zhipu", "智谱 GLM", "https://open.bigmodel.cn/api/paas/v4", ""],
  ["openai", "OpenAI Chat Completions", "https://api.openai.com/v1", ""],
].map(([id, label, apiUrl, model]) => ({
  id, label, apiUrl, icon: id === "aliyunBailianQwenText" ? "qwen" : id, version: "2.0.0", protocol: "openai-completions" as const,
  readme: "文字接口使用 Chat Completions；模型 ID 和账号权限以厂商控制台为准。配置不会触发生成。",
  rules: [{ type: "input", field: "apiKey", title: "API Key", value: "", props: { type: "password", showPassword: true, autocomplete: "off" } }],
  models: model ? [{ id: model, label: model, type: "text" as const }] : [],
}));
export const languageProviders = [tfRouterLanguage, deepSeek, ...commonLanguageProviders];
export const mediaProviders = [tfRouterMedia, apiMart, metaso, compshare, aliyunImage, aliyunVideo, seedAudio] as const;
