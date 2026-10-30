<template>
  <section class="creativeCases" :class="{ compact }">
    <div class="caseHeader"><h2>模板中心</h2><el-button text type="primary" @click="uploadOpen = true">上传模板</el-button></div>
    <div class="caseCategories"><button v-for="item in categories" :key="item" :aria-pressed="category === item" @click="category = item">{{ item }}</button></div>
    <div class="caseGrid"><article v-for="item in visibleCases" :key="item.id"><button class="casePreview" :aria-label="`预览${item.name}`" @pointerenter="playPreview" @pointerleave="pausePreview" @focus="playPreview" @blur="pausePreview" @click="preview = item"><templateMedia :ref="value => setCardMedia(item.id, value)" :media="item.media" /></button><h3>{{ item.name }}</h3><p class="cardPrompt">{{ item.prompt }}</p><p class="cardParameters">{{ item.modelId || '当前模型' }} ｜ {{ item.ratio || '当前比例' }} ｜ {{ item.resolution || '当前清晰度' }}<span v-if="item.duration"> ｜ {{ item.duration }}秒</span></p><el-button type="primary" text :loading="applying" @click="applyTemplate(item, cardMedia.get(item.id))"><icon-copy :size="15" />一键同款</el-button></article></div>
    <el-dialog :modelValue="!!preview" :title="preview?.name" class="templateDetail" width="min(1120px, 96vw)" alignCenter appendToBody destroyOnClose @update:modelValue="preview = undefined">
      <div v-if="preview" class="detailLayout"><div class="detailMedia"><templateMedia ref="previewMedia" :media="preview.media" controls /></div><div class="detailContent"><h3>创作详情</h3><p class="templatePrompt">{{ preview.prompt }}</p><p class="templateParameters">{{ preview.modelId || '当前模型' }} ｜ {{ preview.ratio || '当前比例' }} ｜ {{ preview.resolution || preview.imageSize || '当前清晰度' }}<span v-if="preview.duration"> ｜ {{ preview.duration }}秒</span></p><el-button type="primary" :loading="applying" @click="applyPreview">一键同款</el-button></div></div>
    </el-dialog>
    <el-dialog v-model="uploadOpen" title="上传个人模板" width="min(640px, 94vw)" alignCenter appendToBody class="templateUpload">
      <el-form labelPosition="top"><el-form-item label="模板名称"><el-input v-model="draft.name" maxlength="60" /></el-form-item><el-form-item label="分类"><el-input v-model="draft.category" maxlength="30" /></el-form-item><el-form-item label="模板视频"><input type="file" accept="video/mp4" @change="selectPreview" /></el-form-item><el-form-item label="创作提示词"><el-input v-model="draft.prompt" type="textarea" :rows="5" /></el-form-item><el-form-item label="生成模型（可选）"><el-select v-model="draft.modelId" clearable><el-option v-for="model in models" :key="model.id" :label="model.label" :value="model.modelId" /></el-select></el-form-item><el-form-item label="比例（可选）"><el-select v-model="draft.ratio" clearable><el-option v-for="ratio in Object.keys(imageDimensions)" :key="ratio" :value="ratio" /></el-select></el-form-item><el-form-item label="视频清晰度（可选）"><el-select v-model="draft.resolution" clearable><el-option v-for="value in ['480P','720P','1080P']" :key="value" :value="value" /></el-select></el-form-item></el-form>
      <template #footer><el-button type="primary" :loading="saving" @click="saveTemplate">保存到个人模板中心</el-button></template>
    </el-dialog>
  </section>
