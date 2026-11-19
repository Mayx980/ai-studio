export type TextEncoding = "utf-8" | "utf-8-bom" | "utf-16le" | "utf-16be";

export function decodeText(bytes: Uint8Array) {
  const encoding: TextEncoding = bytes[0] === 0xff && bytes[1] === 0xfe ? "utf-16le"
    : bytes[0] === 0xfe && bytes[1] === 0xff ? "utf-16be"
      : bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? "utf-8-bom" : "utf-8";
  try {
    const text = new TextDecoder(encoding === "utf-8-bom" ? "utf-8" : encoding, { fatal: true }).decode(bytes);
    if (text.includes("\0")) throw new Error("binary");
    return { text, encoding };
  } catch {
    throw Object.assign(new Error("文件不是受支持的 UTF-8 或带 BOM 的 UTF-16 文本，请先用原编辑器转换编码后再打开，原文件未修改"), { status: 415 });
  }
}

export function encodeText(bytes: Buffer, encoding?: TextEncoding) {
  if (!encoding || encoding === "utf-8") return bytes;
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw Object.assign(new Error("请发送 UTF-8 编码的文本"), { status: 415 }); }
  if (encoding === "utf-8-bom") return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text)]);
  const content = Buffer.from(text, "utf16le");
  if (encoding === "utf-16be") content.swap16();
  return Buffer.concat([Buffer.from(encoding === "utf-16be" ? [0xfe, 0xff] : [0xff, 0xfe]), content]);
}
