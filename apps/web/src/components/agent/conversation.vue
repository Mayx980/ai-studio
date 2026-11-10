<template>
  <div class="agentConversation" :class="{ emptyConversation: !messages.length && !props.materialEditor }">
    <div class="messageViewport t-chat t-chat--normal">
      <div ref="messageList" class="messageList t-chat__list" role="region" aria-label="对话消息" tabindex="0">
        <chat-item v-if="!messages.length && !disabled && !props.materialEditor" role="assistant" variant="text">
          <template #content>
            <section class="welcomeMessage" aria-label="开始新对话">
              <div class="welcomeHeader">
                <span class="welcomeIcon" aria-hidden="true"><brandLogo /></span>
                <div>
                  <h3>今天，你想创造什么？</h3>
                </div>
              </div>
            </section>
          </template>
        </chat-item>
        <div class="messageSpace" :style="{ height: `${messageVirtualizer.getTotalSize()}px` }">
          <div
            v-for="{ item, row } in visibleMessages"
            :key="item.id"
            :ref="measureMessage"
            :data-index="row.index"
            :data-message-id="item.id"
            :data-live-message="item.streaming || item.id === browserMessages.liveMessageId || undefined"
            class="messageRow"
            :style="{ transform: `translateY(${row.start}px)` }"
            :class="{ userMessage: item.role === 'user', editingMessage: editingId === item.id }">
            <chat-item :role="item.role" :variant="item.role === 'user' ? 'base' : 'text'" :textLoading="!!item.streaming && !compacting && !item.parts?.some(part => part.type === 'tool' || part.content)" animation="moving" @vue:updated="measureMessage($event.el?.parentElement ?? null)">
              <template #content>
                <div class="messageContent">
                  <div v-if="item.report" class="reportHeader"><icon-users-group :size="14" />{{ item.report.name }} 上报</div>
                  <template v-for="part in item.parts" :key="part.id">
                    <chat-reasoning v-if="part.type === 'thinking' && part.content" class="messageReasoning" :collapsed="part.collapsed ?? true" expandIconPlacement="left" @update:collapsed="part.collapsed = $event">
                      <template #expandIcon><component :is="(part.collapsed ?? true) ? IconChevronRight : IconChevronDown" :size="14" aria-hidden="true" /></template>
                      <template #header>
                        <span class="reasoningHeader">
                          <icon-atom :size="14" />
                          <span>思考</span>
                          <span v-if="part.duration !== undefined" class="thinkingDuration">{{ part.duration.toFixed(1) }} 秒</span>
                        </span>
                      </template>
                      <messageMarkdown v-if="!(part.collapsed ?? true)" :content="part.content" :streaming="!!item.streaming" :directory="directory" />
                    </chat-reasoning>
                    <toolMessage v-else-if="part.type === 'tool' && !isBrowserTool(part.tool)" v-model:collapsed="part.collapsed" :tool="part.tool" :directory="directory" @copy="copyMessage" />
                    <messageMarkdown v-else-if="part.type === 'text' && part.content" :content="part.content" :streaming="!!item.streaming" :directory="directory" />
                  </template>
                  <attachmentList v-if="item.attachments?.length" :attachments="item.attachments" :directory="directory" />
                  <div v-if="item.role === 'user'" class="messageText"><mentionContent :content="item.content" :mentions="item.mentions" :directory="directory" /></div>
                  <browserModelResults :ref="value => setMessageResults(item.id, value)" v-if="item.browserResultIds?.length && !item.professional" :directory="directory" :resultIds="item.browserResultIds" :showStatus="false" :showCanvas="false" @enterCanvas="addMessageToCanvas(item)" :showReference="false" :applicationLabel="props.materialEditor ? props.materialLabel : undefined" :framePosition="props.materialRole && props.materialRole !== 'reference' ? props.materialRole === 'lastFrame' ? 'last' : 'first' : undefined" :disabled="locked" @busy="setMaterialBusy" @apply="emit('applyMaterial', $event)" @reference="referenceGeneratedFile" />
                  <professionalCreation v-if="item.professional && directory" :state="item.professional" :sourceSessionFile="browserSessionFile" :directory="directory" :stopToken="professionalStopToken" :attachments="messages.find(message => message.id === item.replyTo)?.attachments ?? []" :disabled="props.disabled || busy || browserSubmitting || deletingId !== undefined" @busy="professionalBusy = $event" @change="saveProfessionalProgress" @results="item.browserResultIds = $event" />
                  <div v-if="item.creationChoice && !item.creationChoice.resolved" class="creationChoices" role="group" aria-label="选择创作内容">
                    <p>{{ item.creationChoice.needsDetails ? "请先补充创作主体或用途，再确认要生成的内容。" : "你希望生成哪种内容？确认后我会在画布搭建节点和连线。" }}</p>
                    <el-button v-for="choice in item.creationChoice.needsDetails ? [] : creationChoices" :key="choice.label" size="small" :disabled="locked" @click="continueCreation(item, choice.kind, choice.script, choice.label)">{{ choice.label }}</el-button>
                  </div>
                  <div v-if="item.error" class="messageError" role="alert">{{ item.error }}</div>
                </div>
              </template>
            </chat-item>
            <div v-if="!item.streaming" class="messageActions">
              <template v-if="editingId === item.id">
                <el-button text size="small" :disabled="busy || deletingId !== undefined" @click="cancelEdit"><icon-x :size="14" />取消</el-button>
                <span class="editingHint">正在下方编辑</span>
              </template>
              <template v-else>
                <el-button v-if="item.content" class="messageAction" text circle aria-label="复制消息" title="复制消息" @click="copyMessage(mentionPlainText(item.content, item.mentions))"><icon-copy :size="14" /></el-button>
                <template v-if="item.role === 'user'">
                  <el-button class="messageAction" text circle :disabled="locked || remoteRunning" aria-label="编辑消息" title="编辑消息" @click="editMessage(item)"><icon-pencil :size="14" /></el-button>
                </template>
                <el-tooltip v-if="props.materialEditor && item.role === 'assistant' && !item.professional && hasApplicableMaterial(item)" content="应用" placement="top"><el-button class="messageAction" text circle :disabled="locked" aria-label="应用" @click="messageResults.get(item.id)?.applyFirst()"><icon-check :size="14" /></el-button></el-tooltip>
                <el-tooltip v-if="item.role === 'assistant'" content="引用到输入框" placement="top">
                  <el-button class="messageAction" text circle :disabled="locked" aria-label="引用到输入框" @click="referenceMessageResults(item)"><icon-paperclip :size="14" /></el-button>
                </el-tooltip>
                <el-tooltip v-if="item.role === 'assistant' && !item.professional && !props.materialEditor && (sessionMode ?? workspaceStore.creationMode) === 'simple'" content="进入画布" placement="top"><el-button class="messageAction" text circle :disabled="locked" aria-label="进入画布" @click="addMessageToCanvas(item)"><icon-square-plus :size="14" /></el-button></el-tooltip>
                <el-button v-if="!item.report" class="messageAction" text circle :loading="deletingId === item.id" :disabled="locked || remoteRunning" aria-label="删除消息" title="删除消息" @click="deleteMessage(item)"><icon-trash v-if="deletingId !== item.id" :size="14" /></el-button>
              </template>
            </div>
            <browserPanel v-if="browserMessages.tools.has(item.id)" class="browserPreview" :tools="browserMessages.tools.get(item.id)!" :directory="directory" :active="active" :live="item.id === browserMessages.liveMessageId" />
          </div>
        </div>
      </div>
      <el-button v-if="messages.length && !atLatestMessage" class="scrollBottom" circle aria-label="回到最新消息" title="回到最新消息" @click="messageVirtualizer.scrollToEnd()"><icon-arrow-down :size="18" /></el-button>
    </div>
    <div v-if="compacting" class="compactionStatus" role="status">
      <el-icon class="is-loading" aria-hidden="true"><icon-loader-2 :size="14" /></el-icon>
      <span>正在压缩上下文…</span>
    </div>
    <creationModeSwitch v-if="props.creationModes && !props.materialEditor && !messages.length" v-model="workspaceStore.creationMode" class="conversationMode" />
    <div class="messageInput" :class="{ draggingAttachments }" @dragenter.capture="dragEnterAttachments" @dragover.capture="dragOverAttachments" @dragleave.capture="dragLeaveAttachments" @drop.capture="dropAttachments">
      <div v-if="draggingAttachments" class="attachmentDropHint" role="status">
        <icon-paperclip :size="20" aria-hidden="true" />
        <span>松开添加附件</span>
        <small>图片、视频、文档或代码文件</small>
      </div>
      <div v-if="editingId" class="editingBanner"><span>编辑消息</span><el-button text size="small" :disabled="busy" @click="cancelEdit">取消</el-button></div>
      <el-button v-if="props.materialEditor" class="materialUpload" text size="small" :disabled="locked" aria-label="上传参考素材" @click="attachmentInput?.click()"><icon-paperclip :size="16" />上传参考素材</el-button>
      <div
        class="senderResizeHandle"
        role="separator"
        aria-orientation="horizontal"
        aria-label="调整输入框高度"
        aria-valuemin="44"
        :aria-valuemax="senderMaxHeight"
        :aria-valuenow="senderHeight"
        tabindex="0"
        title="拖动调整输入框高度"
        @focus="senderHeight = sender?.chatElement.rollBox.clientHeight ?? 44"
        @pointerdown="startSenderResize"
        @pointermove="moveSenderResize"
        @pointerup="stopSenderResize"
        @pointercancel="stopSenderResize"
        @lostpointercapture="stopSenderResize"
        @keydown.up.prevent="setSenderHeight((sender?.chatElement.rollBox.clientHeight ?? 44) + 16)"
        @keydown.down.prevent="setSenderHeight((sender?.chatElement.rollBox.clientHeight ?? 44) - 16)" />
      <simpleReferenceSlots v-if="props.creationModes && !props.materialEditor && workspaceStore.creationMode === 'simple'" v-model="draftAttachments" v-model:mode="referenceMode" :showFrames="browserConfig.outputKind === 'video'" :tabsTarget="referenceTabsTarget" :directory="directory" :disabled="locked" @edit="editReferenceAttachment" />
      <attachmentList v-if="unassignedAttachments.length" class="draftAttachments" numbered :attachments="unassignedAttachments" :directory="directory" removable restorable :disabled="locked" @remove="removeVisibleAttachment($event)" @restore="restoreVisibleAttachment" />
      <div ref="senderElement" class="senderEditor" @pointerdown.capture="inputStarted = true" @input.capture="inputStarted = true" @keydown.capture="handleSenderKeydown"></div>
      <teleport v-for="target in draftMentionTargets" :key="target.key" :to="target.element"><mentionThumbnail v-bind="mentionThumbnailProps(target.mention)" :directory="directory"><icon-photo :size="14" /></mentionThumbnail></teleport>
      <mentionContent ref="draftMentionPreview" :mentions="draftMentions" :directory="directory" removable @remove="removeDraftMention" />
      <div class="senderActions" :class="{ simpleToolbar: props.creationModes && (props.materialEditor || workspaceStore.creationMode === 'simple') }">
        <simpleGenerationTools v-if="props.creationModes && (props.materialEditor || workspaceStore.creationMode === 'simple')" controls="tabs" :lockedKind="lockedGenerationKind" @select="selectGenerationKind" :imageOnly="props.materialEditor && !!props.materialRole && props.materialRole !== 'reference'" :disabled="locked" />
        <div v-if="props.creationModes && !props.materialEditor && workspaceStore.creationMode === 'simple'" ref="referenceTabsTarget" class="referenceTabsTarget" />
        <browserModelOptions :disabled="locked" :belowInput="props.creationModes && workspaceStore.creationMode === 'simple'" v-if="props.creationModes && (browserConfig.enabled || browserWorkspaceMode)" :fixedKind="props.materialEditor && props.materialRole && props.materialRole !== 'reference' ? 'image' : lockedGenerationKind" :prompt="draftPrompt"><template #afterModel><simpleGenerationTools v-if="props.materialEditor || workspaceStore.creationMode === 'simple'" controls="style" :disabled="locked" /></template></browserModelOptions><modelPopover v-else v-model="selectedModel" v-model:reasoningEffort="reasoningEffort" :active="active" :disabled="disabled" />
        <el-button v-if="props.creationModes && (props.materialEditor || workspaceStore.creationMode === 'simple')" class="quickMention" text :disabled="locked || !directory" aria-label="提及参考素材" title="提及参考素材" @mousedown.prevent @click="mentionMenuRef?.openMenu()">@</el-button>
        <input ref="attachmentInput" type="file" :accept="attachmentAccept" multiple hidden :disabled="locked" @change="selectAttachments" />
        <referencePicker v-if="!props.creationModes" :disabled="locked" @local="attachmentInput?.click()" @files="addAttachments" />
        <mentionMenu :currentOnly="props.creationModes && workspaceStore.creationMode === 'simple'" :attachments="props.creationModes ? activeDraftAttachments : undefined" @selectAttachment="insertAttachmentMention" :hideTrigger="props.creationModes" ref="mentionMenuRef" :directory="directory" :active="active" :disabled="locked || !directory" :query="mentionQuery" :editor="senderElement" :currentCanvasId="createCanvasContext?.()?.id" @open="captureMentionPosition" @select="insertMentions" @dismiss="mentionQuery = undefined" />
        <skillMenu v-if="!browserWorkspaceMode && !browserConfig.enabled" ref="skillMenuRef" :directory="directory" :active="active" :disabled="locked || !directory" :query="skillQuery" :editor="senderElement" @select="selectSkill" @dismiss="skillQuery = undefined" />
        <el-popover
          v-if="!props.creationModes"
          v-model:visible="contextMenuVisible"
          trigger="click"
          placement="top"
          :width="280"
          :offset="10"
          :showArrow="false"
          popperClass="agentContextPopover">
          <template #reference>
            <el-button class="contextButton" text circle aria-label="查看上下文用量" title="查看上下文用量">
              <icon-circle-dashed :size="16" />
            </el-button>
          </template>
          <div class="contextUsage">
            <div class="contextHeader"><span>上下文用量</span><span class="contextHint">估算</span></div>
            <template v-if="contextUsage?.tokens != null">
              <div class="contextTokens">
                <span>{{ contextUsage.tokens.toLocaleString() }} / {{ contextWindow.toLocaleString() }} tok</span>
                <span>{{ contextPercent.toFixed(1) }}%</span>
              </div>
              <el-progress :percentage="Math.min(100, contextPercent)" :showText="false" />
            </template>
            <span v-else class="contextHint">{{ contextUsage ? "等待下一次回复更新用量" : "尚无用量数据" }}</span>
            <div v-if="stats" class="contextStats">
              <div class="contextHeader">对话累计用量</div>
              <div class="contextTokens"><span>输入</span><span>{{ inputTokens.toLocaleString() }} tok</span></div>
              <div class="contextTokens"><span>输出</span><span>{{ stats.tokens.output.toLocaleString() }} tok</span></div>
              <div v-if="inputTokens > 0" class="contextTokens"><span>缓存命中</span><span>{{ (stats.tokens.cacheRead / inputTokens * 100).toFixed(1) }}%</span></div>
              <div v-if="stats.tokensPerSecond !== undefined" class="contextTokens"><span>生成速度</span><span>{{ stats.tokensPerSecond.toFixed(1) }} tok/s</span></div>
            </div>
          </div>
        </el-popover>
        <el-button class="sendButton" type="primary" circle :disabled="!sending && locked" :aria-label="sending ? '停止生成' : editingId ? '重发消息' : '发送消息'" :title="sending ? '停止生成' : editingId ? '重发消息' : '发送消息'" @click="sending ? stopGeneration() : submitMessage()">
          <generationTaskRing v-if="sending && props.materialEditor" :size="16" /><el-icon v-else-if="sending" class="is-loading"><icon-loader-2 :size="16" /></el-icon>
          <icon-arrow-up v-else :size="16" /><span v-if="props.creationModes && (props.materialEditor || workspaceStore.creationMode === 'simple')">{{ sending ? '停止生成' : '生成' }}</span>
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { scriptGenerationInstruction } from "@toonflow/node-text/scriptColumns";
import { browserWorkspaceMode } from "@/lib/browserWorkspaceFiles";
import { createBrowserConversation, saveBrowserConversation } from "./browserConversations";
import { uploadNodeFile } from "@toonflow/nodes-scaffold/workspaceFiles";
import { templatePromptModel } from "@/lib/creationTemplates";
import creationModeSwitch from "@/components/creationModeSwitch.vue";
import { locale, t, translate } from "@toonflow/i18n/vue";
import { computed, inject, nextTick, reactive, ref, shallowRef, watch, type ComponentPublicInstance } from "vue";
import { defaultRangeExtractor, measureElement, observeElementRect, useVirtualizer } from "@tanstack/vue-virtual";
import axios from "axios";
import {
  IconArrowUp, IconArrowDown, IconAtom, IconChevronDown, IconChevronRight, IconCopy,
  IconCircleDashed, IconPencil, IconX, IconLoader2,
  IconTrash, IconPhoto, IconUsersGroup, IconPaperclip, IconSquarePlus,
} from "@tabler/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { getReadableFileExtension, getReadableFileMimeType, readableFileAccept } from "@toonflow/server/documentFormats";
import brandLogo from "@/components/brandLogo.vue";
import { browserConfig as defaultBrowserConfig, configuredBrowserModels, generateInBrowser, generationBusy, generationError, generationResults, stopBrowserGeneration, explicitGenerationKind, browserResultFile, type ModelKind, type BrowserConversationImport } from "@/stores/browserGeneration";
import professionalCreation from "./professionalCreation.vue";
import simpleReferenceSlots from "@/components/simpleReferenceSlots.vue";
import { fileGenerationOrigin } from "@/lib/generationOrigin";
import { startSourceEdit } from "@/stores/sourceEditing";
import generationTaskRing from "@/components/generationTaskRing.vue";
import simpleGenerationTools from "@/components/simpleGenerationTools.vue";
import browserModelOptions from "@/components/browserModelOptions.vue";
import browserModelResults from "@/components/browserModelResults.vue";
import referencePicker from "@/components/referencePicker.vue";
import modelPopover from "@/components/modelPopover.vue";
import skillMenu from "./skillMenu.vue";
import mentionMenu from "./mentionMenu.vue";
import mentionContent from "./mentionContent.vue";
import mentionThumbnail from "./mentionThumbnail.vue";
import { mentionName, mentionParts, mentionPlainText, mentionThumbnailProps } from "./mentionText";
import toolMessage from "./toolMessage.vue";
import attachmentList from "./attachmentList.vue";
import { createPastedTextFile, readTextAttachment } from "./textAttachments";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import { writeClipboardText } from "@/lib/clipboard";
import anonymousData from "@/lib/anonymousData";
import { modelChoices } from "@/stores/settings";
import { useWorkspaceStore } from "@/stores/workspace";
import type { AgentAttachment, AgentConversation, AgentMessage } from "./types";
import type { AgentEvent, AgentMention, AgentToolCall } from "@toonflow/server/agent/types";
import { createConversationStream, readAgentEvents } from "./replyStream";
import type { CanvasContext } from "@toonflow/tool-canvas/runtime";
import browserPanel from "@toonflow/tool-browser/panel";
import { isBrowserTool } from "@toonflow/tool-browser/client";
import chatItem from "@tdesign-vue-next/chat/es/chat-item";
import chatReasoning from "@tdesign-vue-next/chat/es/chat-reasoning";
import messageMarkdown from "@/components/messageMarkdown.vue";
import xSender, { type AnyTagProps } from "x-sender";
import "tdesign-vue-next/es/style/index.css";
import "@tdesign-vue-next/chat/es/style/index.css";
import "x-sender/lib/XSender.css";

