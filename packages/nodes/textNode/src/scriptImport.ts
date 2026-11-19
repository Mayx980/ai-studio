async function boundedText(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 32 * 1024 * 1024) { await reader.cancel(); throw new Error("文档解压内容超过 32MB"); } chunks.push(value); } }
  finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; } return new TextDecoder().decode(bytes);
}
async function zipEntries(file: File) {
  const data = new Uint8Array(await file.arrayBuffer()), view = new DataView(data.buffer);
  let end = data.length - 22;
  while (end >= Math.max(0, data.length - 65557) && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0 || view.getUint32(end, true) !== 0x06054b50) throw new Error("文件不是有效的 Office ZIP 文档");
  const entries = new Map<string, string>();
  let offset = view.getUint32(end + 16, true), total = 0;
  for (let i = 0; i < view.getUint16(end + 10, true); i++) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error("Office 文件目录损坏");
    const length = view.getUint16(offset + 28, true), name = new TextDecoder().decode(data.slice(offset + 46, offset + 46 + length));
    const size = view.getUint32(offset + 20, true), inflated = view.getUint32(offset + 24, true), method = view.getUint16(offset + 10, true), local = view.getUint32(offset + 42, true);
    total += inflated;
    if (total > 32 * 1024 * 1024) throw new Error("文档解压后超过 32MB，请缩小文件");
    if (name.endsWith(".xml")) {
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      const compressed = data.slice(start, start + size);
      if (method !== 0 && method !== 8) throw new Error("不支持此 Office 文件压缩格式");
      const blob = new Blob([compressed]);
      const text = method === 0 ? await blob.text() : await boundedText(blob.stream().pipeThrough(new DecompressionStream("deflate-raw")));
      if (new TextEncoder().encode(text).length !== inflated) throw new Error("Office 文档内容长度不一致");
      entries.set(name, text);
    }
    offset += 46 + length + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
  }
  return entries;
}
function xml(text: string) { const document = new DOMParser().parseFromString(text, "application/xml"); if (document.querySelector("parsererror")) throw new Error("文档 XML 损坏"); return document; }
function csv(text: string) {
  const rows: string[][] = [], row: string[] = [];
  let value = "", quoted = false;
  for (let i = 0; i <= text.length; i++) {
    const char = text[i];
    if (char === '"') { if (quoted && text[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted; }
    else if (!quoted && (char === "," || char === "\n" || char === undefined)) { row.push(value.replace(/\r$/, "")); value = ""; if (char !== ",") { if (row.some(Boolean)) rows.push([...row]); row.length = 0; } }
    else value += char ?? "";
  }
  if (quoted) throw new Error("CSV 引号未闭合");
  return rows;
}
export async function readScriptImport(file: File): Promise<{ text: string; table?: string[][] }> {
  if (file.size > 8 * 1024 * 1024) throw new Error("单个导入文件不能超过 8MB");
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "csv") { const table = csv(await file.text()); return { text: table.map(row => row.join(" | ")).join("\n"), table }; }
  if (["txt", "md"].includes(extension ?? "")) return { text: await file.text() };
  if (extension !== "xlsx" && extension !== "docx") throw new Error("当前支持 TXT、Markdown、CSV、XLSX 和 DOCX；其他格式请转换后重试，原文件未改动");
  const entries = await zipEntries(file);
  if (extension === "docx") {
    const content = entries.get("word/document.xml"); if (!content) throw new Error("缺少 Word 正文");
    const text = [...xml(content).getElementsByTagNameNS("*", "p")].map(p => [...p.getElementsByTagNameNS("*", "t")].map(t => t.textContent).join("")).join("\n");
    if (!text.trim()) throw new Error("文档没有可读取文字，扫描图像需先做 OCR");
    return { text };
  }
  const sheets = [...entries.keys()].filter(name => /^xl\/worksheets\/sheet\d+\.xml$/.test(name));
  if (sheets.length !== 1) throw new Error("请保留一个待导入工作表后重试，避免遗漏或混合镜头");
  const strings = [...xml(entries.get("xl/sharedStrings.xml") ?? "<sst/>").getElementsByTagNameNS("*", "si")].map(item => item.textContent ?? "");
  const table = [...xml(entries.get(sheets[0]!)!).getElementsByTagNameNS("*", "row")].map(row => {
    const values: string[] = [];
    for (const cell of row.getElementsByTagNameNS("*", "c")) {
      if (cell.getElementsByTagNameNS("*", "f").length) throw new Error("表格包含公式，请先粘贴为纯文本值后导入");
      const column = (cell.getAttribute("r")?.match(/^[A-Z]+/)?.[0] ?? "A").split("").reduce((n, letter) => n * 26 + letter.charCodeAt(0) - 64, 0) - 1;
      const value = cell.getElementsByTagNameNS("*", "v")[0]?.textContent ?? "";
      values[column] = cell.getAttribute("t") === "s" ? strings[Number(value)] ?? "" : cell.getAttribute("t") === "inlineStr" ? cell.textContent ?? "" : value;
    }
    return Array.from({ length: values.length }, (_, index) => values[index] ?? "");
  }).filter(row => row.some(Boolean));
  return { text: table.map(row => row.join(" | ")).join("\n"), table };
}
