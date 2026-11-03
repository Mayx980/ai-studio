<template>
  <div class="promptInputWrap nodrag nopan nowheel" :class="{ inlineActions: !!actionsTarget }">
    <div v-if="$slots.references" class="referenceCovers"><slot name="references" /></div>
    <teleport :to="actionsTarget || 'body'" :disabled="!actionsTarget"><div class="promptTools" :class="{ inlineTools: !!actionsTarget }">
    <el-tooltip v-if="pickReferences || uploadLocal" content="上传本地文件" placement="top"><el-button class="uploadButton" text circle :disabled="disabled" aria-label="上传本地文件" @click.stop="uploadLocal ? uploadLocal() : pickReferences?.(nodeId, 'local')"><icon-upload :size="17" /></el-button></el-tooltip>
    <el-tooltip v-if="pickReferences" content="引用" placement="top"><el-button class="referenceButton" text circle :disabled="disabled" aria-label="引用" @click.stop="pickReferences(nodeId, 'personal')"><icon-paperclip :size="17" /></el-button></el-tooltip>
    <el-tooltip v-if="optimizeKind" content="优化提示词" placement="top"><el-button class="optimizeButton" text circle :disabled="disabled || !optimizePrompt || !text.trim() || optimizing" :loading="optimizing" title="优化提示词" aria-label="优化提示词" @click.stop="startOptimization"><icon-wand :size="17" /></el-button></el-tooltip>
    </div></teleport>
    <el-tooltip v-if="expandable" content="放大输入框" placement="top"><el-button class="expandButton" :icon="IconArrowsDiagonal" text circle title="放大输入框" aria-label="放大输入框" @mousedown.prevent @click.stop="expanded = true" /></el-tooltip>
    <teleport :to="expandedTarget || 'body'" :disabled="!expanded || !expandedTarget">
      <div ref="senderElement" class="promptInput nodrag nopan nowheel" :class="{ expandedInput: expanded }" @keydown.capture="handleMentionKey" @click.capture="previewReference" />
    </teleport>
  </div>
  <el-dialog v-if="optimizeKind" v-model="optimizationVisible" title="优化提示词" width="min(640px, 94vw)" appendToBody :closeOnClickModal="false" @close="optimizationController?.abort()">
    <el-alert v-if="optimizationError" :title="optimizationError" type="error" :closable="false" />
    <p v-if="optimizing" role="status">正在优化提示词…</p>
    <el-input v-else-if="optimizedText" v-model="optimizedText" type="textarea" :autosize="{ minRows: 6, maxRows: 16 }" aria-label="优化后的提示词" />
    <template #footer><el-button @click="optimizationVisible = false">取消</el-button><el-button type="primary" :disabled="optimizing || !optimizedText.trim()" @click="applyOptimization">应用</el-button></template>
  </el-dialog>
  <el-dialog v-if="expandable" v-model="expanded" class="promptEditorDialog" title="编辑输入内容" width="min(640px, calc(100vw - 32px))" :modal="false" alignCenter appendToBody :closeOnClickModal="false" @opened="sender?.focus('mark')" @close="expanded = false" @closed="sender?.focus('mark')">
    <div ref="expandedTarget" class="promptExpandedTarget nodrag nopan nowheel" @pointerdown.stop @mousedown.stop @dblclick.stop />
  </el-dialog>
  <imageViewer v-if="previewUrl" :urlList="[previewUrl]" @close="previewReferenceId = undefined" />
</template>

<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { ElAlert, ElInput, ElButton, ElDialog, ElTooltip, useZIndex } from "element-plus";
import { IconWand, IconArrowsDiagonal, IconPaperclip, IconUpload } from "@tabler/icons-vue";
import { useNode } from "@vue-flow/core";
import imageViewer from "./imageViewer.vue";
import xSender, { type AnyTagProps, type MentionItem } from "x-sender";
import "x-sender/lib/XSender.css";

