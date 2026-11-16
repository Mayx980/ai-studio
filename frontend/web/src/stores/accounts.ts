import { ref, computed } from "vue";
import { accounts, type UserAccount } from "@/ports/accounts";

export const currentUser = ref<UserAccount | null>(null);
export const accountsRequired = ref(false);
export const sessionExpired = ref(false);
export const isAdministrator = computed(() => currentUser.value?.role === "admin");
let channel: BroadcastChannel | undefined;

export async function loadAccountSession() {
  const session = await accounts.session();
  if (!channel && accounts.scope === "production" && typeof BroadcastChannel === "function") {
    channel = new BroadcastChannel("afxenAccounts");
    channel.onmessage = () => {
      if (accountsRequired.value && currentUser.value) {
        sessionExpired.value = true;
        window.dispatchEvent(new Event("afxenIdentityChanged"));
      }
    };
  }
  currentUser.value = session.user;
  accountsRequired.value = session.mode === "users";
}
export async function signIn(username: string, password: string) {
  const session = await accounts.login(username, password);
  currentUser.value = session.user;
  accountsRequired.value = session.mode === "users";
  channel?.postMessage("changed");
}
export async function signOut() {
  await accounts.logout();
  channel?.postMessage("changed");
  currentUser.value = null;
}
export function notifyPasswordChanged() { channel?.postMessage("changed"); }
window.addEventListener("afxenSessionExpired", () => { sessionExpired.value = true; });
