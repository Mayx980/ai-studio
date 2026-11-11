<template>
  <div class="professionalHomeCards" aria-label="画布项目">
    <button class="newCanvasCard" type="button" :disabled="busy" @click="createCanvas"><svg class="canvasTrails" viewBox="0 0 240 160" preserveAspectRatio="none" aria-hidden="true"><path v-for="(path, index) in canvasTrails" :key="index" :d="path" pathLength="1" /></svg><span class="canvasIcon"><span class="canvasIconFace canvasPlus"><icon-plus :size="24" /></span><span class="canvasIconFace canvasMark" aria-hidden="true" /></span><span class="canvasLabel">新建画布</span></button>
    <article v-for="project in recentProjects" :key="project.directory" class="recentProjectCard" :class="{ menuOpen: openMenu === project.directory }">
      <button class="projectOpen" type="button" :disabled="busy" :aria-label="`打开项目 ${project.name}`" @click="openProject(project)"><projectThumbnail :directory="project.directory" /><span class="projectCaption"><strong>{{ project.name }}</strong><small>{{ formatTime(project.lastEditedAt ?? project.lastOpenedAt) }}</small></span></button>
      <el-dropdown class="projectMore" trigger="click" placement="bottom-end" popperClass="recentProjectMenu" @visible-change="value => openMenu = value ? project.directory : ''" @command="command => projectAction(project, command)">
        <button class="projectMoreButton" type="button" :disabled="busy" :aria-label="`更多项目操作 ${project.name}`" @click.stop><icon-dots :size="18" /></button>
        <template #dropdown><el-dropdown-menu><el-dropdown-item command="rename"><icon-pencil :size="16" />重命名</el-dropdown-item><el-dropdown-item command="copy"><icon-copy :size="16" />复制项目</el-dropdown-item><el-dropdown-item command="remove" divided><icon-trash :size="16" />删除</el-dropdown-item></el-dropdown-menu></template>
      </el-dropdown>
    </article>
  </div>
