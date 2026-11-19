import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { readSecretFile, unavailable } from "./index";

let rootKey: Buffer | undefined;
let keyVersion = "";

export async function initialize() {
  try {
    const config = JSON.parse(await readSecretFile(process.env.AFXEN_CREDENTIAL_KEY_FILE));
    if (typeof config.keyVersion !== "string" || !/^[a-zA-Z0-9]{1,32}$/.test(config.keyVersion)
      || typeof config.key !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(config.key)) throw unavailable();
    const key = Buffer.from(config.key, "base64");
    if (key.length !== 32) throw unavailable();
    rootKey = key;
    keyVersion = config.keyVersion;
  } catch { rootKey = undefined; keyVersion = ""; }
}

function requireKey() {
  if (!rootKey) throw Object.assign(new Error("供应商凭据加密密钥未配置或无效"), { status: 503, code: "EKEY" });
  return rootKey;
}
export function checkConfiguration() { requireKey(); }

export function encrypt(value: string, identity: string) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", requireKey(), nonce);
  cipher.setAAD(Buffer.from(identity));
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return { keyVersion, nonce, ciphertext, tag: cipher.getAuthTag() };
}

export function decrypt(record: { keyVersion: string; nonce: Uint8Array; ciphertext: Uint8Array; tag: Uint8Array }, identity: string) {
  const key = requireKey();
  try {
    if (record.keyVersion !== keyVersion) throw unavailable();
    const cipher = createDecipheriv("aes-256-gcm", key, record.nonce);
    cipher.setAAD(Buffer.from(identity));
    cipher.setAuthTag(record.tag);
    return Buffer.concat([cipher.update(record.ciphertext), cipher.final()]).toString("utf8");
  } catch { throw Object.assign(new Error("供应商凭据解密失败，请核对备份对应的密钥"), { status: 503, code: "EKEY" }); }
}
