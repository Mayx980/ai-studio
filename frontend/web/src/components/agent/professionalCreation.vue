<template>
  <section class="professionalCreation" aria-label="专业创作流程">
    <p class="stageLabel">专业创作 · {{ stageLabels[state.stage] }}</p>
    <section v-if="historyEntries.length" class="creationHistory" aria-label="专业创作历史内容">
      <article v-for="group in historyGroups" :key="group.id">
        <h4>{{ group.title }}</h4>
        <div v-if="group.entries.length > 1" class="optionTabs" role="tablist" :aria-label="group.title">
          <button v-for="(entry, index) in group.entries" :key="entry.id" type="button" role="tab"
            :aria-selected="activeEntry(group)?.id === entry.id" :id="`${historyTabsId}-${entry.id}`"
            :aria-controls="`${historyTabsId}-${group.id}-panel`" :tabindex="activeEntry(group)?.id === entry.id ? 0 : -1"
            @keydown="moveHistoryTab($event, group, index)" @click="activeHistoryIds[group.id] = entry.id">方案{{ index + 1 }}</button>
        </div>
        <section v-if="activeEntry(group)" role="tabpanel" :id="`${historyTabsId}-${group.id}-panel`"
          :aria-labelledby="group.entries.length > 1 ? `${historyTabsId}-${activeEntry(group)!.id}` : undefined">
          <h5>{{ activeEntry(group)!.title }}</h5>
          <el-input v-if="editableScript(group)" :key="activeEntry(group)!.id" :modelValue="activeEntry(group)!.content"
            type="textarea" :autosize="{ minRows: 12, maxRows: 28 }" :disabled="busy || disabled" aria-label="编辑剧情脚本"
            @update:modelValue="value => editScript(activeEntry(group)!.id, value)" />
          <messageMarkdown v-else :content="activeEntry(group)!.content" :directory="directory" />
          <div v-if="canApply(group)" class="optionActions">
            <el-button type="primary" :disabled="busy || disabled || !activeEntry(group)?.content.trim()" @click="applyOption(group)"><icon-check :size="16" />应用</el-button>
          </div>
        </section>
      </article>
    </section>
    <browserModelResults v-if="archivedResultIds.length" :directory="directory" :resultIds="archivedResultIds" :showStatus="false" :showCanvas="false" :showReference="false" />
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <p v-if="busy" role="status">正在处理，请稍候…</p>
    <el-button v-if="busy" text @click="stop">停止等待</el-button>
    <el-button v-if="state.stage === 'analyze' && !busy" @click="analyze">分析创作要求</el-button>
    <el-form v-if="state.stage === 'brief'" labelPosition="top" :disabled="busy || disabled">
      <el-form-item v-for="(question, index) in state.questions.slice(0, 5)" :key="index" :label="question.label"><el-checkbox-group v-model="question.selected" @change="answerQuestion(index)"><el-checkbox v-for="option in (question.options || []).slice(0, 5)" :key="option" :value="option">{{ option }}</el-checkbox></el-checkbox-group><el-input v-model="question.custom" placeholder="其他想法（选填）" @input="answerQuestion(index)" /></el-form-item>
      <el-form-item v-if="state.start !== 'idea'" label="已有剧情／分镜正文"><el-input v-model="sourceText" type="textarea" :rows="6" placeholder="粘贴正文，或使用本轮已引用的文本内容" /></el-form-item>
      <el-button type="primary" :disabled="!state.questions.slice(0, 5).every(question => question.answer.trim()) || (state.start !== 'idea' && !sourceText.trim())" @click="makePlans">确认要求，生成方案</el-button>
    </el-form>
    <el-button v-if="state.stage === 'storyReview' && !busy" :disabled="disabled" @click="confirmDocument">继续生成分镜脚本</el-button>
    <section v-if="state.storyboard" class="storyboardContent" aria-label="分镜脚本">
      <div class="storyboardHeader"><h4>分镜脚本</h4><el-button text :icon="IconMaximize" aria-label="放大分镜脚本" @click="editorExpanded = true" /></div>
      <div v-if="state.stage === 'storyboardReview'" ref="editorTarget" class="nodeEditor" data-node-content-only="true" /><div v-else class="storyboardPreview"><messageMarkdown :content="storyboardText" :directory="directory" /></div>
      <el-button v-if="state.stage === 'storyboardReview'" type="primary" :disabled="busy || disabled || !editorReady" @click="confirmDocument">确认分镜并同步到画布</el-button>
    </section>
    <el-dialog v-model="editorExpanded" title="分镜脚本" fullscreen appendToBody destroyOnClose @closed="saveStoryboardPreview"><div ref="expandedEditorTarget" class="expandedNodeEditor" data-node-content-only="true" /></el-dialog>
    <template v-if="state.stage === 'referenceConsent'">
      <p>是否根据分镜脚本生成图片设计提示词？</p>
      <el-button type="primary" :disabled="busy || disabled" @click="makePrompts">生成设计提示词供我选择</el-button><el-button :disabled="busy || disabled" @click="skipImages">暂不生成设计提示词</el-button>
    </template>
    <template v-if="state.stage === 'prompts'">
      <p>勾选角色／场景设计提示词，可多选，分别生成参考图。</p>
      <el-checkbox-group v-model="selectedPrompts" :disabled="busy || disabled" @change="changed"><el-checkbox v-for="option in state.prompts" :key="option.id" :value="option.id"><strong>{{ option.title }}</strong></el-checkbox></el-checkbox-group>
      <el-button type="primary" :disabled="busy || disabled || !selectedPrompts.length" @click="makeImages">生成选中的参考图</el-button>
    </template>
    <template v-if="state.stage === 'imageReview'">
      <p>勾选要应用的图片。确认后分别保存到画布图片节点。</p>
      <el-checkbox-group v-model="selectedImages" :disabled="busy || disabled" @change="changed"><div v-for="(id, index) in imageDraftIds" :key="id" class="mediaCandidate"><el-checkbox :value="id">{{ draftLabel(id) || `参考图 ${index + 1}` }}</el-checkbox><browserModelResults :directory="directory" :resultIds="[id]" :showStatus="false" :showCanvas="false" :showReference="false" /></div></el-checkbox-group>
      <el-button type="primary" :disabled="busy || disabled || !selectedImages.length" @click="confirmMedia('image')">应用所选图片并加入画布</el-button>
      <el-button :disabled="busy || disabled" @click="state.stage = 'prompts'; changed()">继续选择提示词</el-button>
    </template>
    <template v-if="state.stage === 'videoReview'">
      <p>勾选要应用的视频。确认后分别保存到画布视频节点。</p>
      <el-checkbox-group v-model="selectedVideos" :disabled="busy || disabled" @change="changed"><div v-for="(id, index) in videoDraftIds" :key="id" class="mediaCandidate"><el-checkbox :value="id">{{ draftLabel(id) || `视频 ${index + 1}` }}</el-checkbox><browserModelResults :directory="directory" :resultIds="[id]" :showStatus="false" :showCanvas="false" :showReference="false" /></div></el-checkbox-group>
      <el-button type="primary" :disabled="busy || disabled || !selectedVideos.length" @click="confirmMedia('video')">应用所选视频并加入画布</el-button>
    </template>
    <template v-if="state.stage === 'videoConsent'">
      <p>是否使用已确认的剧情、分镜与参考图生成视频？</p>
      <el-button type="primary" :disabled="busy || disabled" @click="makeVideo">确认生成视频</el-button><el-button :disabled="busy || disabled" @click="state.stage = 'done'; changed()">暂不生成</el-button>
      <el-button v-if="imageDraftIds.length" :disabled="busy || disabled" @click="state.stage = 'imageReview'; changed()">调整参考图</el-button>
    </template>
    <template v-if="state.stage === 'done'"><p>所选内容已加入画布，可继续编辑。</p></template>
  </section>
