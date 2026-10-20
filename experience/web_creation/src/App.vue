<script setup>
import { computed, ref } from 'vue'
import { useCreation } from '@/ports/creation'
import Home from './views/Home.vue'
import Workspace from './views/Workspace.vue'
import Assets from './views/Assets.vue'
import Projects from './views/Projects.vue'
import TextContextMenu from './components/TextContextMenu.vue'
import CreationModal from './components/CreationModal.vue'
import Icon from './components/CreationIcon.vue'
const port = useCreation(),
  s = port.state
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
    <aside class="main-sidebar">
      <button class="brand" @click="port.go('home')">
        <span class="brand-symbol"><Icon name="spark" :size="23" /></span
        ><strong>AI Studio<span>创作空间</span></strong></button
      ><button
        class="new-project"
        @click="($event) => {
          s.prompt = ''
          s.references = []
          port.go('home')
        }"
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
        <span>最近项目</span
        ><button title="查看全部项目" @click="port.go('home')"><Icon name="more" /></button>
      </div>
      <button class="recent-link" @click="port.openProject('夏日序曲 · 香水新品宣传')">
        <i class="project-dot"></i><span>夏日序曲 · 香水新品宣传</span></button
      ><button class="recent-link" @click="port.openProject('品牌开放日 · 活动预热')">
        <i class="project-dot green"></i><span>品牌开放日 · 活动预热</span>
      </button>
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
      <component :is="port.scenarioNavigator" v-if="port.scenarioNavigator" /><Home
        v-if="s.page === 'home'"
      /><Workspace v-else-if="s.page === 'workspace'" /><Projects
        v-else-if="s.page === 'projects'"
      /><Assets v-else />
    </main>
    <TextContextMenu /><CreationModal v-if="s.modal" :key="s.modalRevision" /><transition
      name="toast"
      ><div v-if="s.toast" class="toast-message" role="status">
        <Icon name="check" />{{ s.toast }}
      </div></transition
    >
  </div>
</template>
