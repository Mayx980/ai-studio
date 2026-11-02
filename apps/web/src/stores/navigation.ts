import { ref, watch } from "vue";

export const navigationCollapsed = ref(localStorage.getItem("afxen.navigationCollapsed") === "true");
watch(navigationCollapsed, value => localStorage.setItem("afxen.navigationCollapsed", String(value)));
