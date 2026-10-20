<template>
  <div :class="['query-filter-field', keyword && 'query-filter-field--keyword']">
    <Label :for="forId">{{ label }}</Label>
    <div class="min-w-0 flex-1"><slot></slot></div>
  </div>
</template>
<script setup>
import { Label } from '@/components/ui/label'
defineProps({
  forId: { type: String, default: '' },
  keyword: { type: Boolean, default: false },
  label: { type: String, required: true }
})
</script>
