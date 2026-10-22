<script setup>
import { ref } from 'vue'
import { useCreation } from '@/ports/creation'
import Icon from './CreationIcon.vue'
import MediaCover from './MediaCover.vue'
const p = useCreation(),
  s = p.state,
  collapsed = ref([])
const groups = [
  ['文字', 'text'],
  ['图片', 'image'],
  ['视频', 'video'],
  ['脚本', 'script'],
  ['音频', 'audio']
]
function focus(n) {
  s.selectedNode = n.id
  if (n.type === '脚本') p.activateScript(n.id)
  s.focusRequest = { id: n.id, time: Date.now() }
}
</script>
<template>
  <section class="canvas-layers" aria-label="画布层级">
    <header>
      <button class="icon-button" title="返回我的项目" @click="p.go('projects')">
        <Icon name="back" /></button
      ><strong>画布层级</strong><small>{{ s.nodes.length }}</small>
    </header>
    <div class="layer-groups">
      <section v-for="[type, icon] in groups" :key="type" class="layer-group">
        <button
          class="layer-group-heading"
          :aria-expanded="!collapsed.includes(type)"
          @click="
            collapsed.includes(type)
              ? (collapsed = collapsed.filter(t => t !== type))
              : collapsed.push(type)
          "
        >
          <Icon name="down" :size="14" :class="{ collapsed: collapsed.includes(type) }" /><Icon
            :name="icon"
            :size="17"
          /><span>{{ type }}节点</span
          ><small>{{ s.nodes.filter(n => n.type === type).length }}</small>
        </button>
        <div v-if="!collapsed.includes(type)">
          <button
            v-for="n in s.nodes.filter(n => n.type === type)"
            :key="n.id"
            class="layer-card"
            :class="{ active: s.selectedNode === n.id }"
            :aria-label="'定位' + n.name"
            @click="focus(n)"
          >
            <span class="layer-cover"
              ><MediaCover v-if="type !== '脚本'" :asset="n" /><Icon
                v-else
                name="script"
                :size="24" /><Icon
                v-if="type === '视频'"
                name="play"
                class="layer-play"
                :size="17" /></span
            ><span class="layer-card-name" :title="n.name">{{ n.name }}</span
            ><Icon v-if="s.selectedNode === n.id" name="locate" :size="16" />
          </button>
          <p v-if="!s.nodes.some(n => n.type === type)" class="layer-empty">暂无{{ type }}节点</p>
        </div>
      </section>
    </div>
  </section>
</template>
