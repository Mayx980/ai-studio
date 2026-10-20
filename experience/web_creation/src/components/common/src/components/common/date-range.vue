<template>
  <div ref="root" class="date-range">
    <PopoverRoot :open="open" @update:open="setOpen">
      <PopoverTrigger as-child>
        <button
          :id="triggerId"
          type="button"
          class="date-range__trigger"
          :disabled="disabled"
          :aria-expanded="open"
          :aria-invalid="Boolean(error) || undefined"
          :aria-describedby="error ? errorId : undefined"
          aria-haspopup="dialog"
          data-test="date-range-trigger"
        >
          <IconCalendarRange class="app-icon app-icon--sm" aria-hidden="true" />
          <span class="date-range__value" :class="{ 'is-placeholder': !draft[0] }">
            {{ triggerLabel }}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverPortal>
        <PopoverContent
          class="date-range__popover"
          role="dialog"
          :aria-label="t('system.dateRange.dialogLabel')"
          align="start"
          side="bottom"
          sticky="always"
          :avoid-collisions="true"
          :collision-padding="16"
          :side-offset="4"
          data-test="date-range-popover"
          @open-auto-focus="handleOpenAutoFocus"
        >
          <div class="date-range__panel">
            <aside
              v-if="presets.length"
              class="date-range__presets"
              :aria-label="t('system.dateRange.presetsLabel')"
            >
              <button
                v-for="(preset, index) in presets"
                :key="preset.id || `${preset.label}-${index}`"
                type="button"
                class="date-range__preset"
                :data-test="`date-range-preset-${preset.id || index}`"
                @click="choosePreset(index)"
              >
                {{ preset.label }}
              </button>
            </aside>

            <div class="date-range__calendar-area">
              <div class="date-range__selection">
                <label
                  class="date-range__selection-surface"
                  :class="{ active: activeBoundary === 0 }"
                  data-focus-surface="composite"
                  data-test="date-range-start-surface"
                  @click="activateBoundary(0)"
                >
                  <small>{{ resolvedLabels[0] }}</small>
                  <input
                    ref="startEditor"
                    :value="editorValues[0]"
                    type="date"
                    class="date-range__editor"
                    :aria-label="t('system.dateRange.editStart')"
                    data-focus-surface-control
                    data-test="date-range-start-editor"
                    @focus="activateBoundary(0)"
                    @input="updateEditor(0, $event.target.value)"
                    @change="commitEditor(0)"
                    @keydown.enter.prevent="commitEditor(0)"
                  />
                </label>
                <IconArrowRight class="app-icon app-icon--sm" aria-hidden="true" />
                <label
                  class="date-range__selection-surface"
                  :class="{ active: activeBoundary === 1 }"
                  data-focus-surface="composite"
                  data-test="date-range-end-surface"
                  @click="activateBoundary(1)"
                >
                  <small>{{ resolvedLabels[1] }}</small>
                  <input
                    ref="endEditor"
                    :value="editorValues[1]"
                    type="date"
                    :min="draft[0] || undefined"
                    class="date-range__editor"
                    :aria-label="t('system.dateRange.editEnd')"
                    data-focus-surface-control
                    data-test="date-range-end-editor"
                    @focus="activateBoundary(1)"
                    @input="updateEditor(1, $event.target.value)"
                    @change="commitEditor(1)"
                    @keydown.enter.prevent="commitEditor(1)"
                  />
                </label>
              </div>
              <p
                class="date-range__selection-hint"
                :class="{ 'is-error': editorError }"
                role="status"
                data-test="date-range-boundary-hint"
              >
                {{ editorError || boundaryHint }}
              </p>

              <div class="date-range__calendars" data-test="date-range-calendars">
                <section
                  v-for="(month, monthIndex) in visibleMonths"
                  :key="`${monthIndex}-${month.format('YYYY-MM')}`"
                  class="date-range__month"
                  :aria-label="monthAccessibleLabel(month, monthIndex)"
                  :data-month="month.format('YYYY-MM')"
                  :data-month-index="monthIndex"
                  data-test="date-range-month"
                >
                  <header>
                    <button
                      v-if="monthIndex === 0"
                      type="button"
                      class="date-range__month-button"
                      :aria-label="t('system.dateRange.previousMonths')"
                      data-test="date-range-previous"
                      @click="moveMonths(-1)"
                    >
                      <IconChevronLeft class="app-icon app-icon--sm" aria-hidden="true" />
                    </button>
                    <span>{{ monthLabel(month) }}</span>
                    <button
                      v-if="monthIndex === 1"
                      type="button"
                      class="date-range__month-button"
                      :aria-label="t('system.dateRange.nextMonths')"
                      data-test="date-range-next"
                      @click="moveMonths(1)"
                    >
                      <IconChevronRight class="app-icon app-icon--sm" aria-hidden="true" />
                    </button>
                  </header>
                  <div class="date-range__weekdays" aria-hidden="true">
                    <span v-for="weekday in weekdays" :key="weekday">{{ weekday }}</span>
                  </div>
                  <div class="date-range__days">
                    <button
                      v-for="day in calendarDays(month)"
                      :key="day.value"
                      type="button"
                      class="date-range__day"
                      :disabled="day.disabled"
                      :aria-label="day.label"
                      :aria-pressed="day.selected"
                      :data-date="day.value"
                      :data-in-range="day.inRange || undefined"
                      :class="{
                        'is-outside': day.outside,
                        'is-today': day.today,
                        'is-selected': day.selected,
                        'is-in-range': day.inRange,
                        'is-preview-end': day.previewEnd
                      }"
                      @mouseenter="previewDay(day.value)"
                      @mouseleave="clearPreview"
                      @click="chooseDay(day.value)"
                    >
                      {{ day.date }}
                    </button>
                  </div>
                </section>
              </div>

              <footer class="date-range__footer">
                <span data-test="date-range-summary">{{ selectionHint }}</span>
                <div class="date-range__footer-actions">
                  <Button
                    v-if="allowOpenEnd && draft[0]"
                    type="button"
                    size="sm"
                    variant="ghost"
                    data-test="date-range-open-end"
                    @click="applyOpenEnd"
                  >
                    {{ t('system.dateRange.openEndAction') }}
                  </Button>
                  <Button
                    v-if="clearable && draft.some(Boolean)"
                    type="button"
                    size="sm"
                    variant="ghost"
                    data-test="date-range-clear"
                    @click="clear"
                  >
                    {{ t('system.dateRange.clear') }}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    data-test="date-range-cancel"
                    @click="cancel"
                  >
                    {{ t('system.cancel') }}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    :disabled="!valid"
                    data-test="date-range-confirm"
                    @click="confirm"
                  >
                    {{ t('system.dateRange.done') }}
                  </Button>
                </div>
              </footer>
            </div>
          </div>
        </PopoverContent>
      </PopoverPortal>
    </PopoverRoot>
    <p v-if="error" :id="errorId" role="alert" class="date-range__error">
      {{ error }}
    </p>
  </div>