</template>

<script setup lang="ts">
import { ElInput, ElDialog } from "element-plus";
import { IconCheck, IconMaximize } from "@tabler/icons-vue";
import { scriptGenerationInstruction } from "@toonflow/node-text/scriptColumns";
import { computed, inject, nextTick, onBeforeUnmount, onMounted, reactive, ref, useId, watch } from "vue";
import { generateBrowserText } from "@/lib/browserNodeAi";
import { browserResultFile, generateInBrowser, generationBusy, generationError, generationResults, resolveBrowserModel, stopBrowserGeneration, type BeginBrowserWorkflow, type BrowserWorkflowNode, type ProfessionalCanvas } from "@/stores/browserGeneration";
import { readTextAttachment } from "./textAttachments";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import type { AgentAttachment } from "./types";
import type { ProfessionalCreation, ProfessionalOption } from "./professionalCreation";
import messageMarkdown from "@/components/messageMarkdown.vue";
import browserModelResults from "@/components/browserModelResults.vue";
const props = defineProps<{ state: ProfessionalCreation; directory: string; attachments: AgentAttachment[]; disabled?: boolean; stopToken?: number }>();
const emit = defineEmits<{ change: []; busy: [value: boolean]; results: [ids: string[]] }>();
const begin = inject<BeginBrowserWorkflow>("beginBrowserWorkflow");
const canvas = inject<ProfessionalCanvas>("professionalCanvas");
const busy = ref(false), error = ref(""), editorReady = ref(false);
const sourceText = computed({ get: () => props.state.sourceText || "", set: value => { props.state.sourceText = value; changed(); } });
const editorTarget = ref<HTMLElement>();
const expandedEditorTarget = ref<HTMLElement>();
const editorExpanded = ref(false);
let controller: AbortController | undefined;
let mediaWaiting = false;
let disposed = false;
let releaseEditor: (() => void) | undefined;
let editorMountVersion = 0;

