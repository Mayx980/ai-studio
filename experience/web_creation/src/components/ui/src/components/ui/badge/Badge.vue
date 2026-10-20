<template>
  <span
    :class="
      cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold',
        tones[tone],
        props.class
      )
    "
    ><slot></slot
  ></span>
</template>
<script setup>
import { cn } from '@/lib/utils'
const props = defineProps({
  class: { type: String, default: '' },
  tone: { type: String, default: 'default' }
})
const tones = {
  default: 'border-transparent bg-primary text-primary-foreground',
  secondary: 'border-transparent bg-secondary text-secondary-foreground',
  destructive: 'border-transparent bg-destructive text-destructive-foreground',
  outline: 'text-foreground'
}
</script>
