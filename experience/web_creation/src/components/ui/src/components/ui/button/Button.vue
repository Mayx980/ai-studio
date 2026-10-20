<template>
  <Primitive
    :as="as"
    :as-child="asChild"
    :class="cn(base, variants[variant], sizes[size], props.class)"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
    v-bind="$attrs"
  >
    <span
      v-if="loading"
      class="size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
      aria-hidden="true"
    ></span>
    <slot></slot>
  </Primitive>
</template>

<script setup>
import { Primitive } from 'reka-ui'
import { cn } from '@/lib/utils'

defineOptions({ inheritAttrs: false })
const props = defineProps({
  as: { type: String, default: 'button' },
  asChild: { type: Boolean, default: false },
  class: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  size: { type: String, default: 'default' },
  variant: { type: String, default: 'default' }
})

const base =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50'
const variants = {
  default:
    'bg-brand-accent text-brand-accent-foreground hover:bg-brand-accent-hover active:bg-brand-accent-pressed',
  destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
  outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
  ghost: 'hover:bg-accent hover:text-accent-foreground',
  link: 'text-brand-accent-subtle-foreground underline-offset-4 hover:underline'
}
const sizes = {
  default: 'h-[var(--density-control-height)] px-4 py-2',
  sm: 'h-[var(--density-control-height-sm)] rounded-md px-3 text-sm',
  lg: 'h-[var(--density-control-height-lg)] rounded-md px-8',
  icon: 'size-[var(--density-control-height)]'
}
</script>
