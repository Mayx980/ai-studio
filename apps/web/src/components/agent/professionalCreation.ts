import type { BrowserWorkflowNode, ModelKind } from "@/stores/browserGeneration";

export type ProfessionalOption = { id: string; title: string; content: string };
export type ProfessionalCreation = {
  prompt: string;
  sourceText?: string;
  goal: ModelKind | "story" | "storyboard";
  start: "idea" | "story" | "storyboard";
  stage: "analyze" | "brief" | "plans" | "scripts" | "storyReview" | "storyboardReview" | "referenceConsent" | "prompts" | "imageReview" | "videoConsent" | "done";
  questions: { label: string; answer: string }[];
  plans: ProfessionalOption[];
  scripts: ProfessionalOption[];
  prompts: ProfessionalOption[];
  selectedPlans: string[];
  selectedScript: string;
  selectedPrompt: string;
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
    && ["analyze", "brief", "plans", "scripts", "storyReview", "storyboardReview", "referenceConsent", "prompts", "imageReview", "videoConsent", "done"].includes(state.stage ?? "")
    && Array.isArray(state.questions) && state.questions.every(item => item && typeof item.label === "string" && typeof item.answer === "string")
    && [state.plans, state.scripts, state.prompts].every(options)
    && [state.selectedPlans, state.imageResultIds, state.resultIds].every(items => Array.isArray(items) && items.every(item => typeof item === "string"))
    && typeof state.selectedScript === "string" && typeof state.selectedPrompt === "string"
    && [state.story, state.storyboard].every(node => node === undefined || nodeReference(node))
    && Array.isArray(state.images) && state.images.every(nodeReference);
}
