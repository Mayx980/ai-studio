import type { PlatformPort, PlatformState, PlatformCommand, PlatformNotice } from "@/ports/platform";
import type { ScenarioName } from "./studio";
import { setScenarioTemporaryPassword, scenarioManagementKey, getScenarioAccountSummaries, updateScenarioAccount, scenarioAccountRestriction } from "./accounts";
import { currentUser } from "@/stores/accounts";
export function createScenarioPlatformPort(scenario: ScenarioName): PlatformPort {
  const now = new Date().toISOString();
  const state: PlatformState = {
    customers: [{ id: "customerPreview", name: "演示客户", modelIds: ["qwen3.8-flash", "qwen-image-3.0-pro", "wan3Video", "seed-audio-1.0"], defaults: { text: "qwen3.8-flash", image: "qwen-image-3.0-pro", video: "wan3Video", audio: "seed-audio-1.0" }, limit: 2 }],
    accounts: [{ id: "previewMember", username: "member", name: "演示普通账号", customerId: "customerPreview", role: "user", enabled: true, mustChangePassword: true, projects: 0, assets: 0, storage: "0 B" }],
    connections: [ { id: "bailianText", name: "百炼文字", protocol: "OpenAI Chat Completions", endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1", enabled: true }, { id: "bailianMedia", name: "百炼媒体", protocol: "DashScope 原生媒体", endpoint: "https://dashscope.aliyuncs.com", enabled: true }, { id: "seed", name: "火山音频", protocol: "Seed Audio", endpoint: "https://openspeech.bytedance.com", enabled: true } ],
    models: [
      { id: "qwen3.8-flash", name: "Qwen3.8 Flash", kind: "text", connectionId: "bailianText", enabled: true, verified: true, description: "文字、方案、剧情及分镜脚本；未验证的思考开关不开放", parameters: [] },
      { id: "qwen-image-3.0-pro", name: "千问图片 3.0 Pro", kind: "image", connectionId: "bailianMedia", enabled: true, verified: true, description: "文生图／参考图片编辑，最多3张参考；不支持蒙版", parameters: [{ key: "size", name: "尺寸", options: ["1K", "2K", "auto"], value: "1K", exposed: true, required: true }, { key: "count", name: "生成数量", options: ["1", "2", "3", "4", "5", "6"], value: "1", exposed: true, required: true }] },
      { id: "wan3Video", name: "万相 3.0 视频", kind: "video", connectionId: "bailianMedia", enabled: true, verified: true, description: "文字／首帧／参考模式；最多10图5视频；不支持尾帧。服务标识wan3.0-video", parameters: [{ key: "resolution", name: "分辨率", options: ["480P", "720P", "1080P"], value: "480P", exposed: true, required: true }, { key: "duration", name: "时长", options: ["自动", ...Array.from({ length: 29 }, (_, i) => `${i + 2}秒`)], value: "自动", exposed: true, required: true }] },
      { id: "seed-audio-1.0", name: "Seed Audio 1.0", kind: "audio", connectionId: "seed", enabled: true, verified: true, description: "文字生成音频，默认WAV；未映射的语言与音色选项不开放", parameters: [{ key: "format", name: "格式", options: ["WAV"], value: "WAV", exposed: true, required: true }] },
    ],
    notices: [{ id: "noticePreview", title: "千问图片参数说明", modelId: "qwen-image-3.0-pro", content: "尺寸选项按当前模型能力提供：1K、2K与自动。", effectiveAt: now, impact: "提交前请核对草稿尺寸；已有作品不变，不会自动重新生成。", customerIds: ["customerPreview"], createdAt: now, read: false }],
    tasks: ["waiting", "running", "saving", "completed", "failed", "unknown"].map((status, i) => ({ id: `taskPreview${i}`, name: `图片创作 · ${i + 1}`, kind: "image", modelId: "qwen-image-3.0-pro", status: status as PlatformState["tasks"][number]["status"], createdAt: now, accountId: "scenarioAccount", customerId: "customerPreview", elapsed: "未提供", usage: "待确认", parameters: { 尺寸: "1K", 数量: "1" }, ...(status === "failed" ? { failure: "结果保存失败，请恢复保存，无需重新生成", recoverable: true } : {}) })),
    templates: [],
  };
  function restore() {
    const raw = localStorage.getItem(scenarioManagementKey);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (!["customers", "accounts", "connections", "models", "notices", "tasks", "templates"].every(key => Array.isArray(saved?.[key]))) throw new Error("演示管理数据无效，请保留数据后重试");
    Object.assign(state, saved);
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
  function receives(notice: PlatformNotice, actor = user()) {
    return notice.accountIds ? notice.accountIds.includes(actor.id) : !notice.customerIds.length || notice.customerIds.includes(actor.customerId ?? "");
  }
  function validRecipient(account: PlatformState["accounts"][number]) {
    return !account.deletedAt && account.enabled && state.customers.some(item => item.id === account.customerId && !item.deletedAt && item.enabled !== false);
  }
  function admin() { if (user().role !== "platformAdmin") throw new Error("仅平台管理员可操作"); }
  function account(id: string) {
    const item = state.accounts.find(item => item.id === id);
    if (!item || item.deletedAt) throw new Error("账号不存在或已删除");
    const actor = user();
    if (actor.role !== "platformAdmin" && !(actor.role === "customerAdmin" && item.customerId === actor.customerId && item.role === "user")) throw new Error("无权管理此账号");
    return item;
  }
  return { scope: "scenario", async load() {
    if (scenario === "loading") await new Promise(resolve => setTimeout(resolve, 1800));
    if (scenario === "platformError") throw new Error("演示：读取失败，可保留当前内容后重试");
    restore(); syncAccounts(); persist();
    const actor = user();
    const result = structuredClone(state);
    result.customers = result.customers.filter(item => !item.deletedAt);
    result.accounts = result.accounts.filter(item => !item.deletedAt);
    result.recipientAccounts = result.accounts.filter(item => validRecipient(item) && (actor.role === "platformAdmin" || actor.role === "customerAdmin" && item.customerId === actor.customerId)).map(({ id, name, username, role, customerId }) => ({ id, name, username, role, customerId }));
    result.sentNotices = result.notices.filter(item => item.senderId === actor.id || actor.role === "platformAdmin" && (!item.senderRole || item.senderRole === "platformAdmin"));
    result.notices = result.notices.filter(item => receives(item, actor)).map(item => ({ ...item, read: item.readBy?.includes(actor.id) ?? false, readBy: item.readBy?.filter(id => id === actor.id), ...(actor.role === "user" ? { accountIds: [actor.id], customerIds: [actor.customerId!] } : {}) }));
    if (actor.role !== "platformAdmin") {
      result.customers = result.customers.filter(item => item.id === actor.customerId);
      result.accounts = actor.role === "customerAdmin" ? result.accounts.filter(item => item.customerId === actor.customerId && item.role === "user") : [];
      result.connections = [];
      result.models = result.models.filter(item => item.enabled && result.customers.some(customer => customer.modelIds.includes(item.id)));
      result.tasks = result.tasks.filter(item => item.accountId === actor.id);
      result.templates = result.templates.filter(item => item.enabled && (!item.customerIds.length || item.customerIds.includes(actor.customerId ?? "")));
    }
    return result;
  }, async execute(command) {
    restore(); syncAccounts();
    await apply(command);
    persist();
    if (currentUser.value && scenarioAccountRestriction(currentUser.value)) window.dispatchEvent(new Event("afxenSessionExpired"));
  } };
  async function apply(command: PlatformCommand) {
    const actor = user();
    if (command.type === "readNotice") {
      const item = state.notices.find(item => item.id === command.id && (receives(item, actor) || item.senderId === actor.id || actor.role === "platformAdmin" && (!item.senderRole || item.senderRole === "platformAdmin")));
      if (!item) throw new Error("消息不存在或无权访问"); item.readBy = [...new Set([...(item.readBy ?? []), actor.id])]; return;
    }
    if (command.type === "recoverTask") {
      const task = state.tasks.find(item => item.id === command.id && item.accountId === actor.id);
      if (!task || !task.recoverable) throw new Error("当前任务不支持恢复保存"); task.status = "saving"; task.recoverable = false; delete task.failure; return;
    }
    if (command.type === "account") {
      if (!state.customers.some(item => item.id === command.value.customerId && !item.deletedAt && item.enabled !== false)) throw new Error("请选择有效客户");
      if (actor.role !== "platformAdmin" && !(actor.role === "customerAdmin" && actor.customerId === command.value.customerId)) throw new Error("无权创建此客户账号");
      if (!command.value.username.trim() || !command.value.name.trim() || command.password.length < 6 || command.password.length > 15) throw new Error("请填写账号、姓名和6–15字符的临时密码");
      if (state.accounts.some(item => item.username === command.value.username) || getScenarioAccountSummaries().some(item => item.username === command.value.username)) throw new Error("账号已存在");
      const id = crypto.randomUUID();
      await setScenarioTemporaryPassword({ ...command.value, id, role: "user", enabled: true, mustChangePassword: true }, command.password);
      state.accounts.push({ ...command.value, id, enabled: true, role: "user", mustChangePassword: true, projects: 0, assets: 0, storage: "0 B" }); return;
    }
    if (command.type === "accountStatus") {
      const item = account(command.id);
      if (actor.role === "customerAdmin" && item.disabledBy === "platformAdmin") throw new Error("平台管理员禁用该账号");
      if (command.enabled && state.customers.some(customer => customer.id === item.customerId && customer.enabled === false)) throw new Error("所属客户已被平台管理员禁用");
      item.enabled = command.enabled;
      item.disabledBy = command.enabled ? undefined : actor.role === "platformAdmin" ? "platformAdmin" : "customerAdmin";
      updateScenarioAccount(item.username, { enabled: item.enabled });
      return;
    }
    if (command.type === "notice") {
      if (!["platformAdmin", "customerAdmin"].includes(actor.role)) throw new Error("无权发布消息");
      if (!command.value.title.trim() || !command.value.content.trim()) throw new Error("请填写标题和消息内容");
      const notice = structuredClone(command.value);
      if (actor.role === "customerAdmin") {
        if (notice.kind !== "customer" || !notice.accountIds?.length || notice.accountIds.some(id => !state.accounts.some(item => item.id === id && item.customerId === actor.customerId && validRecipient(item)))) throw new Error("只能选择本客户的有效账号");
        notice.customerIds = [actor.customerId!]; notice.modelId = "";
      } else {
        if (!notice.customerIds.length || notice.customerIds.some(id => !state.customers.some(item => item.id === id && !item.deletedAt && item.enabled !== false))) throw new Error("请选择有效的接收客户");
        if (notice.kind === "model" && (!notice.modelId || !notice.effectiveAt || !notice.impact.trim())) throw new Error("请填写模型、生效时间和草稿影响");
        notice.accountIds = state.accounts.filter(item => notice.customerIds.includes(item.customerId) && validRecipient(item)).map(item => item.id);
        if (!notice.accountIds.length) throw new Error("所选客户没有有效接收账号");
      }
      notice.senderId = actor.id; notice.senderRole = actor.role; notice.readBy = [];
      state.notices.unshift(notice); return;
    }
    if (command.type === "resetPassword") { const item = account(command.id); if (command.password.length < 6 || command.password.length > 15) throw new Error("临时密码须为6–15字符"); await setScenarioTemporaryPassword({ id: item.id, username: item.username, name: item.name, role: item.role, customerId: item.customerId, enabled: item.enabled, mustChangePassword: true }, command.password); item.mustChangePassword = true; return; }
    admin();
    if (command.type === "deleteAccount") {
      const item = account(command.id);
      if (item.id === actor.id) throw new Error("不能删除当前登录账号");
      item.deletedAt = new Date().toISOString(); item.enabled = false;
      updateScenarioAccount(item.username, { enabled: false }); return;
    }
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
    if (command.type === "accountRole") { const item = account(command.id); item.role = command.role; updateScenarioAccount(item.username, { role: command.role }); return; }
    if (command.type === "customer") {
      if (!command.value.name.trim() || command.value.limit < 1) throw new Error("请填写客户名称和有效并发限制");
      if (Object.values(command.value.defaults).some(id => id && !command.value.modelIds.includes(id))) throw new Error("默认模型必须属于已授权模型");
      const index = state.customers.findIndex(item => item.id === command.value.id); if (index < 0) state.customers.push(structuredClone(command.value)); else state.customers[index] = structuredClone(command.value); return;
    }
    if (command.type === "connection") {
      const url = new URL(command.value.endpoint); if (url.protocol !== "https:") throw new Error("服务地址须为HTTPS");
      if (!command.value.name.trim()) throw new Error("请填写连接名称");
      const index = state.connections.findIndex(item => item.id === command.value.id);
      if (index < 0 && !command.credential.trim()) throw new Error("新连接须填写认证信息");
      const value = { ...structuredClone(command.value), verifiedAt: undefined, verification: undefined };
      if (index < 0) state.connections.push(value); else state.connections[index] = value; return;
    }
    if (command.type === "verifyConnection") { const item = state.connections.find(item => item.id === command.id); if (item) { item.verifiedAt = now; item.verification = "演示验证通过；未调用真实厂商"; } return; }
    if (command.type === "verifyModel") { const item = state.models.find(item => item.id === command.id); if (item) item.verified = true; return; }
    if (command.type === "model") {
      if (!command.value.name.trim()) throw new Error("请填写模型名称");
      if (command.value.enabled && !command.value.verified) throw new Error("模型须先验证再上架");
      if (command.value.parameters.some(item => !item.options.includes(item.value))) throw new Error("默认值须属于可选值");
      const index = state.models.findIndex(item => item.id === command.value.id); if (index < 0) state.models.push(structuredClone(command.value)); else state.models[index] = structuredClone(command.value); return;
    }
    if (command.type === "template") { if (!state.templates.some(item => item.id === command.value.id) && !command.source) throw new Error("请选择模板视频或项目快照"); if (command.source) command.value.sourceName = command.source.name; if (!command.value.name.trim() || !command.value.description.trim()) throw new Error("请填写模板名称与内容说明"); const index = state.templates.findIndex(item => item.id === command.value.id); if (index < 0) state.templates.push(structuredClone(command.value)); else state.templates[index] = structuredClone(command.value); }
  }
}
