<template>
  <section class="creativeCases" :class="{ compact }" :aria-labelledby="titleId">
    <div class="caseHeader"><h2 :id="titleId">从一个案例开始</h2><span>应用后可继续编辑，发送才开始创作</span></div>
    <div class="caseCategories" role="group" aria-label="案例分类">
      <button v-for="item in categories" :key="item" type="button" :aria-pressed="category === item" @click="category = item">{{ item }}</button>
    </div>
    <div class="caseGrid">
      <article v-for="item in visibleCases" :key="item.name" class="caseCard">
        <button class="casePreview" type="button" :aria-label="`预览${item.name}`" :style="{ '--caseColor': item.color }" @pointerenter="play($event)" @pointerleave="pause($event)" @focus="play($event)" @blur="pause($event)" @click="preview = item">
          <img class="caseReference" :src="item.image || `/caseReference${item.mark}.svg`" :alt="`${item.name}参考图片`" />
          <video v-if="!item.image && item.category !== '封面海报'" class="caseVideo" src="/creativePreview.webm" muted loop playsinline preload="none" @error="($event.target as HTMLVideoElement).hidden = true" />
          <span class="previewBadge">{{ item.image ? 'AI 示例 · 风格参考' : item.category === '封面海报' ? '设计示意' : '示意视频 · 悬浮播放' }}</span>
        </button>
        <div class="caseInfo"><div><h3>{{ item.name }}</h3><p>{{ item.description }}</p></div><el-button text type="primary" :aria-label="`使用${item.name}`" @click="applyCase(item)">使用<icon-arrow-up-right :size="16" /></el-button></div>
      </article>
    </div>
    <el-dialog :modelValue="!!preview" :title="preview?.name" width="min(720px, 92vw)" appendToBody destroyOnClose @update:modelValue="preview = undefined">
      <img v-if="preview?.image" class="dialogReference" :src="preview.image" :alt="preview.name" />
      <video v-else-if="preview && preview.category !== '封面海报'" class="dialogVideo" src="/creativePreview.webm" controls playsinline />
      <p>{{ preview?.prompt }}</p><p class="previewNotice">本轮为案例交互设计，预览素材为示意，不代表模型生成效果。</p>
      <template #footer><el-button @click="preview = undefined">关闭</el-button><el-button type="primary" @click="applyPreview">使用案例</el-button></template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, useId } from "vue";
import { ElMessage } from "element-plus";
import { IconArrowUpRight } from "@tabler/icons-vue";
defineProps<{ compact?: boolean }>();
const emit = defineEmits<{ apply: [value: { prompt: string; references: File[] }] }>();
const titleId = useId();
const categories = ["全部", "真实测评", "达人种草", "产品展示", "活动宣传", "人物口播", "品牌故事", "知识讲解", "封面海报"];
const category = ref("全部");
type CreativeCase = { name: string; category: string; description: string; color: string; mark: string; image?: string; prompt: string };
const cases: CreativeCase[] = [
  { name: "用户真实测评口播", category: "真实测评", description: "居家自然光 · 使用过程 · 真实体验", color: "#b3a891", mark: "review", image: "/caseReview.png", prompt: "制作一条 20 秒、9:16 的用户真实测评风格口播视频。参考图仅用于人物和居家光线风格，产品外观以我上传的产品图为准。普通用户坐在窗边桌前，手机平视机位，保留自然肤质、轻微呼吸和停顿，避免棚拍广告感。镜头依次为拿起产品、展示质地或实际操作、使用后谈感受，产品近景穿插人物半身。口播采用‘使用前的困扰—实际怎么用—具体感受与适用人群’，不要编造体验、功效、检测数据或销量。缺少产品名称、实际体验和限制时，先问我，不替我做真实使用背书。所有口播与字幕使用中文。" },
  { name: "达人种草好物", category: "达人种草", description: "生活化分享 · 上手演示 · 好物细节", color: "#b8a18f", mark: "creator", image: "/caseCreator.png", prompt: "制作一条 15 秒、9:16 的达人好物种草视频。参考图中的居家穿搭、桌面环境和手持产品展示方式，保持人物自然、产品比例真实。前 3 秒用一个具体生活痛点开场，中段给出两处真实的使用细节和产品近景，结尾简短说明适用人群。以朋友聊天的中文口吻表达，动作与口播同步，保留自然停顿，不要夸张磨皮、虚假前后对比或空泛的‘必买’。产品特点、价格和活动仅使用我提供的信息；缺失时先提问，不编造用户评价或购买经历。" },
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
async function applyCase(item: (typeof cases)[number]) {
  try {
    const image = new Image(); image.src = item.image || `/caseReference${item.mark}.svg`; await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    canvas.getContext("2d")!.drawImage(image, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("参考图片转换失败")), "image/png"));
    emit("apply", { prompt: item.prompt, references: [new File([blob], `${item.name}（风格参考）.png`, { type: "image/png" })] });
    preview.value = undefined;
  } catch { ElMessage.error("案例参考图片读取失败，未替换当前草稿，请重试。"); }
}
function applyPreview() { if (preview.value) void applyCase(preview.value); }
</script>

