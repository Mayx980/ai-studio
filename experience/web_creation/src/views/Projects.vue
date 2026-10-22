<script setup>
import { computed, ref } from 'vue'
import { useCreation } from '../ports/creation'
import Icon from '../components/CreationIcon.vue'
import ProductScene from '../components/ProductScene.vue'
const p = useCreation(),
  s = p.state
const query = ref(''),
  projects = computed(() =>
    [...s.projects]
      .filter(p => p.name.toLowerCase().includes(query.value.trim().toLowerCase()))
      .sort((a, b) => new Date(b.lastOpened) - new Date(a.lastOpened))
  )
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
        <label class="search-box project-search"
          ><Icon name="search" :size="16" /><input
            v-model="query"
            aria-label="搜索项目"
            placeholder="请输入项目名"
        /></label>
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
          <span class="create-cover"><Icon name="plus" :size="37" /><b>开始创作</b></span></button
        ><button
          v-for="project in projects"
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
      <p v-if="query && !projects.length" class="empty-panel">未找到匹配的项目</p>
    </section>
  </div>
</template>
