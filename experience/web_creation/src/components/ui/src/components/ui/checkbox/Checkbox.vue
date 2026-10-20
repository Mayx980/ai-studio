<template>
  <input
    ref="input"
    type="checkbox"
    :checked="modelValue"
    :class="
      cn('size-4 rounded border border-primary accent-primary disabled:opacity-50', props.class)
    "
    v-bind="$attrs"
    @change="$emit('update:modelValue', $event.target.checked)"
  />
</template>
<script setup>
import { onMounted, ref, watch } from 'vue'
import { cn } from '@/lib/utils'
defineOptions({ inheritAttrs: false })
const props = defineProps({
  modelValue: { type: Boolean, default: false },
  indeterminate: { type: Boolean, default: false },
  class: { type: String, default: '' }
})
defineEmits(['update:modelValue'])
const input = ref(null)
const sync = () => {
  if (input.value) input.value.indeterminate = props.indeterminate
}
onMounted(sync)
watch(() => props.indeterminate, sync)
</script>
