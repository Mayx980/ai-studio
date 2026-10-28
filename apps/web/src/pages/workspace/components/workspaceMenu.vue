<template>
  <div class="workspaceMenu">
    <el-card shadow="never" :bodyStyle="{ padding: '3px 6px' }">
      <div class="menuContent">
        <span v-if="browserWorkspaceMode" class="browserStorageLabel" title="画布与素材保存在当前浏览器，刷新后保留；清除浏览器站点数据会删除这些内容">浏览器保存</span>
        <el-button v-if="workspaceStore.creationMode === 'professional'" class="toolButton" text :icon="IconMessages" aria-label="返回对话" title="返回对话" @click="workspaceStore.creationMode = 'simple'" />
        <el-button class="toolButton" text aria-label="退出项目" title="退出项目" @click="exitVisible = true">
          <icon-logout :size="18" aria-hidden="true" />
        </el-button>
        <el-button class="toolButton" text :aria-label="hasDesktopUpdate ? '设置，有新版本可用' : '设置'" title="设置" @click="emit('openSettings')">
          <el-badge isDot :hidden="!hasDesktopUpdate">
            <icon-settings :size="18" aria-hidden="true" />
          </el-badge>
        </el-button>
      </div>
    </el-card>
    <el-dialog v-model="exitVisible" title="退出项目" width="360px" alignCenter appendToBody>
      <span>是否退出当前项目并返回首页？</span>
      <template #footer>
        <el-button @click="exitVisible = false">取消</el-button>
        <el-button type="primary" :loading="leaving" @click="exitProject">退出项目</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { browserWorkspaceMode } from "@/lib/browserWorkspaceFiles";
import { useWorkspaceStore } from "@/stores/workspace";
import { IconMessages, IconLogout, IconSettings } from "@tabler/icons-vue";
import { hasDesktopUpdate } from "@/stores/desktopUpdate";

const emit = defineEmits<{ openSettings: [] }>();
const router = useRouter();
const workspaceStore = useWorkspaceStore();
const exitVisible = ref(false);
const leaving = ref(false);

async function exitProject() {
  if (leaving.value) return;
  leaving.value = true;
  try {
    await router.push("/home");
  } finally {
    leaving.value = false;
  }
}
</script>

<style scoped lang="scss">
.workspaceMenu {
  .browserStorageLabel { padding: 0 8px; font-size: 12px; color: var(--el-text-color-secondary); }
  .menuContent {
    display: flex;
    align-items: center;
    gap: 4px;

    .toolButton {
      width: 32px;
      height: 32px;
      margin: 0;
      padding: 0;
    }
  }
}
</style>
