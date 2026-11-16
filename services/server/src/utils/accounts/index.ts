import { createHash, randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import type { SQL } from "bun";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { errorFromCause } from "@/lib/responseFormat";
import * as database from "@/utils/database";
import * as secrets from "@/utils/database/secrets";
import { currentAccount, requireAccount, requireAdmin, runAs, systemRoot, usesAccounts, type Account, type AccountContext } from "./context";

export { currentAccount, requireAccount, requireAdmin, usesAccounts } from "./context";
export const passwordSchema = z.string().min(15).max(128);
export const usernameSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9.]{2,63}$/);
const cookieName = "afxenSession";
const sessionLifetime = 12 * 60 * 60 * 1000;
const failures = new Map<string, { count: number; expires: number }>();
let passwordOperations = 0;
let dummyHash: Promise<string> | undefined;

function digest(value: string) { return createHash("sha256").update(value).digest("hex"); }
function denied(status = 401, message = "登录已失效，请保留未保存内容后重新登录") { return Object.assign(new Error(message), { status }); }
export async function assertSession(sql?: SQL) {
  if (!usesAccounts()) return;
  const value = requireAccount();
  const check = async (connection: SQL) => {
    const [user] = await connection`SELECT enabled, authVersion FROM users WHERE id = ${value.user.id} FOR UPDATE`;
    const [session] = await connection`SELECT tokenHash FROM sessions WHERE tokenHash = ${value.session} AND userId = ${value.user.id}
      AND expiresAt > ${Date.now()} AND authVersion = ${value.user.authVersion} FOR UPDATE`;
    if (!user?.enabled || Number(user.authVersion) !== value.user.authVersion || !session) throw denied();
  };
  return sql ? check(sql) : database.run(connection => connection.begin(check));
}
export async function assertWriteAccess(sql?: SQL) {
  if (usesAccounts() && !requireAccount().background) await assertSession(sql);
}

async function passwordOperation<T>(operation: () => Promise<T>) {
  if (passwordOperations >= 4) throw denied(429, "密码操作过多，请稍后再试");
  passwordOperations++;
  try { return await operation(); }
  finally { passwordOperations--; }
}
function hashPassword(password: string) {
  return passwordOperation(() => Bun.password.hash(password, { algorithm: "argon2id" }));
}
function verifyPassword(password: string, hash: string) {
  return passwordOperation(async () => {
    try { return await Bun.password.verify(password, hash); }
    catch { throw Object.assign(new Error("密码校验暂不可用，请联系管理员"), { status: 503 }); }
  });
}
function account(row: Record<string, any>): Account {
  return { id: row.id, username: row.username, name: row.name, role: row.role, enabled: Number(row.enabled) === 1,
    authVersion: Number(row.authVersion), mustChangePassword: Number(row.mustChangePassword) === 1, legacyRoot: Number(row.legacyRoot) === 1 };
}
export function publicAccount(value: Account) {
  return { id: value.id, username: value.username, name: value.name, role: value.role, enabled: Number(value.enabled) === 1, mustChangePassword: Number(value.mustChangePassword) === 1 };
}

export async function readConfiguration(sql: SQL, id: string) {
  const [row] = await sql`SELECT payload, revision FROM userSettings WHERE userId = ${id} FOR SHARE`;
  if (!row) throw database.unavailable();
  const configuration = database.parseJson(row.payload);
  const settings = (configuration.settings ??= {}) as Record<string, any>;
  const records = await sql`SELECT providerId, kind, keyVersion, nonce, ciphertext, tag FROM providerSecrets WHERE userId = ${id} FOR SHARE`;
  for (const record of records) {
    const provider = record.kind === "text" ? (settings.customProviders ?? []).find((item: any) => item.id === record.providerId)
      : settings.mediaProviderConfigs?.[record.providerId];
    if (!provider) throw database.unavailable();
    provider.apiKey = secrets.decrypt(record, JSON.stringify([id, record.kind, record.providerId]));
  }
  return { configuration, configurationRevision: Number(row.revision) };
}

