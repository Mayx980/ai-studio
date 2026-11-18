export type PlatformRole = "platformAdmin" | "customerAdmin" | "user";
export type Customer = { id: string; name: string; modelIds: string[]; defaults: Record<string, string>; limit: number };
export type ManagedAccount = { id: string; username: string; name: string; customerId: string; role: PlatformRole; enabled: boolean; mustChangePassword: boolean; projects: number; assets: number; storage: string };
export type ServiceConnection = { id: string; name: string; protocol: string; endpoint: string; enabled: boolean; verifiedAt?: string; verification?: string };
export type ModelParameter = { key: string; name: string; options: string[]; value: string; exposed: boolean; required: boolean };
export type PlatformModel = { id: string; name: string; kind: "text" | "image" | "video" | "audio"; connectionId: string; enabled: boolean; verified: boolean; description: string; parameters: ModelParameter[] };
export type PlatformNotice = { id: string; title: string; modelId: string; content: string; effectiveAt: string; impact: string; customerIds: string[]; createdAt: string; read: boolean };
export type PlatformTask = { id: string; name: string; kind: string; modelId: string; status: "waiting" | "running" | "saving" | "completed" | "failed" | "unknown"; createdAt: string; accountId: string; customerId: string; elapsed: string; usage: string; failure?: string; directory?: string; canvasPath?: string; conversationFile?: string; parameters: Record<string, string>; recoverable?: boolean };
export type PlatformTemplate = { id: string; name: string; kind: "video" | "project"; description: string; customerIds: string[]; modelIds: string[]; enabled: boolean; sourceName?: string };
export type PlatformState = { customers: Customer[]; accounts: ManagedAccount[]; connections: ServiceConnection[]; models: PlatformModel[]; notices: PlatformNotice[]; tasks: PlatformTask[]; templates: PlatformTemplate[] };
export type PlatformCommand =
  | { type: "customer"; value: Customer }
  | { type: "account"; value: Pick<ManagedAccount, "username" | "name" | "customerId">; password: string }
  | { type: "accountStatus"; id: string; enabled: boolean }
  | { type: "accountRole"; id: string; role: "user" | "customerAdmin" }
  | { type: "resetPassword"; id: string; password: string }
  | { type: "connection"; value: ServiceConnection; credential: string }
  | { type: "verifyConnection"; id: string }
  | { type: "model"; value: PlatformModel }
  | { type: "verifyModel"; id: string }
  | { type: "notice"; value: PlatformNotice }
  | { type: "readNotice"; id: string }
  | { type: "template"; value: PlatformTemplate; source?: File }
  | { type: "recoverTask"; id: string };
export interface PlatformPort {
  readonly scope: "production" | "scenario";
  load(): Promise<PlatformState>;
  execute(command: PlatformCommand): Promise<void>;
}
// ACT: 管理 API 尚未交付；生产装配明确失败，不向猜测的端点写入。
const unavailable = async (): Promise<never> => { throw new Error("平台管理接口尚未接通，无法读取或保存。请使用隔离预览查看本轮 UIUX。"); };
export let platform: PlatformPort = { scope: "production", load: unavailable, execute: unavailable };
export function configurePlatformPort(port: PlatformPort) { platform = port; }
export const roleLabels: Record<PlatformRole, string> = { platformAdmin: "平台管理员", customerAdmin: "客户管理员", user: "普通用户" };
export const taskLabels: Record<PlatformTask["status"], string> = { waiting: "等待处理", running: "生成中", saving: "结果保存中", completed: "已完成", failed: "失败", unknown: "状态待确认" };
