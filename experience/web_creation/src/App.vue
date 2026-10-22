<script setup>
import { computed, ref } from 'vue'
import { useCreation } from '@/ports/creation'
import CanvasLayers from './components/CanvasLayers.vue'
import Home from './views/Home.vue'
import Workspace from './views/Workspace.vue'
import Assets from './views/Assets.vue'
import Projects from './views/Projects.vue'
import TextContextMenu from './components/TextContextMenu.vue'
import CreationModal from './components/CreationModal.vue'
import ModelSettings from './components/ModelSettings.vue'
import Icon from './components/CreationIcon.vue'
const port = useCreation(),
  s = port.state
const recentProjects = computed(() =>
  [...s.projects].sort((a, b) => new Date(b.lastOpened) - new Date(a.lastOpened)).slice(0, 5)
)
const nav = [
  ['home', 'home', '灵感创作'],
  ['projects', 'layers', '我的项目'],
  ['assets', 'grid', '个人资产']
]
</script>
<template>
  <div v-if="!s.available" class="integration-empty">
    <Icon name="spark" :size="40" />
    <h1>AI Studio</h1>
    <p>创作服务尚未接入。请使用独立的场景预览入口查看交互设计。</p>
  </div>
  <div v-else class="app-shell">
    <aside
      class="main-sidebar"
      :inert="s.page === 'workspace' && s.layersCollapsed"
      :aria-hidden="s.page === 'workspace' && s.layersCollapsed"
      :class="{
        'layers-sidebar': s.page === 'workspace',
        'sidebar-collapsed': s.page === 'workspace' && s.layersCollapsed
      }"
    >
      <CanvasLayers v-if="s.page === 'workspace'" /><template v-else>
        <button class="brand" @click="port.go('home')">
          <span class="brand-symbol"><Icon name="spark" :size="23" /></span
          ><strong>AI Studio<span>创作空间</span></strong></button
        ><button
          class="new-project"
          @click="
            $event => {
              s.prompt = ''
              s.references = []
              port.go('home')
            }
          "
        >
          <Icon name="plus" />新建创作
        </button>
        <nav>
          <button
            v-for="[id, icon, label] in nav"
            :key="id"
            :class="{ active: s.page === id || (id === 'projects' && s.page === 'workspace') }"
            @click="port.go(id)"
          >
            <Icon :name="icon" /><span>{{ label }}</span
            ><span v-if="id === 'assets'" class="nav-count">{{ s.assets.length }}</span>
          </button>
        </nav>
        <div class="sidebar-section">
          <span>最近项目</span>
        </div>
        <button
          v-for="project in recentProjects"
          :key="project.id"
          class="recent-link"
          @click="port.openProject(project.id)"
        >
          <i class="project-dot"></i><span>{{ project.name }}</span>
        </button>
        <button
          v-if="port.models"
          class="model-settings-button"
          title="模型接入设置"
          @click="port.models.open = true"
        >
          <Icon name="settings" :size="17" />真实模型设置
        </button>
      </template>
      <div class="sidebar-bottom">
        <div class="workspace-note">
          <Icon name="folder" />
          <div><b>我的工作空间</b><span>内容仅自己可见</span></div>
          <span class="private-dot"></span>
        </div>
        <button class="user-card" @click="port.notify('公司账号 · 个人内容隔离')">
          <span class="avatar">林</span><span><b>林小夏</b><small>品牌市场部</small></span
          ><Icon name="down" />
        </button>
      </div>
    </aside>
    <main class="app-main">
      <div v-if="port.isConnected" class="connected-banner">
        <span>真实模型联调 · 当前输入与引用会提交至所选供应商</span
        ><button @click="port.models.open = true">设置 API Key</button>
      </div>
      <component :is="port.scenarioNavigator" v-if="port.scenarioNavigator" /><Home
        v-if="s.page === 'home'"
      /><Workspace v-else-if="s.page === 'workspace'" /><Projects
        v-else-if="s.page === 'projects'"
      /><Assets v-else />
    </main>
    <CreationModal v-if="s.editorOpen" forced-kind="script-editor" /><ModelSettings
      v-if="port.models"
    /><TextContextMenu /><CreationModal v-if="s.modal" :key="s.modalRevision" /><transition
      name="toast"
      ><div v-if="s.toast" class="toast-message" role="status">
        <Icon name="check" />{{ s.toast }}
      </div></transition
    >
  </div>
</template>
