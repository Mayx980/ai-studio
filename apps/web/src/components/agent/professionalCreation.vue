<template>
  <section class="professionalCreation" aria-label="专业创作流程">
    <p class="stageLabel">专业创作 · {{ stageLabels[state.stage] }}</p>
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <p v-if="busy" role="status">正在处理，请稍候…</p>
    <el-button v-if="busy" text @click="stop">停止等待</el-button>
    <el-button v-if="state.stage === 'analyze' && !busy" @click="analyze">分析创作要求</el-button>
    <el-form v-if="state.stage === 'brief'" labelPosition="top" :disabled="busy || disabled">
      <el-form-item label="本次创作目标"><el-radio-group v-model="state.goal" @change="changed"><el-radio v-for="item in goals" :key="item.value" :value="item.value">{{ item.label }}</el-radio></el-radio-group></el-form-item>
      <el-form-item label="从哪一步开始"><el-radio-group v-model="state.start" @change="changed"><el-radio value="idea">从想法开始</el-radio><el-radio value="story">已有剧情</el-radio><el-radio value="storyboard">已有分镜</el-radio></el-radio-group></el-form-item>
      <el-form-item v-for="(question, index) in state.questions.slice(0, 5)" :key="index" :label="question.label"><el-checkbox-group v-model="question.selected" @change="answerQuestion(index)"><el-checkbox v-for="option in (question.options || []).slice(0, 5)" :key="option" :value="option">{{ option }}</el-checkbox></el-checkbox-group><el-input v-model="question.custom" placeholder="其他想法（选填）" @input="answerQuestion(index)" /></el-form-item>
      <el-form-item v-if="state.start !== 'idea'" label="已有剧情／分镜正文"><el-input v-model="sourceText" type="textarea" :rows="6" placeholder="粘贴正文，或使用本轮已引用的文本内容" /></el-form-item>
      <el-button type="primary" :disabled="!state.questions.slice(0, 5).every(question => question.answer.trim()) || (state.start !== 'idea' && !sourceText.trim())" @click="makePlans">确认要求，生成方案</el-button>
    </el-form>
    <template v-if="state.stage === 'plans'">
      <p>勾选希望继续发展的方案，可多选。</p>
      <el-checkbox-group v-model="state.selectedPlans" :disabled="busy || disabled" @change="changed"><el-checkbox v-for="option in state.plans" :key="option.id" :value="option.id"><strong>{{ option.title }}</strong><p>{{ option.content }}</p></el-checkbox></el-checkbox-group>
      <el-button type="primary" :disabled="busy || disabled || !state.selectedPlans.length" @click="confirmPlans">采用方案，继续</el-button>
    </template>
    <template v-if="state.stage === 'scripts'">
      <p>选择一个{{ state.goal === 'storyboard' ? '分镜' : '剧情' }}脚本，加入画布后可以继续修改。</p>
      <el-radio-group v-model="state.selectedScript" :disabled="busy || disabled" @change="changed"><el-radio v-for="option in state.scripts" :key="option.id" :value="option.id"><strong>{{ option.title }}</strong><p>{{ option.content }}</p></el-radio></el-radio-group>
      <el-button type="primary" :disabled="busy || disabled || !state.selectedScript" @click="adoptScript">采用脚本，加入画布</el-button>
    </template>
    <template v-if="state.stage === 'storyReview' || state.stage === 'storyboardReview'">
      <p>下方与画布使用同一个节点编辑器，修改会即时同步保存。确认后再继续。</p>
      <div ref="editorTarget" class="nodeEditor" />
      <el-button :disabled="busy || disabled" @click="mountEditor">重新打开节点预览</el-button>
      <el-button type="primary" :disabled="busy || disabled || !editorReady" @click="confirmDocument">确认修改，下一步</el-button>
    </template>
    <template v-if="state.stage === 'referenceConsent'">
      <p>是否根据已确认的剧情和分镜生成角色／场景参考图？</p>
      <el-button type="primary" :disabled="busy || disabled" @click="makePrompts">生成设计提示词供我选择</el-button><el-button :disabled="busy || disabled" @click="skipImages">暂不生成参考图</el-button>
    </template>
    <template v-if="state.stage === 'prompts'">
      <p>勾选角色／场景设计提示词，可多选，分别生成参考图。</p>
      <el-checkbox-group v-model="selectedPrompts" :disabled="busy || disabled" @change="changed"><el-checkbox v-for="option in state.prompts" :key="option.id" :value="option.id"><strong>{{ option.title }}</strong><p>{{ option.content }}</p></el-checkbox></el-checkbox-group>
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
    <template v-if="state.stage === 'done'"><p>所选内容已加入画布，可继续编辑。</p><browserModelResults v-if="appliedResultIds.length" :directory="directory" :resultIds="appliedResultIds" :showStatus="false" :showCanvas="false" :showReference="false" /></template>
  </section>
</template>

