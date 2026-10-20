<template>
  <div
    class="flex size-full min-h-40 flex-col items-center justify-center gap-2 px-4 text-center"
    role="alert"
  >
    <span
      class="flex size-8 items-center justify-center rounded-full bg-destructive-subtle text-destructive-subtle-foreground"
      aria-hidden="true"
      >!</span
    >
    <p class="text-sm font-medium">{{ title || $t('system.error') }}</p>
    <p v-if="message" class="max-w-md text-xs text-muted-foreground">{{ message }}</p>
    <Button v-if="retryable" type="button" size="sm" variant="outline" @click="$emit('retry')">{{
      $t('system.retry')
    }}</Button>
  </div>
</template>
<script setup>
import { Button } from '@/components/ui/button'
defineProps({
  title: { type: String, default: '' },
  message: { type: String, default: '' },
  retryable: { type: Boolean, default: true }
})
defineEmits(['retry'])
</script>
