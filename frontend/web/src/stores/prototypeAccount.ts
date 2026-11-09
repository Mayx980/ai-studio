import { prototype } from "@/ports/prototype";
import { ref } from "vue";

// ACT: 仅用于当前浏览器原型演示，不作为服务端身份或权限凭证。
export const prototypeAccounts = [
  { id: "admin", name: "管理员", role: "admin" },
  { id: "user", name: "普通用户", role: "user" },
] as const;
export const currentAccount = ref(prototypeAccounts.find(account => account.id === prototype.readAccount()));
export function signInPrototype(id: string) {
  const account = prototypeAccounts.find(item => item.id === id);
  if (!account) throw new Error("请选择有效的原型账号");
  prototype.writeAccount(account.id);
  currentAccount.value = account;
}
export function signOutPrototype() {
  prototype.clearAccount();
  currentAccount.value = undefined;
}
