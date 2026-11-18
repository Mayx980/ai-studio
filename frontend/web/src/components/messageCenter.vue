<template>
  <section class="messageCenter">
    <header v-if="!management"><h1>消息中心</h1><div class="messageTools"><el-button v-if="isPlatformAdmin || isCustomerAdmin" type="primary" :disabled="platformLoading" @click="composer?.open()">发布消息</el-button><el-radio-group v-model="filter" aria-label="消息筛选"><el-radio-button value="all">全部</el-radio-button><el-radio-button value="unread">未读</el-radio-button></el-radio-group></div></header>
    <div class="messageList" role="list" aria-label="通知列表">
      <div v-for="notice in notices" :key="notice.id" role="listitem"><button type="button" :class="{ unread: !notice.read && !management }" :aria-current="selected?.id === notice.id ? 'true' : undefined" :aria-label="`${!notice.read && !management ? '未读，' : ''}${notice.title}`" @click="openNotice(notice)"><i v-if="!notice.read && !management" class="unreadDot" aria-label="未读" /><div class="messageText"><div class="messageMeta"><span>{{ notice.kind === 'customer' ? '客户通知' : notice.kind === 'platform' ? '平台通知' : modelName(notice.modelId) }}</span><time :datetime="notice.createdAt" :title="new Date(notice.createdAt).toLocaleString()">{{ formatTime(notice.createdAt) }}</time></div><strong>{{ notice.title }}</strong><p>{{ notice.content }}</p></div></button></div>
      <p v-if="!notices.length && !platformLoading" class="emptyMessages">暂无{{ filter === 'unread' ? '未读' : '' }}消息</p>
    </div>
    <noticeComposer ref="composer" />
    <p v-if="failure" class="failure" role="alert">{{ failure }}</p>
    <el-drawer :modelValue="!!selected" title="通知详情" size="min(560px, 100vw)" @update:modelValue="selected = undefined">
      <article v-if="selected" class="messageDetail"><h2>{{ selected.title }}</h2><dl><template v-if="selected.modelId"><dt>受影响模型</dt><dd>{{ modelName(selected.modelId) }}</dd></template><dt>{{ selected.kind === 'platform' || selected.kind === 'customer' ? '发布时间' : '生效时间' }}</dt><dd>{{ new Date(selected.effectiveAt).toLocaleString() }}</dd></dl><h3>{{ selected.kind === 'customer' || selected.kind === 'platform' ? '消息内容' : '参数调整' }}</h3><p>{{ selected.content }}</p><template v-if="selected.impact"><h3>草稿影响与建议操作</h3><p>{{ selected.impact }}</p></template><small>阅读通知不会修改当前草稿、历史参数或自动发起生成。</small><el-button v-if="!management" @click="router.push('/home')">返回创作</el-button></article>
    </el-drawer>
  </section>
</template>
<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import noticeComposer from "@/components/noticeComposer.vue";
import { isPlatformAdmin, isCustomerAdmin, platformState, platformLoading, savePlatform } from "@/stores/platform";
import type { PlatformNotice } from "@/ports/platform";
const composer = ref<InstanceType<typeof noticeComposer>>();
const props = defineProps<{ management?: boolean }>();
const router = useRouter(), filter = ref("all"), selected = ref<PlatformNotice>(), failure = ref("");
const notices = computed(() => (props.management ? platformState.value.sentNotices ?? platformState.value.notices : platformState.value.notices).filter(item => filter.value !== "unread" || !item.read));
function modelName(id: string) { return platformState.value.models.find(item => item.id === id)?.name || id; }
function formatTime(value: string) {
  const date = new Date(value), today = new Date();
  if (date.toDateString() === today.toDateString()) return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  today.setDate(today.getDate() - 1);
  return date.toDateString() === today.toDateString() ? "昨天" : date.toLocaleDateString([], { month: "numeric", day: "numeric" });
}
async function openNotice(notice: PlatformNotice) { selected.value = notice; failure.value = ""; if (!props.management && !notice.read) try { await savePlatform({ type: "readNotice", id: notice.id }); } catch (cause) { failure.value = cause instanceof Error ? cause.message : "已读状态保存失败"; } }
</script>
<style scoped lang="scss">
.messageCenter {
  .messageTools { display:flex; align-items:center; gap:12px; }
  header { display:flex; justify-content:space-between; gap:16px; align-items:center; margin-bottom:24px; }
  .messageList { border-top:1px solid var(--el-border-color); > div { border-bottom:1px solid var(--el-border-color); } button { position:relative; width:100%; display:flex; padding:10px 20px 10px 32px; border:0; border-radius:0; background:transparent; color:var(--el-text-color-primary); text-align:left; font:inherit; cursor:pointer; &:hover { background:var(--el-fill-color-light); } &[aria-current] { background:var(--el-color-primary-light-9); } &:focus-visible { outline:2px solid var(--el-color-primary); outline-offset:-2px; } .unreadDot { position:absolute; top:16px; left:12px; width:7px; height:7px; border-radius:50%; background:#f04452; } .messageText { min-width:0; width:100%; } .messageMeta { display:flex; gap:16px; justify-content:space-between; align-items:baseline; margin-bottom:3px; span { font-size:13px; font-weight:500; } time { color:var(--el-text-color-secondary); font-size:13px; white-space:nowrap; } } strong { display:block; font-size:15px; font-weight:400; line-height:1.4; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; } p { margin:3px 0 0; color:var(--el-text-color-secondary); overflow:hidden; white-space:nowrap; text-overflow:ellipsis; line-height:1.4; font-size:13px; } &.unread strong { font-weight:600; } } .emptyMessages { padding:24px; color:var(--el-text-color-secondary); } }
  .messageDetail { h2 { margin-top:0; font-size:22px; line-height:1.5; overflow-wrap:anywhere; } h3 { font-size:16px; margin-top:28px; } p { white-space:pre-wrap; overflow-wrap:anywhere; line-height:1.8; } dl { display:grid; grid-template-columns:100px minmax(0,1fr); gap:12px; dd { margin:0; overflow-wrap:anywhere; } } small { display:block; color:var(--el-text-color-secondary); line-height:1.6; margin:24px 0; } }
  .failure { color:var(--el-color-danger); }
}
</style>
