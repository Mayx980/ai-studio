<template>
  <Button
    type="button"
    size="icon"
    variant="outline"
    :aria-label="
      $t(
        pageStore.theme === 'dark'
          ? 'system.accessibility.useLightTheme'
          : 'system.accessibility.useDarkTheme'
      )
    "
    @click="pageStore.setTheme(pageStore.theme === 'dark' ? 'light' : 'dark')"
    ><IconSun v-if="pageStore.theme === 'dark'" class="app-icon" aria-hidden="true" /><IconMoon
      v-else
      class="app-icon"
      aria-hidden="true"
  /></Button>
</template>
<script setup>
import IconMoon from '~icons/lucide/moon'
import IconSun from '~icons/lucide/sun'
import { Button } from '@/components/ui/button'
const pageStore = usePageStore()
</script>
