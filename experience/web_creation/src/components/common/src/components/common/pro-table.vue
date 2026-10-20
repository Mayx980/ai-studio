<template>
  <section
    class="pro-table"
    data-component="pro-table"
    :data-context-identity="contextIdentity"
    :data-vertical-scroll-owner="verticalScrollOwner"
    :data-virtualized="hasInternalScroll"
    :data-row-hover="rowHover"
    :data-pinning-active="canPinColumns"
    :aria-busy="loading || undefined"
  >
    <div class="pro-table__tools">
      <div class="flex items-center gap-2">
        <span class="text-sm text-muted-foreground">{{ densityLabel }}</span>
        <Transition name="pro-table-refresh">
          <span
            v-if="isRefreshing"
            class="pro-table__refresh text-sm text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            {{ $t('system.table.refreshing') }}
          </span>
        </Transition>
        <select
          v-model="density"
          class="rounded border border-input bg-background px-2 text-sm"
          :style="{ height: `${controlHeight}px` }"
          :aria-label="$t('system.table.densityLabel')"
        >
          <option value="compact">{{ $t('system.table.compact') }}</option>
          <option value="default">{{ $t('system.table.default') }}</option>
        </select>
      </div>
      <details class="relative">
        <summary
          class="flex cursor-pointer items-center rounded border border-input px-3 text-sm"
          :style="{ height: `${controlHeight}px` }"
        >
          {{ $t('system.table.columns') }}
        </summary>
        <div
          class="absolute right-0 z-20 mt-1 min-w-40 rounded border border-border bg-popover p-2 shadow-lg"
        >
          <label
            v-for="column in table.getAllLeafColumns()"
            :key="column.id"
            class="flex items-center gap-2 px-1 py-1 text-sm"
          >
            <input
              type="checkbox"
              :checked="column.getIsVisible()"
              :disabled="!column.getCanHide()"
              @change="column.toggleVisibility($event.target.checked)"
            />
            <span>{{ column.columnDef.header }}</span>
          </label>
        </div>
      </details>
    </div>

    <div
      v-if="selectedRows.length"
      class="pro-table__batch"
      data-test="batch-bar"
      :aria-disabled="interactionLocked || undefined"
      :inert="interactionLocked || undefined"
    >
      <span>{{ $t('system.table.selected', { count: selectedRows.length }) }}</span
      ><slot name="batch" :rows="selectedRows"></slot>
    </div>

    <div v-if="error" class="pro-table__state">
      <slot name="error"><ErrorState :message="error" @retry="$emit('retry')" /></slot>
    </div>
    <div v-else-if="showSkeleton && !rows.length" class="pro-table__state flex-col space-y-2 p-3">
      <slot name="loading"
        ><Skeleton
          v-for="index in 6"
          :key="index"
          class="w-full"
          :style="{ height: `${densitySize}px` }"
      /></slot>
    </div>
    <div v-else-if="loading && !rows.length" class="pro-table__state" aria-hidden="true"></div>
    <div v-else-if="!rows.length" class="pro-table__state">
      <slot name="empty"><EmptyState /></slot>
    </div>
    <template v-else>
      <div class="pro-table__header-shell">
        <div ref="headerViewport" class="pro-table__header-viewport">
          <div
            class="pro-table__header"
            :style="{ ...gridStyle, minHeight: `${headerHeight}px` }"
            role="row"
          >
            <div v-if="selectable" class="pro-table__cell pro-table__select" role="columnheader">
              <Checkbox
                :model-value="table.getIsAllRowsSelected()"
                :indeterminate="someRowsSelected"
                :disabled="interactionLocked"
                :aria-label="$t('system.table.selectAll')"
                @update:model-value="table.toggleAllRowsSelected($event)"
              />
            </div>
            <div
              v-for="column in visibleColumns"
              :key="column.id"
              class="pro-table__cell font-medium"
              :style="pinnedStyle(column, 'header')"
              :data-table-action-column="column.columnDef.meta?.actionColumn || undefined"
              role="columnheader"
              :aria-label="String(column.columnDef.header)"
            >
              <span class="pro-table__heading" :title="String(column.columnDef.header)">
                {{ column.columnDef.header }}
              </span>
              <button
                v-if="column.columnDef.enableResizing !== false"
                type="button"
                class="pro-table__resize"
                :aria-label="`Resize ${column.columnDef.header}`"
                @pointerdown.stop.prevent="startResize($event, column)"
                @keydown.left.stop.prevent="resizeColumn(column, baseWidth(column) - 16)"
                @keydown.right.stop.prevent="resizeColumn(column, baseWidth(column) + 16)"
                @click.stop
              ></button>
            </div>
          </div>
        </div>
      </div>
      <div
        ref="viewport"
        class="pro-table__viewport"
        :class="{
          'pro-table__viewport--bounded': hasInternalScroll,
          'pro-table__viewport--page': !hasInternalScroll
        }"
        :style="viewportStyle"
        tabindex="0"
        :aria-label="$t('system.table.columns')"
        :aria-disabled="interactionLocked || undefined"
        :inert="interactionLocked || undefined"
        @scroll="syncHeaderScroll"
      >
        <div
          class="relative min-w-max"
          :style="hasInternalScroll ? { height: `${totalHeight}px` } : undefined"
        >
          <div
            v-for="virtualRow in virtualRows"
            :key="virtualRow.key"
            :ref="measureRow"
            :data-index="virtualRow.index"
            :class="[
              'pro-table__row',
              rows[virtualRow.index].getIsSelected() && 'pro-table__row--selected'
            ]"
            :style="{
              ...gridStyle,
              minHeight: `${densitySize}px`,
              position: hasInternalScroll ? 'absolute' : 'relative',
              transform: hasInternalScroll ? `translateY(${virtualRow.start}px)` : undefined
            }"
            role="row"
            :data-row-id="rows[virtualRow.index].id"
            :data-selected="rows[virtualRow.index].getIsSelected() || undefined"
          >
            <div v-if="selectable" class="pro-table__cell pro-table__select" role="cell">
              <Checkbox
                :model-value="rows[virtualRow.index].getIsSelected()"
                :disabled="interactionLocked"
                :aria-label="
                  $t('system.table.selectRow', {
                    id: rows[virtualRow.index].id
                  })
                "
                @update:model-value="rows[virtualRow.index].toggleSelected($event)"
              />
            </div>
            <div
              v-for="cell in orderedCells(rows[virtualRow.index])"
              :key="cell.id"
              class="pro-table__cell"
              :class="{ 'pro-table__cell--wrap': cell.column.columnDef.wrap }"
              :title="typeof cell.getValue() === 'string' ? cell.getValue() : undefined"
              :style="pinnedStyle(cell.column, 'body', rows[virtualRow.index].getIsSelected())"
              :data-table-action-column="cell.column.columnDef.meta?.actionColumn || undefined"
              role="cell"
              @dblclick="startEditing(rows[virtualRow.index], cell)"
            >
              <template v-if="editingCell === cell.id">
                <Input
                  v-model="draft"
                  :style="{ height: `${controlHeight}px` }"
                  autofocus
                  @blur="commitEdit(rows[virtualRow.index], cell)"
                  @keydown.enter.prevent="commitEdit(rows[virtualRow.index], cell)"
                  @keydown.escape.prevent="editingCell = ''"
                />
              </template>
              <template v-else>
                <button
                  v-if="cell.column.id === treeColumnId && rows[virtualRow.index].getCanExpand()"
                  type="button"
                  class="mr-1 rounded px-1"
                  :disabled="interactionLocked"
                  :style="{
                    marginInlineStart: `${rows[virtualRow.index].depth * 16}px`
                  }"
                  :aria-expanded="rows[virtualRow.index].getIsExpanded()"
                  :aria-label="
                    $t(
                      rows[virtualRow.index].getIsExpanded()
                        ? 'system.table.collapseRow'
                        : 'system.table.expandRow',
                      { id: rows[virtualRow.index].id }
                    )
                  "
                  @click="rows[virtualRow.index].toggleExpanded()"
                >
                  <IconChevronDown
                    v-if="rows[virtualRow.index].getIsExpanded()"
                    class="app-icon app-icon--sm"
                    aria-hidden="true"
                  /><IconChevronRight v-else class="app-icon app-icon--sm" aria-hidden="true" />
                </button>
                <div class="pro-table__content"><FlexRender :cell="cell" /></div>
              </template>
            </div>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  createExpandedRowModel,
  FlexRender,
  columnPinningFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  rowExpandingFeature,
  rowSelectionFeature,
  tableFeatures,
  useTable
} from '@tanstack/vue-table'
import { useVirtualizer } from '@tanstack/vue-virtual'
import IconChevronDown from '~icons/lucide/chevron-down'
import IconChevronRight from '~icons/lucide/chevron-right'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { usePageStore } from '@/stores/modules/page'
import { readCssLengthInPixels } from '@/styles/design-tokens'
import EmptyState from './empty-state.vue'
import ErrorState from './error-state.vue'

