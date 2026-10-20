<template>
  <form class="query-filter" data-component="query-filter" @submit.prevent="$emit('search')">
    <div v-if="$slots.fields" class="query-filter__fields"><slot name="fields"></slot></div>
    <div class="query-filter__actions">
      <slot v-if="$slots.actions" name="actions"></slot>
      <template v-else>
        <Button type="button" variant="outline" :disabled="disabled" @click="$emit('reset')">{{
          $t('system.reset')
        }}</Button>
        <Button type="submit" :loading="loading" :disabled="disabled">{{
          $t('system.search')
        }}</Button>
      </template>
    </div>
    <div v-if="$slots.primary" class="query-filter__primary"><slot name="primary"></slot></div>
  </form>
</template>

<script setup>
import { Button } from '@/components/ui/button'
defineProps({
  disabled: { type: Boolean, default: false },
  loading: { type: Boolean, default: false }
})
defineEmits(['reset', 'search'])
</script>