const { id: nodeId } = useNode();
const pickReferences = inject<((nodeId: string, scope?: string) => Promise<void>) | undefined>("pickNodeReferences", undefined);
const props = defineProps<{ references: (MentionItem & { value: string })[]; expandable?: boolean; placeholder?: string; optimizeKind?: "image" | "video" | "audio"; actionsTarget?: HTMLElement; uploadLocal?: () => void; disabled?: boolean }>();
const model = defineModel<AnyTagProps[][]>({ required: true });
const text = defineModel<string>("text", { default: "" });
const optimizePrompt = inject<((prompt: string, kind: "image" | "video" | "audio", signal: AbortSignal) => Promise<string>) | undefined>("optimizeNodePrompt", undefined);
const optimizationVisible = ref(false), optimizing = ref(false), optimizedText = ref(""), optimizationError = ref("");
let optimizationController: AbortController | undefined;
let originalPrompt = "";
let originalReferences = "";
onBeforeUnmount(() => optimizationController?.abort());
async function startOptimization() {
  if (!optimizePrompt || !props.optimizeKind || optimizing.value || !text.value.trim()) return;
  originalPrompt = text.value;
  originalReferences = JSON.stringify(props.references.map(item => [item.id, item.value]));
  optimizedText.value = ""; optimizationError.value = ""; optimizationVisible.value = true; optimizing.value = true;
  const controller = new AbortController(); optimizationController = controller;
  try { const result = await optimizePrompt(originalPrompt, props.optimizeKind, controller.signal); if (!controller.signal.aborted) optimizedText.value = result; }
  catch (error) { if (!controller.signal.aborted) optimizationError.value = error instanceof Error ? error.message : "提示词优化失败"; }
  finally { optimizing.value = false; }
}
function applyOptimization() {
  if (text.value !== originalPrompt || originalReferences !== JSON.stringify(props.references.map(item => [item.id, item.value]))) { optimizationError.value = "原提示词或引用已变化，请关闭后重新优化。"; return; }
  const tokens = (value: string) => (value.match(/\{\{ref \d+\}\}/g) ?? []).sort().join("|");
  if (tokens(optimizedText.value) !== tokens(originalPrompt)) { optimizationError.value = "优化结果的引用标记发生变化，请保留原标记后再应用。"; return; }
  model.value = optimizedText.value.split("\n").map(value => [{ type: "Write", text: value }]);
  text.value = optimizedText.value;
  optimizationVisible.value = false;
}
const senderElement = ref<HTMLElement>();
const expanded = ref(false);
const expandedTarget = ref<HTMLElement>();
const { nextZIndex } = useZIndex();
const previewReferenceId = ref<string>();
const previewUrl = computed(() => String(props.references.find(item => item.id === previewReferenceId.value)?.avatar ?? ""));
let sender: xSender | undefined;
let resetTask: Promise<void> | undefined;

function previewReference(event: MouseEvent) {
  const tag = event.target instanceof Element ? event.target.closest<HTMLElement>(".imageReference[data-reference-id]") : null;
  const reference = props.references.find(item => item.id === tag?.dataset.referenceId);
  if (!reference?.avatar) return;
  event.preventDefault();
  event.stopPropagation();
  sender?.bus.emit(xSender.EventSet.EVENT_COMMON_DIALOG_CLOSE);
  previewReferenceId.value = reference.id;
}

function referenceHtml(reference: MentionItem & { value: string }) {
  const tag = document.createElement("span");
  tag.className = "imageReference";
  tag.dataset.referenceId = reference.id;
  tag.dataset.value = reference.value;
  if (reference.avatar) {
    const image = document.createElement("img");
    image.src = String(reference.avatar);
    image.alt = "";
    image.draggable = false;
    tag.append(image);
  }
  tag.append(document.createTextNode(reference.name));
  return tag.outerHTML;
}

