<template>
  <div
    class="flex size-full min-h-40 flex-col items-center justify-center gap-2 px-4 text-center text-muted-foreground"
    role="status"
  >
    <IconArchive class="app-icon app-icon--lg" aria-hidden="true" />
    <p class="text-sm font-medium text-foreground">{{ title || $t('system.empty') }}</p>
    <p v-if="description" class="max-w-md text-xs">{{ description }}</p>
    <slot name="action"></slot>
  </div>
</template>
<script setup>
import IconArchive from '~icons/lucide/archive'
defineProps({ title: { type: String, default: '' }, description: { type: String, default: '' } })
</script>
