export const scriptHeaders = ["镜头号", "时长", "景别", "运镜方式", "画面", "台词/音效", "角色表情反应", "环境场景", "分镜图提示词", "视频运动提示词", "角色形象描述", "场景提示词", "角色提示词", "道具提示词"];

export const scriptGenerationInstruction = `输出 Markdown 分镜表，表头依次为：${scriptHeaders.filter(header => header !== "角色形象描述").join("、")}。每个镜头一行，仅输出表格。所有提示词必须使用中文，分别填写场景、角色、道具提示词，姓名、性格、背景与外形统一写入角色提示词；不涉及的内容留空，不编造道具。`;

export function scriptCellValue(cells: string[], index: number) {
  if (index === 10) return "";
  if (index === 12) return [...new Set([cells[12], cells[10]].filter(Boolean))].join("\n");
  return cells[index] ?? "";
}
