import useWorkspaceFiles from "@/lib/workspaceFiles";
import type { AgentConversation, AgentMessage } from "./types";

const folder = ".agent/browserSessions";
async function sessionFiles(directory: string) {
  const files = useWorkspaceFiles(directory);
  for (const path of [".agent", folder]) await files.mkdir(path).catch(error => { if (error.code !== "EEXIST") throw error; });
  return files;
}
export async function createBrowserConversation(directory: string): Promise<AgentConversation> {
  const files = await sessionFiles(directory);
  const session: AgentConversation = { file: `${crypto.randomUUID()}.json`, name: "新对话", messages: [] };
  await files.writeJson(`${folder}/${session.file}`, session, true);
  return session;
}
export async function readBrowserConversation(directory: string, file: string) {
  if (!/^[\w-]+\.json$/.test(file)) throw new Error("对话名称无效");
  const session = await useWorkspaceFiles(directory).readJson<AgentConversation>(`${folder}/${file}`);
  if (session?.file !== file || typeof session.name !== "string" || !Array.isArray(session.messages) || session.messages.some(message => !message || typeof message.id !== "string" || !["user", "assistant"].includes(message.role) || typeof message.content !== "string")) throw new Error("浏览器对话数据无效");
  return session;
}
export async function listBrowserConversations(directory: string) {
  const files = await sessionFiles(directory);
  const { entries } = await files.list(folder);
  return Promise.all(entries.filter(entry => entry.type === "file" && /\.json$/.test(entry.name)).map(async entry => {
    const session = await readBrowserConversation(directory, entry.name);
    return { file: entry.name, name: session.name, messageCount: session.messages.length, modified: (session as AgentConversation & { modified?: string }).modified ?? "" };
  })).then(items => items.sort((a, b) => b.modified.localeCompare(a.modified)));
}
export async function saveBrowserConversation(directory: string, file: string, messages: AgentMessage[]) {
  const files = await sessionFiles(directory);
  const path = `${folder}/${file}`;
  const snapshot = await files.readTextSnapshot(path);
  const session = JSON.parse(snapshot.text) as AgentConversation & { modified?: string };
  session.messages = messages.map(message => ({ ...message, streaming: false, attachments: message.attachments?.map(({ file, ...attachment }) => attachment) }));
  if (session.name === "新对话") session.name = messages.find(message => message.role === "user")?.content.slice(0, 80) || session.name;
  session.modified = new Date().toISOString();
  await files.writeTextSnapshot(path, JSON.stringify(session), snapshot);
}
export async function renameBrowserConversation(directory: string, file: string, name: string) {
  const files = useWorkspaceFiles(directory);
  const session = await readBrowserConversation(directory, file);
  session.name = name;
  await files.writeJson(`${folder}/${file}`, session);
  return { name };
}
export async function removeBrowserConversation(directory: string, file: string) {
  await readBrowserConversation(directory, file);
  await useWorkspaceFiles(directory).remove(`${folder}/${file}`);
}
