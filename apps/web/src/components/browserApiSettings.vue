<template>
  <section class="browserApiSettings">
    <div class="settingsHeader"><p>按厂商配置 API Key 和模型。Key 仅保存在当前页面内存，刷新后清除。</p><el-switch v-model="browserConfig.enabled" activeText="启用已接入模型" aria-label="启用已接入模型" /></div>
    <div class="providerList">
      <el-card v-for="provider in providers" :key="provider.id" class="providerCard" shadow="never">
        <div class="providerHeader"><modelIcon :model="vendorFor(provider.vendorId).icon" :size="28" /><div><strong>{{ vendorFor(provider.vendorId).label }}</strong><p>{{ provider.endpoint }}</p></div><el-tag :type="provider.apiKey.trim() ? 'success' : 'info'">{{ provider.apiKey.trim() ? `${provider.models.length} 个模型` : '待填写 Key' }}</el-tag></div>
        <div class="modelTags"><el-tag v-for="model in provider.models" :key="model.id" effect="plain">{{ kindLabels[model.kind] }} · {{ model.label }}</el-tag></div>
        <div class="providerActions"><el-button text @click="openProvider(provider)">编辑供应商</el-button><el-button text type="danger" @click="removeProvider(provider)">删除供应商</el-button></div>
      </el-card>
    </div>
    <div class="settingsActions"><el-button type="primary" @click="openProvider()">添加供应商</el-button><el-button :disabled="!providers.length" @click="clearBrowserKeys">清除全部 Key 并停止等待</el-button></div>
    <el-dialog v-model="visible" :title="editing ? '编辑供应商' : '添加供应商'" width="min(900px, 94vw)" appendToBody destroyOnClose :closeOnClickModal="false" @closed="closeEditor">
      <div class="providerPicker">
        <aside class="providerSidebar" aria-label="选择厂商"><button v-for="vendor in vendors" :key="vendor.id" type="button" :aria-pressed="form.vendorId === vendor.id" :disabled="!!editing || fetching" @click="selectVendor(vendor.id)"><modelIcon :model="vendor.icon" :size="22" />{{ vendor.label }}</button></aside>
        <div class="providerDetails">
          <div class="vendorHeading"><h3>{{ activeVendor.label }}</h3><a v-if="activeVendor.docs" :href="activeVendor.docs" target="_blank" rel="noopener noreferrer">官方文档</a></div>
          <el-form labelPosition="top" autocomplete="off" :disabled="fetching">
            <el-form-item label="API Key"><el-input v-model="form.apiKey" type="password" showPassword autocomplete="off" aria-label="供应商 API Key" placeholder="输入 API Key，刷新后清除" /></el-form-item>
            <el-form-item label="API 基础地址（HTTPS）"><el-input v-model="form.endpoint" :disabled="form.vendorId === 'volcano'" aria-label="供应商 API 基础地址" /></el-form-item>
            <p>{{ activeVendor.description }}</p>
            <div class="modelHeader"><strong>模型列表</strong><el-button v-if="activeVendor.kinds.includes('text') && activeVendor.id !== 'zhipu'" text :loading="fetching" @click="fetchModels">获取模型列表</el-button><el-button text @click="addModel">添加模型</el-button></div>
            <div v-for="(model, index) in form.models" :key="model.id" class="modelRow">
              <el-select v-model="model.kind" aria-label="模型类型" @change="model.modelId = ''; model.label = ''"><el-option v-for="kind in activeVendor.kinds" :key="kind" :value="kind" :label="kindLabels[kind]" /></el-select>
              <el-select v-model="model.modelId" filterable allowCreate defaultFirstOption placeholder="选择或填写模型 ID" aria-label="模型 ID"><el-option v-for="item in modelOptions.filter(item => item.kind === model.kind)" :key="item.modelId" :value="item.modelId" :label="item.modelId" /></el-select>
              <el-input v-model="model.label" aria-label="模型显示名称" placeholder="显示名称（可选）" />
              <el-button text type="danger" :aria-label="`移除模型 ${index + 1}`" @click="form.models.splice(index, 1)">移除</el-button>
            </div>
          </el-form>
          <el-alert v-if="error" :title="error" type="error" :closable="false" />
          <p>填写配置不会发起生成。模型权限以厂商账号为准；未获取列表时可填写厂商提供的模型 ID。</p>
        </div>
      </div>
      <template #footer><el-button @click="visible = false">取消</el-button><el-button type="primary" :disabled="fetching" @click="saveProvider">保存供应商</el-button></template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from "vue";