const props = defineProps({
  columns: { type: Array, required: true },
  data: { type: Array, default: () => [] },
  error: { type: String, default: '' },
  height: {
    type: Number,
    default: undefined,
    validator: value => value === undefined || (Number.isFinite(value) && value > 0)
  },
  loading: { type: Boolean, default: false },
  showSkeleton: { type: Boolean, default: false },
  contextIdentity: { type: [String, Number], default: 'default' },
  interactionLocked: { type: Boolean, default: false },
  rowHover: { type: Boolean, default: false },
  rowKey: { type: String, default: 'id' },
  selectable: { type: Boolean, default: true }
})
const emit = defineEmits(['edit', 'retry', 'selection-change'])
const { t } = useI18n()
const pageStore = usePageStore()
const density = computed({
  get: () => pageStore.density,
  set: value => pageStore.setDensity(value)
})
const densitySize = ref(0)
const headerHeight = ref(0)
const controlHeight = ref(0)
watch(
  density,
  () => {
    densitySize.value = readCssLengthInPixels('--density-table-row-height')
    headerHeight.value = readCssLengthInPixels('--density-table-header-height')
    controlHeight.value = readCssLengthInPixels('--density-control-height-sm')
  },
  { immediate: true, flush: 'sync' }
)
const densityLabel = computed(() =>
  t('system.table.density', { value: t(`system.table.${density.value}`) })
)
const data = computed(() => props.data)
const columns = computed(() =>
  props.columns.map(column => ({
    ...column,
    id: column.id || column.accessorKey,
    size: column.size || column.width || 160,
    minSize: column.minSize || column.minWidth || 80,
    enableHiding: column.enableHiding !== false,
    meta: {
      ...column.meta,
      actionColumn: column.actionColumn ?? column.meta?.actionColumn ?? false,
      toolColumn: column.toolColumn ?? column.meta?.toolColumn ?? false,
      editable: column.editable ?? column.meta?.editable
    }
  }))
)
const features = tableFeatures({
  rowExpandingFeature,
  expandedRowModel: createExpandedRowModel(),
  rowSelectionFeature,
  columnVisibilityFeature,
  columnPinningFeature,
  columnSizingFeature
})
const initialPinning = {
  start: columns.value
    .filter(column => column.pinned === 'left' || column.pinned === 'start')
    .map(column => column.id),
  end: columns.value
    .filter(column => column.pinned === 'right' || column.pinned === 'end')
    .map(column => column.id)
}
const table = useTable({
  features,
  columns,
  data,
  getRowId: row => String(row[props.rowKey]),
  getSubRows: row => row.children,
  initialState: { columnPinning: initialPinning }
})
const visibleColumns = computed(() => table.getVisibleLeafColumns())
const rows = computed(() => table.getRowModel().rows)
const orderedCells = row => {
  const cells = new Map(row.getVisibleCells().map(cell => [cell.column.id, cell]))
  return visibleColumns.value.map(column => cells.get(column.id))
}
const isRefreshing = computed(() => props.loading && rows.value.length > 0)
const hasInternalScroll = computed(() => Number.isFinite(props.height) && props.height > 0)
const verticalScrollOwner = computed(() => (hasInternalScroll.value ? 'table' : 'page'))
const viewportStyle = computed(() =>
  hasInternalScroll.value ? { height: `${props.height}px` } : undefined
)
const treeColumnId = computed(
  () =>
    props.columns.find(column => column.tree)?.id ||
    props.columns.find(column => column.tree)?.accessorKey ||
    ''
)
const headerViewport = ref(null)
const viewport = ref(null)
const viewportWidth = ref(0)
const resizedWidths = ref({})
const minimumWidth = column => column.columnDef.minSize
const maximumWidth = column => Math.max(minimumWidth(column), column.columnDef.maxSize || 2000)
const baseWidth = column =>
  Math.max(
    minimumWidth(column),
    Math.min(maximumWidth(column), resizedWidths.value[column.id] ?? column.getSize())
  )
