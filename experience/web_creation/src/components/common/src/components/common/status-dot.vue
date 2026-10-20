<template>
  <span class="inline-flex items-center gap-2 text-sm" :title="description"
    ><span :class="['size-2 rounded-full', tones[tone] || tones.neutral]" aria-hidden="true"></span
    ><span
      ><slot>{{ label }}</slot></span
    ><span class="sr-only">{{ description }}</span></span
  >
</template>
<script setup>
defineProps({
  label: { type: String, default: '' },
  description: { type: String, default: '' },
  tone: { type: String, default: 'neutral' }
})
const tones = {
  success: 'bg-status-success',
  warning: 'bg-status-warning',
  danger: 'bg-destructive',
  info: 'bg-status-info',
  neutral: 'bg-status-neutral'
}
</script>
