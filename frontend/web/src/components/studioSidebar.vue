<template>
  <aside class="studioSidebar" :class="{ collapsed: navigationCollapsed }" aria-label="主导航" @click.self="navigationCollapsed = false">
    <button class="collapseButton" type="button" :aria-expanded="!navigationCollapsed" :aria-label="navigationCollapsed ? '展开导航栏' : '折叠导航栏'" @click="navigationCollapsed = !navigationCollapsed"><icon-layout-sidebar :size="16" /></button><div class="sidebarScroll" @click.self="navigationCollapsed = false">
      <button class="studioBrand" type="button" aria-label="AFXEN 创作" :disabled="disabled" @click="emit('newAgent')"><brandLogo class="fullBrand" /><brandLogo class="compactBrand" compact /></button>
      <nav @click.self="navigationCollapsed = false">
        <el-tooltip content="首页" placement="right" :showAfter="200"><button type="button" :aria-current="activeSection === 'create' ? 'page' : undefined" aria-label="首页" @click="emit('navigate', 'create')"><icon-home :size="20" /><span>首页</span></button></el-tooltip>
        <el-tooltip content="Agent 助手" placement="right" :showAfter="200"><button type="button" :disabled="disabled" :aria-current="activeSection === 'agent' ? 'page' : undefined" aria-label="Agent 助手" @click="emit('newAgent')"><icon-sparkles :size="20" /><span>Agent 助手</span></button></el-tooltip>
        <el-tooltip v-for="item in sections" :key="item.value" :content="item.label" placement="right" :showAfter="200"><button type="button" :aria-current="activeSection === item.value ? 'page' : undefined" @click="item.value === 'platform' ? router.push('/admin') : emit('navigate', item.value)" :aria-label="item.value === 'messages' && unreadNotices ? `消息中心，${unreadNotices}条未读消息` : item.label"><div class="navIcon"><component :is="item.icon" :size="20" /><i v-if="item.value === 'messages' && unreadNotices" class="unreadDot" aria-hidden="true" /></div><span>{{ item.label }}</span></button></el-tooltip>
      </nav>

    </div>
    <footer class="sidebarFooter"><accountMenu @openSettings="emit('openSettings')" /></footer>
  </aside>
</template>
<script setup lang="ts">
import { useRouter } from "vue-router";
import { computed, onMounted } from "vue";
import { navigationCollapsed } from "@/stores/navigation";
import { IconLayoutSidebar, IconHome, IconSparkles, IconPhoto, IconFolder, IconBell, IconUsers, IconLayoutGrid } from "@tabler/icons-vue";
import type { Project } from "@/stores/workspace";
import { isPlatformAdmin, unreadNotices, loadPlatform } from "@/stores/platform";
import brandLogo from "@/components/brandLogo.vue";
import accountMenu from "@/components/accountMenu.vue";

defineProps<{ activeSection: string; disabled?: boolean }>();
const emit = defineEmits<{ navigate: [section: string]; newAgent: []; openProject: [project: Project]; openSettings: [] }>();
const router = useRouter();
onMounted(loadPlatform);
const sections = computed(() => [
  { value: "assets", label: "资产", icon: IconPhoto },
  { value: "projects", label: "我的项目", icon: IconFolder },


]);
</script>
<style scoped lang="scss">
.studioSidebar { position: fixed; inset: 0 auto 0 0; width: 230px; z-index: 6; display: flex; flex-direction: column; box-sizing: border-box; border-right: 0; background: #181818; color: #f2f2f2;
  .sidebarScroll { flex: 1; min-height: 0; padding: 16px 8px 12px; overflow-y: auto; overflow-x: hidden; scrollbar-width: none; &::-webkit-scrollbar { display: none; } }
  .studioBrand { position: relative; display: flex; align-items: center; gap: 8px; padding: 0; height: 32px; margin-bottom: 50px; border: 0; background: transparent; color: inherit; font-size: 26px; font-weight: 700; cursor: pointer; :deep(.fullBrand) { width: 144px; margin-left: 0; transform: translateY(-4px); } :deep(.compactBrand) { display: none; } }
  nav { display: grid; gap: 6px; button { display: flex; align-items: center; gap: 8px; min-height: 44px; width: 100%; padding: 10px 8px; border: 0; border-radius: 10px; background: transparent; color: #f2f2f2; font: inherit; font-size: 14px; text-align: left; cursor: pointer; position: relative; isolation: isolate; overflow: hidden; transition: background 180ms ease, color 180ms ease;
      &::after { content: ""; position: absolute; z-index: 0; pointer-events: none; inset: 0; border-radius: inherit; background: radial-gradient(ellipse at 50% 50%, #8970e847 0%, #4d70c72e 40%, #3a477515 62%, transparent 82%); opacity: 0; transition: opacity 180ms ease; }
      &:hover { background: #ffffff12; color: #f2f2f2; }
      &[aria-current="page"] { background: transparent; color: #b4a1ff; &::after { opacity: 1; } &:hover { background: #ffffff12; } svg { color: #b4a1ff; filter: drop-shadow(0 0 5px #8261ff66); } }
      svg, span { position: relative; z-index: 1; } svg { flex: none; } } }
  .sidebarFooter { position: relative; flex: none; padding: 14px 20px; border-top: 0; background: inherit; &::before { content: ""; position: absolute; top: 0; left: 50%; width: 200px; height: 1px; background: #292b30; transform: translateX(-50%); } :deep(.accountMenu) { width: 100%; } }
  &.collapsed { width: 68px; background: #131313; border-right: 1px solid #262626; .collapseButton { opacity: 0; pointer-events: none; &:focus-visible { opacity: 1; pointer-events: auto; } } .sidebarScroll { padding: 16px 8px 8px; } .studioBrand { width: 100%; height: auto; margin-bottom: 28px; justify-content: center; :deep(.fullBrand) { display: none; } :deep(.compactBrand) { display: inline-block; } } nav button { justify-content: center; padding: 10px; span { display: none; } } .sidebarFooter { padding: 12px 8px; &::before { width: 35px; } :deep(.userCenterLabel), :deep(.accountName) { display: none; } } }
  .collapseButton { position: absolute; top: 19px; right: 16px; display: grid; place-items: center; width: 20px; height: 26px; border: 0; border-radius: 6px; background: transparent; color: #f2f2f2; cursor: pointer; &:hover { background: #292b30; } }
  @media(max-width:700px) { width: 68px; background: #131313; border-right: 1px solid #262626; .collapseButton { opacity: 0; pointer-events: none; &:focus-visible { opacity: 1; pointer-events: auto; } } .sidebarScroll { padding: 16px 8px 8px; } .studioBrand { height: auto; margin-bottom: 24px; justify-content: center; :deep(.fullBrand) { display: none; } :deep(.compactBrand) { display: inline-block; } } nav button { justify-content: center; padding: 10px; span { display: none; } } .sidebarFooter { padding: 12px 8px; &::before { width: 35px; } :deep(.userCenterLabel), :deep(.accountName) { display: none; } } }
  @media(prefers-reduced-motion:reduce) { nav button, nav button::after { transition: none; } }
}
</style>
