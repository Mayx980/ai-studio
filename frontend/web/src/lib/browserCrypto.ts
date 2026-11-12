// ACT: 内网 HTTP 没有原生 randomUUID；在页面和插件加载前用安全随机数补齐 UUID v4。
if (typeof globalThis.crypto?.randomUUID !== "function" && typeof globalThis.crypto?.getRandomValues === "function") {
  const browserCrypto = globalThis.crypto;
  browserCrypto.randomUUID = () => {
    const bytes = browserCrypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` as ReturnType<Crypto["randomUUID"]>;
  };
}