const browserConfig = inject("generationConfig", defaultBrowserConfig);
const generationModelSelection = inject("generationModelSelection", undefined as typeof import("@/stores/browserGeneration").browserModelSelection | undefined);
const props = defineProps<{ active: boolean; initialSession: AgentConversation | null; sessionFile?: string; disabled: boolean; creationModes?: boolean; materialEditor?: boolean; materialDirectory?: string; materialLabel?: string; initialDraft?: { prompt: string; attachments: AgentAttachment[] }; materialRole?: "firstFrame" | "reference" | "middleFrame" | "lastFrame" }>();
const emit = defineEmits<{ session: [file: string]; sent: [prompt: string]; event: [event: AgentEvent]; applyMaterial: [file: File]; materialBusy: [value: boolean]; draft: [value: { prompt: string; attachments: AgentAttachment[] }]; generationState: [value: { status: "queued" | "generating" | "completed" | "failed"; error?: string; taskId?: string; vendorTaskId?: string; resultIds?: string[] }] }>();
const workspaceStore = useWorkspaceStore();
const directory = props.materialDirectory ?? workspaceStore.project?.directory;
const draftAttachments = ref<AgentAttachment[]>(props.initialDraft?.attachments.map(item => ({ ...item })) ?? []);
const referenceMode = ref<"reference" | "frames">("reference");
const referenceTabsTarget = ref<HTMLElement>();
const activeDraftAttachments = computed(() => !props.creationModes || props.materialEditor || workspaceStore.creationMode !== "simple" ? draftAttachments.value : draftAttachments.value.filter(item => !item.referenceRole || (referenceMode.value === "reference" ? item.referenceRole === "reference" : item.referenceRole !== "reference")));
const unassignedAttachments = computed(() => props.creationModes && !props.materialEditor && workspaceStore.creationMode === "simple" ? draftAttachments.value.filter(item => !item.referenceRole) : draftAttachments.value);
function removeVisibleAttachment(index: number) { const item = unassignedAttachments.value[index]; draftAttachments.value = draftAttachments.value.filter(value => value !== item); }
function restoreVisibleAttachment(index: number) { void restoreTextAttachment(draftAttachments.value.indexOf(unassignedAttachments.value[index]!)); }
const materialResultBusy = ref(false);
function setMaterialBusy(value: boolean) { if (props.materialEditor) { materialResultBusy.value = value; emit("materialBusy", value); } }
const draftPrompt = ref(props.initialDraft?.prompt ?? "");
watch([draftPrompt, draftAttachments], () => { if (props.materialEditor) emit("draft", { prompt: draftPrompt.value, attachments: [...draftAttachments.value] }); }, { deep: true });
const attachmentInput = ref<HTMLInputElement>();
const draggingAttachments = ref(false);
let attachmentDragDepth = 0;
const attachmentAccept = `image/*,video/*,${readableFileAccept}`;
const createCanvasContext = inject<(() => CanvasContext | undefined) | undefined>("canvas", undefined);
const sessionMode = ref(props.initialSession?.creationMode);
watch(() => props.active, active => { if (active && !props.materialEditor && sessionMode.value) workspaceStore.creationMode = sessionMode.value; }, { immediate: true });
const creationChoices = [
  { label: "方案／文字", kind: "text" as const, script: false }, { label: "剧情脚本", kind: "text" as const, script: false }, { label: "分镜脚本", kind: "text" as const, script: true },
  { label: "图片", kind: "image" as const, script: false }, { label: "音频", kind: "audio" as const, script: false }, { label: "视频", kind: "video" as const, script: false },
];
const messages = ref<AgentMessage[]>((props.initialSession?.messages ?? []).map(message => ({ ...message })));
function snapshotMessages(value: AgentMessage[]) {
  return JSON.parse(JSON.stringify(value.map(message => ({ ...message, streaming: false, attachments: message.attachments?.map(({ file, ...attachment }) => attachment) })))) as AgentMessage[];
}
let savedMessages = snapshotMessages(props.initialSession?.messages ?? []);
const generationKind = ref(props.initialSession?.generationKind);
const lockedGenerationKind = computed(() => props.creationModes && (props.materialEditor || (sessionMode.value ?? workspaceStore.creationMode) === "simple") ? generationKind.value : undefined);
watch([() => props.active, lockedGenerationKind, () => browserConfig.outputKind], ([active, kind]) => {
  if (active && kind) { browserConfig.outputKind = kind; browserConfig.kind = kind; browserConfig.outputChosen = true; }
}, { immediate: true });
watch(() => messages.value.flatMap(message => message.browserResultIds ?? []).map(id => generationResults.value.find(result => result.id === id && result.directory === directory)?.kind).find(kind => kind === "image" || kind === "video"), kind => {
  if (!generationKind.value && (kind === "image" || kind === "video")) generationKind.value = kind;
}, { immediate: true });
function selectGenerationKind(kind: "image" | "video") {
  if (generationKind.value && generationKind.value !== kind) return;
  generationKind.value = kind;
  if (directory) void persistBrowserMessages().catch(error => ElMessage.error(error instanceof Error ? error.message : "生成类型保存失败"));
}

