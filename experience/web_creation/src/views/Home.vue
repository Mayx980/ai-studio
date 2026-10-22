<script setup>
import { computed } from 'vue'
import { useCreation } from '@/ports/creation'
import Icon from '../components/CreationIcon.vue'
import ProductScene from '../components/ProductScene.vue'
const p = useCreation(),
  s = p.state
const recentProjects = computed(() =>
  [...s.projects].sort((a, b) => new Date(b.lastOpened) - new Date(a.lastOpened)).slice(0, 3)
)
const ideas = ['为产品写一份宣传脚本', '把活动方案变成分镜', '制作一组品牌视觉']
</script>
<template>
  <div class="home-page">
    <header class="home-top">
      <span>我的工作空间 <span class="separator">/</span> 灵感创作</span
      ><span class="subtle-chip"><i></i> 所有更改已保存</span>
    </header>
    <section class="home-hero">
      <div class="hero-kicker">
        <span class="spark-badge"><Icon name="spark" :size="14" /></span>从一个想法开始
      </div>
      <h1>让灵感，成为<span>下一帧。</span></h1>
      <p class="hero-description">与 AI 一起构思、编写分镜、生成素材，让创作自然发生。</p>
      <div class="inspiration-box">
        <div class="prompt-label">今天，你想创作什么？</div>
        <textarea
          v-model="s.prompt"
          aria-label="创作需求"
          placeholder="描述你的创作目标、产品亮点与期望风格，或引用已有素材…"
          @keydown.ctrl.enter="p.start()"
        ></textarea>
        <div v-if="s.references.length" class="reference-pills">
          <span v-for="a in s.references" :key="a.id"
            ><Icon :name="a.type === '提示词' ? 'text' : 'image'" :size="13" />{{ a.name
            }}<button
              title="移除引用"
              @click="s.references = s.references.filter(x => x.id !== a.id)"
            >
              ×
            </button></span
          >
        </div>
        <div class="inspiration-footer">
          <button class="reference-button" @click="p.openModal('reference', { for: 'home' })">
            <Icon name="attach" :size="17" />引用内容</button
          ><span class="model-choice"
            ><Icon name="spark" :size="14" />Qwen 3.8 Flash<Icon name="down" :size="12" /></span
          ><button class="primary-button start-button" @click="p.start()">
            开始创作<Icon name="arrow" :size="17" />
          </button>
        </div>
        <p v-if="s.error" class="field-error" role="alert">{{ s.error }}</p>
      </div>
      <div class="idea-buttons">
        <button v-for="(idea, i) in ideas" :key="idea" @click="s.prompt = idea">
          <Icon :name="['script', 'video', 'image'][i]" :size="15" />{{ idea }}
        </button>
      </div>
    </section>
    <section class="projects-section">
      <div class="section-heading">
        <div>
          <h2>最近的创作</h2>
          <p>拾起灵感，继续上一次的故事。</p>
        </div>
        <button class="ghost-button" @click="p.go('projects')">
          全部项目<Icon name="arrow" :size="15" />
        </button>
      </div>
      <div v-if="s.loading" class="project-grid">
        <div v-for="n in 3" :key="n" class="skeleton project-skeleton"></div>
      </div>
      <div v-else-if="s.failed" class="empty-panel">
        <h3>项目暂时未能加载</h3>
        <p>已保存的创作不会丢失。</p>
        <button class="secondary-button" @click="p.retry()">重新加载</button>
      </div>
      <div v-else-if="!recentProjects.length" class="empty-panel">
        <Icon name="folder" :size="30" />
        <h3>这里即将有你的第一个故事</h3>
        <p>在上方输入想法，或创建一个空白项目。</p>
      </div>
      <div v-else class="project-grid">
        <button
          v-for="project in recentProjects"
          :key="project.id"
          class="project-card"
          @click="p.openProject(project.id)"
        >
          <div class="project-cover">
            <ProductScene
              v-if="['amber', 'garden'].includes(project.cover)"
              :variant="project.cover"
            />
            <div v-else class="event-cover">
              <b>{{ project.cover === 'event' ? 'OPEN DAY' : '新项目' }}</b>
            </div>
          </div>
          <div class="project-info">
            <h3>{{ project.name }}</h3>
            <div>
              <span>{{ project.workspace?.nodes?.length || 0 }} 个节点</span
              ><small>{{ new Date(project.lastOpened).toLocaleString('zh-CN') }}</small>
            </div>
          </div></button
        ><button
          class="project-card blank-project"
          @click="
            $event => {
              s.prompt = ''
              p.openModal('new-project')
            }
          "
        >
          <span class="blank-plus"><Icon name="plus" :size="27" /></span>
          <h3>从空白画布开始</h3>
          <p>自由连接你的创作工作流</p>
        </button>
      </div>
    </section>
    <footer class="home-footer">
      <Icon name="help" :size="14" /><span>灵感、画布与个人资产，在同一个空间流动。</span
      ><button @click="p.openModal('guide')">了解创作流程<Icon name="arrow" :size="13" /></button>
    </footer>
  </div>
</template>
