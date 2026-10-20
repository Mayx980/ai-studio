<template>
  <PopoverRoot v-model:open="open">
    <PopoverTrigger as-child>
      <Button
        v-bind="$attrs"
        type="button"
        :variant="variant === 'plain' ? 'ghost' : 'outline'"
        class="justify-between"
        :class="variant === 'plain' ? 'w-auto border-0 bg-transparent px-1 shadow-none' : 'w-full'"
        :title="displayText || resolvedPlaceholder"
        :aria-label="resolvedAriaLabel"
        :disabled="disabled"
        data-test="choice-select-trigger"
      >
        <span class="truncate">{{ displayText || resolvedPlaceholder }}</span>
        <IconChevronDown class="app-icon app-icon--sm" aria-hidden="true" />
      </Button>
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent
        data-test="choice-select-popover"
        class="z-50 w-[var(--reka-popover-trigger-width)] min-w-56 rounded-md border border-border bg-popover p-2 text-popover-foreground shadow-lg"
        align="start"
        :side-offset="4"
      >
        <ComboboxRoot
          v-model:open="open"
          :model-value="undefined"
          :ignore-filter="true"
          :open-on-focus="true"
          class="relative flex max-h-64 flex-col"
          data-reka-combobox
          @update:model-value="selectOption"
        >
          <!-- 先挂载 content，使 Reka 在 input 渲染前生成 aria-controls 目标；视觉顺序由 order class 控制。 -->
          <ComboboxContent
            data-test="choice-select-options"
            class="order-2 max-h-56 min-h-0 overflow-auto"
          >
            <ComboboxEmpty class="p-3 text-center text-sm text-muted-foreground">
              {{ $t('system.select.noResults') }}
            </ComboboxEmpty>
            <ComboboxItem
              v-for="(option, index) in visibleOptions"
              :key="optionKey(option, index)"
              :value="option"
              :text-value="option.label"
              :disabled="option.disabled"
              class="flex cursor-pointer items-center justify-between gap-2 rounded px-2 py-1.5 text-sm data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[highlighted]:bg-accent"
            >
              <span class="min-w-0 flex-1 truncate">{{ option.label }}</span>
              <IconCheck
                v-if="option.value === modelValue"
                class="app-icon app-icon--sm"
                aria-hidden="true"
              />
            </ComboboxItem>
          </ComboboxContent>
          <ComboboxInput
            v-model="query"
            data-test="choice-select-input"
            :data-searchable="String(searchable)"
            :aria-label="resolvedAriaLabel"
            :auto-focus="true"
            :class="inputClass"
            :placeholder="searchable ? resolvedSearchPlaceholder : undefined"
            :readonly="!searchable"
          />
        </ComboboxRoot>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxRoot,
  PopoverContent,
  PopoverPortal,
  PopoverRoot,
  PopoverTrigger
} from 'reka-ui'
import IconCheck from '~icons/lucide/check'
import IconChevronDown from '~icons/lucide/chevron-down'
import { Button } from '@/components/ui/button'

defineOptions({ inheritAttrs: false })
const props = defineProps({
  variant: { type: String, default: 'outline' },
  modelValue: { type: [String, Number], default: null },
  options: { type: Array, default: () => [] },
  searchable: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  placeholder: { type: String, default: '' },
  searchPlaceholder: { type: String, default: '' },
  ariaLabel: { type: String, default: '' }
})
const emit = defineEmits(['update:modelValue', 'change'])
const { t } = useI18n()
const open = ref(false)
const query = ref('')
const normalizedQuery = computed(() => query.value.trim().toLocaleLowerCase())
const visibleOptions = computed(() => {
  if (!props.searchable || !normalizedQuery.value) return props.options
  return props.options.filter(option =>
    String(option.label ?? '')
      .toLocaleLowerCase()
      .includes(normalizedQuery.value)
  )
})
const selectedOption = computed(() =>
  props.options.find(option => option.value === props.modelValue)
)
const displayText = computed(() => selectedOption.value?.label ?? '')
const resolvedPlaceholder = computed(() => props.placeholder || t('system.select.placeholder'))
const resolvedSearchPlaceholder = computed(
  () => props.searchPlaceholder || t('system.select.search')
)
const resolvedAriaLabel = computed(
  () => props.ariaLabel || props.placeholder || t('system.select.placeholder')
)
const inputClass = computed(() =>
  props.searchable
    ? 'order-1 mb-2 h-[var(--density-control-height)] w-full shrink-0 rounded-md border border-input bg-background px-3 text-sm'
    : 'order-1 absolute left-0 top-0 size-px overflow-hidden whitespace-nowrap border-0 p-0 opacity-0'
)
const optionKey = (option, index) => `${typeof option.value}:${String(option.value)}:${index}`
const selectOption = option => {
  if (!option || option.disabled) return
  emit('update:modelValue', option.value)
  emit('change', option.value)
  open.value = false
}

watch(open, value => {
  if (!value) query.value = ''
})
</script>