const isToolColumn = column =>
  column.columnDef.meta?.actionColumn || column.columnDef.meta?.toolColumn
const columnWidths = computed(() => {
  const widths = new Map()
  let available = viewportWidth.value - (props.selectable ? 44 : 0)
  let pending = visibleColumns.value.filter(column => {
    if (!isToolColumn(column)) return true
    const width = baseWidth(column)
    widths.set(column.id, width)
    available -= width
    return false
  })
  // Scale business columns together, freezing each readable minimum before
  // redistributing the remaining space. Content never participates in sizing.
  while (pending.length) {
    const total = pending.reduce((sum, column) => sum + baseWidth(column), 0)
    const scale = Math.max(0, available) / total
    const atMinimum = pending.filter(column => baseWidth(column) * scale < minimumWidth(column))
    if (!atMinimum.length) {
      for (const column of pending) widths.set(column.id, baseWidth(column) * scale)
      break
    }
    for (const column of atMinimum) {
      widths.set(column.id, minimumWidth(column))
      available -= minimumWidth(column)
    }
    pending = pending.filter(column => !widths.has(column.id))
  }
  return widths
})
const columnWidth = column => columnWidths.value.get(column.id)
const gridStyle = computed(() => ({
  gridTemplateColumns: `${props.selectable ? '44px ' : ''}${visibleColumns.value.map(column => `${columnWidth(column)}px`).join(' ')}`
}))
const canPinColumns = computed(() => {
  const pinnedWidth = visibleColumns.value
    .filter(column => column.getIsPinned())
    .reduce((sum, column) => sum + columnWidth(column), 0)
  // Keep enough room to reveal every ordinary column in full while scrolling.
  const readableWidth = Math.max(
    0,
    ...visibleColumns.value.filter(column => !column.getIsPinned()).map(columnWidth)
  )
  return viewportWidth.value >= pinnedWidth + readableWidth + (props.selectable ? 44 : 0)
})
let observer
watch(
  viewport,
  element => {
    observer?.disconnect()
    if (!element) return
    const update = () => {
      viewportWidth.value = element.clientWidth
    }
    update()
    observer = new ResizeObserver(update)
    observer.observe(element)
  },
  { flush: 'post' }
)
const resizeColumn = (column, width) => {
  if (props.interactionLocked) return
  resizedWidths.value = {
    ...resizedWidths.value,
    [column.id]: Math.max(minimumWidth(column), Math.min(maximumWidth(column), width))
  }
  nextTick(() => rowVirtualizer.value.measure())
}
let stopResize = () => {}
const startResize = (event, column) => {
  if (props.interactionLocked) return
  stopResize()
  const start = event.clientX
  const width = baseWidth(column)
  const move = event => resizeColumn(column, width + event.clientX - start)
  stopResize = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', stopResize)
    window.removeEventListener('pointercancel', stopResize)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', stopResize)
  window.addEventListener('pointercancel', stopResize)
}
onBeforeUnmount(() => {
  observer?.disconnect()
  stopResize()
})
const syncHeaderScroll = () => {
  if (headerViewport.value && viewport.value) {
    headerViewport.value.scrollLeft = viewport.value.scrollLeft
  }
}
const rowVirtualizer = useVirtualizer(
  computed(() => ({
    count: hasInternalScroll.value ? rows.value.length : 0,
    enabled: hasInternalScroll.value,
    getScrollElement: () => viewport.value,
    estimateSize: () => densitySize.value,
    getItemKey: index => rows.value[index]?.id || index,
    overscan: 6
  }))
)
const allRows = () =>
  rows.value.map((row, index) => ({
    index,
    key: row.id,
    size: densitySize.value,
    start: index * densitySize.value
  }))
