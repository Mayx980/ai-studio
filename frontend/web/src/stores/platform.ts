import { computed, ref, watch } from "vue";
import { currentUser } from "./accounts";
import { platform, type PlatformCommand, type PlatformState } from "@/ports/platform";
export const isPlatformAdmin = computed(() => currentUser.value?.role === "platformAdmin");
export const platformState = ref<PlatformState>({ customers: [], accounts: [], connections: [], models: [], notices: [], tasks: [], templates: [] });
export const platformLoading = ref(false), platformError = ref("");
let pending: Promise<void> | undefined;
let identityVersion = 0;
watch(() => [currentUser.value?.id, currentUser.value?.role, currentUser.value?.customerId].join(":"), () => {
  identityVersion++;
  pending = undefined;
  platformState.value = { customers: [], accounts: [], connections: [], models: [], notices: [], tasks: [], templates: [] };
  platformError.value = "";
}, { flush: "sync" });
export function loadPlatform() {
  if (pending) return pending;
  const version = identityVersion;
  platformLoading.value = true;
  platformError.value = "";
  pending = platform.load().then(value => { if (version === identityVersion) platformState.value = value; }).catch(cause => {
    if (version !== identityVersion) return;
    platformError.value = cause instanceof Error ? cause.message : "读取失败，请重试";
  }).finally(() => { if (version === identityVersion) { pending = undefined; platformLoading.value = false; } });
  return pending;
}
export async function savePlatform(command: PlatformCommand) { await platform.execute(command); await loadPlatform(); if (platformError.value) throw new Error(`操作后读取失败，请核对原记录，勿重复提交：${platformError.value}`); }
export const unreadNotices = computed(() => platformState.value.notices.filter(item => !item.read).length);
