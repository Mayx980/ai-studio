<template>
  <textarea
    :value="modelValue"
    :class="
      cn(
        'flex min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
        props.class
      )
    "
    v-bind="$attrs"
    @input="$emit('update:modelValue', $event.target.value)"
  ></textarea>
</template>

<script setup>
import { cn } from '@/lib/utils'
defineOptions({ inheritAttrs: false })
const props = defineProps({
  modelValue: { type: String, default: '' },
  class: { type: String, default: '' }
})
defineEmits(['update:modelValue'])
</script>
