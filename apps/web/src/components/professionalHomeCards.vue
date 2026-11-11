<template>
  <div class="professionalHomeCards" aria-label="画布项目">
    <button class="newCanvasCard" type="button" :disabled="busy" @click="createCanvas"><icon-plus :size="24" /><span>新建画布</span></button>
    <button v-for="project in recentProjects" :key="project.directory" class="recentProjectCard" type="button" :disabled="busy" :aria-label="`打开项目 ${project.name}`" @click="openProject(project)">
      <projectThumbnail :directory="project.directory" />
      <span class="projectCaption"><strong>{{ project.name }}</strong><small>最近编辑 {{ formatTime(project.lastEditedAt ?? project.lastOpenedAt) }}</small></span>
    </button>
  </div>
</template>
<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { IconPlus } from "@tabler/icons-vue";
import { locale } from "@toonflow/i18n/vue";
import projectThumbnail from "@/components/projectThumbnail.vue";
import { useWorkspaceStore, type Project } from "@/stores/workspace";
const workspace = useWorkspaceStore();
const router = useRouter();
const busy = ref(false);
const recentProjects = computed(() => [...workspace.projectList].sort((a, b) => (b.lastEditedAt ?? b.lastOpenedAt) - (a.lastEditedAt ?? a.lastOpenedAt)).slice(0, 3));
function formatTime(value: number) { return new Date(value).toLocaleString(locale.value, { hour12: false }); }
async function createCanvas() {
  if (busy.value) return;
  busy.value = true;
  try { await workspace.createCanvasEntry(); await router.push({ path: "/workspace", query: { returnSection: "create" } }); }
  catch (error) { ElMessage.error(error instanceof Error ? error.message : "新建画布失败"); }
  finally { busy.value = false; }
}
async function openProject(project: Project) {
  if (busy.value) return;
  busy.value = true;
  try { await workspace.openProject(project.directory); await workspace.restoreProjectEntry(); await router.push({ path: "/workspace", query: { returnSection: "projects" } }); }
  catch (error) { ElMessage.error(error instanceof Error ? error.message : "打开项目失败"); }
  finally { busy.value = false; }
}
</script>
<style scoped lang="scss">
.professionalHomeCards { position: absolute; inset: -1px; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; visibility: visible;
  button { position: relative; min-width: 0; overflow: hidden; border: 1px solid #ffffff0d; border-radius: 16px; padding: 0; color: #f2f2f2; background: #292929; cursor: pointer; text-align: left;
    &:hover:enabled { border-color: #ffffff38; }
    &:focus-visible { outline: 2px solid #a28ae9; outline-offset: -3px; }
    &:disabled { cursor: wait; }
  }
  .newCanvasCard { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; font-size: 13px; background: radial-gradient(circle, #ffffff16 1px, transparent 1px) 0 0 / 18px 18px, #202020;
    svg { box-sizing: content-box; padding: 5px; border-radius: 8px; color: #202020; background: #fff; }
  }
  .recentProjectCard { :deep(.projectThumbnail) { width: 100%; height: 100%; border-radius: 0; } .projectCaption { position: absolute; inset: auto 0 0; display: grid; gap: 4px; padding: 24px 10px 10px; background: linear-gradient(transparent, #000b);
      strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; font-weight: 500; }
      small { font-size: 10px; line-height: 1.3; }
    }
  }
  @media(max-width:700px) { gap: 4px; button { border-radius: 10px; } .recentProjectCard .projectCaption { padding: 18px 5px 8px; strong { font-size: 11px; } small { font-size: 9px; } } }
}
</style>
