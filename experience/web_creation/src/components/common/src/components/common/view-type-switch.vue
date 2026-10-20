<template>
  <Button
    type="button"
    variant="outline"
    size="icon"
    :aria-label="$t(viewType === 'list' ? 'system.view.card' : 'system.view.list')"
    @click="$emit('update:viewType', viewType === 'list' ? 'card' : 'list')"
    ><IconLayoutGrid v-if="viewType === 'list'" class="app-icon" aria-hidden="true" /><IconList
      v-else
      class="app-icon"
      aria-hidden="true"
  /></Button>
</template>
<script setup>
import IconLayoutGrid from '~icons/lucide/layout-grid'
import IconList from '~icons/lucide/list'
import { Button } from '@/components/ui/button'
defineProps({ viewType: { type: String, default: 'list' } })
defineEmits(['update:viewType'])
</script>
