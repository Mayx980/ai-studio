<template>
  <header
    class="layout-header flex flex-none items-center justify-between border-b border-border bg-background"
  >
    <div class="flex items-center gap-2">
      <Button
        type="button"
        size="icon"
        variant="ghost"
        class="md:hidden"
        :aria-label="$t('system.accessibility.openNavigation')"
        @click="siderDrawer?.toggleVisible()"
        ><IconMenu class="app-icon" aria-hidden="true" /></Button
      ><button
        class="flex items-center gap-2 text-left text-sm font-semibold"
        type="button"
        @click="router.push({ name: ROUTES.Dashboard })"
      >
        <span
          class="flex size-7 items-center justify-center rounded-md border border-border bg-muted text-xs text-muted-foreground"
          >A</span
        ><span>{{ $t('title') }}</span>
      </button>
    </div>
    <div class="flex items-center gap-2">
      <switch-lang class="hidden sm:block" /><switch-theme />
      <details class="relative">
        <summary
          class="flex size-[var(--density-control-height)] cursor-pointer list-none items-center justify-center rounded-full border border-border bg-muted"
          :aria-label="$t('system.accessibility.userMenu')"
        >
          U
        </summary>
        <div
          class="absolute right-0 z-30 mt-1 min-w-36 rounded-md border border-border bg-popover p-1 shadow-lg"
        >
          <button
            type="button"
            class="w-full rounded px-3 py-2 text-left text-sm hover:bg-accent"
            @click="handleLogout"
          >
            {{ $t('system.logout') }}
          </button>
        </div>
      </details>
    </div>
  </header>
  <layout-sider-drawer ref="siderDrawer" />
</template>
<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import IconMenu from '~icons/lucide/menu'
import { Button } from '@/components/ui/button'
import { ROUTES } from '@/enumeration/routes'
import { logout } from '@/ports/auth'
const router = useRouter()
const authStore = useAuthStore()
const siderDrawer = ref(null)
const handleLogout = async () => {
  await logout()
  authStore.clearAuth()
  router.push({ name: ROUTES.Auth })
}
</script>