export async function writeConfiguration(sql: SQL, id: string, configuration: Record<string, unknown>, expectedRevision?: number) {
  const [row] = await sql`SELECT revision FROM userSettings WHERE userId = ${id} FOR UPDATE`;
  if (expectedRevision !== undefined && (!row || Number(row.revision) !== expectedRevision)) throw denied(409, "设置已被其它页面修改，请保留当前内容并刷新后重试");
  const payload = structuredClone(configuration);
  const settings = (payload.settings ??= {}) as Record<string, any>;
  const values: { providerId: string; kind: string; value: string }[] = [];
  for (const [kind, providers] of [["text", settings.customProviders ?? []], ["media", Object.entries(settings.mediaProviderConfigs ?? {}).map(([id, item]) => ({ ...(item as object), id }))]] as const) {
    for (const provider of providers) {
      if (typeof provider.apiKey === "string" && provider.apiKey) values.push({ providerId: provider.id, kind, value: provider.apiKey });
    }
  }
  for (const provider of settings.customProviders ?? []) delete provider.apiKey;
  for (const provider of Object.values(settings.mediaProviderConfigs ?? {}) as Record<string, unknown>[]) delete provider.apiKey;
  const content = JSON.stringify(payload);
  if (Buffer.byteLength(content) > 16 * 1024 * 1024) throw denied(413, "个人设置超过16 MiB");
  const revision = Number(row?.revision ?? 0) + 1;
  if (row) await sql`UPDATE userSettings SET payload = ${content}, revision = ${revision} WHERE userId = ${id}`;
  else await sql`INSERT INTO userSettings (userId, payload, revision) VALUES (${id}, ${content}, ${revision})`;
  await sql`DELETE FROM providerSecrets WHERE userId = ${id}`;
  for (const value of values) {
    const encrypted = secrets.encrypt(value.value, JSON.stringify([id, value.kind, value.providerId]));
    await sql`INSERT INTO providerSecrets (userId, providerId, kind, keyVersion, nonce, ciphertext, tag)
      VALUES (${id}, ${value.providerId}, ${value.kind}, ${encrypted.keyVersion}, ${encrypted.nonce}, ${encrypted.ciphertext}, ${encrypted.tag})`;
  }
  return revision;
}

export async function saveConfiguration(configuration: Record<string, unknown>) {
  const value = requireAccount();
  const revision = await database.run(sql => sql.begin(async transaction => {
    await assertSession(transaction);
    return writeConfiguration(transaction, value.user.id, configuration, value.configurationRevision);
  }));
  value.configuration = structuredClone(configuration);
  value.configurationRevision = revision;
}

