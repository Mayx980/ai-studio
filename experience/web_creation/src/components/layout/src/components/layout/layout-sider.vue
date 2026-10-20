<template>
  <aside
    id="primary-navigation"
    :class="[
      'layout-sider hidden flex-none flex-col overflow-hidden border-r border-border bg-muted/40 md:flex',
      pageStore.siderCollapsed && 'layout-sider--collapsed'
    ]"
  >
    <nav
      class="min-h-0 flex-1 space-y-1 overflow-auto"
      :aria-label="$t('system.accessibility.primary')"
    >
      <layout-sider-item
        v-for="item in menu"
        :key="item.path"
        :collapsed="pageStore.siderCollapsed"
        :menu="item"
        @expand="pageStore.setSiderCollapsed(false)"
      />
    </nav>
    <div class="mt-2 flex-none border-t border-border pt-2">
      <Button
        type="button"
        variant="ghost"
        :size="pageStore.siderCollapsed ? 'icon' : 'default'"
        :class="[
          'h-[var(--density-control-height)] w-full',
          pageStore.siderCollapsed ? 'justify-center' : 'justify-start gap-2 px-2'
        ]"
        aria-controls="primary-navigation"
        :aria-expanded="!pageStore.siderCollapsed"
        :aria-label="toggleLabel"
        :title="pageStore.siderCollapsed ? toggleLabel : undefined"
        @click="pageStore.toggleSiderCollapsed()"
      >
        <IconPanelLeftOpen
          v-if="pageStore.siderCollapsed"
          class="app-icon"
          aria-hidden="true"
        /><IconPanelLeftClose v-else class="app-icon" aria-hidden="true" />
        <span v-if="!pageStore.siderCollapsed" class="truncate">{{ toggleLabel }}</span>
      </Button>
    </div>
  </aside>
</template>
<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import IconPanelLeftClose from '~icons/lucide/panel-left-close'
import IconPanelLeftOpen from '~icons/lucide/panel-left-open'
import { Button } from '@/components/ui/button'
import { ROUTES } from '@/enumeration/routes'
const router = useRouter()
const { t } = useI18n()
const pageStore = usePageStore()
const toggleLabel = computed(() =>
  t(
    pageStore.siderCollapsed
      ? 'system.accessibility.expandNavigation'
      : 'system.accessibility.collapseNavigation'
  )
)
const menu = computed(
  () =>
    router.options.routes
      .find(item => item.name === ROUTES.Layout)
      ?.children?.filter(item => !item.meta?.hide) || []
)
</script>
