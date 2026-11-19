import { acceptsPortalRole, portalName } from "@/lib/portal";
import { ref } from "vue";
import { accounts, type UserAccount } from "@/ports/accounts";

export const currentUser = ref<UserAccount | null>(null);
export const accountsRequired = ref(false);
export const sessionExpired = ref(false);
let channel: BroadcastChannel | undefined;

export async function loadAccountSession() {
  const session = await accounts.session();
  if (!channel && accounts.scope === "production" && typeof BroadcastChannel === "function") {
    channel = new BroadcastChannel(`afxenAccounts.${portalName}`);
    channel.onmessage = () => {
      if (accountsRequired.value && currentUser.value) {
        sessionExpired.value = true;
        window.dispatchEvent(new Event("afxenIdentityChanged"));
      }
    };
  }
  currentUser.value = session.user && acceptsPortalRole(session.user.role) ? session.user : null;
  accountsRequired.value = session.mode === "users";
}
export async function signIn(username: string, password: string) {
  const session = await accounts.login(username, password);
  if (session.user && !acceptsPortalRole(session.user.role)) throw new Error("该账号不能登录当前端");
  currentUser.value = session.user && acceptsPortalRole(session.user.role) ? session.user : null;
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