const browserMessages = computed(() => {
  const groups = new Map<string, { id: string; tools: AgentToolCall[] }>();
  let turnId: string | undefined;
  let liveMessageId: string | undefined;
  for (const message of messages.value) {
    if (message.role === "user") {
      turnId = message.entryId ?? message.id;
      liveMessageId = undefined;
      continue;
    }
    if (message.replyTo && message.replyTo !== turnId) {
      turnId = message.replyTo;
      liveMessageId = undefined;
    }
    const tools = message.parts?.flatMap(part => part.type === "tool" && isBrowserTool(part.tool) ? [part.tool] : []);
    if (!tools?.length) continue;
    const replyId = turnId ?? message.id;
    let group = groups.get(replyId);
    if (!group) { group = { id: message.id, tools: [] }; groups.set(replyId, group); }
    group.tools.push(...tools);
    liveMessageId = group.id;
  }
  return { tools: new Map([...groups.values()].map(group => [group.id, group.tools])), liveMessageId };
});
// 同轮浏览器调用共用该轮首条浏览器消息底部的画面，原始工具记录仍完整保留。
const displayedMessages = computed(() => messages.value.filter(message => browserMessages.value.tools.has(message.id) || message.role === "user" || message.error || message.report || message.attachments?.length ||
  !message.parts?.length || message.parts.some(part => part.type !== "tool" || !isBrowserTool(part.tool))));
const stream = createConversationStream(messages);
const remoteRunning = ref(props.initialSession?.running ?? false);
const stats = ref(props.initialSession?.stats);
const contextUsage = ref(props.initialSession?.contextUsage);
const busy = ref(false);
const browserSubmitting = ref(false);
const professionalBusy = ref(false);
const professionalStopToken = ref(0);
let browserCancelled = false;
let ownsBrowserGeneration = false;
const sending = computed(() => busy.value || browserSubmitting.value || professionalBusy.value);
const compacting = ref(false);
const deletingId = ref<string>();
const restoringAttachment = ref(false);
const locked = computed(() => props.disabled || materialResultBusy.value || sending.value || deletingId.value !== undefined || restoringAttachment.value);
const editingId = ref<string>();
const draftMentions = ref<AgentMention[]>([]);
const draftMentionTargets = shallowRef<{ key: symbol; element: HTMLElement; mention: AgentMention }[]>([]);
const draftMentionPreview = ref<InstanceType<typeof mentionContent>>();
let editDraft: { model: AnyTagProps[][]; mentions: AgentMention[]; attachments: AgentAttachment[] } | undefined;
const messageList = ref<HTMLDivElement>();
const atLatestMessage = ref(true);
let messageListInitialized = false;
let messageScrollOffset = 0;
const messageKeys = computed(() => displayedMessages.value.map(item => item.id));
// ACT: 只常驻当前轮的实时画面，历史浏览器消息仍按需挂载，避免长对话累积连接和 DOM。
const retainedMessages = computed(() => displayedMessages.value.flatMap((item, index) => item.streaming || (item.professional && item.professional.stage !== 'done') || item.id === editingId.value || item.id === browserMessages.value.liveMessageId ? [index] : []));
const messageVirtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>(computed(() => {
  const keys = messageKeys.value;
  const retained = retainedMessages.value;
  return {
    count: keys.length,
    getScrollElement: () => messageList.value ?? null,
    getItemKey: (index: number) => keys[index]!,
    estimateSize: () => 240,
    overscan: 3,
    paddingStart: 12,
    anchorTo: "end" as const,
    followOnAppend: true,
    scrollEndThreshold: 48,
    useAnimationFrameWithResizeObserver: true,
    useCachedMeasurements: !props.active,
    // ACT: 实时行读取当前高度，避免延后执行的观察记录覆盖本轮同步测量；历史行仍使用缓存。
    measureElement: (element, entry, instance) => props.active && element.dataset.liveMessage ? element.offsetHeight : measureElement(element, entry, instance),
    // ACT: v-show 隐藏时保留视口与行高，避免零尺寸清空正在输入的工具表单。
    observeElementRect: (instance, onChange) => observeElementRect(instance, rect => { if (rect.height) onChange(rect); }),
    rangeExtractor: range => [...new Set([...defaultRangeExtractor(range), ...retained])].sort((left, right) => left - right),
    onChange(instance) {
      if (!messageListInitialized || !props.active || !messageList.value?.clientHeight) return;
      atLatestMessage.value = instance.isAtEnd();
      messageScrollOffset = instance.scrollOffset ?? 0;
    },
  };
}));
const visibleMessages = computed(() => messageVirtualizer.value.getVirtualItems().map(row => ({ row, item: displayedMessages.value[row.index]! })));
let messageMeasurePending = false;

function measureMessage(element: Element | ComponentPublicInstance | null) {
  const instance = messageVirtualizer.value;
  if (!(element instanceof HTMLDivElement) || !props.active || !atLatestMessage.value || !element.dataset.liveMessage) {
    instance.measureElement(element instanceof HTMLDivElement ? element : null);
    return;
  }
  const index = instance.indexFromElement(element);
  const height = element.offsetHeight;
  const changed = instance.itemSizeCache.get(instance.options.getItemKey(index)) !== height;
  instance.measureElement(element);
  // 自动滚动时库会跳过同步测量；在本次 DOM 提交内校正，避免画面随换行先下移再被拉回。
  instance.resizeItem(index, height);
  if (!changed || messageMeasurePending) return;
  messageMeasurePending = true;
  void nextTick(() => {
    messageMeasurePending = false;
    if (props.active && atLatestMessage.value) instance.scrollToEnd();
  });
}

watch([() => props.active, messageList], async ([active, element]) => {
  if (!active || !element) return;
  await nextTick();
  if (!props.active) return;
  if (!messageListInitialized || atLatestMessage.value) messageVirtualizer.value.scrollToEnd();
  else messageVirtualizer.value.scrollToOffset(messageScrollOffset);
  messageListInitialized = true;
}, { immediate: true, flush: "post" });
let sender: xSender | undefined;
watch(locale, () => {
  if (!sender) return;
  sender.updateConfig({ placeholder: translate("输入消息，@ 提及节点输出或全局素材…") });
  sender.chatElement.richText.setAttribute("aria-label", translate("消息"));
  for (const line of sender.chatEditor.NODES) for (const tag of line.children) {
    if (tag.type === "Mention") tag.$el.setAttribute("aria-label", t`预览 ${tag.name}`);
  }
});
let controller: AbortController | undefined;
const senderElement = ref<HTMLElement>();
const skillMenuRef = ref<InstanceType<typeof skillMenu>>();
const skillQuery = ref<string>();
const inputStarted = ref(false);
const mentionMenuRef = ref<InstanceType<typeof mentionMenu>>();
const mentionQuery = ref<string>();
let mentionPosition: { node: ReturnType<xSender["getCurrentNode"]>; remove: number } | undefined;
let insertingMentions = false;
const senderHeight = ref(44);
const senderMaxHeight = ref(Math.max(44, window.innerHeight / 2));
let senderResize: { pointerId: number; y: number; height: number } | undefined;
const pendingMessage = props.initialSession?.parentFile ? undefined : workspaceStore.pendingAgentMessage;
const selectedModel = ref(pendingMessage?.model ?? (props.initialSession?.providerId && props.initialSession.modelId
  ? JSON.stringify([props.initialSession.providerId, props.initialSession.modelId]) : ""));
const contextMenuVisible = ref(false);
const reasoningEffort = ref(pendingMessage?.reasoningEffort ?? (props.initialSession?.thinkingLevel === "off" ? "" : props.initialSession?.thinkingLevel ?? ""));
const selectedModelChoice = computed(() => modelChoices.value.find(item => item.value === selectedModel.value));
const contextWindow = computed(() => contextUsage.value?.contextWindow ?? selectedModelChoice.value?.contextWindow ?? 262144);
const contextPercent = computed(() => (contextUsage.value?.tokens ?? 0) / contextWindow.value * 100);
const inputTokens = computed(() => stats.value ? stats.value.tokens.input + stats.value.tokens.cacheRead + stats.value.tokens.cacheWrite : 0);
watch([locked, () => props.active], ([locked, active]) => {
  if (!active || locked) resetAttachmentDrag();
  if (!active || locked) sender?.disable();
  else sender?.enable();
});
watch(() => props.active, active => {
  if (!active) contextMenuVisible.value = false;
});

