import { ref, watch } from "vue";

export const navigationCollapsed = ref(localStorage.getItem("afxen.navigationCollapsed") === "true");
watch(navigationCollapsed, value => localStorage.setItem("afxen.navigationCollapsed", String(value)));

export const conversationHistoryOpen = ref(false);
watch(conversationHistoryOpen, value => { if (value) navigationCollapsed.value = true; });
watch(navigationCollapsed, value => { if (!value) conversationHistoryOpen.value = false; });