<script setup lang="ts">
import { scriptGenerationInstruction } from "@toonflow/node-text/scriptColumns";
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { generateBrowserText } from "@/lib/browserNodeAi";
import { browserResultFile, generateInBrowser, generationBusy, generationError, generationResults, resolveBrowserModel, stopBrowserGeneration, type BeginBrowserWorkflow, type BrowserWorkflowNode, type ProfessionalCanvas } from "@/stores/browserGeneration";
import { readTextAttachment } from "./textAttachments";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import type { AgentAttachment } from "./types";
import type { ProfessionalCreation, ProfessionalOption } from "./professionalCreation";
import browserModelResults from "@/components/browserModelResults.vue";
const props = defineProps<{ state: ProfessionalCreation; directory: string; attachments: AgentAttachment[]; disabled?: boolean; stopToken?: number }>();
const emit = defineEmits<{ change: []; busy: [value: boolean]; results: [ids: string[]] }>();
const begin = inject<BeginBrowserWorkflow>("beginBrowserWorkflow");
const canvas = inject<ProfessionalCanvas>("professionalCanvas");
const busy = ref(false), error = ref(""), editorReady = ref(false);
const sourceText = computed({ get: () => props.state.sourceText || "", set: value => { props.state.sourceText = value; changed(); } });
const editorTarget = ref<HTMLElement>();
let controller: AbortController | undefined;
let mediaWaiting = false;
let releaseEditor: (() => void) | undefined;
const goals = [{ label: "剧情", value: "story" }, { label: "分镜设计", value: "storyboard" }, { label: "图片", value: "image" }, { label: "视频", value: "video" }, { label: "音频", value: "audio" }];
const stageLabels = { analyze: "分析要求", brief: "勾选创作细节", plans: "选择方案", scripts: "选择脚本", storyReview: "预览修改剧情", storyboardReview: "预览修改分镜", referenceConsent: "确认参考图", prompts: "选择设计提示词", imageReview: "预览参考图", videoConsent: "确认视频生成", videoReview: "预览并应用视频", done: "已加入画布" };
const selectedPrompts = computed({ get: () => props.state.selectedPrompts ?? (props.state.selectedPrompt ? [props.state.selectedPrompt] : []), set: value => { props.state.selectedPrompts = value; } });
const selectedImages = computed({ get: () => props.state.selectedImages ?? props.state.imageResultIds, set: value => { props.state.selectedImages = value; } });
const selectedVideos = computed({ get: () => props.state.selectedVideos ?? videoDraftIds.value, set: value => { props.state.selectedVideos = value; } });
const imageDraftIds = computed(() => [...new Set([...(props.state.mediaDrafts ?? []).filter(item => item.kind === "image").map(item => item.resultId), ...props.state.imageResultIds])]);
const videoDraftIds = computed(() => (props.state.mediaDrafts ?? []).filter(item => item.kind === "video").map(item => item.resultId));
const appliedResultIds = computed(() => props.state.mediaDrafts ? props.state.mediaDrafts.filter(item => item.node).map(item => item.resultId) : props.state.resultIds);
function draftLabel(id: string) { return props.state.mediaDrafts?.find(item => item.resultId === id)?.label; }
function answerQuestion(index: number) { const question = props.state.questions[index]!; question.answer = [...question.selected ?? [], question.custom || ""].filter(Boolean).join("、"); changed(); }
const reviewNode = computed(() => props.state.stage === "storyReview" ? props.state.story : props.state.stage === "storyboardReview" ? props.state.storyboard : undefined);
function changed() { emit("change"); }
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
  const result = await generateBrowserText({ providerId: model.id, modelId: model.modelId, prompt: instruction, signal: controller?.signal, systemPrompt: "你是专业创作助手。遵守用户指定的创作目标和约束，先收集细节，再提供多个可选方案。只输出请求的 JSON，不输出 Markdown 围栏。不臆造用户已经确认的内容。" });
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
  sourceText.value = await initialReferences();
  const result = await textRequest(`用户要求：${props.state.prompt}\n已有文字参考：${sourceText.value}\n请分析当前创作情景，按当前语境和重要性排序，优先呈现最关键且必须由用户确定的问题，最多提问 5 个尚未明确且影响结果的问题，例如制作目的、时长、受众、主体、风格、比例。每题提供 2～4 个适合当前情景的简短选项（加上“由你推荐”总共不超过 5 个），允许多选。已经明确的细节不要重复问，全部明确时 questions 可为空。输出 {"questions":[{"label":"具体问题","options":["选项1","选项2","选项3"]}]}。`);
  const questions = (result as { questions?: unknown })?.questions;
  if (!Array.isArray(questions) || questions.some(item => !item || typeof item.label !== "string" || !item.label.trim() || !Array.isArray(item.options) || item.options.length < 2 || item.options.some((option: unknown) => typeof option !== "string" || !option.trim()))) throw new Error("模型未返回有效的提问选项，请重新分析");
  props.state.questions = questions.slice(0, 5).map(item => ({ label: item.label, options: [...new Set<string>([...item.options.filter((option: string) => option !== "由你推荐").slice(0, 4), "由你推荐"])], selected: [], custom: "", answer: "" })); props.state.stage = "brief";
}); }
function makePlans() { return run(async () => { props.state.plans = await options("根据已补充的细节生成不同创作方案供勾选"); props.state.stage = "plans"; }); }
async function createDocument(text: string, script: boolean) {
  controller?.signal.throwIfAborted();
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
    if (props.state.start === "story") { props.state.story = await createDocument(text, false); props.state.stage = "storyReview"; }
    else { props.state.storyboard = await createDocument(text, true); props.state.stage = "storyboardReview"; }
  } else if (props.state.goal === "image") { props.state.prompts = await options("生成不同角色或场景的图像设计提示词"); props.state.stage = "prompts"; }
  else if (props.state.goal === "audio") { await media("audio", await context()); props.state.stage = "done"; }
  else {
    props.state.scripts = await options(props.state.goal === "storyboard" ? `生成完整分镜脚本，每项 content 按以下规则填写：${scriptGenerationInstruction}` : "依据勾选的方案生成几个不同的完整剧情脚本");
    props.state.stage = "scripts";
  }
}); }