function applyEvent(event: AgentEvent) {
  switch (event.type) {
    case "subAgent":
    case "subAgentEvent": emit("event", event); break;
    case "report":
      if (event.parentFile !== props.sessionFile) { emit("event", event); break; }
      if (!messages.value.some(message => message.id === event.id)) messages.value.push({
        id: event.id, role: "assistant", content: event.content,
        parts: [{ id: event.id, type: "text", content: event.content }], report: { file: event.file, name: event.name },
      });
      break;
    case "compaction": compacting.value = event.active; break;
    case "session": emit("session", event.file); break;
    case "stats": stats.value = event.stats; contextUsage.value = event.contextUsage; break;
    default: stream.receive(event);
  }
}

function receiveEvent(event: AgentEvent) {
  if (event.type === "done" || event.type === "error") {
    remoteRunning.value = false;
    compacting.value = false;
  } else if (["userMessage", "text", "thinking", "tool"].includes(event.type)) remoteRunning.value = true;
  applyEvent(event);
}

defineExpose({ receiveEvent });

function getDraftContent() {
  return sender?.getModel().map((line, lineIndex) => line.map((tag, tagIndex) => {
    if (tag.type === "Mention") return `{{mention:${tag.id}}}`;
    if (tag.type === "Write") return tag.text;
    return sender?.chatEditor.NODES[lineIndex]?.children[tagIndex]?.$el.textContent ?? "";
  }).join("")).join("\n").replace(/[\ufeff\u200b]/g, "") ?? "";
}

function captureMentionPosition() {
  const node = sender?.getCurrentNode();
  mentionPosition = node?.instance?.$el.isConnected ? { node: { ...node }, remove: mentionQuery.value === undefined ? 0 : mentionQuery.value.length + 1 } : undefined;
  skillQuery.value = undefined;
}

function updateMentionQuery() {
  if (!sender || insertingMentions || sender.chatEditor.isComposition || !sender.chatElement.richText.contains(sender.getSelection().anchorNode)) return;
  const current = sender.getCurrentNode();
  const before = current?.instance?.type === "Write" ? current.instance.text.slice(0, current.offset) : "";
  mentionQuery.value = /(?:^|[^\w@])@([^\s@]*)$/.exec(before)?.[1];
  if (mentionQuery.value !== undefined) captureMentionPosition();
}

function handleSenderKeydown(event: KeyboardEvent) {
  const id = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>("[data-agent-mention]")?.dataset.agentMention : undefined;
  if (id && ["Enter", " "].includes(event.key)) {
    event.preventDefault();
    event.stopPropagation();
    draftMentionPreview.value?.preview(id);
    return;
  }
  if (mentionMenuRef.value?.handleKeydown(event)) return;
  skillMenuRef.value?.handleKeydown(event);
}

async function insertAttachmentMention(attachment: AgentAttachment) {
  const instance = sender;
  if (!instance || locked.value) return;
  try {
    if (mentionPosition?.node.instance.$el.isConnected) mentionPosition.node.instance.focus(mentionPosition.node.offset);
    else instance.focus("last");
    if (mentionPosition?.remove) await instance.backspace(-mentionPosition.remove);
    await instance.setMention({ id: `attachment${draftAttachments.value.indexOf(attachment)}`, name: attachment.referenceName || attachment.name });
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : "引用素材失败"); }
  finally { mentionQuery.value = undefined; mentionPosition = undefined; }
}
async function insertMentions(mentions: AgentMention[]) {
  if (props.creationModes && !props.materialEditor && workspaceStore.creationMode === "simple") {
    const media = mentions.filter(mention => ["IMAGE", "VIDEO"].includes(mention.dataType));
    try {
      const files = await Promise.all(media.map(async mention => {
        const value = mention.value as { url?: string; mimeType?: string } | undefined;
        if (!value || typeof value.url !== "string" || typeof value.mimeType !== "string" || !/^(image|video)\//.test(value.mimeType)) throw new Error("引用素材的媒体信息无效");
        const content = mention.source.kind === "asset" && mentionThumbnailProps(mention).globalAsset
          ? (await axios.get<Blob>("/api/assets/read", { params: { path: mention.source.path }, responseType: "blob" })).data
          : await useWorkspaceFiles(directory).read(value.url);
        return new File([content], mention.label, { type: value.mimeType });
      }));
      for (const file of files) { const count = draftAttachments.value.length; addAttachments([file]); if (draftAttachments.value.length > count) await insertAttachmentMention(draftAttachments.value.at(-1)!); }
    } catch (error) { ElMessage.error(error instanceof Error ? error.message : "引用素材失败"); return; }
    mentions = mentions.filter(mention => !media.includes(mention));
    if (!mentions.length) return;
  }
  const instance = sender;
  if (!instance || locked.value || !props.active) return;
  const currentIds = new Set(instance.getTagData().mention.map(item => item.id));
  if (currentIds.size + mentions.length > 20) return ElMessage.warning("每条消息最多提及 20 个输出或素材");
  insertingMentions = true;
  try {
    if (mentionPosition?.node.instance.$el.isConnected) mentionPosition.node.instance.focus(mentionPosition.node.offset);
    else instance.focus("last");
    if (mentionPosition?.remove) await instance.backspace(-mentionPosition.remove);
    for (const mention of mentions) {
      if (sender !== instance || !props.active) break;
      draftMentions.value.push(mention);
      await instance.setMention({ id: mention.id, name: mentionName(mention) });
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "添加提及失败");
  } finally {
    mentionQuery.value = undefined;
    mentionPosition = undefined;
    insertingMentions = false;
  }
}

async function removeDraftMention(id: string) {
  if (!locked.value) await sender?.removeMention([id]);
}

let browserSaveQueue: Promise<void> = Promise.resolve();
let browserSessionFile = props.sessionFile;
watch(() => props.sessionFile, file => { if (file) browserSessionFile = file; });
async function persistBrowserMessages() {
  const save = browserSaveQueue.catch(() => {}).then(async () => {
    if ((!browserWorkspaceMode && !props.materialEditor) || !directory) return;
    if (!browserSessionFile) {
      const session = await createBrowserConversation(directory, props.materialEditor ? "material" : undefined);
      browserSessionFile = session.file;
      emit("session", session.file);
    }
    const pending = snapshotMessages(messages.value);
    const saved = await saveBrowserConversation(directory, browserSessionFile, pending, sessionMode.value, { generationKind: lockedGenerationKind.value, baseMessages: savedMessages });
    savedMessages = snapshotMessages(saved.messages);
    const local = new Map(messages.value.map(message => [message.id, message]));
    const pendingById = new Map(pending.map(message => [message.id, message]));
    const currentSnapshots = new Map(snapshotMessages(messages.value).map(message => [message.id, message]));
    const savedIds = new Set(saved.messages.map(message => message.id));
    messages.value = [...saved.messages.map(message => {
      const current = local.get(message.id), sent = pendingById.get(message.id);
      if (!current) return message;
      if (JSON.stringify(currentSnapshots.get(message.id)) !== JSON.stringify(sent) || JSON.stringify(message) === JSON.stringify(sent)) return current;
      return message;
    }), ...messages.value.filter(message => !savedIds.has(message.id) && !pendingById.has(message.id))];
  });
  browserSaveQueue = save;
  return save;
}

watch(() => props.initialDraft, draft => {
  if (!draft) return;
  draftAttachments.value = draft.attachments.map(item => ({ ...item }));
  draftPrompt.value = draft.prompt;
  if (sender) void sender.reset({ clearHistory: false, chatNode: templatePromptModel(draft.prompt) });
});
async function editReferenceAttachment(attachment: AgentAttachment) {
  if (locked.value || !directory || !attachment.origin) return;
  try {
    await persistBrowserMessages();
    if (!browserSessionFile) throw new Error("原对话尚未保存，请重试");
    await startSourceEdit({ directory, sessionFile: browserSessionFile, prompt: sender?.getText() ?? draftPrompt.value, attachments: draftAttachments.value, index: draftAttachments.value.indexOf(attachment), origin: attachment.origin });
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : "素材来源打开失败"); }
}

function saveProfessionalProgress() { void persistBrowserMessages().catch(error => ElMessage.error(error instanceof Error ? error.message : "创作流程保存失败")); }
const importConversationTurn = inject<((turn: BrowserConversationImport) => Promise<void>)>("importConversationTurn");
const importMessageResult = inject<((file: File, directory: string, script?: boolean) => Promise<void>)>("importBrowserResult");
function messageText(item: AgentMessage) {
  const text = item.content.trim() || item.parts?.filter(part => part.type === "text").map(part => part.content).join("\n") || "";
  if (text || !item.professional) return text;
  const state = item.professional;
  return [state.prompt, ...state.questions.map(question => `${question.label}：${question.answer}`), ...[...state.plans, ...state.scripts, ...state.prompts].map(option => `${option.title}\n${option.content}`)].join("\n\n");
}
async function addMessageToCanvas(item: AgentMessage) {
  if (locked.value || !importMessageResult || !directory) return;
  browserSubmitting.value = true;
  try {
    const results = generationResults.value.filter(result => item.browserResultIds?.includes(result.id) && result.directory === directory);
    const text = messageText(item);
    if (!results.length && !text) throw new Error("这条消息还没有可加入画布的内容");
    if (results.length && results.every(result => result.kind === "image" || result.kind === "video") && importConversationTurn) {
      const source = messages.value.find(message => message.id === item.replyTo);
      const references = await Promise.all((source?.attachments ?? []).filter(attachment => /^(image|video)\//.test(attachment.mimeType)).map(async attachment => ({ file: attachment.file ?? new File([await useWorkspaceFiles(directory).read(attachment.path)], attachment.name, { type: attachment.mimeType }), label: attachment.referenceName || (attachment.referenceRole === "firstFrame" ? "首帧" : attachment.referenceRole === "lastFrame" ? "尾帧" : attachment.name), role: attachment.referenceRole })));
      await importConversationTurn({ id: `${browserSessionFile || "conversation"}/${item.id}`, directory, request: source?.content || results[0]!.prompt || "", references, results });
      return;
    }
    for (const result of results) await importMessageResult(await browserResultFile(result), directory);
    if (text) {
      const script = /\|[^\n]*镜头[^\n]*\|/.test(text) && /\|\s*:?-{3,}/.test(text);
      await importMessageResult(new File([text], script ? "分镜脚本.md" : "对话文字.md", { type: "text/markdown" }), directory, script);
    }
    ElMessage.success("已加入画布");
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : "加入画布失败"); }
  finally { browserSubmitting.value = false; }
}

async function continueCreation(item: AgentMessage, kind: ModelKind, script = false, label?: string) {
  if (locked.value || !item.creationChoice || item.creationChoice.resolved) return;
  const source = messages.value.find(message => message.id === item.replyTo);
  const prompt = `${label ? `生成${label}` : script ? "生成分镜脚本" : ({ text: "生成方案", image: "生成图片", video: "生成视频", audio: "生成音频" })[kind]}：${item.creationChoice.prompt}`;
  item.creationChoice.resolved = true;
  await submitMessage({ prompt, kind, script, attachments: source?.attachments ?? [] });
}

const messageResults = new Map<string, InstanceType<typeof browserModelResults>>();
function setMessageResults(id: string, value: unknown) {
  if (value) messageResults.set(id, value as InstanceType<typeof browserModelResults>);
  else messageResults.delete(id);
}
function hasApplicableMaterial(item: AgentMessage) { return generationResults.value.some(result => result.directory === directory && item.browserResultIds?.includes(result.id) && ["image", "video"].includes(result.kind)); }

async function referenceMessageResults(item: AgentMessage) {
  try {
    const results = generationResults.value.filter(result => item.browserResultIds?.includes(result.id) && result.directory === directory && result.kind !== "text");
    const text = messageText(item) || (item.creationChoice ? `${item.creationChoice.needsDetails ? "请先补充创作主体或用途，再确认要生成的内容。" : "你希望生成哪种内容？确认后我会在画布搭建节点和连线。"}\n${item.creationChoice.prompt}` : "");
    const files = await Promise.all(results.map(browserResultFile));
    if (text) files.unshift(new File([text], "对话引用.txt", { type: "text/plain" }));
    addAttachments(files);
    sender?.focus("last");
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : "引用素材失败"); }
}

