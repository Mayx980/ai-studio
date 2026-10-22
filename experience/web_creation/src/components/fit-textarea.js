const observers = new WeakMap()
function fit(el) {
  el.style.height = 'auto'
  el.style.height = Math.max(30, el.scrollHeight + 2) + 'px'
}
export const fitTextarea = {
  mounted(el) {
    fit(el)
    let width = el.getBoundingClientRect().width
    const observer = new ResizeObserver(() => {
      const nextWidth = el.getBoundingClientRect().width
      if (nextWidth !== width) {
        width = nextWidth
        fit(el)
      }
    })
    observer.observe(el)
    observers.set(el, observer)
  },
  updated: fit,
  beforeUnmount(el) {
    observers.get(el)?.disconnect()
    observers.delete(el)
  }
}
