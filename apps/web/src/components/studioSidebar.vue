<template>
  <aside class="studioSidebar" aria-label="主导航">
    <div class="sidebarScroll">
      <button class="studioBrand" type="button" aria-label="AFXEN 首页" @click="emit('navigate', 'create')"><brandLogo compact /><span>AFXEN</span></button>
      <el-button class="homeButton" type="primary" :icon="IconHome" aria-label="首页" @click="emit('navigate', 'create')"><span>首页</span></el-button>
      <nav>
        <button type="button" :disabled="disabled" :aria-current="activeSection === 'agent' ? 'page' : undefined" title="Agent 助手" @click="emit('newAgent')"><icon-sparkles :size="20" /><span>Agent 助手</span></button>
        <button v-for="item in sections" :key="item.value" type="button" :aria-current="activeSection === item.value ? 'page' : undefined" :title="item.label" @click="emit('navigate', item.value)"><component :is="item.icon" :size="20" /><span>{{ item.label }}</span></button>
      </nav>
      <section class="recentSection" aria-label="最近项目"><h3>最近项目</h3><button v-for="item in recentProjects" :key="item.directory" type="button" class="recentProject" :disabled="disabled" :title="item.name" @click="emit('openProject', item)"><projectThumbnail :directory="item.directory" /><span><strong>{{ item.name }}</strong><small>{{ new Date(item.lastOpenedAt).toLocaleString(locale, { hour12: false }) }}</small></span></button></section>
    </div>
    <footer class="sidebarFooter"><accountMenu @openSettings="emit('openSettings')" /></footer>
  </aside>
</template>
<script setup lang="ts">
import { computed } from "vue";
import { locale } from "@toonflow/i18n/vue";
import { IconHome, IconHistory, IconPhoto, IconFolder, IconCheck } from "@tabler/icons-vue";
import { useWorkspaceStore, type Project } from "@/stores/workspace";
import { currentAccount } from "@/stores/prototypeAccount";
import brandLogo from "@/components/brandLogo.vue";
import projectThumbnail from "@/components/projectThumbnail.vue";
import accountMenu from "@/components/accountMenu.vue";

defineProps<{ activeSection: string; disabled?: boolean }>();
const emit = defineEmits<{ navigate: [section: string]; newAgent: []; openProject: [project: Project]; openSettings: [] }>();
const workspace = useWorkspaceStore();
const recentProjects = computed(() => [...workspace.projectList].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt).slice(0, 4));
const sections = computed(() => [
  { value: "history", label: "历史对话", icon: IconHistory },
  { value: "assets", label: "个人资产", icon: IconPhoto },
  { value: "projects", label: "我的项目", icon: IconFolder },
  { value: "reviews", label: currentAccount.value?.role === "admin" ? "模板审核" : "我的模板提交", icon: IconCheck },
]);
</script>
<style scoped lang="scss">
.studioSidebar { position: fixed; inset: 0 auto 0 0; width: 220px; z-index: 6; display: flex; flex-direction: column; border-right: 1px solid #292b30; background: #101112; color: #e5e7eb;
  .sidebarScroll { flex: 1; min-height: 0; padding: 28px 20px 12px; overflow-y: auto; }
  .studioBrand { display: flex; align-items: center; gap: 8px; padding: 0; margin-bottom: 28px; border: 0; background: transparent; color: inherit; font-size: 26px; font-weight: 700; cursor: pointer; }
  .homeButton { width: 100%; height: 36px; border-radius: 12px; margin-bottom: 22px; font-weight: 600; }
  nav { display: grid; gap: 6px; button { display: flex; align-items: center; gap: 12px; min-height: 44px; width: 100%; padding: 10px 12px; border: 0; border-radius: 10px; background: transparent; color: #cdd0d7; font: inherit; font-size: 14px; text-align: left; cursor: pointer; &[aria-current="page"], &:hover { background: #19232b; color: var(--el-color-primary); } svg { flex: none; } } }
  .recentSection { margin-top: 28px; h3 { margin: 0 10px 16px; color: #969aa5; font-size: 12px; font-weight: 400; } .recentProject { display: flex; align-items: center; gap: 10px; width: 100%; margin: 0 0 12px; padding: 7px; border: 0; border-radius: 10px; background: transparent; color: inherit; text-align: left; cursor: pointer; &:hover { background: #202227; } :deep(.projectThumbnail) { width: 42px; height: 42px; border-radius: 9px; flex: none; } > span { min-width: 0; display: grid; gap: 6px; } strong { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 12px; } small { font-size: 10px; color: #969aa5; } } }
  .sidebarFooter { flex: none; padding: 14px 20px; border-top: 1px solid #292b30; background: #101112; :deep(.accountMenu) { width: 100%; } }
  @media(max-width:700px) { width: 68px; .sidebarScroll { padding: 20px 8px 8px; } .studioBrand { margin-bottom: 24px; justify-content: center; span { display: none; } :deep(.brandLogo) { display: inline-block; } } .homeButton { padding: 0; :deep(span) { display: none; } } nav button { justify-content: center; padding: 10px; span { display: none; } } .recentSection { display: none; } .sidebarFooter { padding: 12px 8px; :deep(.userCenterLabel), :deep(.accountName) { display: none; } } }
}
</style>
