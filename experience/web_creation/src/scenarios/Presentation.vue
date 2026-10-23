<script setup>
import { computed } from 'vue'
import { useCreation } from '@/ports/creation'
const p = useCreation(),
  d = p.presentation
const steps = ['剧情脚本', '分镜脚本', '图片生成', '视频生成']
const hints = [
  '直接编辑完整剧情，或输入想法后点击生成。在小气泡中修改并确认，才更新节点正文。',
  '点击脚本节点展开全屏表格，修改镜头、动作和台词；可以导出 Excel，查看每行引用素材。',
  '选择模型、比例和清晰度；输入 @ 选择已引用图片。模拟生成后，将图片连接到分镜引用列。',
  '查看分镜行和图片引用，设置模型、画质与时长；模拟生成后播放本地片段，再勾选素材下载。'
]
const hint = computed(() =>
  d.mode === 'canvas'
    ? hints[d.step]
    : '按助手提示依次选择方案、确认剧情和分镜、生成图片、选择镜头生成视频；确认后自动保存到画布。'
)
</script>
<template>
  <div v-if="d.menu" class="presentation-menu">
    <section class="presentation-welcome">
      <span class="presentation-kicker">AI STUDIO · DEMO</span>
      <h1>从一个故事，到一组镜头。</h1>
      <p>同一个香水广告案例，两种创作方式。所有生成均为本地模拟，无需 API Key。</p>
      <div class="presentation-choices">
        <button @click="p.launchPresentation('canvas')">
          <span>01 / 自主编排</span>
          <h2>画布工作流</h2>
          <p>剧情 → 分镜 → 图片 → 视频</p>
          <small>完整节点、素材与连线已准备好，点击逐步演示。</small><b>进入画布 →</b>
        </button>
        <button @click="p.launchPresentation('assistant')">
          <span>02 / 对话引导</span>
          <h2>灵感助手</h2>
          <p>需求 → 方案 → 脚本 → 素材</p>
          <small>带入完整需求，逐步选择、编辑和确认生成结果。</small><b>开始对话 →</b>
        </button>
      </div>
      <button class="ghost-button" @click="d.menu = false">自由体验现有原型</button>
    </section>
  </div>
  <aside v-else class="presentation-controls" aria-label="演示导航">
    <div class="presentation-heading">
      <strong>{{ d.mode === 'canvas' ? '画布编排演示' : '灵感助手演示' }}</strong
      ><span>本地模拟</span
      ><button @click="d.compact = !d.compact">{{ d.compact ? '展开提示' : '收起提示' }}</button
      ><button @click="d.menu = true">切换演示</button>
    </div>
    <template v-if="!d.compact">
      <nav v-if="d.mode === 'canvas'" aria-label="演示步骤">
        <button
          v-for="(step, i) in steps"
          :key="step"
          :class="{ active: d.step === i }"
          @click="p.focusPresentation(i)"
        >
          {{ i + 1 }} · {{ step }}
        </button>
      </nav>
      <p>{{ hint }}</p>
      <small
        >可穿插展示：引用与
        @、节点连线、模型参数、素材下载。重新进入将新建演示项目，已有项目保留。</small
      >
    </template>
  </aside>
</template>
<style scoped>
.presentation-menu {
  position: fixed;
  inset: 0;
  z-index: 800;
  background: radial-gradient(ellipse at 65% 15%, #3b2853 0, transparent 55%), #141318;
  display: grid;
  place-items: center;
  overflow: auto;
  padding: 32px;
  color: #ededf3;
}
.presentation-welcome {
  width: min(900px, 100%);
}
.presentation-kicker {
  letter-spacing: 3px;
  color: #bca0ef;
  font-size: 12px;
}
.presentation-welcome h1 {
  font-size: 42px;
  margin: 20px 0;
}
.presentation-welcome > p {
  color: #afa5bc;
  line-height: 1.8;
}
.presentation-choices {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 22px;
  margin: 36px 0;
}
.presentation-choices > button {
  text-align: left;
  padding: 30px;
  background: #24202e;
  border: 1px solid #554365;
  border-radius: 20px;
  color: inherit;
  cursor: pointer;
}
.presentation-choices > button:hover {
  border-color: #c3a4fc;
  background: #302639;
}
.presentation-choices span,
.presentation-choices b {
  color: #c8a9ff;
}
.presentation-choices h2 {
  font-size: 26px;
  margin: 22px 0 12px;
}
.presentation-choices small {
  display: block;
  color: #aaa0b5;
  line-height: 1.8;
  min-height: 60px;
}
.presentation-choices b {
  display: block;
  margin-top: 24px;
}
.presentation-controls {
  position: fixed;
  left: 224px;
  bottom: 18px;
  z-index: 55;
  width: min(590px, calc(100vw - 250px));
  background: #25202ff2;
  border: 1px solid #695280;
  border-radius: 14px;
  padding: 14px 18px;
  box-shadow: 0 12px 40px #0006;
  color: #eee;
  backdrop-filter: blur(14px);
}
.presentation-heading {
  display: flex;
  align-items: center;
  gap: 12px;
}
.presentation-heading span {
  color: #b7a0cc;
  font-size: 10px;
}
.presentation-heading button {
  margin-left: auto;
  background: none;
  border: 0;
  color: #ceb5f3;
  cursor: pointer;
}
.presentation-controls nav {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
.presentation-controls nav button {
  flex: 1;
  border: 1px solid #574465;
  border-radius: 8px;
  background: #302738;
  color: #bbaac9;
  padding: 8px;
  cursor: pointer;
}
.presentation-controls nav button.active {
  background: #b79ae4;
  color: #24152d;
}
.presentation-controls p {
  font-size: 12px;
  line-height: 1.7;
  margin: 12px 0 6px;
}
.presentation-controls small {
  color: #b0a0bb;
  font-size: 10px;
  line-height: 1.6;
}
@media (max-width: 700px) {
  .presentation-choices {
    grid-template-columns: 1fr;
  }
  .presentation-welcome h1 {
    font-size: 28px;
  }
  .presentation-controls {
    left: 12px;
    width: calc(100vw - 24px);
  }
}
</style>
