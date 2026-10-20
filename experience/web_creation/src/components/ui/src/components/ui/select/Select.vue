<template>
  <select
    :value="modelValue"
    :class="
      cn(
        'h-[var(--density-control-height)] rounded-md border border-input bg-background px-3 text-sm shadow-sm disabled:opacity-50',
        props.class
      )
    "
    v-bind="$attrs"
    @change="$emit('update:modelValue', $event.target.value)"
  >
    <slot></slot>
  </select>
</template>
<script setup>
import { cn } from '@/lib/utils'
defineOptions({ inheritAttrs: false })
const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  class: { type: String, default: '' }
})
defineEmits(['update:modelValue'])
</script>
