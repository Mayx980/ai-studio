<template>
  <span class="brandLogo" :class="{ compact }" role="img" aria-label="AFXEN Logo"><img src="/afxenLogo.png" alt="" /></span>
</template>
<script setup lang="ts">
defineProps<{ compact?: boolean }>();
</script>
<style scoped lang="scss">
.brandLogo { display: inline-block; position: relative; width: 200px; aspect-ratio: 3 / 2; overflow: hidden; flex-shrink: 0; vertical-align: middle;
  img { display: block; width: 100%; height: 100%; object-fit: contain; }
  &.compact { width: 42px; aspect-ratio: 108 / 61;
    img { position: absolute; width: 142.222%; height: auto; max-width: none; left: -21.296%; top: -7.377%; }
  }
}
</style>