const virtualRows = computed(() => {
  if (!hasInternalScroll.value) return allRows()
  const measured = rowVirtualizer.value.getVirtualItems()
  return measured.length ? measured : allRows()
})
const measureRow = element => {
  if (hasInternalScroll.value && element) rowVirtualizer.value.measureElement(element)
}
const totalHeight = computed(() => {
  const contentHeight = rows.value.length * densitySize.value
  return hasInternalScroll.value
    ? Math.max(rowVirtualizer.value.getTotalSize(), contentHeight)
    : contentHeight
})
watch([density, hasInternalScroll, gridStyle], () =>
  nextTick(() => {
    rowVirtualizer.value.measure()
    syncHeaderScroll()
  })
)
const selectedRows = computed(() => {
  table.atoms.rowSelection.get()
  return table.getSelectedRowModel().flatRows.map(row => row.original)
})
watch(selectedRows, value => emit('selection-change', [...value]), {
  flush: 'post'
})
const someRowsSelected = computed(
  () => table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected()
)
const editingCell = ref('')
const draft = ref('')
const startEditing = (row, cell) => {
  if (props.interactionLocked || !cell.column.columnDef.meta?.editable) return
  editingCell.value = cell.id
  draft.value = String(cell.getValue() ?? '')
}
const commitEdit = (row, cell) => {
  if (editingCell.value !== cell.id) return
  if (props.interactionLocked) {
    editingCell.value = ''
    return
  }
  emit('edit', {
    row: row.original,
    column: cell.column.id,
    value: draft.value
  })
  editingCell.value = ''
}
watch(
  () => props.contextIdentity,
  () => {
    table.resetRowSelection()
    table.resetExpanded()
    editingCell.value = ''
    draft.value = ''
  }
)
watch(
  () => props.interactionLocked,
  value => {
    if (value) editingCell.value = ''
  }
)
const pinnedStyle = (column, surface = 'body', selected = false) => {
  const pinned = column.getIsPinned()
  if (!pinned || !canPinColumns.value) return {}
  const peers = visibleColumns.value.filter(item => item.getIsPinned() === pinned)
  const index = peers.findIndex(item => item.id === column.id)
  const before = peers.slice(0, index).reduce((sum, item) => sum + columnWidth(item), 0)
  const after = peers.slice(index + 1).reduce((sum, item) => sum + columnWidth(item), 0)
  return {
    position: 'sticky',
    insetInlineStart: pinned === 'start' ? `${before}px` : undefined,
    insetInlineEnd: pinned === 'end' ? `${after}px` : undefined,
    zIndex: surface === 'header' ? 6 : 3,
    background:
      surface === 'header'
        ? 'var(--muted)'
        : selected
          ? 'var(--brand-accent-subtle)'
          : 'var(--background)'
  }
}
</script>
