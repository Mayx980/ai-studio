<script setup>
import { useCreation } from '../ports/creation'
import Icon from '../components/CreationIcon.vue'
import ProductScene from '../components/ProductScene.vue'
const p = useCreation(),
  s = p.state
function date(value) {
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}
</script>
<template>
  <div class="projects-page">
    <header class="home-top">
      <span>我的工作空间 <span class="separator">/</span> 我的项目</span
      ><span class="subtle-chip">当前浏览器会话的项目</span>
    </header>
    <section class="projects-section">
      <div class="section-heading">
        <div>
          <h1>我的项目</h1>
          <p>回到上一次创作，或从一个新想法开始。</p>
        </div>
        <button class="primary-button" :disabled="s.readonly" @click="p.openModal('new-project')">
          <Icon name="plus" :size="16" />新建项目
        </button>
      </div>
      <div v-if="s.loading" class="project-grid">
        <div v-for="n in 3" :key="n" class="skeleton project-skeleton"></div>
        <button class="secondary-button" @click="p.retry()">显示内容</button>
      </div>
      <div v-else-if="s.failed" class="empty-panel">
        <h3>项目加载失败</h3>
        <button class="secondary-button" @click="p.retry()">重试</button>
      </div>
      <div v-else class="project-grid">
        <button
          class="project-create-card"
          :disabled="s.readonly"
          @click="p.openModal('new-project')"
        >
          <span class="create-cover"><Icon name="plus" :size="37" /><b>开始创作</b></span
          ><span>创建新的视频项目</span></button
        ><button
          v-for="project in s.projects"
          :key="project.id"
          class="project-card"
          @click="p.openProject(project.id)"
        >
          <div class="project-cover">
            <ProductScene
              v-if="project.cover === 'amber' || project.cover === 'garden'"
              :variant="project.cover"
            />
            <div v-else-if="project.cover === 'event'" class="event-cover project-event-cover">
              <span class="event-small">OPEN YOUR IMAGINATION</span
              ><b>OPEN<br />DAY<span>2026</span></b>
            </div>
            <div v-else class="project-empty-cover">
              <Icon name="layers" :size="40" /><span>从一个想法开始</span>
            </div>
          </div>
          <div class="project-info">
            <h3>{{ project.name }}</h3>
            <div>
              <span>{{ project.workspace?.nodes?.length || 0 }} 个节点</span
              ><small>上次打开 {{ date(project.lastOpened) }}</small>
            </div>
          </div>
        </button>
      </div>
    </section>
  </div>
</template>
