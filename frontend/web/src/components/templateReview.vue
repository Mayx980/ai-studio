<template>
  <section class="templateReview">
    <h2>{{ sharedWorkspace ? '模板管理' : isAdmin ? '模板审核' : '我的模板提交' }}</h2>
    <p v-if="loading" role="status">正在读取模板…</p>
    <el-alert v-else-if="error" type="error" :title="error" :closable="false"><el-button text @click="load">重试</el-button></el-alert>
    <p v-else-if="!submittedTemplates.length" role="status">暂无模板提交</p>
    <el-card v-for="item in submittedTemplates" :key="item.id" class="reviewItem" shadow="never">
      <button class="reviewPreview" type="button" :aria-label="`查看提交 ${item.name}`" @click="preview = item"><templateMedia :media="item.media" /></button>
      <div class="reviewInfo"><h3>{{ item.name }}</h3><p>{{ item.category }}<template v-if="!sharedWorkspace"> · {{ item.review?.authorId === 'admin' ? '管理员' : '普通用户' }}</template></p><el-tag v-if="!sharedWorkspace" :type="item.review?.status === 'approved' ? 'success' : item.review?.status === 'rejected' ? 'danger' : 'warning'">{{ statusLabels[item.review?.status || 'pending'] }}</el-tag><p v-if="!sharedWorkspace && item.review?.reason">拒绝原因：{{ item.review.reason }}</p></div>
      <div v-if="!sharedWorkspace && isAdmin && item.review?.status === 'pending'" class="reviewActions"><el-button :disabled="!!reviewing" @click="preview = item">查看内容</el-button><el-button type="success" :disabled="!!reviewing" @click="review(item, 'approved')">通过</el-button><el-button type="danger" :disabled="!!reviewing" @click="review(item, 'rejected')">拒绝</el-button></div>
    </el-card>
    <el-dialog :modelValue="!!preview" :title="preview?.name" width="min(1100px, 96vw)" alignCenter appendToBody destroyOnClose @update:modelValue="preview = undefined">
      <template v-if="preview"><div class="reviewDetail"><div class="reviewVideo"><templateMedia :media="preview.media" controls /></div><p>{{ preview.prompt }}</p></div><templateProjectPreview v-if="preview.project" :template="preview" /></template>
    </el-dialog>
  </section>
</template>
<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { prototype } from "@/ports/prototype";
import { currentAccount } from "@/stores/prototypeAccount";
import { loadCreationTemplates, submittedTemplates, reviewCreationTemplate, type CreationTemplate } from "@/lib/creationTemplates";
import templateMedia from "@/components/templateMedia.vue";
import templateProjectPreview from "@/components/templateProjectPreview.vue";
const sharedWorkspace = !prototype.requiresAccount;
const isAdmin = computed(() => currentAccount.value?.role === "admin");
const loading = ref(false), error = ref(""), reviewing = ref(""), preview = ref<CreationTemplate>();
const statusLabels = { pending: "待审核", approved: "已通过", rejected: "已拒绝" };
async function load() {
  loading.value = true; error.value = "";
  try { await loadCreationTemplates(); }
  catch (failure) { error.value = failure instanceof Error ? failure.message : "模板读取失败"; }
  finally { loading.value = false; }
}
onMounted(load);
async function review(item: CreationTemplate, status: "approved" | "rejected") {
  if (reviewing.value || !isAdmin.value) return;
  reviewing.value = item.id;
  try {
    let reason = "";
    if (status === "rejected") {
      const result = await ElMessageBox.prompt("请输入拒绝原因", "拒绝模板", { confirmButtonText: "确认拒绝", cancelButtonText: "取消", inputValidator: value => !!value?.trim() && value.trim().length <= 300 || "请输入1–300个字符" }).catch(() => null);
      if (!result) return;
      reason = result.value;
    }
    await reviewCreationTemplate(item.id, status, reason);
    ElMessage.success(status === "approved" ? "审核通过，模板已公开展示" : "模板已拒绝");
  } catch (failure) { ElMessage.error(failure instanceof Error ? failure.message : "审核失败"); }
  finally { reviewing.value = ""; }
}
</script>
<style scoped lang="scss">
.templateReview { .reviewItem { margin: 12px 0; :deep(.el-card__body) { display: flex; align-items: center; gap: 20px; } .reviewPreview { flex: none; width: 100px; height: 130px; padding: 0; border: 0; border-radius: 10px; overflow: hidden; background: var(--el-fill-color-light); cursor: pointer; } .reviewInfo { flex: 1; min-width: 0; h3, p { overflow-wrap: anywhere; } h3 { margin: 0; } p { font-size: 13px; color: var(--el-text-color-secondary); } } .reviewActions { display: flex; flex-wrap: wrap; gap: 8px; .el-button { margin: 0; } } }
  @media(max-width:700px) { .reviewItem :deep(.el-card__body) { flex-wrap: wrap; } }
}
.reviewDetail { display: flex; gap: 20px; margin-bottom: 20px; .reviewVideo { flex: none; width: 180px; height: 260px; overflow: hidden; border-radius: 10px; } p { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 260px; overflow: auto; } @media(max-width:700px) { flex-direction: column; } }
</style>
