<template>
  <div :class="cn('animate-pulse rounded-md bg-muted', props.class)" aria-hidden="true"></div>
</template>
<script setup>
import { cn } from '@/lib/utils'
const props = defineProps({ class: { type: String, default: '' } })
</script>
