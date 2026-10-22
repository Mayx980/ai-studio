<script setup>
import { computed } from 'vue'
import { mediaFields } from '../state/media-parameters'
const props = defineProps({
  type: { type: String, required: true },
  modelValue: { type: Object, required: true },
  connected: Boolean
})
const emit = defineEmits(['update:modelValue'])
const fields = computed(() => mediaFields(props.type, props.connected))
function update(key, event) {
  emit('update:modelValue', {
    ...props.modelValue,
    [key]: key === 'count' ? Number(event.target.value) : event.target.value
  })
}
</script>
<template>
  <div class="parameter-grid shared-media-parameters">
    <label v-for="field in fields" :key="field.key"
      >{{ field.label }}
      <select
        :value="modelValue[field.key]"
        :aria-label="field.key === 'ratio' ? '参数比例' : field.label"
        @change="update(field.key, $event)"
      >
        <option
          v-for="option in field.options"
          :key="option.value ?? option"
          :value="option.value ?? option"
        >
          {{ option.label ?? option }}
        </option>
      </select>
    </label>
  </div>
</template>
