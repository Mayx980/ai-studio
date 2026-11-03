<template>
  <span class="brandLogo" :class="{ compact }" role="img" aria-label="AFXEN Logo"><img :src="compact ? '/afxenMark.svg' : '/afxenBrand.svg'" alt="" /></span>
</template>
<script setup lang="ts">
defineProps<{ compact?: boolean }>();
</script>
<style scoped lang="scss">
.brandLogo { display: inline-block; width: 260px; aspect-ratio: 64 / 15; flex-shrink: 0; vertical-align: middle;
  img { display: block; width: 100%; height: 100%; object-fit: contain; }
  &.compact { width: 42px; aspect-ratio: 155 / 150; }
}
</style>