import { ElMessageBox } from "element-plus";
import { modelIcon } from "@toonflow/model-icons";
import { languageProviders } from "@toonflow/providers";
import { browserConfig, browserModels, additionalBrowserModels, clearBrowserKeys, type ModelKind } from "@/stores/browserGeneration";
import { studioFetch } from "@/lib/studioFetch";

type Vendor = { id: string; label: string; icon: string; endpoint: string; hosts: string[]; kinds: ModelKind[]; docs: string; description: string };
const deepSeek = languageProviders.find(provider => provider.id === "deepSeek")!;
const vendors: Vendor[] = [
  { id: "aliyun", label: "阿里云百炼", icon: "qwen", endpoint: "https://dashscope.aliyuncs.com", hosts: [".aliyuncs.com"], kinds: ["text", "image", "video"], docs: "https://help.aliyun.com/zh/model-studio/", description: "文字使用 OpenAI 兼容接口；图片、视频沿用已接入的百炼协议。可使用对应地域或业务空间的基础地址。" },
  { id: "deepseek", label: deepSeek.label, icon: "deepseek", endpoint: deepSeek.apiUrl, hosts: ["api.deepseek.com"], kinds: ["text"], docs: "https://api-docs.deepseek.com/", description: "接入 DeepSeek 官方文字模型，按账号权限获取模型列表或填写实际模型 ID。" },
  { id: "siliconflow", label: "硅基流动", icon: "siliconcloud", endpoint: "https://api.siliconflow.cn/v1", hosts: ["api.siliconflow.cn"], kinds: ["text"], docs: "https://docs.siliconflow.cn/", description: "当前接入文字对话协议；图片、视频等其它协议不在本次接入范围。" },
  { id: "moonshot", label: "月之暗面 Kimi", icon: "moonshot", endpoint: "https://api.moonshot.cn/v1", hosts: ["api.moonshot.cn", "api.moonshot.ai"], kinds: ["text"], docs: "https://platform.moonshot.cn/docs", description: "使用 Kimi 的 OpenAI 兼容文字对话接口。" },
  { id: "zhipu", label: "智谱 GLM", icon: "zhipu", endpoint: "https://open.bigmodel.cn/api/paas/v4", hosts: ["open.bigmodel.cn"], kinds: ["text"], docs: "https://docs.bigmodel.cn/", description: "使用智谱开放平台的文字对话接口；模型 ID 以控制台可用模型为准。" },
  { id: "openai", label: "OpenAI", icon: "openai", endpoint: "https://api.openai.com/v1", hosts: ["api.openai.com"], kinds: ["text"], docs: "https://platform.openai.com/docs", description: "仅支持提供 Chat Completions 接口的文字模型；不支持仅提供 Responses 接口的模型。" },
  { id: "volcano", label: "火山引擎 Seed-Audio", icon: "doubao", endpoint: "https://openspeech.bytedance.com", hosts: ["openspeech.bytedance.com"], kinds: ["audio"], docs: "https://www.volcengine.com/docs/6561", description: "沿用已接入的 Seed-Audio 文字生成音频协议，不包含其它豆包模型协议。" },
];
const kindLabels: Record<ModelKind, string> = { text: "文字", image: "图片", video: "视频", audio: "音频" };
type ModelEntry = { id: string; kind: ModelKind; label: string; modelId: string };
type ProviderGroup = { id: string; vendorId: string; endpoint: string; apiKey: string; models: ModelEntry[]; builtinKinds: ModelKind[] };
const unknownVendor: Vendor = { id: "existing", label: "已有自定义供应商", icon: "openai", endpoint: "", hosts: [], kinds: ["text"], docs: "", description: "此地址不属于当前支持的厂商。请使用受支持的厂商地址重新配置。" };
const vendorFor = (id: string) => vendors.find(vendor => vendor.id === id) ?? unknownVendor;
function vendorForEndpoint(endpoint: string) {
  try { const host = new URL(endpoint).hostname; return vendors.find(vendor => vendor.hosts.some(item => item.startsWith(".") ? host.endsWith(item) : host === item))?.id ?? "existing"; }
  catch { return "existing"; }
}
const providers = computed(() => {
  const groups: ProviderGroup[] = [];
  const entries: (ModelEntry & { apiKey: string; endpoint: string; builtinKind?: ModelKind })[] = [...Object.entries(browserConfig.keys).flatMap(([kind, apiKey]) => apiKey ? browserModels[kind as ModelKind].models.map(model => ({ id: browserModels[kind as ModelKind].id, kind: kind as ModelKind, label: model.label, modelId: model.id, apiKey, endpoint: kind === "audio" ? vendors.find(vendor => vendor.id === "volcano")!.endpoint : browserConfig.endpoint, builtinKind: kind as ModelKind })) : []), ...additionalBrowserModels];
  for (const model of entries) {
    const vendorId = vendorForEndpoint(model.endpoint);
    let group = groups.find(item => item.vendorId === vendorId && item.endpoint === model.endpoint && item.apiKey === model.apiKey);
    if (!group) { group = { id: model.id, vendorId, endpoint: model.endpoint, apiKey: model.apiKey, models: [], builtinKinds: [] }; groups.push(group); }
    group.models.push({ id: model.id, kind: model.kind, label: model.label, modelId: model.modelId });
    if (model.builtinKind && !group.builtinKinds.includes(model.builtinKind)) group.builtinKinds.push(model.builtinKind);
  }
  return groups;
});
const visible = ref(false), fetching = ref(false), error = ref("");
const editing = ref<ProviderGroup>();
const form = ref({ vendorId: "aliyun", apiKey: "", endpoint: vendors[0]!.endpoint, models: [] as ModelEntry[] });
const activeVendor = computed(() => vendorFor(form.value.vendorId));
const modelOptions = ref<{ kind: ModelKind; modelId: string }[]>([]);
let controller: AbortController | undefined;
function presetModels(vendorId: string) {
  return (vendorId === "aliyun" ? ["text", "image", "video"] as const : vendorId === "volcano" ? ["audio"] as const : []).flatMap(kind => browserModels[kind].models.map(model => ({ kind, modelId: model.id === "wan3Video" ? "wan3.0-video" : model.id })));
}
function selectVendor(id: string) {
  controller?.abort(); error.value = "";
  form.value = { vendorId: id, apiKey: "", endpoint: vendorFor(id).endpoint, models: [] };
  modelOptions.value = presetModels(id);
  addModel();
}
function openProvider(provider?: ProviderGroup) {
  editing.value = provider;
  if (provider) {
    form.value = { vendorId: provider.vendorId, apiKey: provider.apiKey, endpoint: provider.endpoint, models: provider.models.map(model => ({ ...model })) };
    modelOptions.value = presetModels(provider.vendorId);
  } else selectVendor("aliyun");
  error.value = ""; visible.value = true;
}
function addModel() { form.value.models.push({ id: `browser:${crypto.randomUUID()}`, kind: activeVendor.value.kinds[0]!, modelId: "", label: "" }); }
function endpointValue() {
  const url = new URL(form.value.endpoint.trim());
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || (url.port && url.port !== "443") || vendorForEndpoint(url.href) !== form.value.vendorId || form.value.vendorId === "existing") throw new Error("请填写所选厂商不含账号、查询参数的 HTTPS 基础地址");
  url.pathname = url.pathname.replace(/\/+$/, "").replace(/\/chat\/completions$/, "");
  if (form.value.vendorId === "aliyun") url.pathname = url.pathname.replace(/\/(?:compatible-mode\/v1|api\/v1)$/, "");
  return url.href.replace(/\/+$/, "");
}
async function fetchModels() {
  const draft = form.value;
  error.value = "";
  try {
    const endpoint = endpointValue();
    const key = form.value.apiKey.trim();
    if (!key) throw new Error("请先填写 API Key");
    const url = new URL(endpoint);
    const base = url.pathname === "/" && form.value.vendorId === "aliyun" ? `${endpoint}/compatible-mode/v1` : endpoint;
    controller?.abort(); const request = new AbortController(); controller = request; fetching.value = true;
    try {
      const response = await studioFetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.any([request.signal, AbortSignal.timeout(30000)]) });
      const result = await response.json();
      if (!response.ok) throw new Error(`获取模型失败（HTTP ${response.status}）：${String(result.error?.message || result.message || "请检查 Key 和模型权限").replaceAll(key, "[Key]")}`);
      if (!Array.isArray(result.data) || result.data.length > 2000 || result.data.some((item: unknown) => !item || typeof item !== "object" || !("id" in item) || typeof item.id !== "string" || !item.id.trim() || item.id.length > 200)) throw new Error("厂商未返回有效模型列表，请手动填写模型 ID");
      if (!request.signal.aborted) { modelOptions.value = [...new Map([...presetModels(form.value.vendorId), ...result.data.map((item: { id: string }) => ({ kind: "text" as const, modelId: item.id }))].map(item => [`${item.kind}:${item.modelId}`, item])).values()]; }
    } finally { if (controller === request) fetching.value = false; }
  } catch (reason) {
    if (visible.value && form.value === draft && !(reason instanceof DOMException && reason.name === "AbortError")) {
      const message = reason instanceof Error ? reason.message : "获取模型失败";
      error.value = draft.apiKey.trim() ? message.replaceAll(draft.apiKey.trim(), "[Key]") : message;
    }
  }
}
function removeGroup(provider: ProviderGroup) {
  const ids = new Set(provider.models.map(model => model.id));
  for (let i = additionalBrowserModels.length - 1; i >= 0; i--) if (ids.has(additionalBrowserModels[i]!.id)) additionalBrowserModels.splice(i, 1);
  for (const kind of provider.builtinKinds) browserConfig.keys[kind] = "";
}
function saveProvider() {
  error.value = "";
  try {
    const endpoint = endpointValue();
    const apiKey = form.value.apiKey.trim();
    if (!apiKey || apiKey.length > 8192 || /[\r\n]/.test(apiKey)) throw new Error("请填写有效的 API Key");
    if (!form.value.models.length) throw new Error("请至少添加一个模型");
    const models = form.value.models.map(model => ({ ...model, modelId: model.modelId.trim(), label: model.label.trim() || model.modelId.trim(), endpoint, apiKey }));
    if (models.some(model => !model.modelId || model.modelId.length > 200 || !activeVendor.value.kinds.includes(model.kind))) throw new Error("请填写有效模型 ID 并选择厂商支持的模型类型");
    if (new Set(models.map(model => `${model.kind}:${model.modelId}`)).size !== models.length) throw new Error("同一类型的模型 ID 不能重复");
    const editingIds = new Set(editing.value?.models.map(model => model.id));
    if (additionalBrowserModels.some(existing => !editingIds.has(existing.id) && existing.endpoint === endpoint && existing.apiKey === apiKey && models.some(model => model.kind === existing.kind && model.modelId === existing.modelId))) throw new Error("该厂商配置中已存在相同模型");
    if (editing.value) removeGroup(editing.value);
    additionalBrowserModels.push(...models);
    visible.value = false;
  } catch (reason) { error.value = reason instanceof Error ? reason.message : "保存失败"; }
}
async function removeProvider(provider: ProviderGroup) {
  if (await ElMessageBox.confirm(`删除${vendorFor(provider.vendorId).label}及其 ${provider.models.length} 个模型？`, "删除供应商", { confirmButtonText: "删除", cancelButtonText: "取消", type: "warning" }).then(() => true, () => false)) removeGroup(provider);
}
function closeEditor() { controller?.abort(); fetching.value = false; editing.value = undefined; form.value.apiKey = ""; error.value = ""; }
watch(visible, value => { if (!value) controller?.abort(); });
onScopeDispose(() => controller?.abort());
</script>

