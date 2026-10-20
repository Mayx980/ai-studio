<template>
  <div
    role="alert"
    :class="
      cn(
        'relative w-full rounded-lg border border-border bg-background px-4 py-3 text-sm',
        tone === 'destructive' &&
          'border-destructive/50 bg-destructive-subtle text-destructive-subtle-foreground',
        props.class
      )
    "
  >
    <slot></slot>
  </div>
</template>
<script setup>
import { cn } from '@/lib/utils'
const props = defineProps({
  class: { type: String, default: '' },
  tone: { type: String, default: 'default' }
})
</script>