function sessionToken(request: Request) {
  const cookie = request.get("cookie")?.split(";").map(item => item.trim()).find(item => item.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  return cookie && /^[a-f0-9]{64}$/.test(cookie) ? cookie : undefined;
}

export function assertOrigin(request: Request) {
  const expected = process.env.AFXEN_PUBLIC_ORIGIN || `${request.protocol}://${request.get("host")}`;
  const origin = request.get("origin");
  if (!origin || origin !== new URL(expected).origin) throw denied(403, "请求来源无效，请从本站页面操作");
}

export async function authenticate(request: Request) {
  const token = sessionToken(request);
  if (!token) throw denied();
  return database.run(sql => sql.begin(async transaction => {
    const [row] = await transaction`SELECT u.*, s.csrf, s.tokenHash FROM sessions s JOIN users u ON u.id = s.userId
      WHERE s.tokenHash = ${digest(token)} AND s.expiresAt > ${Date.now()} AND s.authVersion = u.authVersion AND u.enabled = 1`;
    if (!row) throw denied();
    const user = account(row);
    const root = user.legacyRoot ? systemRoot() : join(systemRoot(), "users", user.id);
    return { user, root, session: row.tokenHash, csrf: row.csrf, ...await readConfiguration(transaction, user.id) } satisfies AccountContext;
  }));
}

export async function middleware(request: Request, response: Response, next: NextFunction) {
  if (!usesAccounts()) return next();
  response.set("Cache-Control", "no-store");
  try {
    if (["/auth/login", "/auth/session", "/health"].includes(request.path)) return next();
    const value = await authenticate(request);
    const pageId = request.get("x-afxen-user") ?? (typeof request.query.account === "string" ? request.query.account : undefined);
    if (pageId !== value.user.id) throw denied();
    if (!["GET", "HEAD"].includes(request.method)) {
      assertOrigin(request);
      if (request.get("x-afxen-csrf") !== value.csrf) throw denied(403, "页面校验已失效，请刷新后重试");
    }
    if (value.user.mustChangePassword && !["/auth/password", "/auth/logout"].includes(request.path)) throw denied(403, "请先修改初始密码");
    runAs(value, () => {
      const path = request.path;
      if (/^\/(desktop|mobileLink|browser|connection)(\/|$)/.test(path) || /^\/agents\/(a2a|connect)(\/|$)/.test(path)
        || /^\/mcp(\/|$)/.test(path)) throw denied(403, "多用户Web服务不开放此本机或未绑定用户的能力");
      if (/^\/(tools|nodes|ext|skills|agents)\/(install|uninstall|save|create|move|order|setEnabled)(\/|$)/.test(path)
        || /^\/providers\/(debug|media\/(add|delete|validate))(\/|$)/.test(path) || path === "/plugins/export"
        || /^\/ffmpeg\/(download|cancel)$/.test(path)) requireAdmin();
      if (!/^\/(auth|accounts|agent|agents|ai|assets|ext|ffmpeg|marketplace|mcp|nodes|plugins|providers|settings|singleAgent|skills|studio|tools|workspaces)(\/|$)/.test(path)) {
        throw denied(403, "该接口尚未归入用户授权范围");
      }
      next();
    });
    if (response.writableEnded || response.destroyed) return;
    let checking = false;
    const timer = setInterval(() => {
      if (checking || response.writableEnded || response.destroyed) return;
      checking = true;
      void runAs(value, () => assertSession()).catch(cause => {
        if (response.writableEnded || response.destroyed) return;
        const body = errorFromCause(cause);
        if (!response.headersSent) response.status((cause as { status?: number }).status ?? 503).json(body);
        else if (String(response.getHeader("content-type")).includes("text/event-stream")) response.end(`data: ${JSON.stringify({ type: "error", message: body.message })}\n\n`);
        else response.destroy();
      }).finally(() => { checking = false; });
    }, 5000);
    timer.unref();
    response.once("close", () => clearInterval(timer));
    response.once("finish", () => clearInterval(timer));
  } catch (cause) { next(cause); }
}

function setCookie(request: Request, response: Response, token: string, maxAge: number) {
  const secure = process.env.AFXEN_PUBLIC_ORIGIN ? new URL(process.env.AFXEN_PUBLIC_ORIGIN).protocol === "https:" : request.secure;
  response.cookie(cookieName, token, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge });
}

export async function login(request: Request, response: Response, username: string, password: string) {
  assertOrigin(request);
  const normalized = usernameSchema.parse(username).toLowerCase();
  const now = Date.now();
  for (const [key, value] of failures) if (value.expires < now) failures.delete(key);
  const sources = [`ip:${request.socket.remoteAddress}`, `name:${digest(normalized)}`];
  if (passwordOperations >= 4 || failures.size >= 10000 || sources.some(key => (failures.get(key)?.count ?? 0) >= 10)) throw denied(429, "登录尝试过多，请稍后再试");
  const user = await database.run(async sql => (await sql`SELECT * FROM users WHERE username = ${normalized}`)[0]);
  const hash = user?.passwordHash ?? await (dummyHash ??= hashPassword(randomBytes(32).toString("hex")).catch(cause => { dummyHash = undefined; throw cause; }));
  const valid = await verifyPassword(password, hash);
  if (!valid || !user?.enabled) {
    for (const key of sources) { const value = failures.get(key); failures.set(key, { count: (value?.count ?? 0) + 1, expires: value?.expires ?? now + 15 * 60_000 }); }
    throw denied(401, "用户名或密码错误");
  }
  const token = randomBytes(32).toString("hex");
  const csrf = randomBytes(32).toString("hex");
  await database.run(sql => sql.begin(async transaction => {
    const [current] = await transaction`SELECT enabled, authVersion FROM users WHERE id = ${user.id} FOR UPDATE`;
    if (!current?.enabled || Number(current.authVersion) !== Number(user.authVersion)) throw denied();
    await transaction`DELETE FROM sessions WHERE expiresAt <= ${now}`;
    await transaction`INSERT INTO sessions (tokenHash, userId, authVersion, csrf, expiresAt)
      VALUES (${digest(token)}, ${user.id}, ${user.authVersion}, ${csrf}, ${now + sessionLifetime})`;
  }));
  setCookie(request, response, token, sessionLifetime);
  return { user: publicAccount(account(user)), csrf, mode: "users" };
}

