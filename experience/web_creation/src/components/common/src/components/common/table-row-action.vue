<template>
  <span
    v-if="iconOnly"
    class="table-row-action-tooltip"
    @mouseenter="showTooltip"
    @mouseleave="hideTooltip"
    @focusin="showTooltip"
    @focusout="hideTooltip"
  >
    <Button
      v-bind="$attrs"
      type="button"
      variant="ghost"
      size="icon"
      class="table-row-action size-[var(--density-control-height-sm)] p-0"
      data-table-action-kind="icon"
      :aria-label="label"
      :aria-describedby="tooltipOpen ? tooltipId : undefined"
    >
      <slot></slot>
    </Button>
    <Teleport to="body">
      <span
        v-if="tooltipOpen"
        :id="tooltipId"
        class="table-row-action-tooltip__content"
        role="tooltip"
        :style="tooltipStyle"
      >
        {{ label }}
      </span>
    </Teleport>
  </span>
  <Button
    v-else
    v-bind="$attrs"
    type="button"
    variant="link"
    size="sm"
    :class="['table-row-action h-auto p-0', destructive && 'text-destructive']"
    :data-table-action-kind="destructive ? 'destructive' : 'normal'"
  >
    <slot>{{ label }}</slot>
  </Button>
</template>

<script setup>
import { ref, useId } from 'vue'
import { Button } from '@/components/ui/button'

defineOptions({ inheritAttrs: false })
defineProps({
  label: { type: String, required: true },
  destructive: { type: Boolean, default: false },
  iconOnly: { type: Boolean, default: false }
})
const tooltipId = useId()
const tooltipOpen = ref(false)
const tooltipStyle = ref({})
const showTooltip = event => {
  const box = event.currentTarget.getBoundingClientRect()
  tooltipStyle.value = {
    insetInlineStart: `${box.left + box.width / 2}px`,
    insetBlockStart: `${box.top}px`
  }
  tooltipOpen.value = true
}
const hideTooltip = () => {
  tooltipOpen.value = false
}
</script>
