import { reactive } from 'vue'

const clone = source =>
  Object.fromEntries(
    Object.entries(source).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value])
  )

const sync = (target, source) => Object.assign(target, clone(source))

export const useQueryFilterState = (defaults, current = defaults) => {
  const baseline = clone(defaults)
  const first = { ...clone(baseline), ...clone(current) }
  const draft = reactive(clone(first))
  const applied = reactive(clone(first))
  return {
    draft,
    applied,
    apply: () => sync(applied, draft),
    reset: () => {
      sync(draft, baseline)
      sync(applied, baseline)
    }
  }
}
