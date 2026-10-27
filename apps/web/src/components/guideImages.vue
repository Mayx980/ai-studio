<template>
  <section class="guideImages" aria-label="引导图">
    <div class="guideHeader"><span>引导图</span><el-tag size="small" type="info">设计预览</el-tag></div>
    <div class="guideSlots">
      <div v-for="item in slots" :key="item.id" class="guideSlot" @dragover.prevent @drop.prevent="readImage($event.dataTransfer?.files[0], item.id)">
        <button class="imagePicker" type="button" :aria-label="`选择${item.label}`" @click="choose(item.id)" @paste="readImage($event.clipboardData?.files[0], item.id)">
          <img v-if="images[item.id]" :src="images[item.id]!.url" :alt="images[item.id]!.name" />
          <icon-photo-plus v-else :size="21" aria-hidden="true" />
          <span>{{ item.label }}</span>
        </button>
        <button v-if="images[item.id]" class="removeImage" type="button" :aria-label="`移除${item.label}`" @click="remove(item.id)"><icon-x :size="13" /></button>
      </div>
    </div>
    <p v-if="error" class="guideError" role="alert">{{ error }}</p>
    <input ref="fileInput" type="file" accept="image/png,image/jpeg,image/webp" hidden @change="selectImage" />
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, reactive, ref } from "vue";
import { IconPhotoPlus, IconX } from "@tabler/icons-vue";
type GuideRole = "character" | "first" | "last";
const emit = defineEmits<{ change: [hasImages: boolean] }>();
const slots: { id: GuideRole; label: string }[] = [{ id: "character", label: "人物引导" }, { id: "first", label: "首帧" }, { id: "last", label: "尾帧" }];
const images = reactive<Partial<Record<GuideRole, { url: string; name: string }>>>({});
const role = ref<GuideRole>("character");
const fileInput = ref<HTMLInputElement>();
const error = ref("");
function choose(value: GuideRole) { role.value = value; fileInput.value?.click(); }
function remove(value: GuideRole) {
  if (images[value]) URL.revokeObjectURL(images[value]!.url);
  delete images[value];
  emit("change", Object.keys(images).length > 0);
}
function readImage(file: File | undefined, value: GuideRole) {
  if (!file) return;
  if (!/^image\/(png|jpeg|webp)$/.test(file.type) || !file.size || file.size > 10 * 1024 * 1024) {
    error.value = "请选择不超过 10 MB 的 PNG、JPEG 或 WebP 图片。";
    return;
  }
  remove(value);
  images[value] = { name: file.name, url: URL.createObjectURL(file) };
  error.value = "";
  emit("change", true);
}
function selectImage(event: Event) {
  const input = event.target as HTMLInputElement;
  readImage(input.files?.[0], role.value);
  input.value = "";
}
onBeforeUnmount(() => Object.values(images).forEach(image => URL.revokeObjectURL(image.url)));
</script>

<style scoped lang="scss">
.guideImages {
  margin: 12px 0;
  .guideHeader { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; font-size: 12px; color: var(--el-text-color-secondary); }
  .guideSlots {
    display: flex;
    gap: 10px;
    .guideSlot {
      position: relative;
      .imagePicker {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 6px;
        width: 92px;
        height: 84px;
        overflow: hidden;
        border: 1px dashed var(--el-border-color);
        border-radius: var(--el-border-radius-base);
        color: var(--el-text-color-secondary);
        background: var(--el-fill-color-extra-light);
        cursor: pointer;
        font: inherit;
        font-size: 12px;
        &:hover, &:focus-visible { border-color: var(--el-color-primary); color: var(--el-color-primary); }
        img { width: 100%; height: 50px; object-fit: cover; }
      }
      .removeImage { position: absolute; top: -5px; right: -5px; display: grid; place-items: center; width: 22px; height: 22px; border: 1px solid var(--el-border-color); border-radius: 50%; background: var(--el-bg-color-overlay); color: var(--el-text-color-primary); cursor: pointer; }
    }
  }
  .guideError { color: var(--el-color-danger); font-size: 12px; }
}
</style>
