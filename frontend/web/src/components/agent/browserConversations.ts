import { getWorkspaceFailure } from "@toonflow/nodes-scaffold/workspaceFiles";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import type { AgentConversation, AgentMessage } from "./types";
import { isProfessionalCreation } from "./professionalCreation";

const sessionSnapshots = new Map<string, { text: string; revision: string; encoding: "utf-8" | "utf-8-bom" | "utf-16le" | "utf-16be" }>();
const folder = ".agent/browserSessions";
async function sessionFiles(directory: string) {
  const files = useWorkspaceFiles(directory);
  for (const path of [".agent", folder]) await files.mkdir(path).catch(error => { if (getWorkspaceFailure(error).code !== "EEXIST") throw error; });
  return files;
}
export async function createBrowserConversation(directory: string): Promise<AgentConversation> {
  const files = await sessionFiles(directory);
  const session: AgentConversation = { file: `${crypto.randomUUID()}.json`, name: "新对话", messages: [] };
  await files.writeJson(`${folder}/${session.file}`, session, true);
  sessionSnapshots.set(JSON.stringify([directory, session.file]), await files.readTextSnapshot(`${folder}/${session.file}`));
  return session;
}
export async function readBrowserConversation(directory: string, file: string, remember = true) {
  if (!/^[\w-]+\.json$/.test(file)) throw new Error("对话名称无效");
  const snapshot = await useWorkspaceFiles(directory).readTextSnapshot(`${folder}/${file}`);
  const session = JSON.parse(snapshot.text) as AgentConversation;
  if (session?.file !== file || typeof session.name !== "string" || !Array.isArray(session.messages) || session.messages.some(message => !message || typeof message.id !== "string" || !["user", "assistant"].includes(message.role) || typeof message.content !== "string")) throw new Error("浏览器对话数据无效");
  if (session.messages.some(message => message.professional !== undefined && !isProfessionalCreation(message.professional))) throw new Error("专业创作流程数据无效，请保留当前项目并检查对话文件");
  if (remember) sessionSnapshots.set(JSON.stringify([directory, file]), snapshot);
  return session;
}
export async function listBrowserConversations(directory: string) {
  const files = await sessionFiles(directory);
  const { entries } = await files.list(folder);
  return Promise.all(entries.filter(entry => entry.type === "file" && /\.json$/.test(entry.name)).map(async entry => {
    const session = await readBrowserConversation(directory, entry.name, false);
    return { file: entry.name, name: session.name, messageCount: session.messages.length, modified: (session as AgentConversation & { modified?: string }).modified ?? "" };
  })).then(items => items.sort((a, b) => b.modified.localeCompare(a.modified)));
}
export async function saveBrowserConversation(directory: string, file: string, messages: AgentMessage[], creationMode?: "simple" | "professional") {
  const files = await sessionFiles(directory);
  const path = `${folder}/${file}`;
  if (!/^[\w-]+\.json$/.test(file)) throw new Error("对话名称无效");
  const key = JSON.stringify([directory, file]);
  const snapshot = sessionSnapshots.get(key);
  if (!snapshot) throw new Error("请先重新打开对话再保存");
  const session = JSON.parse(snapshot.text) as AgentConversation & { modified?: string };
  if (creationMode) session.creationMode = creationMode;
  session.messages = messages.map(message => ({ ...message, streaming: false, attachments: message.attachments?.map(({ file, ...attachment }) => attachment) }));
  if (session.name === "新对话") session.name = messages.find(message => message.role === "user")?.content.slice(0, 80) || session.name;
  session.modified = new Date().toISOString();
  const text = JSON.stringify(session);
  const revision = await files.writeTextSnapshot(path, text, snapshot);
  sessionSnapshots.set(key, { ...snapshot, text, revision });
}
export async function renameBrowserConversation(directory: string, file: string, name: string) {
  const files = useWorkspaceFiles(directory);
  if (!/^[\w-]+\.json$/.test(file) || !name.trim() || name.trim().length > 80) throw new Error("对话名称无效");
  const snapshot = await files.readTextSnapshot(`${folder}/${file}`);
  const session = JSON.parse(snapshot.text) as AgentConversation;
  session.name = name.trim();
  const text = JSON.stringify(session);
  const revision = await files.writeTextSnapshot(`${folder}/${file}`, text, snapshot);
  sessionSnapshots.set(JSON.stringify([directory, file]), { ...snapshot, text, revision });
  return { name };
}
export async function removeBrowserConversation(directory: string, file: string) {
  await readBrowserConversation(directory, file);
  await useWorkspaceFiles(directory).remove(`${folder}/${file}`);
}