<style scoped lang="scss">
.browserApiSettings {
  p { color: var(--el-text-color-secondary); font-size: 13px; line-height: 1.7; overflow-wrap: anywhere; }
  .settingsHeader { margin-bottom: 18px; }
  .providerList { display: grid; gap: 12px; .providerCard { .providerHeader { display: flex; align-items: center; gap: 12px; > div { flex: 1; min-width: 0; } p { margin: 4px 0; } } .modelTags { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; } .providerActions { display: flex; justify-content: flex-end; } } }
  .settingsActions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
}
.providerPicker {
  display: flex; gap: 24px;
  .providerSidebar { flex: 0 0 170px; display: flex; flex-direction: column; gap: 6px; button { display: flex; align-items: center; gap: 10px; padding: 12px; border: 0; border-radius: 8px; color: var(--el-text-color-primary); background: transparent; text-align: left; cursor: pointer; &[aria-pressed="true"] { color: var(--el-color-primary); background: var(--el-color-primary-light-9); } &:disabled { cursor: default; } } }
  .providerDetails { flex: 1; min-width: 0; max-height: 65vh; overflow-y: auto; .vendorHeading, .modelHeader { display: flex; align-items: center; gap: 12px; h3, strong { flex: 1; } } .modelRow { display: grid; grid-template-columns: 80px minmax(120px, 1fr) minmax(100px, 1fr) auto; gap: 8px; margin: 12px 0; .el-select { width: 100%; } } p { color: var(--el-text-color-secondary); font-size: 12px; line-height: 1.7; } }
  @media (max-width: 640px) { flex-direction: column; .providerSidebar { flex-basis: auto; flex-direction: row; flex-wrap: wrap; } .providerDetails .modelRow { grid-template-columns: 80px 1fr; } }
}
</style>
