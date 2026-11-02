import type { AgentToolCall, AgentStats, AgentContext, AgentSubAgent, AgentMention } from "@toonflow/server/agent/types";
import type { ProfessionalCreation } from "./professionalCreation";

export type ReferenceRole = "firstFrame" | "reference" | "lastFrame";
export type ReferenceCategory = "character" | "scene" | "prop";
export type AgentAttachment = { name: string; path: string; mimeType: string; file?: File; referenceRole?: ReferenceRole; referenceCategory?: ReferenceCategory; referenceName?: string };

export type AgentMessagePart =
  | { id: string; type: "text"; content: string }
  | { id: string; type: "thinking"; content: string; collapsed?: boolean; duration?: number }
  | { id: string; type: "tool"; tool: AgentToolCall; collapsed?: boolean };

export type AgentMessage = {
  id: string;
  entryId?: string;
  replyTo?: string;
  role: "user" | "assistant";
  content: string;
  attachments?: AgentAttachment[];
  mentions?: AgentMention[];
  parts?: AgentMessagePart[];
  streaming?: boolean;
  browserResultIds?: string[];
  creationChoice?: { prompt: string; needsDetails?: boolean; resolved?: boolean };
  professional?: ProfessionalCreation;
  error?: string;
  report?: { file: string; name: string };
};

export type AgentHistory = { file: string; name: string; modified: string; messageCount: number };

export type AgentConversation = {
  creationMode?: "simple" | "professional";
  file: string;
  name: string;
  messages: AgentMessage[];
  providerId?: string;
  modelId?: string;
  thinkingLevel?: string;
  stats?: AgentStats;
  contextUsage?: AgentContext;
  parentFile?: string;
  subAgents?: AgentSubAgent[];
  running?: boolean;
};
