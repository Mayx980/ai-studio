<template>
  <span data-language-switch
    ><label class="sr-only" :for="controlId">{{ $t('system.accessibility.language') }}</label
    ><select
      :id="controlId"
      :value="pageStore.currentLocale"
      class="h-[var(--density-control-height)] rounded-md border border-input bg-background px-2 text-sm"
      @change="pageStore.setLocale($event.target.value)"
    >
      <option v-for="item in pageStore.languages" :key="item.value" :value="item.value">
        {{ item.label }}
      </option>
    </select></span
  >
</template>
<script setup>
import { useId } from 'vue'
const controlId = `language-switch-${useId()}`
const pageStore = usePageStore()
</script>