function normalizeModel(value: AnyTagProps[][]): AnyTagProps[][] {
  if (!value.length) return [[{ type: "Write", text: "" }]];
  return value.map(line => {
    const tags = line.flatMap((tag): AnyTagProps[] => {
      if (tag.type === "Write") return tag.text.split(/(\{\{ref \d+\}\})/g).map(text => {
        const reference = props.references.find(item => item.value === text);
        return reference
          ? { type: "Custom", html: `<span style="display: inline-block;">${referenceHtml(reference)}</span>` }
          : { type: "Write", text };
      });
      if (tag.type !== "Custom") return [tag];
      const template = document.createElement("template");
      template.innerHTML = tag.html;
      const id = template.content.querySelector<HTMLElement>(".imageReference[data-reference-id]")?.dataset.referenceId;
      if (!id) return [tag];
      const reference = props.references.find(item => item.id === id);
      if (!reference) return [];
      return [{ type: "Custom", html: `<span style="display: inline-block;">${referenceHtml(reference)}</span>` }];
    });
    const next: AnyTagProps[] = [{ type: "Write", text: "" }];
    for (const tag of tags) {
      const previous = next[next.length - 1];
      if (tag.type === "Write" && previous.type === "Write") previous.text += tag.text;
      else {
        if (tag.type !== "Write" && previous.type !== "Write") next.push({ type: "Write", text: "" });
        next.push(tag);
      }
    }
    if (next[next.length - 1].type !== "Write") next.push({ type: "Write", text: "" });
    return next;
  });
}

function releaseNodeFocus(instance: xSender) {
  // ACT: 1.4.6 的排队输入回调仍会聚焦旧 Write；仅让即将移除的节点失效，库支持取消回调后可移除。
  for (const grid of instance.chatEditor.NODES) {
    for (const node of grid.children) {
      if (node.type === "Write" || node.type === "Input") node.focus = () => {};
    }
  }
}

function syncModel(value = sender?.getModel() ?? model.value) {
  // 输入法组字时只同步文本，等 compositionend 后再替换参考标签，保留正在编辑的 DOM。
  const next = sender?.chatEditor.isComposition ? value : normalizeModel(value);
  if (sender && JSON.stringify(sender.getModel()) !== JSON.stringify(next)) {
    const instance = sender;
    const editor = instance.chatElement.richText;
    const selection = instance.getSelection();
    const focused = document.activeElement === editor;
    const endpoints = focused ? [selection.anchorNode, selection.focusNode].map((node, index) => {
      const gridIndex = instance.chatEditor.NODES.findIndex(grid => grid.$el.contains(node));
      const grid = instance.chatEditor.NODES[gridIndex];
      const childIndex = grid?.children.findIndex(child => child.$el.contains(node)) ?? -1;
      const child = grid?.children[childIndex];
      return {
        gridIndex, childIndex,
        text: child?.type === "Write" || child?.type === "Input" ? child.text : undefined,
        offset: index ? selection.focusOffset : selection.anchorOffset,
      };
    }) : [];
    releaseNodeFocus(instance);
    const task = instance.reset({ chatNode: next, clearHistory: false });
    resetTask = task;
    void task.finally(() => { if (resetTask === task) resetTask = undefined; });
    // ACT: reset 同步重建 DOM，但下一帧会强制移到末尾；在此恢复选区，并在 reset 完成前抑制该次聚焦。
    const last = instance.chatEditor.NODES.at(-1)?.children.at(-1);
    if (last?.type === "Write") {
      Object.assign(instance.getCurrentNode(), { instance: last, node: last.$el.children[0].firstChild, offset: last.text.length || 1 });
    }
    const restored = endpoints.map(endpoint => {
      const target = instance.chatEditor.NODES[endpoint.gridIndex]?.children[endpoint.childIndex];
      if ((target?.type !== "Write" && target?.type !== "Input") || target.text !== endpoint.text) return;
      const node = target.type === "Write" ? target.$el.children[0].firstChild : target.$el.children[0].children[0].firstChild;
      if (node?.nodeType !== Node.TEXT_NODE || endpoint.offset > (node.textContent?.length ?? 0)) return;
      return { target, node, offset: endpoint.offset };
    });
    const [anchor, focus] = restored;
    if (anchor && focus) {
      focus.target.focus(focus.offset);
      selection.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset);
    } else if (focused && last?.type === "Write") last.focus(-1);
  }
  updateModel(next);
}

function getStoredModel(value: AnyTagProps[][]): AnyTagProps[][] {
  return value.map(line => line.map(tag => {
    if (tag.type !== "Custom") return tag;
    const template = document.createElement("template");
    template.innerHTML = tag.html;
    // 参考缩略图及其临时地址只用于显示，不进入持久化模型。
    const images = template.content.querySelectorAll(".imageReference img");
    if (!images.length) return tag;
    for (const image of images) image.remove();
    return { ...tag, html: template.innerHTML };
  }));
}

