<template>
  <nav
    class="layout-breadcrumb flex flex-none items-center gap-2 border-b border-border bg-background text-sm text-muted-foreground"
    :aria-label="$t('system.accessibility.breadcrumb')"
  >
    <template v-for="(segment, index) in segments" :key="`${segment}-${index}`"
      ><span v-if="index" aria-hidden="true">/</span
      ><span :class="index === segments.length - 1 && 'text-foreground'">{{
        segment
      }}</span></template
    >
  </nav>
</template>
<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
const route = useRoute()
const { t } = useI18n()
const segments = computed(() => {
  const out = []
  for (let index = route.matched.length - 1; index >= 0; index -= 1) {
    if (route.matched[index].meta?.module) {
      out.push(t(`module.${route.matched[index].meta.module}`))
      break
    }
  }
  route.matched.slice(1).forEach(item => {
    if (item.meta?.title) out.push(t(item.meta.title))
  })
  return out
})
</script>
