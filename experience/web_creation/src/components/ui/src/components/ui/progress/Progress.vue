<template>
  <div
    role="progressbar"
    :aria-valuemin="0"
    :aria-valuemax="100"
    :aria-valuenow="value"
    class="h-2 w-full overflow-hidden rounded-full bg-secondary"
  >
    <div
      class="h-full bg-primary transition-[width]"
      :style="{ width: `${Math.min(100, Math.max(0, value))}%` }"
    ></div>
  </div>
</template>
<script setup>
defineProps({ value: { type: Number, default: 0 } })
</script>
