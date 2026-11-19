import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";

// 离线生成账号SQL；不加载应用、读取配置或连接数据库。
if (!process.stdin.isTTY || !process.stderr.isTTY) throw new Error("请在交互终端生成账号SQL");
const operation = process.argv[2] ?? "create";
if (!["create", "reset", "enable", "disable"].includes(operation)) throw new Error("操作只支持create、reset、enable、disable");
let hidden = false;
const output = new Writable({ write(chunk, _encoding, callback) { if (!hidden) process.stderr.write(chunk); callback(); } });
const terminal = createInterface({ input: process.stdin, output, terminal: true });
const sqlText = (value: string) => `CONVERT(X'${Buffer.from(value).toString("hex")}' USING utf8mb4)`;

try {
  const username = (await terminal.question("用户名（3–64位字母/数字/点）：")).trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9.]{2,63}$/.test(username)) throw new Error("用户名格式无效");
  if (operation === "enable" || operation === "disable") {
    console.log(`UPDATE users SET enabled = ${operation === "enable" ? 1 : 0}, authVersion = authVersion + 1 WHERE username = ${sqlText(username)};`);
  } else {
    const name = operation === "create" ? (await terminal.question("显示名称：")).trim() : "";
    if (operation === "create" && (!name || name.length > 80)) throw new Error("显示名称须为1–80个字符");
    process.stderr.write("密码（15–128字符，输入隐藏）：");
    hidden = true;
    const password = await terminal.question("");
    process.stderr.write("\n再次输入密码：");
    const confirmation = await terminal.question("");
    process.stderr.write("\n");
    if (password.length < 15 || password.length > 128) throw new Error("密码须为15–128字符");
    if (password !== confirmation) throw new Error("两次密码不一致");
    const hash = await Bun.password.hash(password, { algorithm: "argon2id" });
    if (operation === "create") {
      console.log("INSERT INTO users (id, username, name, role, enabled, passwordHash, authVersion, mustChangePassword, legacyRoot, createdAt)");
      console.log(`VALUES (${sqlText(randomUUID())}, ${sqlText(username)}, ${sqlText(name)}, 'user', 1, ${sqlText(hash)}, 1, 1, 0, CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000 AS UNSIGNED));`);
    } else {
      console.log(`UPDATE users SET passwordHash = ${sqlText(hash)}, authVersion = authVersion + 1, mustChangePassword = 1 WHERE username = ${sqlText(username)};`);
    }
  }
} finally { terminal.close(); }
