import { reactive } from 'vue'

export const toastState = reactive({ items: [] })
let nextId = 0

const push = (tone, message) => {
  const id = ++nextId
  toastState.items.push({ id, tone, message })
  window.setTimeout(() => dismiss(id), 4200)
  return id
}

export const dismiss = id => {
  const index = toastState.items.findIndex(item => item.id === id)
  if (index >= 0) toastState.items.splice(index, 1)
}

export const toast = {
  success: message => push('success', message),
  error: message => push('error', message),
  info: message => push('info', message)
}
