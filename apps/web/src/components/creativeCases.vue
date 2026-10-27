<template>
  <section class="creativeCases" aria-labelledby="creativeCasesTitle">
    <div class="caseHeader"><h2 id="creativeCasesTitle">从一个案例开始</h2><span>应用后可继续编辑，发送才开始创作</span></div>
    <div class="caseCategories" role="group" aria-label="案例分类">
      <button v-for="item in categories" :key="item" type="button" :aria-pressed="category === item" @click="category = item">{{ item }}</button>
    </div>
    <div class="caseGrid">
      <article v-for="item in visibleCases" :key="item.name" class="caseCard">
        <button class="casePreview" type="button" :aria-label="`预览${item.name}`" :style="{ '--caseColor': item.color }" @pointerenter="play($event)" @pointerleave="pause($event)" @focus="play($event)" @blur="pause($event)" @click="preview = item">
          <div class="caseArtwork" :data-case="item.mark" aria-hidden="true"><div class="artCircle"></div><span class="artMark">{{ item.mark }}</span><div class="artObject"></div><span class="artCaption">{{ item.category }}</span></div>
          <video v-if="item.category !== '封面海报'" class="caseVideo" src="/creativePreview.webm" muted loop playsinline preload="none" @error="($event.target as HTMLVideoElement).hidden = true" />
          <span class="previewBadge">{{ item.category === '封面海报' ? '设计示意' : '示意视频 · 悬浮播放' }}</span>
        </button>
        <div class="caseInfo"><div><h3>{{ item.name }}</h3><p>{{ item.description }}</p></div><el-button text type="primary" :aria-label="`使用${item.name}`" @click="emit('apply', item.prompt)">使用<icon-arrow-up-right :size="16" /></el-button></div>
      </article>
    </div>
    <el-dialog :modelValue="!!preview" :title="preview?.name" width="min(720px, 92vw)" appendToBody destroyOnClose @update:modelValue="preview = undefined">
      <video v-if="preview && preview.category !== '封面海报'" class="dialogVideo" src="/creativePreview.webm" controls playsinline />
      <p>{{ preview?.prompt }}</p><p class="previewNotice">本轮为案例交互设计，预览素材为示意，不代表模型生成效果。</p>
      <template #footer><el-button @click="preview = undefined">关闭</el-button><el-button type="primary" @click="applyPreview">使用案例</el-button></template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { IconArrowUpRight } from "@tabler/icons-vue";
const emit = defineEmits<{ apply: [prompt: string] }>();
const categories = ["全部", "产品展示", "活动宣传", "人物口播", "品牌故事", "知识讲解", "封面海报"];
const category = ref("全部");
const cases = [
  { name: "让产品成为主角", category: "产品展示", description: "光影、质感与产品细节", color: "#c1a47b", mark: "01", prompt: "为我的产品制作一段展示视频，用自然光与近景突出材质和使用细节。产品信息以我提供的素材为准。" },
  { name: "给活动一个开场", category: "活动宣传", description: "用一个镜头，唤起期待", color: "#788fae", mark: "02", prompt: "制作一段活动预热视频，突出活动亮点与参与体验。活动时间、地点使用我提供的信息，缺失内容先询问。" },
  { name: "像朋友一样分享", category: "人物口播", description: "自然表达，讲清产品价值", color: "#a3af95", mark: "03", prompt: "根据人物参考和产品资料制作自然的分享口播，语气真诚，突出实际使用场景，不虚构功效。" },
  { name: "讲一个品牌故事", category: "品牌故事", description: "把理念变成有温度的画面", color: "#aa91a8", mark: "04", prompt: "围绕我提供的品牌理念，创作简洁、有温度的品牌故事，先保留可修改的内容。" },
  { name: "把知识讲明白", category: "知识讲解", description: "一个概念，一次清晰表达", color: "#89a7ac", mark: "05", prompt: "把我提供的知识内容转化为通俗的讲解，用清晰的例子说明关键概念，不补充未经证实的事实。" },
  { name: "一张图打开想象", category: "封面海报", description: "清晰主体，留下标题空间", color: "#b09c83", mark: "06", prompt: "设计一张简洁的宣传封面，突出我提供的主体，保留可编辑标题区域，画面干净、层次清晰。" },
];
const visibleCases = computed(() => cases.filter(item => category.value === "全部" || item.category === category.value));
const preview = ref<(typeof cases)[number]>();
function play(event: Event) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const video = (event.currentTarget as HTMLElement).querySelector("video");
  if (video) void video.play().catch(() => {});
}
function pause(event: Event) { (event.currentTarget as HTMLElement).querySelector("video")?.pause(); }
function applyPreview() { if (preview.value) emit("apply", preview.value.prompt); preview.value = undefined; }
</script>