function updateModel(value: AnyTagProps[][]) {
  const next = getStoredModel(value);
  // ACT: 旧模型中的预览地址随下次实际编辑清理，避免仅打开文档就触发保存。
  if (JSON.stringify(getStoredModel(model.value)) !== JSON.stringify(next)) model.value = next;
  text.value = getPromptText(next);
}

function getPromptText(value: AnyTagProps[][]) {
  return value.map(line => line.map(tag => {
    if (tag.type === "Write") return tag.text;
    if (tag.type === "Input") return tag.text || tag.placeholder;
    if (tag.type !== "Custom") {
      const prefix = tag.type === "Mention" ? "@" : tag.type === "Trigger" ? tag.key : "";
      return prefix + tag.name;
    }
    const content = document.createElement("template");
    content.innerHTML = tag.html;
    for (const reference of content.content.querySelectorAll<HTMLElement>(".imageReference[data-value]")) {
      reference.replaceWith(reference.dataset.value ?? "");
    }
    return content.content.textContent ?? "";
  }).join("")).join("\n");
}

watch(model, (value) => {
  if (sender && JSON.stringify(getStoredModel(value)) !== JSON.stringify(getStoredModel(sender.getModel()))) syncModel(value);
}, { deep: true });

watch(() => props.references, async (options) => {
  const instance = sender;
  if (!instance) return;
  instance.bus.emit(xSender.EventSet.EVENT_COMMON_DIALOG_CLOSE);
  instance.updateConfig({ mentionConfig: { dialogTitle: "选择参考", callEvery: false, options } });
  // 等库将本帧的输入 DOM 写回模型后再更新参考，避免用旧文本重建输入框。
  await instance.nextTick();
  if (sender === instance) syncModel();
}, { deep: true });

