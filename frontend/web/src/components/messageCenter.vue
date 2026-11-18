<template>
  <section class="messageCenter">
    <header v-if="!management"><h1>消息中心</h1><el-radio-group v-model="filter" aria-label="消息筛选"><el-radio-button value="all">全部</el-radio-button><el-radio-button value="unread">未读 {{ unreadNotices }}</el-radio-button></el-radio-group></header>
    <div class="messageLayout"><div class="messageList"><button v-for="notice in notices" :key="notice.id" type="button" :aria-current="selected?.id === notice.id ? 'true' : undefined" @click="openNotice(notice)"><span v-if="!notice.read && !management" class="unreadDot" aria-label="未读" /><strong>{{ notice.title }}</strong><small>{{ new Date(notice.createdAt).toLocaleString() }}</small><span>{{ notice.content }}</span></button><p v-if="!notices.length">暂无{{ filter === 'unread' ? '未读' : '' }}消息</p></div><article v-if="selected" class="messageDetail"><h2>{{ selected.title }}</h2><dl><dt>受影响模型</dt><dd>{{ platformState.models.find(item => item.id === selected?.modelId)?.name || selected.modelId }}</dd><dt>生效时间</dt><dd>{{ new Date(selected.effectiveAt).toLocaleString() }}</dd></dl><h3>参数调整</h3><p>{{ selected.content }}</p><h3>草稿影响与建议操作</h3><p>{{ selected.impact }}</p><small>阅读通知不会修改当前草稿、历史参数或自动发起生成。</small><el-button v-if="!management" @click="router.push('/home')">返回创作</el-button></article></div>
    <p v-if="failure" class="failure" role="alert">{{ failure }}</p>
  </section>
</template>
<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { platformState, savePlatform, unreadNotices } from "@/stores/platform";
import type { PlatformNotice } from "@/ports/platform";
const props = defineProps<{ management?: boolean }>();
const router = useRouter(), filter = ref("all"), selected = ref<PlatformNotice>(), failure = ref("");
const notices = computed(() => platformState.value.notices.filter(item => filter.value !== "unread" || !item.read));
async function openNotice(notice: PlatformNotice) { selected.value = notice; failure.value = ""; if (!props.management && !notice.read) try { await savePlatform({ type: "readNotice", id: notice.id }); } catch (cause) { failure.value = cause instanceof Error ? cause.message : "已读状态保存失败"; } }
</script>
<style scoped lang="scss">
.messageCenter { header { display:flex; justify-content:space-between; gap:16px; align-items:center; } .messageLayout { display:grid; grid-template-columns:minmax(260px, .8fr) minmax(0,1.2fr); gap:24px; margin-top:24px; } .messageList { display:grid; gap:8px; align-content:start; button { position:relative; display:grid; gap:12px; border:1px solid var(--el-border-color); background:var(--el-bg-color); color:var(--el-text-color-primary); border-radius:12px; padding:20px; text-align:left; cursor:pointer; font:inherit; &[aria-current] { border-color:var(--el-color-primary); } &:focus-visible { outline:2px solid var(--el-color-primary); } strong { font-weight:500; } small,span { color:var(--el-text-color-secondary); line-height:1.6; } .unreadDot { width:6px; height:6px; border-radius:50%; background:var(--el-color-primary); position:absolute; top:12px; right:12px; } } } .messageDetail { padding:24px; background:var(--el-bg-color); border:1px solid var(--el-border-color); border-radius:12px; h2 { margin-top:0; font-size:22px; } h3 { font-size:16px; margin-top:28px; } p { white-space:pre-wrap; overflow-wrap:anywhere; line-height:1.8; } dl { display:grid; grid-template-columns:100px 1fr; gap:12px; dd { margin:0; } } small { display:block; color:var(--el-text-color-secondary); line-height:1.6; margin:24px 0; } } .failure { color:var(--el-color-danger); } @media(max-width:800px) { .messageLayout { grid-template-columns:1fr; } } }
</style>