const stageLabels = { analyze: "分析要求", brief: "勾选创作细节", plans: "选择方案", scripts: "选择脚本", storyReview: "生成分镜脚本", storyboardReview: "预览修改分镜", referenceConsent: "确认设计提示词", prompts: "选择设计提示词", imageReview: "预览参考图", videoConsent: "确认视频生成", videoReview: "预览并应用视频", done: "已加入画布" };
const selectedPrompts = computed({ get: () => props.state.selectedPrompts ?? (props.state.selectedPrompt ? [props.state.selectedPrompt] : []), set: value => { props.state.selectedPrompts = value; } });
const selectedImages = computed({ get: () => props.state.selectedImages ?? props.state.imageResultIds, set: value => { props.state.selectedImages = value; } });
const selectedVideos = computed({ get: () => props.state.selectedVideos ?? videoDraftIds.value, set: value => { props.state.selectedVideos = value; } });
const imageDraftIds = computed(() => [...new Set([...(props.state.mediaDrafts ?? []).filter(item => item.kind === "image").map(item => item.resultId), ...props.state.imageResultIds])]);
const videoDraftIds = computed(() => (props.state.mediaDrafts ?? []).filter(item => item.kind === "video").map(item => item.resultId));
const archivedResultIds = computed(() => props.state.resultIds.filter(id => !(props.state.stage === "imageReview" && imageDraftIds.value.includes(id)) && !(props.state.stage === "videoReview" && videoDraftIds.value.includes(id))));
function optionHistory() {
  return [
    ...props.state.plans.map(item => ({ ...item, title: `设计方案 · ${item.title}` })),
    ...props.state.scripts.map(item => ({ ...item, title: `${props.state.goal === "storyboard" ? "分镜脚本" : "剧情脚本"} · ${item.title}` })),
    ...props.state.prompts.map(item => ({ ...item, title: `设计提示词 · ${item.title}` })),
  ];
}
const historyEntries = computed(() => {
  const saved = props.state.history ?? [];
  return [...saved, ...optionHistory().filter(item => !saved.some(entry => entry.id === item.id))];
});
const historyTabsId = useId();
const activeHistoryIds = reactive<Record<string, string>>({});
type HistoryGroup = { id: string; title: string; entries: NonNullable<ProfessionalCreation["history"]> };
const historyGroups = computed<HistoryGroup[]>(() => {
  const prefixes = ["设计方案", "剧情脚本", "分镜脚本", "设计提示词"];
  const groups = prefixes.map(title => ({ id: title, title: title === "设计提示词" ? "图片提示词" : title, entries: historyEntries.value.filter(entry => entry.title.startsWith(`${title} · `) && !entry.title.endsWith("画布版本") && !entry.title.endsWith("确认版本")) })).filter(group => group.entries.length);
  const grouped = new Set(groups.flatMap(group => group.entries.map(entry => entry.id)));
  return [...groups, ...historyEntries.value.filter(entry => !grouped.has(entry.id)).map(entry => ({ id: entry.id, title: entry.title, entries: [entry] }))].filter(group => !props.state.storyboard || !group.title.startsWith("分镜脚本"));
});
function activeEntry(group: HistoryGroup) { return group.entries.find(entry => entry.id === activeHistoryIds[group.id]) ?? group.entries[0]; }
function moveHistoryTab(event: KeyboardEvent, group: HistoryGroup, index: number) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const next = event.key === "Home" ? 0 : event.key === "End" ? group.entries.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + group.entries.length) % group.entries.length;
  activeHistoryIds[group.id] = group.entries[next]!.id;
  ((event.currentTarget as HTMLElement).parentElement?.children[next] as HTMLElement)?.focus();
}
function editableScript(group: HistoryGroup) { return props.state.stage === "scripts" && ["剧情脚本", "分镜脚本"].includes(group.id); }
function canApply(group: HistoryGroup) { return props.state.stage === "plans" && group.id === "设计方案" || editableScript(group); }
function editScript(id: string, content: string) {
  const option = props.state.scripts.find(item => item.id === id);
  const entry = props.state.history?.find(item => item.id === id);
  if (option) option.content = content;
  if (entry) entry.content = content;
  changed();
}
function applyOption(group: HistoryGroup) {
  const entry = activeEntry(group); if (!entry?.content.trim() || busy.value || props.disabled) return;
  const option = { ...entry, title: entry.title.replace(/^(设计方案|剧情脚本|分镜脚本) · /, "") };
  if (props.state.stage === "plans") {
    if (!props.state.plans.some(item => item.id === entry.id)) props.state.plans.push(option);
    props.state.selectedPlans = [entry.id]; return confirmPlans();
  }
  if (!props.state.scripts.some(item => item.id === entry.id)) props.state.scripts.push(option);
  props.state.selectedScript = entry.id; return adoptScript();
}
function retainDocument(title: string, content: string) {
  if (title === "分镜脚本") props.state.history = (props.state.history ?? []).filter(item => !["分镜脚本", "分镜脚本 · 画布版本", "分镜脚本 · 确认版本"].includes(item.title));
  if (!content.trim() || props.state.history?.some(item => item.title === title && item.content === content)) return;
  (props.state.history ??= []).push({ id: crypto.randomUUID(), title, content });
  changed();
}
async function restoreDocumentHistory() {
  if (!canvas) return;
  for (const [node, title] of [[props.state.storyboard, "分镜脚本"]] as const) {
    if (!node || props.state.history?.some(item => item.title === title)) continue;
    try {
      const content = await canvas.read(props.directory, node);
      if (disposed) return;
      retainDocument(title, content);
    }
    catch (reason) { if (disposed) return; error.value = `历史文档读取失败：${reason instanceof Error ? reason.message : "请检查原画布文件"}`; }
  }
}
function draftLabel(id: string) { return props.state.mediaDrafts?.find(item => item.resultId === id)?.label; }
function answerQuestion(index: number) { const question = props.state.questions[index]!; question.answer = [...question.selected ?? [], question.custom || ""].filter(Boolean).join("、"); changed(); }
const reviewNode = computed(() => props.state.stage === "storyboardReview" || editorExpanded.value ? props.state.storyboard : undefined);
const storyboardText = computed(() => props.state.history?.find(entry => entry.title === "分镜脚本")?.content || "");
function changed() { props.state.history = historyEntries.value; emit("change"); }
function stop() { controller?.abort(); if (mediaWaiting) stopBrowserGeneration(); }
async function run(action: () => Promise<void>) {
  if (busy.value || props.disabled) return;
  error.value = ""; busy.value = true; emit("busy", true); controller = new AbortController();
  try { await action(); }
  catch (reason) { error.value = controller.signal.aborted ? "已停止等待，已创建的节点与选择保留。" : reason instanceof Error ? reason.message : "处理失败，请重试"; }
  finally { busy.value = false; emit("busy", false); changed(); }
}
async function textRequest(instruction: string) {
  const model = resolveBrowserModel("text");
  const result = await generateBrowserText({ providerId: model.providerId, modelId: model.modelId, prompt: instruction, signal: controller?.signal, systemPrompt: "你是专业创作助手。遵守用户指定的创作目标和约束，先收集细节，再提供多个可选方案。只输出请求的 JSON，不输出 Markdown 围栏。不臆造用户已经确认的内容。" });
  controller?.signal.throwIfAborted();
  let value: unknown;
  try { value = JSON.parse(result.text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "")); }
  catch { throw new Error("模型未返回有效的结构化内容，请重试；不会用示例方案替代。"); }
  return value;
}
async function initialReferences() {
  const texts = await Promise.all(props.attachments.filter(item => item.mimeType.startsWith("text/") || item.mimeType === "application/json").map(item => readTextAttachment({ ...item, mimeType: "text/plain" }, props.directory)));
  return texts.join("\n\n");
}
async function context() {
  const state = props.state;
  const documents = await Promise.all([state.story, state.storyboard].flatMap(node => node && canvas ? [canvas.read(props.directory, node)] : []));
  const value = [state.prompt, `目标：${state.goal}，起点：${state.start}`, ...state.questions.map(item => `${item.label}：${item.answer}`), ...state.plans.filter(item => state.selectedPlans.includes(item.id)).map(item => item.content), sourceText.value || await initialReferences(), ...documents].filter(Boolean).join("\n\n");
  if (value.length > 100000) throw new Error("创作上下文过长，请缩小引用内容后重试");
  return value;
}
async function options(instruction: string): Promise<ProfessionalOption[]> {
  const result = await textRequest(`${await context()}\n\n${instruction}。输出 JSON 数组，包含 2～3 项，每项为 {"title":"标题","content":"完整内容"}，不要返回摘要替代正文。`);
  if (!Array.isArray(result) || result.length < 2 || result.length > 3 || result.some(item => !item || typeof item.title !== "string" || !item.title.trim() || typeof item.content !== "string" || !item.content.trim())) throw new Error("模型返回的选项格式不完整，请重试");
  return result.map(item => ({ id: crypto.randomUUID(), title: item.title, content: item.content }));
}
function analyze() { return run(async () => {
  sourceText.value ||= await initialReferences();
  const result = await textRequest(`用户要求：${props.state.prompt}\n已有文字参考：${sourceText.value}\n请分析当前创作情景，按当前语境和重要性排序，优先呈现最关键且必须由用户确定的问题，最多提问 5 个尚未明确且影响结果的问题，例如制作目的、时长、受众、主体、风格、比例。每题提供 2～4 个适合当前情景的简短选项（加上“由你推荐”总共不超过 5 个），允许多选。已经明确的细节不要重复问，全部明确时 questions 可为空。自行判断创作目标goal（story/storyboard/image/video/audio）和起点start（idea/story/storyboard），不要提问“本次创作目标”“从哪一步开始”等可以从语境判断的问题。sourceText仅提取用户已提供的剧情或分镜原文，没有则为空，不得自行补写。输出 {"goal":"video","start":"idea","sourceText":"","questions":[{"label":"具体问题","options":["选项1","选项2","选项3"]}]}。`);
  const inference = result as { goal?: unknown; start?: unknown; sourceText?: unknown };
  if (["story", "storyboard", "image", "video", "audio"].includes(String(inference?.goal))) props.state.goal = inference.goal as ProfessionalCreation["goal"];
  if (typeof inference?.sourceText === "string" && inference.sourceText.trim()) sourceText.value = inference.sourceText;
  if (["idea", "story", "storyboard"].includes(String(inference?.start))) props.state.start = inference.start as ProfessionalCreation["start"];
  if (props.state.start !== "idea" && !sourceText.value.trim()) props.state.start = "idea";
  const questions = (result as { questions?: unknown })?.questions;
  if (!Array.isArray(questions) || questions.some(item => !item || typeof item.label !== "string" || !item.label.trim() || !Array.isArray(item.options) || item.options.length < 2 || item.options.some((option: unknown) => typeof option !== "string" || !option.trim()))) throw new Error("模型未返回有效的提问选项，请重新分析");
  props.state.questions = questions.slice(0, 5).map(item => ({ label: item.label, options: [...new Set<string>([...item.options.filter((option: string) => option !== "由你推荐").slice(0, 4), "由你推荐"])], selected: [], custom: "", answer: "" })); props.state.stage = "brief";
  if (!props.state.questions.length) { props.state.plans = await options("根据用户要求生成不同创作方案"); props.state.stage = "plans"; }
}); }
function makePlans() { return run(async () => { props.state.plans = await options("根据已补充的细节生成不同创作方案供勾选"); props.state.stage = "plans"; }); }
async function createDocument(text: string, script: boolean) {
  controller?.signal.throwIfAborted();
  if (script) retainDocument("分镜脚本", text);
  if (!begin) throw new Error("画布尚未就绪");
  const workflow = await begin(props.state.prompt, "text", [], script, true, sources());
  await workflow.complete([{ id: crypto.randomUUID(), kind: "text", text, directory: props.directory }]);
  return workflow.node;
}
function sources() { return [props.state.story, props.state.storyboard].filter((node): node is BrowserWorkflowNode => !!node); }
function confirmPlans() { return run(async () => {
  if (props.state.start !== "idea" && !props.state.story && !props.state.storyboard) {
    const text = sourceText.value || await initialReferences();
    if (!text.trim()) throw new Error("请先提供已有剧情或分镜正文");
    if (props.state.start === "story") { props.state.story = await createDocument(text, false); props.state.stage = "storyReview"; await advanceDocument(); }
    else { props.state.storyboard = await createDocument(text, true); props.state.stage = "storyboardReview"; }
  } else if (props.state.goal === "image") { props.state.prompts = await options("生成不同角色或场景的图像设计提示词"); props.state.stage = "prompts"; }
  else if (props.state.goal === "audio") { await media("audio", await context()); props.state.stage = "done"; }
  else if (props.state.goal === "storyboard") { await generateStoryboard(); }
  else {
    props.state.scripts = await options("依据已应用的方案生成几个不同的完整剧情脚本");
    props.state.stage = "scripts";
  }
}); }

