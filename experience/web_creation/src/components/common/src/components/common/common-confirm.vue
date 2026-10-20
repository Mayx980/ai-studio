<template>
  <AlertDialogRoot :open="open" @update:open="handleOpenChange">
    <AlertDialogTrigger as-child>
      <slot v-if="$slots.default" :disabled="disabled" :loading="loading"></slot>
      <Button
        v-else
        type="button"
        variant="link"
        class="h-auto p-0 text-destructive"
        :disabled="disabled"
        >{{ $t('system.delete') }}</Button
      >
    </AlertDialogTrigger>
    <AlertDialogPortal>
      <AlertDialogOverlay class="fixed inset-0 z-50 bg-overlay" />
      <AlertDialogContent
        class="fixed left-1/2 top-1/2 z-50 w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-background p-6 shadow-xl"
        @escape-key-down="guardClose"
        @pointer-down-outside="guardClose"
        @interact-outside="guardClose"
      >
        <AlertDialogTitle class="font-semibold">{{ action }} {{ object }}？</AlertDialogTitle>
        <AlertDialogDescription class="mt-2 text-sm text-muted-foreground">{{
          content
        }}</AlertDialogDescription>
        <div class="mt-5 flex justify-end gap-2">
          <AlertDialogCancel as-child
            ><Button type="button" variant="outline" :disabled="loading">{{
              $t('system.cancel')
            }}</Button></AlertDialogCancel
          >
          <Button type="button" variant="destructive" :loading="loading" @click="confirm">{{
            $t('system.confirm')
          }}</Button>
        </div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>
</template>
<script setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogRoot,
  AlertDialogTitle,
  AlertDialogTrigger
} from 'reka-ui'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { confirmationText } from './common-confirm-model'
const emit = defineEmits(['success'])
const props = defineProps({
  action: { type: String, required: true },
  object: { type: String, required: true },
  consequence: { type: String, required: true },
  disabled: { type: Boolean, default: false },
  fn: { type: Function, required: true },
  successText: { type: String, default: '' }
})
const { t } = useI18n()
const open = ref(false)
const loading = ref(false)
const content = computed(() => confirmationText(props))
const handleOpenChange = nextOpen => {
  if (!nextOpen && loading.value) return
  open.value = nextOpen
}
const guardClose = event => {
  if (loading.value) event.preventDefault()
}
const confirm = async () => {
  if (loading.value) return
  loading.value = true
  try {
    await props.fn()
    toast.success(props.successText || t('system.deleteSuccess'))
    open.value = false
    emit('success')
  } catch (error) {
    toast.error(error.message || t('system.error'))
  } finally {
    loading.value = false
  }
}
</script>
