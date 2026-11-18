<template>
  <el-dialog v-model="visible" title="发布消息" width="min(680px, 94vw)" :closeOnClickModal="false" :beforeClose="closeDialog">
    <form v-if="draft" class="noticeComposer" @submit.prevent="publish">
      <el-form labelPosition="top" :disabled="busy">
        <el-form-item v-if="isPlatformAdmin" label="消息类型"><el-radio-group v-model="draft.kind"><el-radio value="platform">平台通知</el-radio><el-radio value="model">模型参数调整</el-radio></el-radio-group></el-form-item>
        <el-form-item label="标题" required><el-input v-model="draft.title" :maxlength="100" aria-label="消息标题" /></el-form-item>
        <el-form-item label="消息内容" required><el-input v-model="draft.content" type="textarea" :rows="3" :maxlength="4000" aria-label="消息内容" /></el-form-item>
        <template v-if="draft.kind === 'model'"><el-form-item label="受影响模型" required><el-select v-model="draft.modelId" aria-label="受影响模型"><el-option v-for="model in platformState.models" :key="model.id" :value="model.id" :label="model.name" /></el-select></el-form-item><el-form-item label="生效时间" required><el-date-picker v-model="draft.effectiveAt" type="datetime" valueFormat="YYYY-MM-DDTHH:mm:ss" aria-label="生效时间" /></el-form-item><el-form-item label="草稿影响与建议操作" required><el-input v-model="draft.impact" type="textarea" :rows="2" aria-label="草稿影响与建议操作" /></el-form-item></template>
        <el-form-item :label="isPlatformAdmin ? '接收客户' : '接收账号'" required><div class="recipientPicker"><div class="recipientTools"><el-input v-model="search" :placeholder="isPlatformAdmin ? '搜索客户' : '搜索账号或姓名'" aria-label="搜索接收对象" clearable /><el-button text @click="selected = recipients.map(item => item.id)">全选</el-button><el-button text @click="selected = []">取消全选</el-button></div><el-checkbox-group v-model="selected" class="recipientList"><el-checkbox v-for="item in filteredRecipients" :key="item.id" :value="item.id">{{ item.label }}</el-checkbox></el-checkbox-group><p>已选择 {{ selected.length }} / {{ recipients.length }} {{ isPlatformAdmin ? '个客户' : '个账号' }}</p><p v-if="!recipients.length">暂无有效接收对象</p></div></el-form-item>
        <section class="noticePreview"><h3>发布预览</h3><strong>{{ draft.title }}</strong><p>{{ draft.content }}</p><p v-if="draft.kind === 'model'">{{ draft.impact }}</p><small>{{ selectedLabels.join('、') }}</small></section>
      </el-form><p v-if="failure" class="failure" role="alert">{{ failure }}</p><div class="noticeActions"><el-button :disabled="busy" @click="visible = false">取消</el-button><el-button nativeType="submit" type="primary" :loading="busy" :disabled="!selected.length">确认发布</el-button></div>
    </form>
  </el-dialog>
</template>
<script setup lang="ts">
import { computed, ref } from "vue";
import { ElMessage } from "element-plus";
import { currentUser } from "@/stores/accounts";
import { isPlatformAdmin, isCustomerAdmin, platformState, savePlatform } from "@/stores/platform";
import type { PlatformNotice } from "@/ports/platform";
const visible = ref(false), busy = ref(false), search = ref(""), failure = ref("");
const draft = ref<PlatformNotice>(), selected = ref<string[]>([]);
const recipients = computed(() => isPlatformAdmin.value ? platformState.value.customers.filter(item => !item.deletedAt && item.enabled !== false).map(item => ({ id: item.id, label: item.name })) : (platformState.value.recipientAccounts ?? []).filter(item => item.customerId === currentUser.value?.customerId).map(item => ({ id: item.id, label: `${item.name}（${item.username}）` })));
const filteredRecipients = computed(() => recipients.value.filter(item => item.label.includes(search.value.trim())));
const selectedLabels = computed(() => recipients.value.filter(item => selected.value.includes(item.id)).map(item => item.label));
function open(modelId = "") {
  if (!isPlatformAdmin.value && !isCustomerAdmin.value) return;
  const now = new Date().toISOString();
  draft.value = { id: crypto.randomUUID(), kind: isPlatformAdmin.value ? modelId ? "model" : "platform" : "customer", title: "", content: "", modelId, effectiveAt: modelId ? "" : now, impact: "", customerIds: [], accountIds: [], createdAt: now, read: false };
  selected.value = recipients.value.map(item => item.id); search.value = ""; failure.value = ""; visible.value = true;
}
function closeDialog(done: () => void) { if (!busy.value) done(); }
async function publish() {
  if (!draft.value || busy.value) return;
  failure.value = "";
  if (!draft.value.title.trim() || !draft.value.content.trim()) { failure.value = "请填写标题和消息内容"; return; }
  if (!selected.value.length || selected.value.some(id => !recipients.value.some(item => item.id === id))) { failure.value = "请选择有效接收对象"; return; }
  if (draft.value.kind === "model" && (!draft.value.modelId || !draft.value.effectiveAt || !draft.value.impact.trim())) { failure.value = "请填写模型、生效时间和草稿影响"; return; }
  busy.value = true;
  try {
    const value: PlatformNotice = { ...draft.value, createdAt: new Date().toISOString(), ...(draft.value.kind !== "model" ? { effectiveAt: new Date().toISOString(), modelId: "", impact: "" } : {}), customerIds: isPlatformAdmin.value ? [...selected.value] : [currentUser.value!.customerId!], accountIds: isPlatformAdmin.value ? [] : [...selected.value] };
    await savePlatform({ type: "notice", value }); visible.value = false; ElMessage.success("消息已发布");
  } catch (cause) { failure.value = cause instanceof Error ? cause.message : "发布失败，请重试"; } finally { busy.value = false; }
}
defineExpose({ open });
</script>
<style scoped lang="scss">
.noticeComposer { max-height:72dvh; overflow-y:auto; .recipientPicker { width:100%; .recipientTools { display:flex; gap:8px; align-items:center; .el-input { flex:1; min-width:100px; } } .recipientList { display:flex; flex-direction:column; max-height:180px; overflow-y:auto; margin-top:8px; } p { color:var(--el-text-color-secondary); margin:8px 0 0; } } .noticePreview { padding:16px; border-top:1px solid var(--el-border-color); h3 { font-size:15px; margin-top:0; } p { white-space:pre-wrap; overflow-wrap:anywhere; } small { color:var(--el-text-color-secondary); overflow-wrap:anywhere; } } .noticeActions { display:flex; justify-content:flex-end; gap:12px; padding-top:20px; } .failure { color:var(--el-color-danger); } }
</style>
