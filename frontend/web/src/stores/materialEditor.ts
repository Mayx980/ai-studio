import { shallowRef } from "vue";
import type { ReferenceRole, ReferenceCategory } from "@/components/agent/types";

export type MaterialTarget = { role: ReferenceRole; category?: ReferenceCategory };
export const materialEditorState = shallowRef<{ owner: symbol; source?: "canvas"; directory: string; target: MaterialTarget; label: string; apply: (file: File) => void | Promise<void> }>();
