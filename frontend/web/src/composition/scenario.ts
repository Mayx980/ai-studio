import { configureStudioPort } from "@/ports";
import { createScenarioPort, scenarioNames } from "@/scenarios/studio";
import { configureNodeAiPort } from "@toonflow/nodes-scaffold/nodeAi";
import { configureBrowserViewPort } from "@toonflow/tool-browser-ui/ports";
import { configureQuestionPort } from "@toonflow/tool-ask-user-ui/ports";

const selected = new URLSearchParams(window.location.search).get("scenario") ?? import.meta.env.VITE_EXPERIENCE_SCENARIO ?? "empty";
const scenario = scenarioNames.find(name => name === selected) ?? "empty";
const unavailable = async (): Promise<never> => { throw new Error("隔离预览不连接真实工作区或模型服务"); };
configureStudioPort(createScenarioPort(scenario));
configureNodeAiPort({ loadModels: async () => [], async *streamText() { await unavailable(); }, quoteMedia: unavailable, generateMedia: unavailable });
configureBrowserViewPort({ async *observe() { await unavailable(); }, send: unavailable, release: unavailable });
configureQuestionPort({ answer: unavailable });
await import("../bootstrap");