</template>
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import templateMedia from "@/components/templateMedia.vue";
import { creationTemplates, loadCreationTemplates, readTemplateFile, saveCreationTemplate, type CreationTemplate, type TemplateApplication } from "@/lib/creationTemplates";
import { configuredBrowserModels } from "@/stores/browserGeneration";
import { imageDimensions } from "@toonflow/node-shared/generationDefaults";
defineProps<{ compact?: boolean }>();
const emit = defineEmits<{ apply: [value: TemplateApplication] }>();
const category = ref("全部"), preview = ref<CreationTemplate>(), previewMedia = ref<InstanceType<typeof templateMedia>>();
const applying = ref(false), uploadOpen = ref(false), saving = ref(false), uploadFile = ref<File>();
const draft = reactive({ name: "", category: "", prompt: "", modelId: "", ratio: "", resolution: "" });
const categories = computed(() => ["全部", ...new Set(creationTemplates.value.map(item => item.category))]);
const visibleCases = computed(() => creationTemplates.value.filter(item => category.value === "全部" || item.category === category.value));
const uploadVideo = computed(() => uploadFile.value?.type === "video/mp4" || uploadFile.value?.name.toLowerCase().endsWith(".mp4"));
const models = computed(() => configuredBrowserModels("video"));
onMounted(() => { void loadCreationTemplates().catch(error => ElMessage.error(error.message)); });
function selectPreview(event: Event) { uploadFile.value = (event.target as HTMLInputElement).files?.[0]; }
const cardMedia = new Map<string, InstanceType<typeof templateMedia>>();
function setCardMedia(id: string, value: unknown) { if (value) cardMedia.set(id, value as InstanceType<typeof templateMedia>); else cardMedia.delete(id); }
function playPreview(event: Event) { if (!matchMedia("(prefers-reduced-motion: reduce)").matches) void (event.currentTarget as HTMLElement).querySelector("video")?.play().catch(() => {}); }
function pausePreview(event: Event) { (event.currentTarget as HTMLElement).querySelector("video")?.pause(); }
function applyPreview() { if (preview.value) void applyTemplate(preview.value, previewMedia.value); }
async function applyTemplate(item: CreationTemplate, source?: InstanceType<typeof templateMedia>) {
  if (applying.value) return;
  applying.value = true;
  try {
    const references = await Promise.all(item.references.map(readTemplateFile));
    if (!references.length) references.push(item.kind === "image" ? await readTemplateFile(item.media) : await source!.referenceFrame());
    emit("apply", { prompt: item.prompt, references, template: item }); preview.value = undefined;
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : "模板素材读取失败"); }
  finally { applying.value = false; }
}
async function saveTemplate() {
  if (!uploadFile.value || saving.value) { if (!uploadFile.value) ElMessage.warning("请选择模板视频"); return; }
  if (!uploadVideo.value) { ElMessage.warning("模板中心仅支持视频模板"); return; }
  saving.value = true;
  try {
    await saveCreationTemplate({ ...draft, category: draft.category.trim() || "个人模板", kind: "video", resolution: draft.resolution }, uploadFile.value, []);
    uploadOpen.value = false; ElMessage.success("模板已保存在当前浏览器，跨项目可用");
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : "模板保存失败"); }
  finally { saving.value = false; }
}
</script>
<style scoped lang="scss">
.creativeCases { margin: 32px 0; .caseHeader { display: flex; justify-content: space-between; align-items: center; h2 { font-size: 19px; } } .caseCategories { display: flex; gap: 20px; overflow: auto; margin-bottom: 18px; button { flex: none; border: 0; background: none; padding: 8px 0; color: var(--el-text-color-secondary); cursor: pointer; &[aria-pressed="true"] { color: var(--el-color-primary); border-bottom: 2px solid; } } } .cardPrompt { font-size: 12px; line-height: 1.6; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; white-space: pre-line; color: var(--el-text-color-secondary); } .cardParameters { font-size: 12px; color: var(--el-text-color-secondary); } .caseGrid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 22px; article { min-width: 0; h3 { font-size: 14px; } .casePreview { width: 100%; height: 220px; border: 0; border-radius: 16px; overflow: hidden; background: var(--el-fill-color-light); cursor: pointer; } } } &.compact { margin: 8px 14px; max-height: 140px; overflow: auto; .caseHeader h2 { font-size: 13px; margin: 0; } .caseCategories { margin: 0; } .caseGrid { display: flex; article { flex: 0 0 160px; .casePreview { height: 64px; } h3 { margin: 4px 0; font-size: 12px; } } } } @media(max-width:700px) { .caseGrid { grid-template-columns: repeat(2,minmax(0,1fr)); } } }
.detailLayout { display: grid; grid-template-columns: minmax(0,1.4fr) minmax(260px,1fr); gap: 28px; height: min(680px,76dvh); .detailMedia { min-height: 0; background: #161616; border-radius: 12px; overflow: hidden; } .detailContent { min-height: 0; overflow: auto; display: flex; flex-direction: column; align-items: stretch; h3 { margin-top: 0; } .templatePrompt { white-space: pre-wrap; line-height: 1.8; margin: 0; overflow: auto; } .templateParameters { color: var(--el-text-color-secondary); font-size: 12px; margin-top: auto; padding-top: 20px; } .el-button { flex-shrink: 0; margin-top: 10px; } } @media(max-width:700px) { grid-template-columns: 1fr; grid-template-rows: minmax(180px,1fr) minmax(180px,1fr); height: 76dvh; gap: 16px; } }
</style>
<style lang="scss">
.templateDetail.el-dialog, .templateUpload.el-dialog { max-height: 94dvh; margin: auto; display: flex; flex-direction: column; .el-dialog__body { min-height: 0; overflow: auto; } }
</style>
