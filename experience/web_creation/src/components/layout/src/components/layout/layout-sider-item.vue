<template>
  <details v-if="visibleChildren.length" open class="group">
    <summary
      class="navigation-link flex cursor-pointer list-none items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-selected-navigation hover:text-selected-navigation-foreground"
      :title="collapsed ? $t(menu.meta?.title) : undefined"
      @click="handleGroupClick"
    >
      <component
        :is="menuIcon"
        v-if="menuIcon"
        class="app-icon app-icon--sm"
        data-menu-icon
        aria-hidden="true"
      /><span :class="collapsed && 'sr-only'">{{ $t(menu.meta?.title) }}</span
      ><IconChevronRight
        v-if="!collapsed"
        class="app-icon app-icon--sm ml-auto transition group-open:rotate-90"
        aria-hidden="true"
      />
    </summary>
    <div v-if="!collapsed" class="ml-4 border-l border-border pl-2">
      <layout-sider-item
        v-for="item in visibleChildren"
        :key="item.path"
        :collapsed="collapsed"
        :menu="item"
        @expand="$emit('expand')"
      />
    </div>
  </details>
  <RouterLink
    v-else
    :to="{ name: menu.name }"
    class="navigation-link flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-selected-navigation hover:text-selected-navigation-foreground"
    active-class="navigation-link--active bg-selected-navigation text-selected-navigation-foreground font-medium"
    :title="collapsed ? $t(menu.meta?.title) : undefined"
    ><component
      :is="menuIcon"
      v-if="menuIcon"
      class="app-icon app-icon--sm"
      data-menu-icon
      aria-hidden="true"
    /><span :class="collapsed && 'sr-only'">{{ $t(menu.meta?.title) }}</span></RouterLink
  >
</template>
<script setup>
import { computed } from 'vue'
import IconChevronRight from '~icons/lucide/chevron-right'
import IconLayoutDashboard from '~icons/lucide/layout-dashboard'
import IconPanelsTopLeft from '~icons/lucide/panels-top-left'
const props = defineProps({
  collapsed: { type: Boolean, default: false },
  menu: { type: Object, default: () => ({}) }
})
const emit = defineEmits(['expand'])
const menuIcons = { apps: IconPanelsTopLeft, dashboard: IconLayoutDashboard }
const menuIcon = computed(() => menuIcons[props.menu.meta?.icon])
const visibleChildren = computed(() => props.menu.children?.filter(item => !item.meta?.hide) || [])
const handleGroupClick = event => {
  if (!props.collapsed) return
  event.preventDefault()
  emit('expand')
}
</script>
