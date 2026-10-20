<template>
  <div class="table-row-actions" data-table-row-actions role="group" :aria-label="label">
    <slot></slot>
  </div>
</template>

<script setup>
defineProps({
  label: { type: String, required: true }
})
</script>
