import type { PlatformPort, PlatformState, PlatformCommand } from "@/ports/platform";
import { setScenarioTemporaryPassword, scenarioManagementKey, getScenarioAccountSummaries, updateScenarioAccount, scenarioAccountRestriction } from "./accounts";
import { currentUser } from "@/stores/accounts";
export function createScenarioPlatformPort(scenario = "login"): PlatformPort {
  const state: PlatformState = {
    customers: [{ id: "customerPreview", name: "演示客户", modelIds: ["qwen3.8-flash", "qwen-image-3.0-pro", "wan3Video", "seed-audio-1.0"], defaults: { text: "qwen3.8-flash", image: "qwen-image-3.0-pro", video: "wan3Video", audio: "seed-audio-1.0" } }],
    accounts: [{ id: "previewMember", username: "member", name: "演示普通账号", customerId: "customerPreview", role: "user", enabled: true, mustChangePassword: true, projects: 0, assets: 0, storage: "0 B" }],
    connections: [], models: [], notices: [], tasks: [],
    templates: [],
  };
  function restore() {
    const raw = localStorage.getItem(scenarioManagementKey);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (!["customers", "accounts", "connections", "models", "notices", "tasks", "templates"].every(key => Array.isArray(saved?.[key]))) throw new Error("演示管理数据无效，请保留数据后重试");
    Object.assign(state, saved);
    for (const account of state.accounts) if (String(account.role) === "customerAdmin") account.role = "user";
  }
  function persist() { localStorage.setItem(scenarioManagementKey, JSON.stringify(state)); }
  function syncAccounts() {
    for (const account of getScenarioAccountSummaries()) {
      if (account.role === "platformAdmin") continue;
      const existing = state.accounts.find(item => item.id === account.id || item.username === account.username);
      if (existing) { if (!existing.deletedAt) existing.mustChangePassword = account.mustChangePassword; continue; }
      state.accounts.push({ ...account, customerId: account.customerId ?? "customerPreview", projects: 0, assets: 0, storage: "0 B" });
    }
  }
  function user() {
    if (!currentUser.value || currentUser.value.mustChangePassword) throw new Error("请先完成登录和修改密码");
    const restriction = scenarioAccountRestriction(currentUser.value);
    if (restriction) throw new Error(restriction);
    return currentUser.value;
  }
  function admin() { if (user().role !== "platformAdmin") throw new Error("仅平台管理员可操作"); }
  function account(id: string) {
    const item = state.accounts.find(item => item.id === id);
    if (!item || item.deletedAt) throw new Error("账号不存在或已删除");
    admin();
    return item;
  }
  return { scope: "scenario", async load() {
    if (scenario === "loading") await new Promise(resolve => setTimeout(resolve, 1800));
    if (scenario === "platformError") throw new Error("演示：读取失败，可保留当前内容后重试");
    restore(); syncAccounts(); persist();
    const actor = user();
    const result = structuredClone(state);
    result.customers = result.customers.filter(item => !item.deletedAt);
    result.accounts = result.accounts.filter(item => !item.deletedAt && item.role !== "platformAdmin");
    if (actor.role !== "platformAdmin") {
      result.customers = []; result.accounts = []; result.connections = []; result.models = []; result.tasks = []; result.templates = [];
    }
    result.notices = []; result.sentNotices = [];
    return result;
  }, async execute(command) {
    restore(); syncAccounts();
    await apply(command);
    persist();
    if (currentUser.value && scenarioAccountRestriction(currentUser.value)) window.dispatchEvent(new Event("afxenSessionExpired"));
  } };
  async function apply(command: PlatformCommand) {
    const actor = user();
    if (["notice", "readNotice", "connection", "verifyConnection", "model", "verifyModel", "template"].includes(command.type)) throw new Error("本版不提供消息和模型管理功能");
    admin();
    if ((command.type === "account" || command.type === "resetPassword") && command.password !== "123456") throw new Error("初始和重置密码统一为123456");
    if (command.type === "account") {
      if (!state.customers.some(item => item.id === command.value.customerId && !item.deletedAt && item.enabled !== false)) throw new Error("请选择有效客户");
      if (!command.value.username.trim() || !command.value.name.trim() || command.password.length < 6 || command.password.length > 15) throw new Error("请填写账号和姓名");
      if (state.accounts.some(item => item.username === command.value.username) || getScenarioAccountSummaries().some(item => item.username === command.value.username)) throw new Error("账号已存在");
      const id = crypto.randomUUID();
      await setScenarioTemporaryPassword({ ...command.value, id, role: "user", enabled: true, mustChangePassword: true }, command.password);
      state.accounts.push({ ...command.value, id, enabled: true, role: "user", mustChangePassword: true, projects: 0, assets: 0, storage: "0 B" }); return;
    }
    if (command.type === "updateAccount") {
      const item = account(command.id);
      if ("role" in command.value) throw new Error("本版不支持修改角色");
      const value = { username: command.value.username.trim(), name: command.value.name.trim(), customerId: command.value.customerId };
      if (!value.username || !value.name || value.username.length > 64 || value.name.length > 64) throw new Error("请填写1–64个字符的账号和姓名");
      const customer = state.customers.find(group => group.id === value.customerId && !group.deletedAt);
      if (!customer || value.customerId !== item.customerId && customer.enabled === false) throw new Error("请选择有效用户组");
      if (state.accounts.some(other => other.id !== item.id && other.username === value.username) || getScenarioAccountSummaries().some(other => other.id !== item.id && other.username === value.username)) throw new Error("账号已存在");
      const previous = { username: item.username, name: item.name, customerId: item.customerId, role: item.role };
      updateScenarioAccount(item.username, { ...value, customerName: customer.name });
      item.changes = [...(item.changes ?? []), { actorId: actor.id, at: new Date().toISOString(), previous, next: { ...value, role: "user" } }];
      Object.assign(item, value);
      return;
    }
    if (command.type === "accountStatus") {
      const item = account(command.id);
      if (command.enabled && state.customers.some(customer => customer.id === item.customerId && customer.enabled === false)) throw new Error("所属客户已被平台管理员禁用");
      item.enabled = command.enabled;
      item.disabledBy = command.enabled ? undefined : "platformAdmin";
      updateScenarioAccount(item.username, { enabled: item.enabled });
      return;
    }
    if (command.type === "resetPassword") { const item = account(command.id); if (command.password.length < 6 || command.password.length > 15) throw new Error("临时密码须为6–15字符"); await setScenarioTemporaryPassword({ id: item.id, username: item.username, name: item.name, role: item.role, customerId: item.customerId, enabled: item.enabled, mustChangePassword: true }, command.password); item.mustChangePassword = true; return; }
    if (command.type === "deleteAccount") {
      const item = account(command.id);
      if (item.id === actor.id) throw new Error("不能删除当前登录账号");
      item.deletedAt = new Date().toISOString(); item.deletedBy = { id: actor.id, role: actor.role }; item.enabled = false;
      updateScenarioAccount(item.username, { enabled: false }); return;
    }
    admin();
    if (command.type === "customerStatus") {
      const customer = state.customers.find(item => item.id === command.id && !item.deletedAt);
      if (!customer) throw new Error("客户不存在或已删除");
      customer.enabled = command.enabled; return;
    }
    if (command.type === "deleteCustomer") {
      const customer = state.customers.find(item => item.id === command.id && !item.deletedAt);
      if (!customer) throw new Error("客户不存在或已删除");
      if (state.accounts.some(item => item.customerId === customer.id && !item.deletedAt)) throw new Error("客户下仍有账号，请先处理账号后再删除客户");
      customer.deletedAt = new Date().toISOString(); customer.enabled = false; return;
    }
    if (command.type === "customer") {
      if (!command.value.name.trim()) throw new Error("请填写客户名称");
      if (Object.values(command.value.defaults).some(id => id && !command.value.modelIds.includes(id))) throw new Error("默认模型必须属于已授权模型");
      const index = state.customers.findIndex(item => item.id === command.value.id); if (index < 0) state.customers.push(structuredClone(command.value)); else state.customers[index] = structuredClone(command.value);
      for (const item of state.accounts.filter(item => item.customerId === command.value.id)) updateScenarioAccount(item.username, { customerName: command.value.name });
      return;
    }
    throw new Error("本版仅提供用户组和账号管理");
  }
}
