import "@/lib/browserCrypto";
import { configureStudioPort } from "@/ports";
import { createScenarioPort, scenarioNames } from "@/scenarios/studio";
import { configureNodeAiPort } from "@toonflow/nodes-scaffold/nodeAi";
import { configureBrowserViewPort } from "@toonflow/tool-browser-ui/ports";
import { configureQuestionPort } from "@toonflow/tool-ask-user-ui/ports";
import { configurePrototypePort } from "@/ports/prototype";

const selected = new URLSearchParams(window.location.search).get("scenario") ?? import.meta.env.VITE_EXPERIENCE_SCENARIO ?? "empty";
const scenario = scenarioNames.find(name => name === selected) ?? "empty";
const unavailable = async (): Promise<never> => { throw new Error("隔离预览不连接真实工作区或模型服务"); };
const unavailableSync = (): never => { throw new Error("隔离预览不连接浏览器项目或原型账号"); };
configurePrototypePort({
  workspaceMode: false,
  supportsCreation: false,
  requiresAccount: false,
  readLegacyState: () => null,
  readAccount: () => null,
  writeAccount: unavailableSync,
  clearAccount: unavailableSync,
  createWorkspaceFiles: () => undefined,
  nodeAi: { getModels: async () => [], getMediaModels: async () => [], generate: unavailable, generateImage: unavailable, generateVideo: unavailable, generateAudio: unavailable },
  generateText: unavailable,
  generateMedia: unavailable,
  readMedia: unavailable,
  loadModels: unavailable,
});
configureStudioPort(createScenarioPort(scenario));
configureNodeAiPort({ loadModels: async () => [], async *streamText() { await unavailable(); }, quoteMedia: unavailable, generateMedia: unavailable });
configureBrowserViewPort({ async *observe() { await unavailable(); }, send: unavailable, release: unavailable });
configureQuestionPort({ answer: unavailable });
await import("../bootstrap");
