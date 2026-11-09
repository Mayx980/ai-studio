import { configureStudioPort } from "@/ports";
import { createProductionPort } from "@/adapters/production/studio";
import { configureNodeAiPort } from "@toonflow/nodes-scaffold/nodeAi";
import { createNodeAiPort } from "@/adapters/production/nodeAi";
import { configureBrowserViewPort } from "@toonflow/tool-browser-ui/ports";
import { createBrowserViewPort } from "@/adapters/production/browser";
import { configureQuestionPort } from "@toonflow/tool-ask-user-ui/ports";
import { createQuestionPort } from "@/adapters/production/question";

configureStudioPort(createProductionPort());
configureNodeAiPort(createNodeAiPort());
configureBrowserViewPort(createBrowserViewPort());
configureQuestionPort(createQuestionPort());
await import("../bootstrap");
