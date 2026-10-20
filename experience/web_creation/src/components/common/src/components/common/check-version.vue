<template>
  <div
    v-if="url"
    class="fixed right-4 top-4 z-[90] w-[min(24rem,calc(100vw-2rem))] rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-lg"
  >
    <p class="font-medium">{{ $t('system.checkVersion.title') }}</p>
    <p class="mt-1 text-sm text-muted-foreground">{{ $t('system.checkVersion.content') }}</p>
    <div class="mt-3 flex justify-end gap-2">
      <Button type="button" variant="ghost" size="sm" @click="url = ''">{{
        $t('system.close')
      }}</Button
      ><Button type="button" size="sm" @click="refresh">{{
        $t('system.checkVersion.confirm')
      }}</Button>
    </div>
  </div>
</template>
<script setup>
import { ref } from 'vue'
import { checkVersion } from 'am-check-version'
import { Button } from '@/components/ui/button'
const url = ref('')
checkVersion({
  auto_refresh: false,
  delay: 1000 * 30,
  success: nextUrl => {
    url.value ||= nextUrl
  }
})
const refresh = () => window.location.replace(url.value)
</script>