<style scoped lang="scss">
.creativeCases {
  margin: 48px 0 36px;
  .caseHeader { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; h2 { font-size: 19px; margin: 0; font-weight: 600; } span { color: var(--el-text-color-secondary); font-size: 12px; } }
  .caseCategories { display: flex; overflow-x: auto; gap: 24px; margin: 22px 0; padding-bottom: 6px; button { flex: none; padding: 6px 0; border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--el-text-color-secondary); font: inherit; font-size: 14px; cursor: pointer; &[aria-pressed="true"] { color: var(--el-color-primary); border-bottom-color: var(--el-color-primary); font-weight: 600; } } }
  .caseGrid {
    display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 22px;
    .caseCard {
      min-width: 0;
      .casePreview { display: block; position: relative; width: 100%; height: 220px; padding: 0; overflow: hidden; border: 1px solid var(--el-border-color-light); border-radius: 20px; background: var(--el-fill-color-light); cursor: pointer; &:hover, &:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 3px; .caseVideo:not([hidden]) { opacity: 1; } } .caseVideo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity .2s; } .previewBadge { position: absolute; bottom: 12px; left: 12px; border-radius: 20px; padding: 5px 9px; font-size: 10px; color: #fff; background: #0008; } }
      .caseArtwork { position: relative; height: 100%; overflow: hidden; background: linear-gradient(145deg, color-mix(in srgb, var(--caseColor) 40%, #f6f5ef), var(--caseColor)); .artCircle { position: absolute; width: 210px; height: 210px; border: 1px solid #fff7; border-radius: 50%; top: 25px; left: calc(50% - 105px); } .artMark { position: absolute; right: 18px; top: 10px; font-size: 52px; font-weight: 300; color: #fff5; } .artObject { position: absolute; width: 76px; height: 100px; left: calc(50% - 38px); bottom: 42px; border: 1px solid #fffa; border-radius: 14px 14px 8px 8px; background: linear-gradient(120deg, #fff9, #fff2); box-shadow: 15px 15px 24px #0002; &::before { content: ""; position: absolute; width: 35px; height: 20px; top: -20px; left: 19px; border-radius: 5px 5px 0 0; background: #fff8; } } &[data-case="02"] .artObject { width: 120px; left: calc(50% - 60px); height: 65px; border-radius: 50% 50% 8px 8px; } &[data-case="03"] .artObject { width: 110px; left: calc(50% - 55px); border-radius: 60px 60px 12px 12px; &::before { width: 48px; height: 48px; border-radius: 50%; left: 30px; top: -44px; } } &[data-case="04"] .artObject { width: 100px; left: calc(50% - 50px); border-radius: 60px 60px 0 0; height: 125px; &::before { display: none; } } &[data-case="05"] .artObject { transform: rotate(-12deg); width: 105px; height: 115px; left: calc(50% - 52px); border-radius: 8px; &::before { width: 65px; height: 2px; left: 20px; top: 32px; box-shadow: 0 16px #fff8, 0 32px #fff8; } } &[data-case="06"] .artObject { width: 110px; left: calc(50% - 55px); height: 140px; border-radius: 3px; &::before { width: 50px; height: 50px; border-radius: 50%; top: 25px; left: 30px; } } .artCaption { position: absolute; top: 24px; left: 22px; letter-spacing: 2px; line-height: 1.5; color: #34404b; font-size: 12px; } }
      .caseInfo { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 14px 2px; h3 { margin: 0 0 6px; font-size: 14px; font-weight: 500; } p { margin: 0; font-size: 12px; color: var(--el-text-color-secondary); } }
    }
  }
  .dialogVideo { width: 100%; max-height: 400px; border-radius: var(--el-border-radius-base); }
  .previewNotice { color: var(--el-text-color-secondary); font-size: 12px; }
  @media (max-width: 1000px) { .caseGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 560px) { .caseGrid { grid-template-columns: 1fr; } }
}
</style>