<style scoped lang="scss">
.creativeCases {
  margin: 48px 0 36px;
  &.compact { flex: 0 1 120px; min-height: 0; margin: 8px 14px 12px; max-height: 120px; overflow: auto; .caseHeader { h2 { font-size: 13px; } span { display: none; } } .caseCategories { gap: 14px; margin: 6px 0; button { font-size: 12px; } } .caseGrid { display: flex; gap: 10px; overflow-x: auto; .caseCard { flex: 0 0 160px; .casePreview { height: 64px; border-radius: 8px; .previewBadge { display: none; } } .caseInfo { padding: 6px 0; h3 { font-size: 12px; margin: 0; } p { display: none; } } } } }
  .caseHeader { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; h2 { font-size: 19px; margin: 0; font-weight: 600; } span { color: var(--el-text-color-secondary); font-size: 12px; } }
  .caseCategories { display: flex; overflow-x: auto; gap: 24px; margin: 22px 0; padding-bottom: 6px; button { flex: none; padding: 6px 0; border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--el-text-color-secondary); font: inherit; font-size: 14px; cursor: pointer; &[aria-pressed="true"] { color: var(--el-color-primary); border-bottom-color: var(--el-color-primary); font-weight: 600; } } }
  .caseGrid {
    display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 22px;
    .caseCard {
      min-width: 0;
      .casePreview { display: block; position: relative; width: 100%; height: 220px; padding: 0; overflow: hidden; border: 1px solid var(--el-border-color-light); border-radius: 20px; background: var(--el-fill-color-light); cursor: pointer; &:hover, &:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 3px; .caseVideo:not([hidden]) { opacity: 1; } } .caseVideo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity .2s; } .previewBadge { position: absolute; bottom: 12px; left: 12px; border-radius: 20px; padding: 5px 9px; font-size: 10px; color: #fff; background: #0008; } }
      .caseReference { width: 100%; height: 100%; object-fit: cover; }
      .caseInfo { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 14px 2px; h3 { margin: 0 0 6px; font-size: 14px; font-weight: 500; } p { margin: 0; font-size: 12px; color: var(--el-text-color-secondary); } }
    }
  }
  .dialogReference { display: block; max-width: 100%; max-height: 60vh; margin: auto; border-radius: 16px; }
  .dialogVideo { width: 100%; max-height: 400px; border-radius: var(--el-border-radius-base); }
  .previewNotice { color: var(--el-text-color-secondary); font-size: 12px; }
  @media (max-width: 1000px) { .caseGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 560px) { .caseGrid { grid-template-columns: 1fr; } }
}
</style>