async function submitMessage(choice?: { prompt: string; kind: ModelKind; script: boolean; attachments: AgentAttachment[] }) {
  if (locked.value) return;
  if (props.materialEditor && !browserConfig.enabled) { ElMessage.warning("请先在设置 → API 配置中启用图片或视频模型并填写 Key"); return; }
  if (browserWorkspaceMode && !browserConfig.enabled && workspaceStore.creationMode !== "professional") { ElMessage.warning("请先在设置 → API 配置中启用模型联调并输入 Key"); return; }
  if (props.creationModes && (props.materialEditor || browserWorkspaceMode || browserConfig.enabled)) {
    const input = choice?.prompt ?? sender?.getText() ?? "";
    if (!input.trim()) return;
    const pending = !choice ? messages.value.findLast(item => item.creationChoice && !item.creationChoice.resolved) : undefined;
    const prompt = pending?.creationChoice ? `${pending.creationChoice.prompt}\n补充要求：${input}` : input;
    const sourceAttachments = pending ? messages.value.find(item => item.id === pending.replyTo)?.attachments ?? [] : [];
    const attachments = [...sourceAttachments, ...(choice?.attachments ?? activeDraftAttachments.value)];
    if (pending?.creationChoice) pending.creationChoice.resolved = true;
    sessionMode.value ??= workspaceStore.creationMode;
    const professional = !props.materialEditor && sessionMode.value === "professional";
    if (!professional) generationKind.value ??= props.materialEditor && props.materialRole && props.materialRole !== "reference" ? "image" : browserConfig.outputKind;
    const kind = professional ? choice?.kind ?? explicitGenerationKind(prompt) : generationKind.value;
    if (props.materialEditor && kind !== "image" && kind !== "video") { ElMessage.warning("自定义素材对话用于生成或编辑图片、视频，请选择图片或视频产物"); return; }
    browserConfig.kind = kind ?? "image";
    browserCancelled = false;
    browserSubmitting.value = true;
    const generationConfig = { ...browserConfig, keys: { ...browserConfig.keys } };
    const generationSelection = generationModelSelection ? { ...generationModelSelection } : undefined;
    const taskId = crypto.randomUUID();
    if (props.materialEditor) emit("generationState", { status: "queued", taskId });
    let reply: AgentMessage | undefined;
    try {
      await persistBrowserMessages();
      const files = await Promise.all(attachments.map(async item => item.file ?? new File([await useWorkspaceFiles(directory).read(item.path)], item.name, { type: item.mimeType })));
      if (browserCancelled) throw new Error("已取消等待生成，输入和素材已保留");
      const userId = crypto.randomUUID();
      if ((browserWorkspaceMode || props.materialEditor) && directory) {
        const filesStore = useWorkspaceFiles(directory);
        for (const item of attachments) if (item.file && !item.path) item.path = await uploadNodeFile(filesStore, userId, item.file);
      }
      const assistantId = crypto.randomUUID();
      messages.value.push({ id: userId, role: "user", content: prompt, attachments });
      messages.value.push({ id: assistantId, replyTo: userId, role: "assistant", content: "", streaming: true });
      reply = messages.value.find(item => item.id === assistantId)!;
      if (!professional) await persistBrowserMessages();
      emit("sent", prompt);
      await sender?.reset({ clearHistory: false });
      draftAttachments.value = [];
      if (professional) {
        const goal = /分镜/.test(prompt) && kind === "text" ? "storyboard" : kind === "text" ? "story" : kind ?? "video";
        reply.professional = { prompt, goal, start: "idea", stage: "analyze", questions: [], plans: [], scripts: [], prompts: [], selectedPlans: [], selectedScript: "", selectedPrompt: "", images: [], imageResultIds: [], resultIds: [] };
        return;
      }
      const outputKind = kind ?? "image";
      if (!browserConfig.enabled) throw new Error("请先在设置 → API 配置中启用模型联调并输入 Key");
      if (!configuredBrowserModels(outputKind, browserConfig).length) throw new Error("请先在设置 → API 配置中输入当前模型的 Key");
      if ((outputKind === "text" || outputKind === "audio") && files.some(file => !file.type.startsWith("text/") && file.type !== "application/json")) throw new Error("当前文字／音频适配器只支持文字输入，请移除引用素材后重试");
      if ((outputKind === "image" || outputKind === "video") && files.some(file => !file.type.startsWith("image/") && !file.type.startsWith("video/") && !file.type.startsWith("text/") && file.type !== "application/json")) throw new Error("当前图片／视频适配器仅支持图片、视频或文字参考，素材已保留，请调整引用后重试");
      const isStoryboard = choice?.script ?? /分镜/.test(prompt);
        if (browserCancelled) throw new Error("已停止发送；已创建的画布节点保留供修改");
      let previousIds = new Set(generationResults.value.map(item => item.id));
      const textReferences = await Promise.all(files.filter(file => file.type.startsWith("text/") || file.type === "application/json").map(async file => { const text = await file.text(); if (text.length > 100000) throw new Error("文字引用最多支持 100000 字符，请缩小内容"); return `${file.name}：\n${text}`; }));
      const referenceDescriptions = attachments.filter(item => item.mimeType.startsWith("image/")).flatMap((item, index) => item.referenceRole === "reference" && item.referenceCategory ? [`图${index + 1}为${({ character: "角色", scene: "场景", prop: "道具", other: "其他" })[item.referenceCategory]}参考（${item.referenceName || "分类参考图"}），保持对应主体特征。`] : []);
      const generationPrompt = isStoryboard ? `${prompt}\n${scriptGenerationInstruction}` : !kind ? `${prompt}\n请围绕上述主题自行补充画面主体、场景、构图与光线，生成一张完整图片。` : prompt;
      const success = await generateInBrowser([generationPrompt, ...referenceDescriptions, ...textReferences].join("\n\n"), files.filter(file => /^(image|video)\//.test(file.type)), directory, outputKind, browserConfig.style, attachments.filter(item => /^(image|video)\//.test(item.mimeType)).map(item => item.referenceRole), { config: generationConfig, origin: browserSessionFile && directory ? { type: "conversation", directory, sessionFile: browserSessionFile, messageId: userId } : undefined, references: attachments.map(({ path, mimeType, name, referenceRole }) => ({ path, mimeType, name, referenceRole })), modelSelection: generationSelection, queue: true, cancelled: () => browserCancelled, onStart: () => { previousIds = new Set(generationResults.value.map(item => item.id)); ownsBrowserGeneration = true; if (props.materialEditor) emit("generationState", { status: "generating", taskId }); }, onTask: vendorTaskId => { if (props.materialEditor) emit("generationState", { status: "generating", taskId, vendorTaskId }); } });
      const results = generationResults.value.filter(item => !previousIds.has(item.id) && item.directory === directory);
      reply.browserResultIds = results.filter(item => item.kind !== "text").map(item => item.id);
      if (props.materialEditor && success && (outputKind === "image" || outputKind === "video")) { browserConfig.outputKind = outputKind; browserConfig.outputChosen = true; }
      const text = results.filter(item => item.kind === "text").map(item => item.text).join("\n\n");
      if (text) { reply.content = text; reply.parts = [{ id: crypto.randomUUID(), type: "text", content: text }]; }
      if (success && directory && props.creationModes && !props.materialEditor) workspaceStore.completeSimpleProject(directory, prompt);
      if (props.materialEditor && success) emit("generationState", { status: "completed", taskId, resultIds: reply.browserResultIds });
      if (!success) throw new Error(browserCancelled ? "已停止发送，输入已保留。" : generationError.value);
    } catch (error) {
      const message = error instanceof Error ? error.message : "生成失败，输入已保留";
      if (props.materialEditor) emit("generationState", { status: "failed", taskId, error: message });
      if (reply) reply.error = message;
      else ElMessage.error(message);
      await sender?.reset({ clearHistory: false, chatNode: templatePromptModel(prompt) });
      draftAttachments.value = attachments;
    } finally {
      if (reply) reply.streaming = false;
      try { await persistBrowserMessages(); }
      catch (error) { ElMessage.error(error instanceof Error ? error.message : "浏览器对话保存失败"); }
      browserSubmitting.value = false;
      ownsBrowserGeneration = false;
    }
    return;
  }
  return sendMessage(editingId.value ? messages.value.find(item => item.id === editingId.value) : undefined);
}

function referenceGeneratedFile(file: File) {
  addAttachments([file], true);
  sender?.focus("last");
}

function stopGeneration() {
  professionalStopToken.value++;
  browserCancelled = true;
  if (props.creationModes && generationBusy.value && ownsBrowserGeneration) stopBrowserGeneration();
  else stopMessage();
}

async function selectSkill(name: string) {
  const instance = sender;
  if (!instance || locked.value) return;
  const model = instance.getModel();
  const first = model[0]?.[0];
  if (first?.type === "Write") first.text = `/skill:${name} ${first.text.replace(skillQuery.value !== undefined ? /^\/\S*/ : /^\s*\/skill:\S+(?:\s+|$)/, "")}`;
  if (!model.length) model.push([]);
  if (first?.type !== "Write") model[0]!.unshift({ type: "Write", text: `/skill:${name} ` });
  skillQuery.value = undefined;
  mentionMenuRef.value?.closeMenu();
  await instance.reset({ clearHistory: false, chatNode: model });
  if (sender === instance) instance.focus("last");
}

async function fillPrompt(prompt: string) {
  const instance = sender;
  if (!instance || locked.value) return;
  draftMentions.value = [];
  await instance.reset({ clearHistory: false, chatNode: templatePromptModel(prompt) });
  if (sender === instance) instance.focus("last");
}

async function copyMessage(content: string) {
  try {
    await writeClipboardText(content);
    ElMessage.success("已复制");
  } catch {
    ElMessage.error("复制失败，请重试");
  }
}

async function editMessage(item: AgentMessage) {
  const instance = sender;
  if (!instance || locked.value || remoteRunning.value || item.role !== "user") return;
  if (!editingId.value) editDraft = { model: instance.getModel(), mentions: [...draftMentions.value], attachments: [...draftAttachments.value] };
  editingId.value = item.id;
  draftMentions.value = [...item.mentions ?? []];
  draftAttachments.value = [...item.attachments ?? []];
  mentionMenuRef.value?.closeMenu();
  const model: AnyTagProps[][] = item.content.split("\n").map(line => mentionParts(line, item.mentions).map(part => part.mention
    ? { type: "Mention", id: part.mention.id, name: mentionName(part.mention) } : { type: "Write", text: part.text }));
  await instance.reset({ chatNode: model });
  if (sender === instance) instance.focus("last");
}

async function restoreEditingDraft() {
  const draft = editDraft;
  editDraft = undefined;
  editingId.value = undefined;
  draftMentions.value = draft?.mentions ?? [];
  draftAttachments.value = draft?.attachments ?? [];
  await sender?.reset({ chatNode: draft?.model });
}

async function cancelEdit() {
  if (busy.value || deletingId.value !== undefined) return;
  await restoreEditingDraft();
}

async function deleteMessage(item: AgentMessage) {
  if (locked.value || remoteRunning.value || item.streaming || item.report) return;
  deletingId.value = item.id;
  try {
    if (browserWorkspaceMode) {
      messages.value = messages.value.filter(message => message.id !== item.id && message.replyTo !== item.id);
      if (directory && props.sessionFile) await persistBrowserMessages();
      return;
    }
    if (item.entryId || item.replyTo) {
      if (!directory || !props.sessionFile) throw new Error("请重新打开对话后再删除");
      const { data } = await axios.delete<{ code: number; data: AgentConversation; message?: string }>("/api/agent/message", {
        data: {
          directory, sessionFile: props.sessionFile,
          ...(item.replyTo ? { replyTo: item.replyTo } : { entryIds: [item.entryId!] }),
        },
        headers: { "x-toonflow-workspace": "1" },
      });
      if (data.code !== 200) throw new Error(data.message || "删除消息失败");
      stats.value = data.data.stats;
      contextUsage.value = data.data.contextUsage;
    }
    messages.value = messages.value.filter(message => message.id !== item.id &&
      !(item.replyTo && message.role === "assistant" && !message.report && message.replyTo === item.replyTo));
  } catch (error) {
    const message = axios.isAxiosError<{ message?: string }>(error) ? error.response?.data?.message : undefined;
    ElMessage.error(message || (error instanceof Error ? error.message : "删除消息失败"));
  } finally {
    deletingId.value = undefined;
  }
}

function setSenderHeight(height: number) {
  if (!sender) return;
  senderMaxHeight.value = Math.max(44, window.innerHeight / 2);
  senderHeight.value = Math.max(44, Math.min(senderMaxHeight.value, Math.round(height)));
  sender.chatElement.rollBox.style.height = `${senderHeight.value}px`;
}

function startSenderResize(event: PointerEvent) {
  if (event.button !== 0 || senderResize || !sender) return;
  event.preventDefault();
  senderResize = { pointerId: event.pointerId, y: event.clientY, height: sender.chatElement.rollBox.getBoundingClientRect().height };
  senderHeight.value = senderResize.height;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}

function moveSenderResize(event: PointerEvent) {
  if (senderResize?.pointerId !== event.pointerId) return;
  setSenderHeight(senderResize.height + senderResize.y - event.clientY);
}

function stopSenderResize(event: PointerEvent) {
  if (senderResize?.pointerId === event.pointerId) senderResize = undefined;
}

function stopMessage() {
  controller?.abort();
}

async function uploadAttachments(attachments: AgentAttachment[], directory: string, signal: AbortSignal) {
  if (!attachments.some(item => item.file)) return;
  const files = useWorkspaceFiles(directory);
  for (const path of ["assets", "assets/chat"]) {
    await files.mkdir(path).catch(error => {
      if (error?.response?.data?.data?.code !== "EEXIST") throw error;
    });
    signal.throwIfAborted();
  }
  for (const attachment of attachments) {
    if (!attachment.file) continue;
    attachment.mimeType = getReadableFileMimeType(attachment.name, attachment.mimeType) ?? attachment.mimeType;
    const readableExtension = getReadableFileExtension(attachment.name, attachment.mimeType);
    const extension = readableExtension ? `.${readableExtension}` : attachment.name.match(/\.[a-zA-Z0-9]{1,10}$/)?.[0].toLowerCase() ?? "";
    const path = `assets/chat/${crypto.randomUUID()}${extension}`;
    await files.write(path, attachment.file, true, signal);
    attachment.path = path;
    attachment.file = undefined;
    signal.throwIfAborted();
  }
}

async function sendCanvasResult(event: Extract<AgentEvent, { type: "canvasCall" }>, canvasContext: CanvasContext | undefined, signal: AbortSignal) {
  let body: string;
  try {
    if (!canvasContext) throw new Error("当前页面没有激活的画布");
    const result = await canvasContext.call(event, signal);
    body = JSON.stringify({ directory, callId: event.callId, result: result ?? null });
  } catch (error) {
    body = JSON.stringify({ directory, callId: event.callId, error: (error instanceof Error && error.message ? error.message : translate("画布操作失败")).slice(0, 8000) });
  }
  const cancelled = signal.aborted;
  if (cancelled) body = JSON.stringify({ directory, callId: event.callId, error: translate("画布操作已取消") });
  const response = await fetch("/api/agent/canvasResult", {
    method: "POST",
    headers: { "Accept-Language": locale.value, "Content-Type": "application/json", "x-toonflow-workspace": "1" },
    body,
    keepalive: cancelled,
    signal: cancelled ? AbortSignal.timeout(5000) : signal,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.message || "画布操作结果回传失败");
  }
}

async function sendMessage(source?: AgentMessage) {
  const instance = sender;
  const editing = source && editingId.value === source.id;
  const prompt = (source && !editing ? source.content : getDraftContent()).trim();
  const attachments = reactive((source && !editing ? source.attachments ?? [] : draftAttachments.value).map(item => ({ ...item })));
  const mentionedIds = source && !editing ? (source.mentions ?? []).filter(mention => prompt.includes(`{{mention:${mention.id}}}`)).map(mention => mention.id)
    : instance?.getTagData().mention.map(mention => mention.id) ?? [];
  const references = source && !editing ? source.mentions ?? [] : draftMentions.value;
  const mentions = references.filter(mention => mentionedIds.includes(mention.id)).map(mention => ({ ...mention }));
  if (mentionedIds.some(id => !mentions.some(mention => mention.id === id))) return ElMessage.warning("存在无法读取的提及，请删除后重新选择");
  if (!source && editingId.value !== undefined) return;
  const resendIndex = source ? messages.value.findIndex(item => item.id === source.id) : -1;
  if (source && (source.role !== "user" || resendIndex < 0)) return;
  const resendFrom = source ? source.entryId ?? messages.value.slice(resendIndex + 1).find(item => item.role === "user" && item.entryId)?.entryId : undefined;
  if (locked.value || !instance || (!prompt && !attachments.length)) return;
  const model = selectedModelChoice.value;
  if (!directory) return ElMessage.warning("请先打开项目");
  if (!model) return ElMessage.warning("请先选择模型");

  const requestController = new AbortController();
  const canvasContext = createCanvasContext?.();
  controller = requestController;
  busy.value = true;
  compacting.value = false;
  instance.disable();
  const reply = reactive<AgentMessage>({ id: crypto.randomUUID(), role: "assistant", content: "", parts: [], streaming: true });
  const userMessage = reactive<AgentMessage>({ id: crypto.randomUUID(), role: "user", content: prompt, attachments, mentions });
  let ownsStream = !remoteRunning.value;
  let forwarded = false;
  if (!source) {
    messages.value.push(userMessage);
    if (ownsStream) messages.value.push(reply);
    draftAttachments.value = [];
    draftMentions.value = [];
  }
  let accepted = false;
  if (ownsStream) stream.begin(reply);
  const handledCanvasCalls = new Set<string>();
  const pendingQuestions = new Map<string, string>();
  const activeChildFiles = new Set<string>();
  const finishStats = anonymousData.startAgent();
  try {
    if (!source) await instance.reset();
    requestController.signal.throwIfAborted();
    await uploadAttachments(attachments, directory, requestController.signal);
    const response = await fetch("/api/agent", {
      method: "POST",
      headers: { "Accept-Language": locale.value, "Content-Type": "application/json", "x-toonflow-workspace": "1" },
      body: JSON.stringify({ prompt, mentions, attachments: attachments.map(({ name, path, mimeType }) => ({ name, path, mimeType })), directory, providerId: model.providerId, modelId: model.modelId, thinkingLevel: reasoningEffort.value || undefined, sessionFile: props.sessionFile, resendFrom, canvas: canvasContext ? { id: canvasContext.id, tools: canvasContext.tools } : undefined }),
      signal: requestController.signal,
    });
    for await (const event of readAgentEvents(response, requestController.signal)) {
      // 子任务复用发起委派时的画布与取消通道，界面切换不改变工具执行目标。
      let toolEvent: AgentEvent = event;
      let scope = "";
      while (toolEvent.type === "subAgentEvent") {
        if (toolEvent.event.type === "done" || toolEvent.event.type === "error") activeChildFiles.delete(toolEvent.file);
        else activeChildFiles.add(toolEvent.file);
        scope += `${toolEvent.file}/`;
        toolEvent = toolEvent.event;
      }
      if (toolEvent.type === "question") pendingQuestions.set(`${scope}${toolEvent.toolCallId}`, toolEvent.callId);
      if (toolEvent.type === "tool" && toolEvent.tool.status !== "running") pendingQuestions.delete(`${scope}${toolEvent.tool.id}`);
      if (toolEvent.type === "canvasCall") {
        if (handledCanvasCalls.has(toolEvent.callId)) throw new Error("收到重复的画布调用");
        handledCanvasCalls.add(toolEvent.callId);
        await sendCanvasResult(toolEvent, canvasContext, requestController.signal);
        continue;
      }
      switch (event.type) {
        case "accepted":
          forwarded = true;
          if (ownsStream) {
            stream.finish();
            messages.value = messages.value.filter(message => message !== reply);
          }
          break;
        case "userMessage":
          if (!ownsStream) {
            messages.value.push(reply);
            stream.begin(reply);
          }
          userMessage.entryId = event.id;
          reply.replyTo = event.id;
          if (source && !accepted) {
            messages.value.splice(resendIndex, messages.value.length - resendIndex, userMessage, reply);
            stats.value = undefined;
            contextUsage.value = undefined;
            await restoreEditingDraft();
          }
          accepted = true;
          ownsStream = true;
          applyEvent(event);
          break;
        case "stats":
          if (source && !accepted) break;
          applyEvent(event);
          break;
        default: applyEvent(event);
      }
    }
    if (source && !accepted) throw new Error("服务端未确认重发，请重新打开对话后重试");
    finishStats("success");
    emit("sent", mentionPlainText(prompt, mentions) || attachments[0]?.name || "新对话");
  } catch (error) {
    finishStats(requestController.signal.aborted ? "cancelled" : "failed");
    const responseMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
    const message = requestController.signal.aborted ? "已停止生成" : responseMessage || (error instanceof Error ? error.message : "发送失败，请重试");
    if ((source && !accepted) || !ownsStream) { userMessage.error = message; ElMessage.error(message); }
    else reply.error = message;
    if (ownsStream && props.initialSession?.parentFile && props.sessionFile) {
      emit("event", { type: "subAgentEvent", file: props.sessionFile, event: { type: "error", message } });
    }
  } finally {
    for (const file of activeChildFiles) emit("event", { type: "subAgentEvent", file, event: { type: "error", message: "委派连接已结束，请重新打开子会话查看结果" } });
    // ACT: Bun 的流断开事件可能不触发；主动结束仍在等待的提问，不依赖断开通知。
    for (const callId of pendingQuestions.values()) {
      void fetch("/api/agent/answer", {
        method: "POST", headers: { "Accept-Language": locale.value, "Content-Type": "application/json", "x-toonflow-workspace": "1" },
        body: JSON.stringify({ directory, callId, cancelled: true }), keepalive: true,
      }).catch(() => {});
    }
    if (ownsStream && !forwarded) stream.finish();
    compacting.value = false;
    busy.value = false;
    controller = undefined;
  }
}

async function restoreTextAttachment(index: number) {
  const instance = sender;
  const attachment = draftAttachments.value[index];
  if (!instance || locked.value || !props.active || attachment?.mimeType !== "text/plain") return;
  restoringAttachment.value = true;
  try {
    const text = await readTextAttachment(attachment, directory);
    if (sender !== instance || !props.active || props.disabled || !draftAttachments.value.includes(attachment)) return;
    instance.focus("last");
    await instance.setText(`${instance.isEmpty(false) ? "" : "\n"}${text}`);
    if (sender === instance) draftAttachments.value = draftAttachments.value.filter(item => item !== attachment);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "还原文本附件失败，请重试");
  } finally {
    restoringAttachment.value = false;
  }
}

function pasteAttachments(event: ClipboardEvent) {
  const files = Array.from(event.clipboardData?.files ?? []);
  if (!files.length) {
    try {
      const file = createPastedTextFile(event.clipboardData?.getData("text/plain") ?? "");
      if (file) files.push(file);
    } catch (error) {
      event.preventDefault();
      event.stopImmediatePropagation();
      ElMessage.warning(error instanceof Error ? error.message : "无法添加文本附件");
      return;
    }
  }
  if (!files.length) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  addAttachments(files);
}

function selectAttachments(event: Event) {
  const input = event.target as HTMLInputElement;
  addAttachments(Array.from(input.files ?? []));
  input.value = "";
}

function resetAttachmentDrag() {
  attachmentDragDepth = 0;
  draggingAttachments.value = false;
}

function dragEnterAttachments(event: DragEvent) {
  if (!event.dataTransfer?.types.includes("Files")) return;
  attachmentDragDepth++;
  dragOverAttachments(event);
}

function dragOverAttachments(event: DragEvent) {
  if (!event.dataTransfer?.types.includes("Files")) return;
  event.preventDefault();
  event.stopPropagation();
  draggingAttachments.value = !locked.value && props.active;
  if (draggingAttachments.value) attachmentDragDepth = Math.max(1, attachmentDragDepth);
  event.dataTransfer.dropEffect = draggingAttachments.value ? "copy" : "none";
}

function dragLeaveAttachments(event: DragEvent) {
  if (!attachmentDragDepth) return;
  event.stopPropagation();
  if (--attachmentDragDepth === 0) resetAttachmentDrag();
}

function dropAttachments(event: DragEvent) {
  resetAttachmentDrag();
  const files = Array.from(event.dataTransfer?.files ?? []);
  if (!files.length) return;
  event.preventDefault();
  event.stopPropagation();
  addAttachments(files);
}

function addAttachments(files: File[], fromMaterialResult = false) {
  if (locked.value && !(fromMaterialResult && props.materialEditor && materialResultBusy.value && !sending.value && !props.disabled)) return;
  for (const file of files) {
    const readableMimeType = getReadableFileMimeType(file.name, file.type);
    const mimeType = readableMimeType ?? file.type.split(";")[0]!.trim().toLowerCase();
    if (!readableMimeType && !/^(image|video)\//.test(mimeType)) {
      ElMessage.warning("只支持图片、视频和受支持的文本或文档文件");
      continue;
    }
    if (!file.size || file.size > 100 * 1024 * 1024) {
      ElMessage.warning("附件不能为空且不能超过 100 MB");
      continue;
    }
    if (mimeType === "text/plain" && file.size > 400000) {
      ElMessage.warning("文本附件不能超过 400000 字节");
      continue;
    }
    if (draftAttachments.value.length >= 20) {
      ElMessage.warning("每条消息最多添加 20 个附件");
      break;
    }
    draftAttachments.value.push({ name: file.name, path: "", mimeType, file, origin: fileGenerationOrigin(file), ...((props.creationModes && !props.materialEditor && /^(image|video)\//.test(mimeType)) ? { referenceRole: referenceMode.value === "frames" ? "middleFrame" as const : "reference" as const, referenceCategory: "other" as const, referenceName: referenceMode.value === "frames" ? `中间帧${Math.max(draftAttachments.value.filter(item => item.referenceRole === "middleFrame").length, ...draftAttachments.value.filter(item => item.referenceRole === "middleFrame").map(item => Number(item.referenceName?.match(/^中间帧(\d+)$/)?.[1] ?? 0))) + 1}` : `其他${draftAttachments.value.filter(item => item.referenceCategory === "other" && item.referenceRole === "reference").length + 1}` } : {}) });
  }
}

watch(senderElement, (element, _previous, onCleanup) => {
  if (!element) return;
  const instance = new xSender(element, {
    autoFocus: props.active,
    placeholder: translate("输入消息，@ 提及节点输出或全局素材…"),
    chatStyle: { minHeight: "44px", maxHeight: "50vh", fontSize: "14px", lineHeight: "24px" },
    keyboardSendFun: event => event.key === "Enter" && !event.shiftKey && !event.isComposing && event.keyCode !== 229,
    keyboardWrapFun: event => event.key === "Enter" && event.shiftKey && !event.isComposing,
  });
  sender = instance;
  if (props.initialDraft?.prompt) void instance.reset({ clearHistory: false, chatNode: templatePromptModel(props.initialDraft.prompt) });
  if (!props.active || locked.value) instance.disable();
  instance.bus.on("agentConversation", xSender.EventSet.EVENT_COMMON_SEND, () => void submitMessage());
  instance.bus.on("agentConversation", xSender.EventSet.EVENT_COMMON_CHANGE, () => {
    draftPrompt.value = instance.getText();
    skillQuery.value = browserWorkspaceMode || browserConfig.enabled ? undefined : /^\/([^\s/]*)$/.exec(instance.getText())?.[1];
    const targets: typeof draftMentionTargets.value = [];
    for (const line of instance.chatEditor.NODES) for (const tag of line.children) {
      if (tag.type !== "Mention") continue;
      tag.$el.dataset.agentMention = tag.id;
      tag.$el.setAttribute("role", "button");
      tag.$el.setAttribute("tabindex", "0");
      tag.$el.setAttribute("aria-label", t`预览 ${tag.name}`);
      const mention = draftMentions.value.find(item => item.id === tag.id);
      if (!mention || !mentionThumbnailProps(mention).thumbnail) continue;
      const content = tag.$el.querySelector<HTMLElement>(".chat-tag-mention");
      if (!content) continue;
      let element = content.querySelector<HTMLElement>(".agentMentionThumbnail");
      if (!element) {
        element = document.createElement("span");
        element.className = "agentMentionThumbnail";
        const label = document.createElement("span");
        label.className = "agentMentionLabel";
        label.textContent = content.textContent;
        content.replaceChildren(element, label);
      }
      targets.push({ key: draftMentionTargets.value.find(target => target.element === element)?.key ?? Symbol(), element, mention });
    }
    draftMentionTargets.value = targets;
    void instance.nextTick(() => { if (sender === instance) updateMentionQuery(); });
  });
  instance.bus.on("agentConversation", xSender.EventSet.EVENT_COMMON_TAG_CLICK, (tag: { type: string; id?: string }) => {
    if (tag.type === "Mention" && tag.id) draftMentionPreview.value?.preview(tag.id);
  });
  const editor = instance.chatElement.richText;
  editor.setAttribute("role", "textbox");
  editor.setAttribute("aria-label", translate("消息"));
  editor.setAttribute("aria-multiline", "true");
  element.addEventListener("paste", pasteAttachments, true);
  window.addEventListener("dragend", resetAttachmentDrag, true);
  window.addEventListener("drop", resetAttachmentDrag, true);
  window.addEventListener("blur", resetAttachmentDrag);
  const updateCursor = (event: Event) => { if (!(event instanceof KeyboardEvent) || event.key !== "Escape") updateMentionQuery(); };
  editor.addEventListener("keyup", updateCursor);
  editor.addEventListener("compositionend", updateCursor);
  onCleanup(() => {
    controller?.abort();
    draftMentionTargets.value = [];
    sender = undefined;
    senderResize = undefined;
    element.removeEventListener("paste", pasteAttachments, true);
    window.removeEventListener("dragend", resetAttachmentDrag, true);
    window.removeEventListener("drop", resetAttachmentDrag, true);
    window.removeEventListener("blur", resetAttachmentDrag);
    resetAttachmentDrag();
    editor.removeEventListener("keyup", updateCursor);
    editor.removeEventListener("compositionend", updateCursor);
    instance.destroy();
  });
});

watch(() => !props.materialEditor && !props.initialSession?.parentFile && !!workspaceStore.pendingAgentMessage && props.active && !locked.value && !!senderElement.value && (workspaceStore.pendingAgentMessage?.send === false || (props.creationModes && browserConfig.enabled) || !!createCanvasContext?.()), async ready => {
  const message = workspaceStore.pendingAgentMessage;
  const instance = sender;
  if (!ready || !message || !instance || message.directory !== directory) return;
  workspaceStore.pendingAgentMessage = null;
  referenceMode.value = "reference";
  draftAttachments.value = (message.attachments ?? []).map((attachment, index) => /^(image|video)\//.test(attachment.mimeType) ? { ...attachment, referenceRole: "reference", referenceCategory: "other", referenceName: `其他${index + 1}` } : attachment);
  await fillPrompt(message.prompt);
  if (sender === instance && props.active && message.send !== false) void submitMessage();
}, { immediate: true, flush: "post" });
</script>

<style lang="scss">
.agentConversation {
  .senderEditor .chat-tag-input { color: var(--el-text-color-primary); font-weight: 600; background: #62656b; }
  .creationChoices { padding: 10px 0; .el-button { margin: 4px; } }
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;

  .messageViewport {
    flex: 1;
    min-height: 100px;

    .messageList {
      overflow-anchor: none;
      scrollbar-width: none;
      &::-webkit-scrollbar { display: none; }
    }

    .messageSpace {
      position: relative;
      width: 100%;
    }

    .scrollBottom {
      position: absolute;
      right: 16px;
      bottom: 12px;
      z-index: 1;
    }

    .welcomeMessage {
      display: flex;
      flex-direction: column;
      gap: 18px;
      padding: 28px 16px 16px;
      color: var(--el-text-color-primary);

      .welcomeHeader {
        display: flex;
        align-items: center;
        gap: 12px;

        .welcomeIcon {
          display: grid;
          place-items: center;
          flex-shrink: 0;
          width: 42px;
          height: 42px;
          border-radius: var(--ui-radius-large);
          background: var(--el-color-primary-light-9);
          color: var(--el-color-primary);
        }

        h3 { margin: 0; font-size: 18px; font-weight: 600; line-height: 1.4; }
      }


    }

    .messageRow {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      box-sizing: border-box;
      padding: 0 12px 12px;

      .messageActions {
        display: flex;
        align-items: center;
        gap: 4px;
        margin-top: 4px;

        .el-button {
          margin: 0;

          .tabler-icon {
            flex-shrink: 0;
          }
        }

        .messageAction {
          width: 24px;
          height: 24px;
          padding: 0;
          color: var(--el-text-color-secondary);
        }
      }

      .browserPreview { margin-top: 6px; }

      &.userMessage .messageActions {
        justify-content: flex-end;
      }

      &.editingMessage .t-chat__inner.user .t-chat__content .t-chat__detail {
        width: 100%;
        max-width: 100%;
        padding: 0;
        background: transparent;
      }
    }

    .t-chat__inner {
      margin-bottom: 0;

      .t-chat__content {
        min-width: 0;
        padding-top: 0;

        .t-chat__detail {
          width: 100%;
          max-width: 100%;
          padding: 0;
        }
      }

      &.user .t-chat__content .t-chat__detail {
        width: auto;
        max-width: 80%;
        padding: 6px 10px;
        border-radius: calc(var(--ui-radius) * 1.25);
        background: color-mix(in srgb, var(--el-text-color-secondary) 12%, var(--el-bg-color));
      }
    }

    .messageContent {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
      overflow-wrap: anywhere;
      color: var(--el-text-color-primary);

      .messageReasoning {
        padding-top: 0;

        .t-collapse-panel__wrapper {
          background: transparent;

          .t-collapse-panel__header {
            padding: 2px 0;
            font-size: 13px;
            line-height: 20px;
          }

          .t-collapse-panel__icon {
            width: 16px;
            height: 20px;
            margin-right: 6px;
            color: var(--el-text-color-secondary);
          }

          .t-collapse-panel__body {
            background: transparent;

            .t-collapse-panel__content {
              padding: 4px 0 4px 22px;
              background: transparent;
              color: var(--el-text-color-secondary);
            }
          }
        }
      }

      .reasoningHeader {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: var(--el-text-color-secondary);

        .thinkingDuration {
          font-variant-numeric: tabular-nums;
        }
      }

      .messageText {
        white-space: pre-wrap;
        font-size: 13px;
        line-height: 1.6;
      }

      .messageError {
        color: var(--el-color-danger);
        font-size: 12px;
      }

      .reportHeader {
        display: flex;
        align-items: center;
        gap: 6px;
        color: var(--el-text-color-secondary);
        font-size: 12px;
      }

      .messageMarkdown {
        display: block;
        min-width: 0;
        max-width: 100%;
        font-size: 13px;
        line-height: 1.6;
      }
    }
  }

  .compactionStatus {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: 6px;
    margin: 0 12px 8px;
    color: var(--el-text-color-secondary);
    font-size: 12px;
  }

  .messageInput {
    .materialUpload { margin: 6px 8px 0; color: #d2c6e7; :deep(> span) { gap: 6px; } }
    --chat-text: var(--el-text-color-primary);
    --chat-text-placeholder: var(--el-text-color-placeholder);
    --chat-rect-padding: 12px;
    --chat-mention-text: var(--el-color-primary);
    position: relative;
    flex-shrink: 0;
    margin: 0 12px 8px;
    width: calc(100% - 24px);
    min-width: min(280px, calc(100% - 24px));
    max-width: calc(100% - 24px);
    box-sizing: border-box;
    resize: horizontal;
    overflow: hidden;
    border: 1px solid var(--el-border-color-light);
    border-radius: calc(var(--ui-radius) * 2.75);
    background: var(--agent-input-bg);
    box-shadow: 0 4px 16px rgb(0 0 0 / 8%);

    &:focus-within {
      border-color: var(--el-color-primary-light-5);
    }

    &.draggingAttachments {
      border-color: var(--el-color-primary-light-5);
    }

    .attachmentDropHint {
      position: absolute;
      inset: 0;
      z-index: 13;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      border-radius: inherit;
      background: var(--el-bg-color);
      color: var(--el-text-color-primary);
      font-size: 14px;
      font-weight: 500;
      pointer-events: none;

      > svg {
        color: var(--el-text-color-secondary);
      }

      small {
        color: var(--el-text-color-secondary);
        font-size: 12px;
        font-weight: 400;
      }
    }

    .senderResizeHandle {
      position: absolute;
      z-index: 12;
      top: -4px;
      right: 12px;
      left: 12px;
      height: 12px;
      border-radius: 4px;
      &::after { content: ""; display: block; width: 36px; height: 3px; margin: 4px auto; background: var(--el-border-color); border-radius: 3px; }
      cursor: ns-resize;
      touch-action: none;
      user-select: none;

      &:focus-visible {
        outline: 2px solid var(--el-color-primary);
        outline-offset: 2px;
      }
    }

    .draftAttachments {
      .thumbnailItem { width: 68px; height: 68px; }
      padding: 12px 12px 0;
    }

    .senderEditor .chat-placeholder-wrap {
      font-size: 14px;
      font-style: normal;
      line-height: 24px;
    }

    .editingBanner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 3px 12px;
      border-bottom: 1px solid var(--el-border-color-lighter);
      color: var(--el-text-color-secondary);
      font-size: 12px;
    }

    .senderEditor .chat-tag-mention {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      max-width: 100%;
      vertical-align: middle;
      border-radius: var(--el-border-radius-small);
      background: var(--el-color-primary-light-9);
      color: var(--el-color-primary);
      white-space: normal;
      overflow-wrap: anywhere;
      cursor: pointer;

      .agentMentionThumbnail {
        display: inline-flex;
        flex-shrink: 0;

        .mentionThumbnail { width: 24px; height: 24px; border-radius: 3px; }
      }
      .agentMentionLabel { min-width: 0; }
    }

    .senderActions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      align-items: center;
      gap: 12px;
      padding: 2px 8px 6px;

      .el-button:not(.sendButton):not(.styleSelect):hover { background: var(--el-fill-color); border-color: transparent; }

      > .el-button {
        margin-left: 0;
        border-color: transparent;
        &:hover { background: var(--el-fill-color); }
      }

      .modelPopover {
        flex: 1;
        margin-right: auto;
      }

      .contextButton {
        width: 24px;
        height: 24px;
        margin: 0;
        padding: 0;

        &.is-text {
          background-color: transparent;
        }
      }

      .sendButton {
        width: 34px;
        height: 34px;
        border: none;
        transform: translateY(-2px);
      }
    }
  }

}
.agentContextPopover {
  .contextUsage {
    display: flex;
    flex-direction: column;
    gap: 12px;

    .contextStats {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .contextHeader,
    .contextTokens {
      display: flex;
      justify-content: space-between;
      gap: 8px;
    }

    .contextHeader {
      color: var(--el-text-color-primary);
    }

    .contextTokens {
      font-size: 12px;
      font-variant-numeric: tabular-nums;
    }

    .contextHint {
      color: var(--el-text-color-secondary);
      font-size: 12px;
    }
  }
}
</style>

<style scoped lang="scss">
.agentConversation {
  .conversationMode { flex-shrink: 0; width: min(340px, calc(100% - 24px)); margin: 12px 12px 10px; }
  .welcomeMessage { align-items: center; text-align: center; padding: 12px 16px 20px; .welcomeHeader { flex-direction: column; gap: 12px; .welcomeIcon { width: auto; height: auto; border-radius: 0; background: transparent; :deep(.brandLogo) { width: 132px; } } h3 { font-size: clamp(24px, 3vw, 32px); font-weight: 600; } } }
  &.emptyConversation { justify-content: center; .messageViewport { flex: none; min-height: 0; max-height: 34dvh; overflow: auto; } .messageInput { flex-shrink: 0; resize: none; background: var(--agent-input-bg); .senderEditor { min-height: 110px; } } .conversationMode { align-self: center; } }
  .senderActions { justify-content: flex-start; > .sendButton { margin-left: auto; } }
}
</style>

<style scoped lang="scss">
.messageInput { :deep(.chat-sender), :deep(.chat-rich-text), :deep(.chat-rich-text > [contenteditable]) { background: transparent; } }
</style>

<style scoped lang="scss">
.agentConversation .messageInput .senderActions.simpleToolbar {
  display: flex; flex-wrap: nowrap; align-items: center; justify-content: flex-start; gap: 6px; padding: 10px 8px; overflow-x: auto; overscroll-behavior-x: contain; scrollbar-width: thin;
  .referenceTabsTarget { display: flex; flex: none; }
  .quickMention { flex: none; width: 32px; height: 40px; padding: 0; margin: 0; color: #e3dfeb; font-size: 21px; border-radius: 10px; }
  > .sendButton { position: sticky; right: 0; z-index: 1; flex: none; display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-width: 100px; width: auto; height: 48px; margin: 0 0 0 auto; padding: 0 16px; border-radius: 12px; transform: none; background: linear-gradient(110deg, #8747ed, #397df6); box-shadow: 0 4px 14px #7552d52b; font-size: 12px; :deep(> span) { gap: 6px; } &:hover:enabled { background: linear-gradient(110deg, #985ef4, #548dfa); } &:active:enabled { filter: brightness(.94); } &.is-disabled { background: #383241; color: #a49bad; box-shadow: none; } }
}
</style>
