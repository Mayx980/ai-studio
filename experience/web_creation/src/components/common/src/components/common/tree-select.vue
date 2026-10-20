<template>
  <PopoverRoot v-model:open="open">
    <PopoverTrigger as-child>
      <Button
        type="button"
        variant="outline"
        class="w-full justify-between"
        :disabled="disabled"
        data-test="tree-select-trigger"
      >
        <span class="truncate">{{ displayText || resolvedPlaceholder }}</span
        ><IconChevronDown class="app-icon app-icon--sm" aria-hidden="true" />
      </Button>
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent
        data-test="tree-select-popover"
        class="z-50 w-[var(--reka-popover-trigger-width)] min-w-72 rounded-md border border-border bg-popover p-2 text-popover-foreground shadow-lg"
        align="start"
        :side-offset="4"
      >
        <ComboboxRoot
          :model-value="undefined"
          :ignore-filter="true"
          :open-on-focus="true"
          class="flex max-h-64 flex-col"
          data-reka-combobox
          @update:model-value="selectItem"
        >
          <ComboboxInput
            v-model="query"
            data-test="tree-select-search"
            class="tree-select__search mb-2 w-full rounded-md border border-input bg-background px-3 text-sm"
            :placeholder="resolvedSearchPlaceholder"
          />
          <ComboboxContent
            v-if="query"
            data-test="tree-select-search-results"
            class="max-h-64 min-h-0 overflow-auto"
          >
            <ComboboxEmpty
              v-if="!searchResults.length"
              class="p-3 text-center text-sm text-muted-foreground"
              >{{ $t('system.select.noResults') }}</ComboboxEmpty
            >
            <ComboboxItem
              v-for="item in searchResults"
              :key="item.value"
              :value="item"
              :text-value="item.label"
              class="cursor-pointer rounded px-2 py-1.5 text-sm data-[highlighted]:bg-accent"
              >{{ item.label }}</ComboboxItem
            >
          </ComboboxContent>
        </ComboboxRoot>
        <span
          v-if="loadingStatus"
          class="sr-only"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          >{{ loadingStatus }}</span
        >
        <TreeRoot
          v-if="!query"
          :model-value="selectedObjects"
          :items="localOptions"
          :multiple="multiple"
          :get-key="getKey"
          :get-children="getChildren"
          selection-behavior="toggle"
          data-reka-tree
          @update:model-value="selectTree"
        >
          <template #default="{ flattenItems }">
            <TreeItem
              v-for="item in flattenItems"
              :key="item._id"
              v-bind="item.bind"
              v-slot="{ isExpanded, isSelected, handleToggle }"
              as-child
              @toggle="loadChildrenSafely(item.value)"
            >
              <div
                class="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
                :style="{ paddingInlineStart: `${item.level * 16 + 8}px` }"
              >
                <button
                  v-if="item.hasChildren || item.value.async"
                  type="button"
                  class="flex size-[var(--icon-sm)] items-center justify-center"
                  tabindex="-1"
                  :aria-label="$t('system.select.toggle', { label: item.value.label })"
                  :aria-busy="item.value.loading || undefined"
                  @click.stop="toggleChildren(item.value, handleToggle)"
                >
                  <IconLoaderCircle
                    v-if="item.value.loading"
                    class="app-icon app-icon--sm animate-spin"
                    aria-hidden="true"
                  /><IconChevronDown
                    v-else-if="isExpanded"
                    class="app-icon app-icon--sm"
                    aria-hidden="true"
                  /><IconChevronRight
                    v-else
                    class="app-icon app-icon--sm"
                    aria-hidden="true"
                  /></button
                ><span v-else class="block size-[var(--icon-sm)]"></span>
                <input
                  v-if="multiple"
                  type="checkbox"
                  :checked="isSelected"
                  tabindex="-1"
                  aria-hidden="true"
                />
                <span class="min-w-0 flex-1 truncate text-left">{{ item.value.label }}</span>
              </div>
            </TreeItem>
          </template>
        </TreeRoot>
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
  PopoverTrigger,
  TreeItem,
  TreeRoot
} from 'reka-ui'
import IconChevronDown from '~icons/lucide/chevron-down'
import IconChevronRight from '~icons/lucide/chevron-right'
import IconLoaderCircle from '~icons/lucide/loader-circle'
import { Button } from '@/components/ui/button'
import { filterTree, flattenTree, loadTreeChildren, toggleTreeValue } from './tree-select-model'

const props = defineProps({
  modelValue: { type: [String, Number, Array], default: '' },
  options: { type: Array, default: () => [] },
  multiple: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  loadChildren: { type: Function, default: null },
  placeholder: { type: String, default: '' },
  searchPlaceholder: { type: String, default: '' }
})
const emit = defineEmits(['update:modelValue', 'change'])
const { t } = useI18n()
const clone = items =>
  items.map(item => ({ ...item, children: item.children ? clone(item.children) : item.children }))
const localOptions = ref(clone(props.options))
watch(
  () => props.options,
  items => {
    localOptions.value = clone(items)
  },
  { deep: true }
)
const open = ref(false)
const query = ref('')
const allItems = computed(() => flattenTree(localOptions.value, []))
const loadingItems = computed(() => allItems.value.filter(item => item.loading))
const loadingStatus = computed(() =>
  loadingItems.value.map(item => t('system.select.loading', { label: item.label })).join(' ')
)
const searchResults = computed(() =>
  flattenTree(filterTree(localOptions.value, query.value), []).filter(item => !item.disabled)
)
const selectedValues = computed(() =>
  props.multiple ? (Array.isArray(props.modelValue) ? props.modelValue : []) : [props.modelValue]
)
const selectedObjects = computed(() => {
  const found = allItems.value.filter(item => selectedValues.value.includes(item.value))
  return props.multiple ? found : found[0]
})
const displayText = computed(() =>
  allItems.value
    .filter(item => selectedValues.value.includes(item.value))
    .map(item => item.label)
    .join(', ')
)
const resolvedPlaceholder = computed(() => props.placeholder || t('system.select.placeholder'))
const resolvedSearchPlaceholder = computed(
  () => props.searchPlaceholder || t('system.select.search')
)
const getKey = item => String(item.value)
const getChildren = item => item.children
const commit = value => {
  emit('update:modelValue', value)
  emit('change', value)
  if (!props.multiple) open.value = false
}
const selectItem = item => {
  if (item) commit(toggleTreeValue(props.modelValue, item.value, props.multiple))
}
const selectTree = items => {
  const values = Array.isArray(items) ? items.map(item => item.value) : items?.value
  commit(values ?? (props.multiple ? [] : ''))
}
const loadChildren = item => loadTreeChildren(item, props.loadChildren)
const loadChildrenSafely = item => loadChildren(item).catch(() => undefined)
const toggleChildren = (item, handleToggle) =>
  loadChildren(item)
    .then(handleToggle)
    .catch(() => undefined)
</script>