watch(senderElement, (element, _previous, onCleanup) => {
  if (!element) return;
  const popup = document.createElement("div");
  popup.className = "textNodeMentions nodrag nopan nowheel";
  popup.style.zIndex = String(nextZIndex());
  document.body.appendChild(popup);
  const initialModel: AnyTagProps[][] = model.value.length ? model.value : text.value.split("\n").map(text => [{ type: "Write", text }]);
  const instance = new xSender(element, {
    autoFocus: false,
    placeholder: props.placeholder ?? "描述一下生成风格提示词，输入 @ 引用参考",
    chatStyle: { minHeight: "70px", maxHeight: "180px", fontSize: "14px", lineHeight: "1.6" },
    getPopupContainer: () => popup,
    mentionConfig: { dialogTitle: "选择参考", callEvery: false, options: props.references },
    keyboardSendFun: () => false,
    keyboardWrapFun: event => event.key === "Enter" && !event.isComposing,
  });
  sender = instance;
  // ACT: 弹窗只移动现有编辑器，保留参考标签、光标与撤销记录。
  const stopExpandedWatch = watch([expanded, expandedTarget], async ([visible, target]) => {
    instance.bus.emit(xSender.EventSet.EVENT_COMMON_DIALOG_CLOSE);
    instance.updateConfig({ chatStyle: { minHeight: visible ? "100%" : "70px", maxHeight: visible ? "100%" : "180px" } });
    if (!visible || !target) return;
    await nextTick();
    if (sender !== instance || !expanded.value) return;
    popup.style.zIndex = String(nextZIndex());
  });
  const editor = instance.chatElement.richText;
  // ACT: 1.4.6 未检查卸载节点和空 Range 矩形；只适配当前实例，升级到库内修复后可移除。
  const chatEditor = instance.chatEditor as typeof instance.chatEditor & {
    focusFirst(): void;
    focusLast(): void;
    focusMark(): void;
    cursorView(): void;
    insertNodes(nodes: AnyTagProps[][]): Promise<void>;
  };
  for (const method of ["focusFirst", "focusLast", "focusMark"] as const) {
    const focus = chatEditor[method].bind(chatEditor);
    chatEditor[method] = () => {
      if (sender !== instance || !editor.isConnected || !editor.getClientRects().length) return;
      if (method === "focusLast" && resetTask) return;
      if (method === "focusMark" && !editor.contains(instance.getCurrentNode().node)) return chatEditor.focusLast();
      focus();
    };
  }
  const cursorView = chatEditor.cursorView.bind(chatEditor);
  chatEditor.cursorView = () => {
    const selection = instance.getSelection();
    if (sender !== instance || !editor.isConnected || !selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer) || !range.getClientRects().length || !editor.parentElement?.getClientRects().length) return;
    cursorView();
  };
  const insertNodes = chatEditor.insertNodes.bind(chatEditor);
  chatEditor.insertNodes = async nodes => {
    // 选区粘贴会先异步删除，再插入；关闭输入框后不再创建并聚焦新节点。
    if (sender === instance && editor.isConnected) await insertNodes(nodes);
  };
  editor.setAttribute("role", "textbox");
  editor.setAttribute("aria-label", "生成提示词");
  editor.setAttribute("aria-multiline", "true");
  instance.bus.on("textPrompt", xSender.EventSet.EVENT_COMMON_CHANGE, () => syncModel());
  syncModel(initialModel);
  // ACT: XSender 1.4.6 默认复制标签名称；复用库截取的选区模型，仅覆盖纯文本，保留富文本粘贴。
  const copyText = (event: ClipboardEvent) => {
    const copied = event.clipboardData?.getData("application/chat-nodes");
    if (copied) event.clipboardData?.setData("text/plain", getPromptText(JSON.parse(copied)));
  };
  editor.addEventListener("copy", copyText);
  editor.addEventListener("cut", copyText);
  const selectReference = (event: MouseEvent) => {
    const item = (event.target as Element).closest<HTMLElement>(".chat-mention-dialog-item");
    if (!item) return;
    event.preventDefault();
    event.stopPropagation();
    const reference = props.references.find(reference => reference.id === item.dataset.id);
    if (reference) void insertReference(reference);
  };
  const closeOutside = (event: PointerEvent) => {
    if (!element.contains(event.target as Node) && !popup.contains(event.target as Node)) {
      instance.bus.emit(xSender.EventSet.EVENT_COMMON_DIALOG_CLOSE);
    }
  };
  // ACT: XSender 1.4.6 的候选默认插入 Mention；捕获选择事件改用公开 setHtml，库支持自定义渲染后可替换。
  popup.addEventListener("click", selectReference, true);
  document.addEventListener("pointerdown", closeOutside, true);
  onCleanup(() => {
    stopExpandedWatch();
    updateModel(instance.getModel());
    releaseNodeFocus(instance);
    sender = undefined;
    editor.removeEventListener("copy", copyText);
    editor.removeEventListener("cut", copyText);
    document.removeEventListener("pointerdown", closeOutside, true);
    popup.removeEventListener("click", selectReference, true);
    // ACT: 1.4.6 的 destroy 会删除排队回调仍需用到的字段；先走公开清理事件，库修复后可直接 destroy。
    instance.bus.offKeyEvent("textPrompt");
    instance.bus.emit(xSender.EventSet.EVENT_COMMON_DIALOG_CLOSE);
    instance.updateConfig({ mentionConfig: { dialogTitle: "选择参考", callEvery: false, options: [] } });
    instance.bus.emit(xSender.EventSet.EVENT_COMMON_DESTROY);
    popup.remove();
  });
});

async function insertReference(reference: MentionItem) {
  const instance = sender;
  if (!instance) return;
  const cursor = instance.getCurrentNode();
  const before = cursor.node.textContent?.slice(0, cursor.offset) ?? "";
  const start = before.lastIndexOf("@");
  if (start < 0) return;
  instance.bus.emit(xSender.EventSet.EVENT_COMMON_DIALOG_CLOSE);
  await instance.backspace(start - before.length);
  const current = props.references.find(item => item.id === reference.id);
  if (sender === instance && current) await instance.setHtml(referenceHtml(current));
}

