import dayjs from 'dayjs'

export const DATE_VALUE_FORMAT = 'YYYY-MM-DD'

export const normalizeDateValue = value => {
  if (!value) return ''
  const normalized =
    typeof value === 'string' ? value.trim() : dayjs(value).format(DATE_VALUE_FORMAT)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return ''
  const parsed = dayjs(normalized)
  return parsed.isValid() && parsed.format(DATE_VALUE_FORMAT) === normalized ? normalized : ''
}

export const normalizeDateRange = value => [
  normalizeDateValue(value?.[0]),
  normalizeDateValue(value?.[1])
]

export const startOfMondayWeek = value => {
  const current = dayjs(value).startOf('day')
  const daysFromMonday = current.day() === 0 ? 6 : current.day() - 1
  return current.subtract(daysFromMonday, 'day')
}

const currentDay = now => dayjs(now()).startOf('day')
const formatRange = (start, end = start) => [
  start.format(DATE_VALUE_FORMAT),
  end.format(DATE_VALUE_FORMAT)
]

export const createDefaultDateRangePresets = (t, now = () => dayjs()) => [
  {
    id: 'today',
    label: t('system.dateRange.presets.today'),
    value: () => formatRange(currentDay(now))
  },
  {
    id: 'yesterday',
    label: t('system.dateRange.presets.yesterday'),
    value: () => formatRange(currentDay(now).subtract(1, 'day'))
  },
  {
    id: 'lastWeek',
    label: t('system.dateRange.presets.lastWeek'),
    value: () => {
      const today = currentDay(now)
      return formatRange(today.subtract(6, 'day'), today)
    }
  },
  {
    id: 'last30Days',
    label: t('system.dateRange.presets.last30Days'),
    value: () => {
      const today = currentDay(now)
      return formatRange(today.subtract(29, 'day'), today)
    }
  },
  {
    id: 'last90Days',
    label: t('system.dateRange.presets.last90Days'),
    value: () => {
      const today = currentDay(now)
      return formatRange(today.subtract(89, 'day'), today)
    }
  },
  {
    id: 'thisWeek',
    label: t('system.dateRange.presets.thisWeek'),
    value: () => {
      const today = currentDay(now)
      return formatRange(startOfMondayWeek(today), today)
    }
  },
  {
    id: 'thisMonth',
    label: t('system.dateRange.presets.thisMonth'),
    value: () => {
      const today = currentDay(now)
      return formatRange(today.startOf('month'), today)
    }
  },
  {
    id: 'thisYear',
    label: t('system.dateRange.presets.thisYear'),
    value: () => {
      const today = currentDay(now)
      return formatRange(today.startOf('year'), today)
    }
  }
]
