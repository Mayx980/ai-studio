<template>
  <div :class="['relative flex min-h-screen flex-col bg-muted', props.class]">
    <div
      class="absolute inset-0 opacity-40 [background-size:24px_24px] [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)]"
      aria-hidden="true"
    ></div>
    <slot></slot>
  </div>
</template>
<script setup>
const props = defineProps({ class: { type: String, default: '' } })
</script>