export async function logout(request: Request, response: Response) {
  const value = requireAccount();
  await database.run(sql => sql`DELETE FROM sessions WHERE tokenHash = ${value.session} AND userId = ${value.user.id}`);
  setCookie(request, response, "", 0);
}

export async function listAccounts() {
  requireAdmin();
  return database.run(async sql => {
    const rows = await sql`SELECT id, username, name, role, enabled, mustChangePassword FROM users ORDER BY createdAt, id LIMIT 1001`;
    if (rows.length > 1000) throw denied(413, "账号数超过当前管理入口上限1000，未截断列表");
    return rows.map(publicAccount);
  });
}

export async function createAccount(username: string, name: string, password: string) {
  requireAdmin();
  const title = z.string().min(1).max(80).parse(name.trim());
  const hash = await hashPassword(passwordSchema.parse(password));
  const id = randomUUID();
  await database.run(sql => sql.begin(async transaction => {
    await transaction`SELECT id FROM users WHERE role = 'admin' ORDER BY id FOR UPDATE`;
    await assertSession(transaction);
    const [count] = await transaction`SELECT COUNT(*) AS total FROM users`;
    if (Number(count.total) >= 1000) throw denied(409, "当前单实例最多管理1000个账号");
    await transaction`INSERT INTO users (id, username, name, role, enabled, passwordHash, authVersion, mustChangePassword, legacyRoot, createdAt)
      VALUES (${id}, ${usernameSchema.parse(username).toLowerCase()}, ${title}, 'user', 1, ${hash}, 1, 1, 0, ${Date.now()})`;
    await writeConfiguration(transaction, id, { settings: {} });
    const state = "{}";
    await transaction`INSERT INTO creationStates (userId, payload, revision) VALUES (${id}, ${state}, ${digest(state)})`;
  }));
  return { id };
}

export async function updateAccount(id: string, enabled: boolean) {
  requireAdmin();
  await database.run(sql => sql.begin(async transaction => {
    // ACT: 当前只支持初始管理员和普通账号；按管理员行串行化管理，不修改迁移标记。
    await transaction`SELECT id FROM users WHERE role = 'admin' ORDER BY id FOR UPDATE`;
    await assertSession(transaction);
    const [row] = await transaction`SELECT role, enabled FROM users WHERE id = ${id} FOR UPDATE`;
    if (!row) throw denied(404, "账号不存在");
    if (!enabled && row.role === "admin") {
      const [count] = await transaction`SELECT COUNT(*) AS total FROM users WHERE role = 'admin' AND enabled = 1`;
      if (Number(count.total) <= 1) throw denied(409, "不能停用最后一个有效管理员");
    }
    await transaction`UPDATE users SET enabled = ${enabled ? 1 : 0}, authVersion = authVersion + 1 WHERE id = ${id}`;
    await transaction`DELETE FROM sessions WHERE userId = ${id}`;
  }));
}

export async function changePassword(password: string, previous?: string, targetId?: string) {
  const value = requireAccount();
  if (targetId) requireAdmin();
  const id = targetId ?? value.user.id;
  const [row] = await database.run(sql => sql`SELECT passwordHash, authVersion FROM users WHERE id = ${id}`);
  if (!row) throw denied(404, "账号不存在");
  if (!targetId && (!previous || !await verifyPassword(previous, row.passwordHash))) throw denied(403, "当前密码错误");
  const hash = await hashPassword(passwordSchema.parse(password));
  await database.run(sql => sql.begin(async transaction => {
    if (targetId) await transaction`SELECT id FROM users WHERE role = 'admin' ORDER BY id FOR UPDATE`;
    await assertSession(transaction);
    const [current] = await transaction`SELECT authVersion FROM users WHERE id = ${id} FOR UPDATE`;
    if (Number(current?.authVersion) !== Number(row.authVersion)) throw denied(409, "账号已变更，请重新操作");
    await transaction`UPDATE users SET passwordHash = ${hash}, authVersion = authVersion + 1, mustChangePassword = ${targetId ? 1 : 0} WHERE id = ${id}`;
    await transaction`DELETE FROM sessions WHERE userId = ${id}`;
  }));
}
