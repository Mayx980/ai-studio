import { SQL } from "bun";
import { readFile, lstat, realpath } from "@toonflow/file";
import { isAbsolute } from "node:path";
import { z } from "zod";

let pool: SQL | undefined;
const schemaDigest = "16e7f3cb8ba23109aa3fd877cce472ed3f35d5154509a27d4e3df34c5d304b7e";
const connectionSchema = z.object({
  host: z.string().min(1), port: z.number().int().min(1).max(65535).default(3306),
  database: z.string().regex(/^[a-zA-Z][a-zA-Z0-9]*$/), username: z.string().min(1), password: z.string().min(1),
  ca: z.string().min(1).optional(),
}).strict();

export function unavailable() {
  return Object.assign(new Error("数据库不可用或结构尚未初始化，请联系管理员；当前内容未覆盖"), { status: 503, code: "EDATABASE" });
}

export async function readSecretFile(path: string | undefined) {
  if (!path || !isAbsolute(path)) throw unavailable();
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || await realpath(path) !== path || info.size > 65536 || (process.platform !== "win32" && (info.mode & 0o077) !== 0)) throw unavailable();
  return readFile(path, "utf8");
}

export async function initialize() {
  try {
    const config = connectionSchema.parse(JSON.parse(await readSecretFile(process.env.AFXEN_DATABASE_CONFIG)));
    pool = new SQL({ adapter: "mysql", hostname: config.host, port: config.port, database: config.database,
      username: config.username, password: config.password, max: 10, connectionTimeout: 10, idleTimeout: 30,
      tls: config.ca ? { ca: config.ca, rejectUnauthorized: true } : false });
  } catch { pool = undefined; }
}

export async function run<T>(operation: (sql: SQL) => Promise<T>): Promise<T> {
  if (!pool) throw unavailable();
  try { return await operation(pool); }
  catch (cause) {
    if (cause instanceof SQL.SQLError) {
      if ((cause as { errno?: number }).errno === 1062) throw Object.assign(new Error("名称或记录已存在，原内容未覆盖"), { status: 409, code: "EEXIST" });
    }
    // 驱动连接/认证错误不一定继承SQLError；只透传业务层明确标记的HTTP错误。
    if (!(cause instanceof SQL.SQLError) && typeof (cause as { status?: unknown })?.status === "number") throw cause;
    throw unavailable();
  }
}

export async function health() {
  return run(async sql => {
    const rows = await sql`SELECT version, digest FROM schemaMigrations ORDER BY version DESC LIMIT 1`;
    if (Number(rows[0]?.version) !== 1 || rows[0]?.digest !== schemaDigest) throw unavailable();
    const [tables] = await sql`SELECT COUNT(*) AS total FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME IN ('schemaMigrations','users','sessions','userSettings','providerSecrets','creationStates','libraryStates','mediaFiles','dataImports')`;
    if (Number(tables.total) !== 9) throw unavailable();
    return true;
  });
}

export function parseJson<T = Record<string, unknown>>(value: unknown): T {
  return (typeof value === "string" ? JSON.parse(value) : value) as T;
}
