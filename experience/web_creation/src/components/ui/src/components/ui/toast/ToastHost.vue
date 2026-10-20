<template>
  <div
    class="fixed right-4 top-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
    aria-live="polite"
  >
    <div
      v-for="item in toastState.items"
      :key="item.id"
      :data-tone="item.tone"
      :class="[
        'rounded-lg border bg-popover px-4 py-3 text-sm text-popover-foreground shadow-lg',
        item.tone === 'error' && 'border-destructive/50',
        item.tone === 'success' && 'border-status-success/40'
      ]"
    >
      <div class="flex items-start justify-between gap-3">
        <span>{{ item.message }}</span
        ><button
          type="button"
          class="text-muted-foreground hover:text-foreground"
          :aria-label="$t('system.close')"
          @click="dismiss(item.id)"
        >
          <IconX class="app-icon app-icon--sm" aria-hidden="true" />
        </button>
      </div>
    </div>
  </div>
</template>
<script setup>
import IconX from '~icons/lucide/x'
import { dismiss, toastState } from './toast'
</script>