function handleMentionKey(event: KeyboardEvent) {
  if (!sender || event.isComposing || !["ArrowUp", "ArrowDown", "Enter", "Escape"].includes(event.key)) return;
  const dialog = sender.chatElement.dialogRoot.querySelector<HTMLElement>(".chat-mention-dialog-wrap");
  if (!dialog?.getClientRects().length) return;
  event.preventDefault();
  event.stopPropagation();
  if (event.key === "Escape") {
    sender.bus.emit(xSender.EventSet.EVENT_COMMON_DIALOG_CLOSE);
    return;
  }
  // ACT: 1.4.6 的候选键盘监听在 window，会被骨架截断；只适配当前实例，库支持局部键盘 API 后可替换。
  const items = Array.from(dialog.querySelectorAll<HTMLElement>(".chat-mention-dialog-item")).filter(item => item.getClientRects().length);
  if (!items.length) return;
  const active = Math.max(0, items.findIndex(item => item.classList.contains("active")));
  if (event.key === "Enter") {
    items[active]?.click();
    return;
  }
  const next = (active + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
  items.forEach((item, index) => item.classList.toggle("active", index === next));
  items[next]?.scrollIntoView({ block: "nearest" });
}
</script>

<style scoped lang="scss">
.promptInputWrap {
  position: relative;
  margin: 12px 0 16px;
  padding: 8px 8px 36px;
  border: 0;
  border-radius: 0;
  background: transparent;
  .referenceCovers { display: flex; margin-bottom: 8px; overflow-x: auto; }
  &.inlineActions { padding-bottom: 8px; margin-bottom: 12px; }

  .expandButton {
    position: absolute;
    top: 2px;
    right: 10px;
    z-index: 11;
    width: 24px;
    height: 24px;
    padding: 4px;
    color: var(--el-text-color-secondary);
  }

  &:has(.expandButton) .promptInput {
    :deep(.chat-rich-text > [contenteditable]),
    :deep(.chat-placeholder-wrap) { padding-right: 34px; }
  }
}

.promptTools { position: absolute; left: 8px; right: 8px; bottom: 4px; z-index: 1; display: flex; align-items: center; justify-content: space-between; gap: 4px; .el-button { margin: 0; } &.inlineTools { position: static; justify-content: flex-start; } }

:global(.el-dialog.promptEditorDialog.is-align-center) {
  display: flex;
  flex-direction: column;
  height: min(42dvh, 360px);
  min-height: min(240px, calc(100dvh - 32px));
  max-height: calc(100dvh - 32px);
  margin: auto;
  border: 1px solid var(--el-border-color);
  border-radius: 14px;
}

:global(.promptEditorDialog .el-dialog__body) { flex: 1; min-height: 0; }
.promptExpandedTarget { height: 100%; }

.promptInput,
:global(.textNodeMentions) {
  --chat-primary: var(--el-color-primary);
  --chat-text: var(--el-text-color-primary);
  --chat-text-secondary: var(--el-text-color-regular);
  --chat-text-placeholder: var(--el-text-color-placeholder);
  --chat-box: var(--el-bg-color-overlay);
  --chat-card: var(--el-fill-color-light);
  --chat-highlight: var(--el-color-primary-light-3);
  --chat-highlight-card: var(--el-fill-color);
  --chat-box-shadow: var(--el-box-shadow-light);
  --chat-rect-padding: 0px;
}

:global(.textNodeMentions) {
  position: fixed;
  inset: 0;
  pointer-events: none;
}

:global(.textNodeMentions .chat-dialog-wrap .chat-mention-dialog-wrap.chat-view-show) {
  animation: none;
}

.promptInput {
  --chat-box: transparent;
  display: block;
  cursor: text;
  -webkit-user-select: text;
  user-select: text;

  &.expandedInput {
    height: 100%;
    margin: 0;
  }

  &:deep(.imageReference) {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin: 0 3px;
    padding: 2px 6px 2px 2px;
    border: 1px solid var(--el-border-color-lighter);
    border-radius: var(--el-border-radius-base);
    background: var(--el-fill-color-light);
    color: var(--el-text-color-primary);
    font-size: 12px;
    line-height: 18px;
    white-space: nowrap;
    vertical-align: middle;

    &:has(img) {
      cursor: zoom-in;
    }

    img {
      width: 18px;
      height: 18px;
      flex-shrink: 0;
      object-fit: cover;
      border-radius: 3px;
      pointer-events: none;
    }
  }

  &:deep(.chat-placeholder-wrap) {
    font-style: normal;
    -webkit-user-select: none;
    user-select: none;
  }
}
</style>