</template>

<script setup>
import dayjs from 'dayjs'
import { computed, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import IconArrowRight from '~icons/lucide/arrow-right'
import IconCalendarRange from '~icons/lucide/calendar-range'
import IconChevronLeft from '~icons/lucide/chevron-left'
import IconChevronRight from '~icons/lucide/chevron-right'
import { Button } from '@/components/ui/button'
import { normalizeDateRange, normalizeDateValue, startOfMondayWeek } from './date-range-model'

const props = defineProps({
  id: { type: String, default: '' },
  modelValue: { type: Array, default: () => [] },
  labels: { type: Array, default: () => [] },
  presets: { type: Array, default: () => [] },
  unavailable: { type: Function, default: undefined },
  clearable: { type: Boolean, default: true },
  allowOpenEnd: { type: Boolean, default: false },
  required: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue'])
const { t } = useI18n()
const generatedId = useId().replaceAll(':', '')
const triggerId = computed(() => props.id || `date-range-${generatedId}`)
const errorId = computed(() => `${triggerId.value}-error`)
const root = ref(null)
const startEditor = ref(null)
const endEditor = ref(null)
const open = ref(false)
const draft = ref(['', ''])
const editorValues = ref(['', ''])
const editorError = ref('')
const error = ref('')
const activeBoundary = ref(0)
const hoverDate = ref('')
const viewMonth = ref(dayjs().startOf('month'))

const resolvedLabels = computed(() => [
  props.labels[0] || t('system.dateRange.startDate'),
  props.labels[1] || t('system.dateRange.endDate')
])
const weekdays = computed(() => [
  t('system.dateRange.weekdays.monday'),
  t('system.dateRange.weekdays.tuesday'),
  t('system.dateRange.weekdays.wednesday'),
  t('system.dateRange.weekdays.thursday'),
  t('system.dateRange.weekdays.friday'),
  t('system.dateRange.weekdays.saturday'),
  t('system.dateRange.weekdays.sunday')
])
const unavailableDate = value => Boolean(value && props.unavailable?.(dayjs(value).toDate()))
const draftError = computed(() => {
  if (editorError.value) return editorError.value
  if (!draft.value.some(Boolean))
    return props.required ? t('system.dateRange.errors.startRequired') : ''
  if (!draft.value[0]) return t('system.dateRange.errors.startRequired')
  if (!props.allowOpenEnd && !draft.value[1]) return t('system.dateRange.errors.incomplete')
  if (draft.value[1] && draft.value[0] > draft.value[1]) {
    return t('system.dateRange.errors.endBeforeStart')
  }
  if (draft.value.some(unavailableDate)) return t('system.dateRange.errors.unavailable')
  return ''
})
const valid = computed(() => !draftError.value)
const visibleMonths = computed(() => [viewMonth.value, viewMonth.value.add(1, 'month')])
const previewRange = computed(() => {
  const start = draft.value[0]
  const end = activeBoundary.value === 1 && hoverDate.value ? hoverDate.value : draft.value[1]
  if (!start || !end) return ['', '']
  return start <= end ? [start, end] : [end, start]
})
const triggerLabel = computed(() => {
  if (!draft.value[0]) {
    return t('system.dateRange.placeholder', {
      start: resolvedLabels.value[0],
      end: resolvedLabels.value[1]
    })
  }
  return t('system.dateRange.value', {
    start: draft.value[0],
    end: draft.value[1] || t('system.dateRange.openEnd')
  })
})
const boundaryHint = computed(() =>
  t('system.dateRange.settingBoundary', {
    boundary: resolvedLabels.value[activeBoundary.value]
  })
)
const selectionHint = computed(() => {
  if (!draft.value[0]) return t('system.dateRange.hints.chooseStart')
  if (!draft.value[1]) {
    return t(
      props.allowOpenEnd
        ? 'system.dateRange.hints.chooseEndOrOpen'
        : 'system.dateRange.hints.chooseEnd'
    )
  }
  return t('system.dateRange.summary', {
    start: draft.value[0],
    end: draft.value[1]
  })
})

const resetDraftFromModel = () => {
  draft.value = normalizeDateRange(props.modelValue)
  editorValues.value = [...draft.value]
  editorError.value = ''
  error.value = ''
}
const syncViewMonths = (boundary = 0) => {
  const startMonth = dayjs(draft.value[0] || undefined).startOf('month')
  const endMonth = draft.value[1] ? dayjs(draft.value[1]).startOf('month') : null
  if (boundary === 1 && endMonth?.isAfter(startMonth, 'month')) {
    viewMonth.value = endMonth.subtract(1, 'month')
    return
  }
  viewMonth.value = startMonth
}
const setOpen = value => {
  if (value && !props.disabled) {
    resetDraftFromModel()
    activeBoundary.value = draft.value[0] && !draft.value[1] ? 1 : 0
    hoverDate.value = ''
    syncViewMonths(activeBoundary.value)
    open.value = true
    return
  }
  open.value = false
  hoverDate.value = ''
  resetDraftFromModel()
}
const handleOpenAutoFocus = event => {
  event.preventDefault()
  const editor = activeBoundary.value === 1 ? endEditor.value : startEditor.value
  editor?.focus()
}
const validate = () => {
  error.value = draftError.value
  return valid.value
}
defineExpose({ validate, valid })

watch(
  () => props.modelValue,
  () => {
    if (!open.value) resetDraftFromModel()
  },
  { immediate: true, deep: true }
)
watch(
  () => props.disabled,
  value => {
    if (value && open.value) setOpen(false)
  }
)

const clear = () => {
  draft.value = ['', '']
  editorValues.value = ['', '']
  activeBoundary.value = 0
  hoverDate.value = ''
  editorError.value = ''
  error.value = ''
  syncViewMonths()
}
const choosePreset = index => {
  const preset = props.presets[index]
  const values = typeof preset?.value === 'function' ? preset.value() : preset?.value
  draft.value = normalizeDateRange(values)
  editorValues.value = [...draft.value]
  activeBoundary.value = draft.value[0] && !draft.value[1] ? 1 : 0
  hoverDate.value = ''
  editorError.value = ''
  error.value = ''
  editorError.value = draftError.value
  syncViewMonths(activeBoundary.value)
}
const applyOpenEnd = () => {
  draft.value[1] = ''
  editorValues.value[1] = ''
  activeBoundary.value = 1
  hoverDate.value = ''
  editorError.value = ''
  error.value = ''
}
const cancel = () => setOpen(false)
const confirm = () => {
  if (!validate()) return
  const value = draft.value.some(Boolean) ? [...draft.value] : []
  emit('update:modelValue', value)
  open.value = false
  hoverDate.value = ''
  error.value = ''
}
const activateBoundary = index => {
  activeBoundary.value = index
  hoverDate.value = ''
  editorError.value = ''
  syncViewMonths(index)
}
const updateEditor = (index, value) => {
  editorValues.value[index] = value
  editorError.value = ''
  error.value = ''
}
const commitEditor = index => {
  const raw = editorValues.value[index].trim()
  if (!raw) {
    draft.value[index] = ''
    if (index === 0) {
      draft.value[1] = ''
      editorValues.value[1] = ''
    }
    activeBoundary.value = index === 0 ? 0 : 1
    editorError.value = ''
    syncViewMonths(index)
    return
  }
  const value = normalizeDateValue(raw)
  if (!value) {
    editorError.value = t('system.dateRange.errors.invalidDate')
    return
  }
  if (unavailableDate(value)) {
    editorError.value = t('system.dateRange.errors.unavailable')
    return
  }
  if (index === 1 && !draft.value[0]) {
    editorError.value = t('system.dateRange.errors.startRequired')
    return
  }
  if (index === 1 && value < draft.value[0]) {
    editorError.value = t('system.dateRange.errors.endBeforeStart')
    return
  }
  draft.value[index] = value
  editorValues.value[index] = value
  if (index === 0 && draft.value[1] && draft.value[1] < value) {
    draft.value[1] = ''
    editorValues.value[1] = ''
    activeBoundary.value = 1
  }
  editorError.value = ''
  hoverDate.value = ''
  syncViewMonths(index)
}
const chooseDay = value => {
  if (activeBoundary.value === 0 || !draft.value[0]) {
    draft.value = [value, '']
    editorValues.value = [...draft.value]
    activeBoundary.value = 1
    hoverDate.value = ''
    editorError.value = ''
    error.value = ''
    return
  }
  draft.value = value < draft.value[0] ? [value, draft.value[0]] : [draft.value[0], value]
  editorValues.value = [...draft.value]
  activeBoundary.value = 0
  hoverDate.value = ''
  editorError.value = ''
  error.value = ''
}
const moveMonths = offset => {
  viewMonth.value = viewMonth.value.add(offset, 'month')
  hoverDate.value = ''
}
const previewDay = value => {
  if (activeBoundary.value === 1 && draft.value[0]) hoverDate.value = value
}
const clearPreview = () => {
  hoverDate.value = ''
}
const monthLabel = month =>
  t('system.dateRange.month', { year: month.year(), month: month.month() + 1 })
const monthAccessibleLabel = (month, monthIndex) =>
  t('system.dateRange.calendarLabel', {
    position: t(
      monthIndex === 0 ? 'system.dateRange.leftCalendar' : 'system.dateRange.rightCalendar'
    ),
    month: monthLabel(month)
  })
const calendarDays = month => {
  const monthStart = month.startOf('month')
  const gridStart = startOfMondayWeek(monthStart)
  return Array.from({ length: 42 }, (_, index) => {
    const current = gridStart.add(index, 'day')
    const value = current.format('YYYY-MM-DD')
    const outside = !current.isSame(monthStart, 'month')
    return {
      value,
      date: current.date(),
      label: t('system.dateRange.selectDate', { date: value }),
      outside,
      today: current.isSame(dayjs(), 'day'),
      selected: value === draft.value[0] || value === draft.value[1],
      inRange: Boolean(
        previewRange.value[0] && value > previewRange.value[0] && value < previewRange.value[1]
      ),
      previewEnd: Boolean(
        activeBoundary.value === 1 && hoverDate.value && value === hoverDate.value
      ),
      disabled: outside || unavailableDate(value)
    }
  })
}
</script>

<style scoped>
@reference '@/styles/tokens.css';

.date-range {
  width: min(var(--field-width-range), 100%);
  min-width: 0;
}

.date-range__trigger {
  display: flex;
  width: 100%;
  min-width: 0;
  height: var(--density-control-height);
  align-items: center;
  gap: var(--space-2);
  border: var(--border-width) solid var(--input);
  border-radius: var(--radius-sm);
  background: var(--background);
  padding-inline: var(--space-3);
  color: var(--foreground);
  text-align: start;
  transition:
    border-color var(--motion-duration-fast) var(--motion-ease-standard),
    background var(--motion-duration-fast) var(--motion-ease-standard);
}

.date-range__trigger:hover:not(:disabled) {
  background: var(--accent);
}

.date-range__trigger:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.date-range__value {
  min-width: 0;
  flex: 1;
  white-space: nowrap;
  font-size: var(--font-size-caption);
  font-variant-numeric: tabular-nums;
}

.date-range__value.is-placeholder {
  color: var(--muted-foreground);
}

.date-range__popover {
  z-index: 50;
  width: min(45rem, calc(100vw - var(--space-8)));
  max-width: calc(100vw - var(--space-8));
  max-height: min(
    42rem,
    var(--reka-popover-content-available-height, calc(100svh - var(--space-8)))
  );
  overflow: auto;
  border: var(--border-width) solid var(--border);
  border-radius: var(--radius-md);
  background: var(--popover);
  padding: var(--space-3);
  color: var(--popover-foreground);
  box-shadow: var(--shadow-lg);
}

.date-range__panel {
  display: flex;
  min-width: 0;
}

.date-range__presets {
  display: flex;
  width: 7rem;
  flex: none;
  flex-direction: column;
  gap: var(--space-1);
  border-inline-end: var(--border-width) solid var(--border);
  padding-inline-end: var(--space-3);
}

.date-range__preset,
.date-range__month-button,
.date-range__day {
  border-radius: var(--radius-sm);
  transition:
    color var(--motion-duration-fast) var(--motion-ease-standard),
    background var(--motion-duration-fast) var(--motion-ease-standard);
}

.date-range__preset {
  min-height: var(--density-control-height-sm);
  padding-inline: var(--space-2);
  color: var(--muted-foreground);
  text-align: start;
  font-size: var(--font-size-caption);
}

.date-range__preset:hover,
.date-range__month-button:hover,
.date-range__day:not(:disabled):hover {
  background: var(--accent);
  color: var(--accent-foreground);
}

.date-range__calendar-area {
  min-width: 0;
  flex: 1;
  padding-inline-start: var(--space-3);
}

.date-range__selection {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: var(--space-2);
  border-radius: var(--radius-sm);
  background: var(--muted);
  padding: var(--space-2) var(--space-3);
}

.date-range__selection-surface {
  min-width: 0;
  border: var(--border-width) solid transparent;
  border-radius: var(--radius-sm);
  padding: var(--space-1) var(--space-2);
  cursor: text;
}

.date-range__selection-surface small,
.date-range__editor {
  display: block;
}

.date-range__selection-surface small {
  margin-block-end: var(--space-1);
  color: var(--muted-foreground);
  font-size: var(--font-size-caption);
  line-height: var(--line-height-caption);
}

.date-range__selection-surface.active {
  border-color: var(--primary);
  background: var(--background);
}

.date-range__selection-surface.active small,
.date-range__selection-surface.active .date-range__editor {
  color: var(--primary);
}

.date-range__editor {
  width: 100%;
  min-width: 0;
  height: var(--density-control-height-sm);
  border: 0;
  outline: 0;
  background: transparent;
  box-shadow: none;
  color: var(--foreground);
  font-size: var(--font-size-body);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.date-range__editor:focus,
.date-range__editor:focus-visible {
  border: 0;
  outline: 0;
  box-shadow: none;
}

.date-range__editor::-webkit-calendar-picker-indicator {
  display: none;
}

.date-range__selection-hint {
  margin: var(--space-2) 0 var(--space-3);
  color: var(--primary);
  font-size: var(--font-size-caption);
  font-weight: 500;
}

.date-range__selection-hint.is-error,
.date-range__error {
  color: var(--destructive);
}

.date-range__calendars {
  display: grid;
  grid-template-columns: repeat(2, minmax(15rem, 1fr));
  gap: var(--space-4);
}

.date-range__month header {
  display: grid;
  min-height: var(--density-control-height);
  grid-template-columns: var(--density-control-height) 1fr var(--density-control-height);
  align-items: center;
  text-align: center;
  font-size: var(--font-size-body);
  font-weight: 500;
}

.date-range__month header span {
  grid-column: 2;
}

.date-range__month header button:last-child {
  grid-column: 3;
}

.date-range__month-button {
  display: grid;
  width: var(--density-control-height);
  height: var(--density-control-height);
  place-items: center;
}

.date-range__weekdays,
.date-range__days {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
}

.date-range__weekdays span {
  display: grid;
  height: var(--density-control-height-sm);
  place-items: center;
  color: var(--muted-foreground);
  font-size: var(--font-size-caption);
}

.date-range__day {
  display: grid;
  min-width: var(--density-control-height-sm);
  height: var(--density-control-height);
  place-items: center;
  font-size: var(--font-size-caption);
  font-variant-numeric: tabular-nums;
}

.date-range__day:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.date-range__day.is-outside {
  visibility: hidden;
}

.date-range__day.is-today:not(.is-selected) {
  color: var(--primary);
  font-weight: 600;
}

.date-range__day.is-in-range {
  border-radius: 0;
  background: var(--brand-accent-subtle);
}

.date-range__day.is-selected,
.date-range__day.is-preview-end {
  background: var(--primary);
  color: var(--primary-foreground);
}

.date-range__footer {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-block-start: var(--space-3);
  border-block-start: var(--border-width) solid var(--border);
  padding-block-start: var(--space-3);
}

.date-range__footer > span {
  min-width: 0;
  flex: 1;
  color: var(--muted-foreground);
  font-size: var(--font-size-caption);
}

.date-range__footer-actions {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-1);
}

.date-range__error {
  margin-block-start: var(--space-1);
  font-size: var(--font-size-caption);
}

@variant max-sm {
  .date-range__popover {
    width: min(21rem, calc(100vw - var(--space-6)));
    max-width: calc(100vw - var(--space-6));
  }

  .date-range__panel {
    flex-direction: column;
  }

  .date-range__presets {
    width: 100%;
    flex-direction: row;
    flex-wrap: wrap;
    border-inline-end: 0;
    border-block-end: var(--border-width) solid var(--border);
    padding: 0 0 var(--space-3);
  }

  .date-range__calendar-area {
    padding: var(--space-3) 0 0;
  }

  .date-range__calendars {
    grid-template-columns: 1fr;
  }

  .date-range__footer {
    align-items: flex-start;
    flex-direction: column;
  }

  .date-range__footer-actions {
    width: 100%;
  }
}
</style>
