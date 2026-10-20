<template>
  <Sheet
    :open="visible"
    :title="$t('title')"
    :description="$t('system.accessibility.mobileNavigationDescription')"
    side="left"
    @update:open="visible = $event"
  >
    <nav
      class="space-y-1"
      :aria-label="$t('system.accessibility.mobilePrimary')"
      @click="visible = false"
    >
      <layout-sider-item v-for="item in menu" :key="item.path" :menu="item" />
    </nav>
    <template #footer
      ><div class="flex items-center gap-2">
        <switch-lang /><switch-theme /><Button
          type="button"
          variant="outline"
          @click="handleLogout"
          >{{ $t('system.logout') }}</Button
        >
      </div></template
    >
  </Sheet>
</template>
<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { ROUTES } from '@/enumeration/routes'
import { logout } from '@/ports/auth'
const visible = ref(false)
const router = useRouter()
const authStore = useAuthStore()
const menu = computed(
  () =>
    router.options.routes
      .find(item => item.name === ROUTES.Layout)
      ?.children?.filter(item => !item.meta?.hide) || []
)
const handleLogout = async () => {
  await logout()
  authStore.clearAuth()
  router.push({ name: ROUTES.Auth })
  visible.value = false
}
defineExpose({
  toggleVisible: () => {
    visible.value = !visible.value
  }
})
</script>
