<template><div ref="editor" class="creationPrompt" role="group" aria-label="创作描述" @paste.capture="emit('paste', $event)" /></template>
<script setup lang="ts">
import { ref, watch } from "vue";
import xSender from "x-sender";
import "x-sender/lib/XSender.css";
import { templatePromptModel } from "@/lib/creationTemplates";
const props = defineProps<{ disabled?: boolean; placeholder?: string }>();
const emit = defineEmits<{ send: []; paste: [event: ClipboardEvent] }>();
const model = defineModel<string>({ required: true });
const editor = ref<HTMLElement>();
let sender: xSender | undefined;
watch(editor, (element, _previous, cleanup) => {
  if (!element) return;
  const instance = new xSender(element, { placeholder: props.placeholder, autoFocus: false, chatStyle: { minHeight: "96px", maxHeight: "32vh", fontSize: "16px", lineHeight: "26px" }, keyboardSendFun: event => event.key === "Enter" && !event.shiftKey && !event.isComposing, keyboardWrapFun: event => event.key === "Enter" && event.shiftKey && !event.isComposing });
  sender = instance;
  instance.bus.on("creationPrompt", xSender.EventSet.EVENT_COMMON_CHANGE, () => { model.value = instance.getText(); });
  instance.bus.on("creationPrompt", xSender.EventSet.EVENT_COMMON_SEND, () => emit("send"));
  if (model.value) void instance.setChatNode(templatePromptModel(model.value));
  if (props.disabled) instance.disable();
  cleanup(() => { instance.destroy(); if (sender === instance) sender = undefined; });
});
watch(model, value => { if (sender && sender.getText() !== value) void sender.reset({ clearHistory: false, chatNode: templatePromptModel(value) }); });
watch(() => props.disabled, value => { if (value) sender?.disable(); else sender?.enable(); });
defineExpose({ focus: () => sender?.focus("last") });
</script>
<style scoped lang="scss">
.creationPrompt { --chat-primary: var(--el-color-primary); --chat-box: transparent; --chat-text: var(--el-text-color-primary); --chat-text-placeholder: var(--el-text-color-placeholder); --chat-card: var(--el-fill-color-light); --chat-rect-padding: 0px; :deep(.chat-tag-input) { color: var(--el-text-color-primary); font-weight: 600; background: var(--el-fill-color-dark); } }
</style>
