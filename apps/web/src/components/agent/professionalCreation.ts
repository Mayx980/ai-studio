import type { BrowserWorkflowNode, ModelKind } from "@/stores/browserGeneration";

export type ProfessionalOption = { id: string; title: string; content: string };
export type ProfessionalCreation = {
  prompt: string;
  sourceText?: string;
  goal: ModelKind | "story" | "storyboard";
  start: "idea" | "story" | "storyboard";
  stage: "analyze" | "brief" | "plans" | "scripts" | "storyReview" | "storyboardReview" | "referenceConsent" | "prompts" | "imageReview" | "videoConsent" | "videoReview" | "done";
  questions: { label: string; answer: string; options?: string[]; selected?: string[]; custom?: string }[];
  plans: ProfessionalOption[];
  scripts: ProfessionalOption[];
  prompts: ProfessionalOption[];
  selectedPlans: string[];
  selectedScript: string;
  selectedPrompt: string;
  selectedPrompts?: string[];
  selectedImages?: string[];
  selectedVideos?: string[];
  generatedPromptIds?: string[];
  mediaDrafts?: { resultId: string; kind: "image" | "video" | "audio"; label: string; prompt: string; model: string; node?: BrowserWorkflowNode }[];
  story?: BrowserWorkflowNode;
  storyboard?: BrowserWorkflowNode;
  images: BrowserWorkflowNode[];
  imageResultIds: string[];
  resultIds: string[];
};

export function isProfessionalCreation(value: unknown): value is ProfessionalCreation {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<ProfessionalCreation>;
  const nodeReference = (node: unknown) => !!node && typeof node === "object" && "canvasPath" in node && typeof node.canvasPath === "string" && "nodeId" in node && typeof node.nodeId === "string";
  const options = (items: unknown) => Array.isArray(items) && items.every(item => item && typeof item.id === "string" && typeof item.title === "string" && typeof item.content === "string");
  return typeof state.prompt === "string" && (state.sourceText === undefined || typeof state.sourceText === "string")
    && ["text", "story", "storyboard", "image", "video", "audio"].includes(state.goal ?? "")
    && ["idea", "story", "storyboard"].includes(state.start ?? "")
    && ["analyze", "brief", "plans", "scripts", "storyReview", "storyboardReview", "referenceConsent", "prompts", "imageReview", "videoConsent", "videoReview", "done"].includes(state.stage ?? "")
    && Array.isArray(state.questions) && state.questions.every(item => item && typeof item.label === "string" && typeof item.answer === "string" && [item.options, item.selected].every(values => values === undefined || Array.isArray(values) && values.every(value => typeof value === "string")) && (item.custom === undefined || typeof item.custom === "string"))
    && [state.plans, state.scripts, state.prompts].every(options)
    && [state.selectedPlans, state.imageResultIds, state.resultIds].every(items => Array.isArray(items) && items.every(item => typeof item === "string"))
    && typeof state.selectedScript === "string" && typeof state.selectedPrompt === "string"
    && [state.story, state.storyboard].every(node => node === undefined || nodeReference(node))
    && Array.isArray(state.images) && state.images.every(nodeReference)
    && [state.selectedPrompts, state.selectedImages, state.selectedVideos, state.generatedPromptIds].every(items => items === undefined || Array.isArray(items) && items.every(item => typeof item === "string"))
    && (state.mediaDrafts === undefined || Array.isArray(state.mediaDrafts) && state.mediaDrafts.every(item => item && typeof item.resultId === "string" && ["image", "video", "audio"].includes(item.kind) && typeof item.label === "string" && typeof item.prompt === "string" && typeof item.model === "string" && (item.node === undefined || nodeReference(item.node))));
}
