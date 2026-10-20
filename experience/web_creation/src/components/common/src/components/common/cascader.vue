<template>
  <PopoverRoot v-model:open="open">
    <PopoverTrigger as-child
      ><Button
        type="button"
        variant="outline"
        class="w-full justify-between"
        :disabled="disabled"
        data-test="cascader-trigger"
        ><span class="truncate">{{ displayText || resolvedPlaceholder }}</span
        ><IconChevronDown class="app-icon app-icon--sm" aria-hidden="true" /></Button
    ></PopoverTrigger>
    <PopoverPortal>
      <PopoverContent
        data-test="cascader-popover"
        class="z-50 min-w-[var(--cascader-min-width)] rounded-md border border-border bg-popover p-2 text-popover-foreground shadow-lg"
        align="start"
        :side-offset="4"
      >
        <ComboboxRoot
          :model-value="undefined"
          :ignore-filter="true"
          class="flex max-h-64 flex-col"
          data-reka-combobox
          @update:model-value="selectSearchResult"
        >
          <ComboboxInput
            v-model="query"
            data-test="cascader-search"
            class="cascader__search mb-2 w-full rounded-md border border-input bg-background px-3 text-sm"
            :placeholder="resolvedSearchPlaceholder"
          />
          <ComboboxContent
            v-if="query"
            data-test="cascader-search-results"
            class="max-h-64 min-h-0 overflow-auto"
          >
            <ComboboxEmpty
              v-if="!searchResults.length"
              class="p-3 text-center text-sm text-muted-foreground"
              >{{ $t('system.select.noResults') }}</ComboboxEmpty
            >
            <ComboboxItem
              v-for="entry in searchResults"
              :key="entry.key"
              :value="entry"
              :text-value="entry.label"
              class="cursor-pointer rounded px-2 py-1.5 text-sm data-[highlighted]:bg-accent"
              >{{ entry.label }}</ComboboxItem
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
        <div
          v-if="!query"
          class="flex min-h-48 divide-x divide-border overflow-auto"
          data-reka-tree
        >
          <TreeRoot
            v-for="(column, level) in columns"
            :key="level"
            :items="column"
            :get-key="getKey"
            :get-children="getChildren"
            class="min-w-44 p-1"
          >
            <template #default="{ flattenItems }">
              <TreeItem
                v-for="entry in flattenItems.filter(item => item.level === 1)"
                :key="entry._id"
                v-bind="entry.bind"
                as-child
                @select="selectColumn($event, entry.value, level)"
              >
                <button
                  type="button"
                  class="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                  :aria-busy="entry.value.loading || undefined"
                >
                  <span>{{ entry.value.label }}</span
                  ><IconLoaderCircle
                    v-if="entry.value.loading"
                    class="app-icon app-icon--sm animate-spin"
                    aria-hidden="true"
                  /><IconChevronRight
                    v-else-if="entry.value.children?.length || entry.value.async"
                    class="app-icon app-icon--sm"
                    aria-hidden="true"
                  /><IconCheck
                    v-else-if="isSelected([...activePath.slice(0, level), entry.value.value])"
                    class="app-icon app-icon--sm"
                    aria-hidden="true"
                  />
                </button>
              </TreeItem>
            </template>
          </TreeRoot>
        </div>
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
import IconCheck from '~icons/lucide/check'
import IconChevronDown from '~icons/lucide/chevron-down'
import IconChevronRight from '~icons/lucide/chevron-right'
import IconLoaderCircle from '~icons/lucide/loader-circle'
import { Button } from '@/components/ui/button'
import { loadTreeChildren } from './tree-select-model'
import { filterCascaderPaths, flattenPaths, toggleCascaderPath } from './cascader-model'

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
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
const activePath = ref([])
const getKey = item => String(item.value)
const getChildren = () => undefined
const findByValue = (items, value) => (items || []).find(item => item.value === value)
const columns = computed(() => {
  const result = [localOptions.value]
  let items = localOptions.value
  for (const value of activePath.value) {
    const item = findByValue(items, value)
    if (!item?.children?.length) break
    result.push(item.children)
    items = item.children
  }
  return result
})
const searchResults = computed(() => filterCascaderPaths(localOptions.value, query.value))
const allPaths = computed(() => flattenPaths(localOptions.value))
const loadingEntries = computed(() => allPaths.value.filter(entry => entry.item.loading))
const loadingStatus = computed(() =>
  loadingEntries.value.map(entry => t('system.select.loading', { label: entry.label })).join(' ')
)
const normalizedValue = computed(() => (props.multiple ? props.modelValue : [props.modelValue]))
const isSelected = path =>
  normalizedValue.value.some(item => Array.isArray(item) && item.join('/') === path.join('/'))
const displayText = computed(() =>
  normalizedValue.value
    .map(path => allPaths.value.find(entry => entry.path.join('/') === path?.join('/'))?.label)
    .filter(Boolean)
    .join(', ')
)
const resolvedPlaceholder = computed(() => props.placeholder || t('system.select.placeholder'))
const resolvedSearchPlaceholder = computed(
  () => props.searchPlaceholder || t('system.select.searchPaths')
)
const commit = path => {
  const value = toggleCascaderPath(props.modelValue, path, props.multiple)
  emit('update:modelValue', value)
  emit('change', value)
  if (!props.multiple) open.value = false
}
const choose = async (item, level) => {
  const path = [...activePath.value.slice(0, level), item.value]
  if (item.async) await loadTreeChildren(item, props.loadChildren)
  if (item.children?.length) activePath.value = path
  else commit(path)
}
const selectColumn = (event, item, level) => {
  event.preventDefault()
  return choose(item, level).catch(() => undefined)
}
const selectSearchResult = entry => {
  if (entry) commit(entry.path)
}
</script>
