<template>
  <DialogRoot :open="open" @update:open="$emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="sheet-overlay fixed inset-0 z-50 bg-overlay" />
      <DialogContent
        :class="
          cn(
            'sheet-content fixed z-50 flex flex-col border-border bg-background shadow-xl focus:outline-none',
            sides[side],
            props.class
          )
        "
        @escape-key-down="guardClose"
        @pointer-down-outside="guardClose"
        @interact-outside="guardClose"
      >
        <header class="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <DialogTitle class="font-semibold">{{ title }}</DialogTitle
            ><DialogDescription v-if="description" class="mt-1 text-sm text-muted-foreground">{{
              description
            }}</DialogDescription>
          </div>
          <DialogClose
            v-if="!closeDisabled"
            class="rounded p-1 text-muted-foreground hover:bg-muted"
            :aria-label="$t('system.close')"
            ><IconX class="app-icon app-icon--sm" aria-hidden="true"
          /></DialogClose>
        </header>
        <div class="min-h-0 flex-1 overflow-auto p-5"><slot></slot></div>
        <footer v-if="$slots.footer" class="border-t border-border px-5 py-4">
          <slot name="footer"></slot>
        </footer>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
<script setup>
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle
} from 'reka-ui'
import IconX from '~icons/lucide/x'
import { cn } from '@/lib/utils'
const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  side: { type: String, default: 'right' },
  closeDisabled: { type: Boolean, default: false },
  class: { type: String, default: '' }
})
defineEmits(['update:open'])
const sides = {
  right: 'sheet-content--right inset-y-0 right-0 w-[var(--sheet-width-md)] border-l',
  left: 'sheet-content--left inset-y-0 left-0 w-[var(--layout-drawer-width)] border-r'
}
const guardClose = event => {
  if (props.closeDisabled) event.preventDefault()
}
</script>

<style scoped>
.sheet-overlay[data-state='open'] {
  animation: sheet-overlay-enter var(--motion-duration-normal) var(--motion-ease-decelerate) both;
}

.sheet-overlay[data-state='closed'] {
  animation: sheet-overlay-exit var(--motion-duration-normal) var(--motion-ease-accelerate) both;
}

.sheet-content--right[data-state='open'] {
  animation: sheet-content-right-enter var(--motion-duration-slow) var(--motion-ease-decelerate)
    both;
}

.sheet-content--right[data-state='closed'] {
  animation: sheet-content-right-exit var(--motion-duration-slow) var(--motion-ease-accelerate) both;
}

.sheet-content--left[data-state='open'] {
  animation: sheet-content-left-enter var(--motion-duration-slow) var(--motion-ease-decelerate) both;
}

.sheet-content--left[data-state='closed'] {
  animation: sheet-content-left-exit var(--motion-duration-slow) var(--motion-ease-accelerate) both;
}

@keyframes sheet-overlay-enter {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes sheet-overlay-exit {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}

@keyframes sheet-content-right-enter {
  from {
    opacity: 0;
    transform: translate3d(100%, 0, 0);
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }
}

@keyframes sheet-content-right-exit {
  from {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }
  to {
    opacity: 0;
    transform: translate3d(100%, 0, 0);
  }
}

@keyframes sheet-content-left-enter {
  from {
    opacity: 0;
    transform: translate3d(-100%, 0, 0);
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }
}

@keyframes sheet-content-left-exit {
  from {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }
  to {
    opacity: 0;
    transform: translate3d(-100%, 0, 0);
  }
}
</style>