</template>
<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import { IconPlus, IconDots, IconPencil, IconCopy, IconTrash } from "@tabler/icons-vue";
import projectThumbnail from "@/components/projectThumbnail.vue";
import { useWorkspaceStore, type Project } from "@/stores/workspace";
const workspace = useWorkspaceStore();
const router = useRouter();
const busy = ref(false);
const openMenu = ref("");
const canvasTrails = [
  "M120 80 C76 80 66 30 8 24", "M120 80 C76 80 64 76 8 82", "M120 80 C76 80 66 126 8 134",
  "M120 80 C164 80 174 30 232 24", "M120 80 C164 80 176 76 232 88", "M120 80 C164 80 174 126 232 134",
];
const recentProjects = computed(() => [...workspace.projectList].sort((a, b) => (b.lastEditedAt ?? b.lastOpenedAt) - (a.lastEditedAt ?? a.lastOpenedAt)).slice(0, 3));
function formatTime(value: number) {
  const minutes = Math.max(0, Math.floor((Date.now() - value) / 60000));
  return minutes < 1 ? "刚刚修改" : minutes < 60 ? `${minutes}分钟前修改` : minutes < 1440 ? `${Math.floor(minutes / 60)}小时前修改` : `${Math.floor(minutes / 1440)}天前修改`;
}
async function projectAction(project: Project, command: string | number | object) {
  if (busy.value) return;
  busy.value = true;
  try {
    if (command === "rename") {
      const result = await ElMessageBox.prompt("请输入项目名称", "重命名项目", { inputValue: project.name, confirmButtonText: "保存", cancelButtonText: "取消", inputValidator: value => !!value?.trim() && value.trim().length <= 80 || "请输入1–80个字符的项目名称" }).catch(() => null);
      if (result) workspace.renameProject(project.directory, result.value);
    } else if (command === "copy") { await workspace.duplicateProject(project); ElMessage.success("已创建项目副本"); }
    else if (command === "remove") {
      const confirmed = await ElMessageBox.confirm(`从项目列表删除“${project.name}”？项目文件不会被删除。`, "删除项目", { confirmButtonText: "删除", cancelButtonText: "取消", type: "warning" }).then(() => true, () => false);
      if (confirmed) workspace.removeProject(project.directory);
    }
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : "项目操作失败"); }
  finally { busy.value = false; }
}
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
  .newCanvasCard, .recentProjectCard { position: relative; min-width: 0; overflow: hidden; border: 1px solid #ffffff0d; border-radius: 16px; padding: 0; color: #f2f2f2; background: #292929; cursor: pointer; text-align: left;
    &:hover:enabled { border-color: #ffffff38; }
    &:focus-visible { outline: 2px solid #a28ae9; outline-offset: -3px; }
    &:disabled { cursor: wait; }
  }
  .newCanvasCard { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; font-size: 13px; background: radial-gradient(circle, #ffffff16 1px, transparent 1px) 0 0 / 18px 18px, #202020;
    .canvasTrails { position: absolute; top: -14px; left: 0; width: 100%; height: 100%; pointer-events: none; mask-image: linear-gradient(to right, transparent 0%, #0002 12%, #0008 30%, #000 50%, #0008 70%, #0002 88%, transparent 100%);
      path { fill: none; stroke: #ffffff26; stroke-width: 1; vector-effect: non-scaling-stroke; stroke-dasharray: 1; stroke-dashoffset: 1; opacity: 0; transition: stroke-dashoffset 700ms ease 120ms, opacity 220ms ease; }
    }
    .canvasIcon { position: relative; z-index: 1; display: block; width: 34px; height: 34px; perspective: 180px; }
    .canvasIconFace { position: absolute; inset: 0; display: grid; place-items: center; border-radius: 8px; color: #202020; background: #fff; backface-visibility: hidden; transition: transform 480ms ease;
    }
    .canvasPlus { transform: rotateY(0deg); }
    .canvasMark { transform: rotateY(-180deg); background: #202020;
      &::before { content: ""; position: absolute; inset: 0; border-radius: inherit; background: #fff; mask-image: linear-gradient(#000 0 0), url("/afxenMark.svg"); mask-size: 100% 100%, 25px 25px; mask-position: center; mask-repeat: no-repeat; mask-composite: exclude; }
    }
    .canvasLabel { position: relative; z-index: 1; }
    &:hover:enabled, &:focus-visible { .canvasPlus { transform: rotateY(180deg); } .canvasMark { transform: rotateY(0deg); } .canvasTrails path { stroke-dashoffset: 0; opacity: 1; } }
    @media(prefers-reduced-motion:reduce) { .canvasIconFace, .canvasTrails path { transition: none; } }

  }
  .recentProjectCard {
    .projectOpen { display: block; position: absolute; inset: 0; width: 100%; height: 100%; border: 0; padding: 0; background: transparent; color: inherit; text-align: left; cursor: pointer; &:focus-visible { outline: 2px solid #a28ae9; outline-offset: -3px; } }
    :deep(.projectThumbnail) { width: 100%; height: 100%; border-radius: 0; transform: scale(1); transition: transform 400ms ease; }
    .projectCaption { position: absolute; inset: auto 0 0; display: grid; align-content: start; gap: 5px; box-sizing: border-box; height: 70px; padding: 20px 12px 10px; background: linear-gradient(transparent, #0009); transform: translateY(22px); transition: transform 300ms ease; pointer-events: none;
      strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; font-weight: 500; }
      small { padding-right: 28px; font-size: 11px; opacity: 0; transition: opacity 250ms ease; }
    }
    .projectMore { position: absolute; right: 8px; bottom: 7px; opacity: 0; visibility: hidden; transition: opacity 250ms ease;
      .projectMoreButton { display: grid; place-items: center; width: 26px; height: 26px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: #fff; cursor: pointer; &:hover { background: #ffffff30; } &:focus-visible { outline: 2px solid #a28ae9; } }
    }
    &:hover, &:focus-within, &.menuOpen { :deep(.projectThumbnail) { transform: scale(1.045); } .projectCaption { transform: translateY(0); small { opacity: 1; } } .projectMore { opacity: 1; visibility: visible; } }
    @media(hover:none) { .projectCaption { transform: translateY(0); small { opacity: 1; } } .projectMore { opacity: 1; visibility: visible; } }
  }
  @media(prefers-reduced-motion:reduce) { .recentProjectCard { :deep(.projectThumbnail), .projectCaption, .projectCaption small, .projectMore { transition: none; } } }

  @media(max-width:700px) { gap: 4px; button { border-radius: 10px; } .recentProjectCard .projectCaption { padding: 18px 5px 8px; strong { font-size: 11px; } small { font-size: 9px; } } }
}
</style>

<style lang="scss">
.recentProjectMenu.el-popper { border: 1px solid #ffffff0d; border-radius: 10px; background: #262626; .el-dropdown-menu { min-width: 160px; padding: 6px; background: transparent; .el-dropdown-menu__item { gap: 10px; padding: 10px; border-radius: 5px; color: #f2f2f2; &:hover, &:focus { background: #ffffff12; color: #fff; } } .el-dropdown-menu__item--divided { border-top-color: #ffffff12; } } .el-popper__arrow { display: none; } }
</style>