function adoptScript() { return run(async () => {
  const option = props.state.scripts.find(item => item.id === props.state.selectedScript);
  if (!option?.content.trim()) throw new Error("请先填写有效脚本内容");
  if (props.state.goal === "storyboard") { props.state.storyboard = await createDocument(option.content, true); props.state.stage = "storyboardReview"; }
  else { props.state.story = await createDocument(option.content, false); props.state.stage = "storyReview"; changed(); await advanceDocument(); }
}); }
async function mountEditor() {
  const version = ++editorMountVersion;
  releaseEditor?.(); releaseEditor = undefined; editorReady.value = false;
  const node = reviewNode.value;
  await nextTick();
  const target = editorExpanded.value ? expandedEditorTarget.value : editorTarget.value;
  if (!node || !canvas || !target || props.disabled || disposed || version !== editorMountVersion) return;
  try {
    const release = await canvas.mount(props.directory, node, target);
    if (disposed || version !== editorMountVersion) { release(); return; }
    releaseEditor = release; editorReady.value = true;
  } catch (reason) { if (!disposed && version === editorMountVersion) error.value = reason instanceof Error ? reason.message : "节点预览打开失败"; }
}
async function generateStoryboard() {
  if (!props.state.storyboard) {
    const result = await textRequest(`${await context()}\n根据已应用的剧情或创作要求生成一份分镜脚本，输出 {"table":"Markdown表格"}，table 内容遵循：${scriptGenerationInstruction}`);
    const table = (result as { table?: unknown })?.table;
    if (typeof table !== "string" || !table.includes("|")) throw new Error("模型没有返回有效分镜表格");
    props.state.storyboard = await createDocument(table, true);
  }
  props.state.stage = "storyboardReview";
}
function confirmDocument() { return run(advanceDocument); }
async function advanceDocument() {
  const state = props.state;
  if (!canvas) throw new Error("画布尚未就绪");
  if (state.stage === "storyReview") {
    if (!state.story) throw new Error("请先应用剧情脚本");
    await generateStoryboard();
  } else {
    if (!state.storyboard) throw new Error("分镜脚本尚未就绪");
    const content = await canvas.read(props.directory, state.storyboard);
    if (!content.trim()) throw new Error("请先保存有效分镜内容");
    retainDocument("分镜脚本", content);
    state.stage = "referenceConsent";
    await nextTick();
    try { await canvas.focus(props.directory, state.storyboard); }
    catch (reason) { state.stage = "storyboardReview"; throw reason; }
  }
}
async function saveStoryboardPreview() {
  if (!canvas || !props.state.storyboard || props.state.stage === "storyboardReview") return;
  try {
    const content = await canvas.read(props.directory, props.state.storyboard);
    if (!disposed) retainDocument("分镜脚本", content);
  } catch (reason) { if (!disposed) error.value = reason instanceof Error ? reason.message : "分镜内容读取失败"; }
}
function makePrompts() { return run(async () => { props.state.prompts = await options("基于当前已修改的剧情和分镜生成几个角色／场景设计提示词，保持主体一致"); props.state.stage = "prompts"; }); }
function skipImages() { props.state.stage = props.state.goal === "video" ? "videoConsent" : "done"; changed(); }
async function media(kind: "image" | "video" | "audio", prompt: string, label = "") {
  if (!canvas) throw new Error("画布尚未就绪");
  const model = resolveBrowserModel(kind);
  const referenceResults = kind === "video" ? generationResults.value.filter(item => props.state.imageResultIds.includes(item.id) && item.directory === props.directory) : [];
  if (kind === "video" && props.state.imageResultIds.length !== referenceResults.length) throw new Error("参考图未能恢复，请保留当前内容并重新打开对话");
  const originalImages = props.attachments.filter(item => item.mimeType.startsWith("image/"));
  const files = referenceResults.length ? await Promise.all(referenceResults.map(browserResultFile)) : kind === "image" || kind === "video" ? await Promise.all(originalImages.map(async item => item.file ?? new File([await useWorkspaceFiles(props.directory).read(item.path)], item.name, { type: item.mimeType }))) : [];
  if (props.attachments.some(item => !item.mimeType.startsWith("image/") && !item.mimeType.startsWith("text/") && item.mimeType !== "application/json")) throw new Error("当前模型不支持本轮音频／视频或其他文件参考，请调整引用后继续");
  if (kind === "audio" && originalImages.length) throw new Error("音频模型只支持文字参考，图片不会被静默忽略");
  if (generationBusy.value) throw new Error("另一个模型请求仍在处理中，请稍后继续");
  controller?.signal.throwIfAborted();
  const previous = new Set(generationResults.value.map(item => item.id));
  let success: boolean;
  mediaWaiting = true;
  try { success = await generateInBrowser(prompt, files, props.directory, kind); }
  finally { mediaWaiting = false; }
  const results = generationResults.value.filter(item => !previous.has(item.id) && item.directory === props.directory);
  if (!results.length && !success) throw new Error(generationError.value);
  for (const result of results) {
    const draft = { resultId: result.id, kind, label: label || ({ image: "参考图", video: "视频", audio: "音频" })[kind], prompt, model: JSON.stringify([model.providerId, model.modelId]), node: undefined as BrowserWorkflowNode | undefined };
    (props.state.mediaDrafts ??= []).push(draft);
    props.state.resultIds.push(result.id);
    if (kind === "audio") draft.node = await canvas.apply(props.directory, result, sources(), draft.label, draft.model, draft.prompt);
  }
  emit("results", props.state.resultIds); changed();
  if (!success) { if (kind === "image") { props.state.selectedImages = [...selectedImages.value, ...results.map(item => item.id)]; props.state.stage = "imageReview"; } else if (kind === "video") { props.state.selectedVideos = results.map(item => item.id); props.state.stage = "videoReview"; } throw new Error(generationError.value); }
  return results.map(item => item.id);
}
function confirmMedia(kind: "image" | "video") { return run(async () => {
  if (!canvas) throw new Error("画布尚未就绪");
  const ids = kind === "image" ? selectedImages.value : selectedVideos.value;
  if (!ids.length) throw new Error("请先勾选要应用的素材");
  const adopted: BrowserWorkflowNode[] = [];
  for (const id of ids) {
    const result = generationResults.value.find(item => item.id === id && item.directory === props.directory && item.kind === kind);
    if (!result) throw new Error("素材未能恢复，请重新打开对话，已有节点保留");
    let draft = props.state.mediaDrafts?.find(item => item.resultId === id);
    if (!draft) {
      draft = { resultId: id, kind, label: kind === "image" ? "参考图" : "视频", model: "", prompt: props.state.prompt };
      (props.state.mediaDrafts ??= []).push(draft);
    }
    const node = await canvas.apply(props.directory, result, [...sources(), ...(kind === "video" ? props.state.images : [])], draft.label, draft.model, draft.prompt);
    draft.node = node; adopted.push(node); changed();
  }
  if (kind === "image") { props.state.images = adopted; props.state.imageResultIds = [...ids]; props.state.stage = props.state.goal === "video" ? "videoConsent" : "done"; }
  else props.state.stage = "done";
}); }
function makeImages() { return run(async () => {
  const prompts = props.state.prompts.filter(item => selectedPrompts.value.includes(item.id) && !props.state.generatedPromptIds?.includes(item.id));
  if (!prompts.length) { if (imageDraftIds.value.length) { props.state.stage = "imageReview"; return; } throw new Error("请先勾选设计提示词"); }
  for (const prompt of prompts) {
    const ids = await media("image", prompt.content, prompt.title);
    (props.state.generatedPromptIds ??= []).push(prompt.id);
    props.state.selectedImages = [...new Set([...selectedImages.value, ...ids])];
    props.state.stage = "imageReview"; changed();
  }
}); }
function makeVideo() { return run(async () => { const ids = await media("video", `${await context()}\n将已确认的剧情与分镜转为视频，参考所附图片保持角色和场景一致。`); props.state.selectedVideos = ids; props.state.stage = "videoReview"; }); }
watch([reviewNode, editorTarget, expandedEditorTarget, editorExpanded], () => { void mountEditor(); }, { flush: "post" });
watch(() => props.stopToken, stop);
watch(() => props.disabled, disabled => {
  if (disabled) return;
  void restoreDocumentHistory();
  if (props.state.stage === "analyze" && !busy.value) void analyze();
  else if (!editorReady.value) void mountEditor();
});
onMounted(() => { if (!props.disabled) void restoreDocumentHistory(); for (const question of props.state.questions) { question.options ??= ["由你推荐"]; question.selected ??= []; question.custom ??= question.answer; } if (props.state.stage === "analyze" && !props.disabled) void analyze(); else void mountEditor(); });
onBeforeUnmount(() => { disposed = true; editorMountVersion++; stop(); releaseEditor?.(); });
</script>

