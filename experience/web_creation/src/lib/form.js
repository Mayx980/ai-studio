import { nextTick } from 'vue'

export const focusFirstInvalid = async (errors, fields) => {
  const field = Object.keys(fields).find(name => Boolean(errors[name]))
  if (!field) return false
  await nextTick()
  document.getElementById(fields[field])?.focus()
  return true
}
