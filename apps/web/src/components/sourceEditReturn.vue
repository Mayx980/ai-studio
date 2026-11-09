<template>
  <teleport to="body">
    <el-alert v-if="sourceEditError && !sourceEdit" class="sourceEditRecoveryError" :title="sourceEditError" type="error" :closable="false" />
    <template v-for="url in sourceWindows" :key="url">
      <transition name="sourceDrawer" appear>
        <section v-show="sourceEdit && sourceUrl === url" class="sourceEditorWindow" :class="{ canvasSource: url.includes('sourceType=canvas') }" role="dialog" aria-label="编辑素材来源">
          <header class="sourceEditorHeader">
            <div><strong :title="sourceEdit?.name">{{ sourceEdit?.name }}</strong><small>{{ sourceEdit?.origin.type === 'canvas' ? '编辑来源画布' : '编辑来源对话' }}</small></div>
            <div class="sourceEditorActions">
              <el-tooltip v-if="sourceEdit?.result" content="应用最新生成结果并替换原素材" :showArrow="false"><el-button type="primary" :loading="sourceEditBusy" aria-label="应用编辑结果" @click="returnFromSourceEdit(true)"><icon-check :size="16" />应用</el-button></el-tooltip>
              <el-popconfirm title="确认关闭编辑？记录会保留，已提交的任务继续运行。" confirmButtonText="确认关闭" cancelButtonText="取消" placement="bottom-end" :width="260" @confirm="returnFromSourceEdit()"><template #reference><el-button text :disabled="sourceEditBusy" aria-label="关闭来源编辑"><icon-x :size="18" /></el-button></template></el-popconfirm>
            </div>
          </header>
          <p v-if="sourceEditError" class="sourceEditorError" role="alert">{{ sourceEditError }}</p>
          <iframe :src="url" data-source-editor="true" title="素材来源编辑工作区" @load="bindSourceWindow" />
        </section>
      </transition>
    </template>
  </teleport>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { IconX, IconCheck } from "@tabler/icons-vue";
import { sourceEdit, sourceEditBusy, sourceEditError, restoreSourceEdit, returnFromSourceEdit, receiveSourceResult } from "@/stores/sourceEditing";
if (window.parent === window) restoreSourceEdit();
const sourceUrl = computed(() => {
  const origin = sourceEdit.value?.origin;
  if (!origin) return "";
  const query = new URLSearchParams({ returnSection: "assets", sourceType: origin.type, sourceDirectory: origin.directory, source: origin.type === "canvas" ? origin.nodeId : origin.sessionFile });
  if (origin.type === "canvas") query.set("canvasPath", origin.canvasPath);
  return `${window.location.pathname}#/workspace?${query}`;
});
const sourceWindows = ref<string[]>([]);
watch(sourceUrl, url => { if (url && !sourceWindows.value.includes(url)) sourceWindows.value.push(url); }, { immediate: true });
const boundWindows = new Set<Window>();
function bindSourceWindow(event: Event) {
  const sourceWindow = (event.target as HTMLIFrameElement).contentWindow;
  if (sourceWindow) { sourceWindow.addEventListener("afxen:generation-recorded", receiveSourceResult); boundWindows.add(sourceWindow); }
}
onBeforeUnmount(() => { for (const sourceWindow of boundWindows) sourceWindow.removeEventListener("afxen:generation-recorded", receiveSourceResult); });
</script>
<style scoped lang="scss">
.sourceEditorWindow { position: fixed; z-index: 1909; top: 12px; right: 12px; bottom: 12px; width: min(500px, calc(100vw - 24px)); display: flex; flex-direction: column; box-sizing: border-box; overflow: hidden; border: 1px solid #494052; border-radius: 18px; background: #1c1b21; box-shadow: -12px 12px 48px #0006;
  &.canvasSource { width: min(1100px, calc(100vw - 24px)); }
  .sourceEditorHeader { display: flex; flex: none; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; border-bottom: 1px solid #ffffff0c;
    > div:first-child { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; color: #e9e5f0; }
    small { font-size: 12px; color: #b4a7ca; }
    .sourceEditorActions { display: flex; align-items: center; flex: none; gap: 4px; }
  }
  .sourceEditorError { margin: 0; padding: 8px 16px; color: #f56c6c; font-size: 12px; }
  iframe { display: block; flex: 1; min-height: 0; width: 100%; border: 0; }
}
.sourceDrawer-enter-active, .sourceDrawer-leave-active { transition: transform 240ms ease, opacity 240ms ease; }
.sourceDrawer-enter-from, .sourceDrawer-leave-to { transform: translateX(calc(100% + 16px)); opacity: 0; }
.sourceEditRecoveryError { position: fixed; z-index: 1910; top: 12px; left: 50%; transform: translateX(-50%); width: min(480px, calc(100vw - 24px)); }
@media(max-width:600px) { .sourceEditorWindow { top: 8px; right: 8px; bottom: 8px; width: calc(100vw - 16px); &.canvasSource { width: calc(100vw - 16px); } } }
@media(prefers-reduced-motion:reduce) { .sourceDrawer-enter-active, .sourceDrawer-leave-active { transition: none; } }
</style>