<style scoped lang="scss">
.professionalCreation {
  .optionTabs { display: flex; gap: 8px; overflow-x: auto; margin-bottom: 12px; button { flex: none; padding: 9px 18px; border: 1px solid var(--el-border-color); border-radius: 8px; color: var(--el-text-color-primary); background: var(--el-fill-color-light); cursor: pointer; &[aria-selected="true"] { color: var(--el-color-primary); border-color: var(--el-color-primary); background: var(--el-color-primary-light-9); } } }
  .creationHistory { article { margin: 12px 0; padding: 12px; border: 1px solid var(--el-border-color); border-radius: 10px; overflow-x: auto; h4 { margin: 0 0 10px; } } }
  .stageLabel { color: var(--el-color-primary); font-weight: 600; }
  .el-form { margin-top: 12px; }
  .el-checkbox-group, .el-radio-group { display: grid; gap: 10px; margin: 12px 0; .el-checkbox, .el-radio { align-items: flex-start; height: auto; margin: 0; padding: 12px; border: 1px solid var(--el-border-color); border-radius: 10px; :deep(.el-checkbox__label), :deep(.el-radio__label) { min-width: 0; white-space: normal; } p { white-space: pre-wrap; line-height: 1.7; margin: 6px 0 0; } } }
  .optionActions { display: flex; justify-content: flex-end; margin-top: 12px; }
  .storyboardHeader { display: flex; justify-content: space-between; align-items: center; }
  .expandedNodeEditor { height: calc(100dvh - 100px); overflow: auto; }
  .storyboardPreview { max-height: 55vh; overflow: auto; }
  .nodeEditor { max-height: 55vh; overflow: auto; border: 1px solid var(--el-border-color); border-radius: 10px; margin: 12px 0; }
  > .el-button { margin: 6px 6px 6px 0; }
}
</style>