function adoptScript() { return run(async () => {
  const option = props.state.scripts.find(item => item.id === props.state.selectedScript);
  if (!option) throw new Error("请选择脚本");
  if (props.state.goal === "storyboard") { props.state.storyboard = await createDocument(option.content, true); props.state.stage = "storyboardReview"; }
  else { props.state.story = await createDocument(option.content, false); props.state.stage = "storyReview"; }
}); }
async function mountEditor() {
  releaseEditor?.(); releaseEditor = undefined; editorReady.value = false;
  const node = reviewNode.value;
  await nextTick();
  if (!node || !canvas || !editorTarget.value) return;
  try { releaseEditor = await canvas.mount(props.directory, node, editorTarget.value); editorReady.value = true; }
  catch (reason) { error.value = reason instanceof Error ? reason.message : "节点预览打开失败"; }
}
function confirmDocument() { return run(async () => {
  const node = reviewNode.value;
  if (!node || !canvas || !(await canvas.read(props.directory, node)).trim()) throw new Error("请先保存有效节点内容");
  const state = props.state;
  if (state.stage === "storyReview" && state.goal !== "story" && state.goal !== "text") {
    if (state.goal === "image") { state.prompts = await options("基于当前已修改的剧情，生成角色／场景设计提示词"); state.stage = "prompts"; }
    else if (state.goal === "audio") { await media("audio", await context()); state.stage = "done"; }
    else {
      const result = await textRequest(`${await context()}\n根据当前剧情生成分镜脚本，输出 {"table":"Markdown表格"}，table 内容遵循：${scriptGenerationInstruction}`);
      const table = (result as { table?: unknown })?.table;
      if (typeof table !== "string" || !table.includes("|")) throw new Error("模型没有返回有效分镜表格");
      state.storyboard = await createDocument(table, true); state.stage = "storyboardReview";
    }
  } else if (state.goal === "audio") { await media("audio", await context()); state.stage = "done"; }
  else state.stage = state.goal === "video" || state.goal === "image" ? "referenceConsent" : "done";
}); }
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
    const draft = { resultId: result.id, kind, label: label || ({ image: "参考图", video: "视频", audio: "音频" })[kind], prompt, model: JSON.stringify([model.id, model.modelId]), node: undefined as BrowserWorkflowNode | undefined };
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
watch(reviewNode, () => { void mountEditor(); }, { flush: "post" });
watch(() => props.stopToken, stop);
watch(() => props.disabled, disabled => { if (!disabled && props.state.stage === "analyze" && !busy.value) void analyze(); });
onMounted(() => { for (const question of props.state.questions) { question.options ??= ["由你推荐"]; question.selected ??= []; question.custom ??= question.answer; } if (props.state.stage === "analyze" && !props.disabled) void analyze(); else void mountEditor(); });
onBeforeUnmount(() => { stop(); releaseEditor?.(); });
</script>

<style scoped lang="scss">
.professionalCreation {
  .stageLabel { color: var(--el-color-primary); font-weight: 600; }
  .el-form { margin-top: 12px; }
  .el-checkbox-group, .el-radio-group { display: grid; gap: 10px; margin: 12px 0; .el-checkbox, .el-radio { align-items: flex-start; height: auto; margin: 0; padding: 12px; border: 1px solid var(--el-border-color); border-radius: 10px; :deep(.el-checkbox__label), :deep(.el-radio__label) { min-width: 0; white-space: normal; } p { white-space: pre-wrap; line-height: 1.7; margin: 6px 0 0; } } }
  .nodeEditor { max-height: 55vh; overflow: auto; border: 1px solid var(--el-border-color); border-radius: 10px; margin: 12px 0; }
  > .el-button { margin: 6px 6px 6px 0; }
}
</style>
