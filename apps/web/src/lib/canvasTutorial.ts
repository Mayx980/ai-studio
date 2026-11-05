import type { Node, Edge } from "@vue-flow/core";

export const singleImageTutorialPrompt = "去掉人物，其他不变";
export const singleVideoTutorialPrompt = "女人{{ref 2}}穿着白色毛衣 站在{{ref 1}}房顶上给云朵刷粉色的油漆，白色的云朵变成了粉色的云朵。女人动作优雅、专注而平静，没有任何惊讶的表情。模拟胶片摄影，轻微胶片颗粒和褪色质感，柔和景深，梦幻超现实主义，诗意、安静、优雅，荒诞但非常自然，像一部被遗忘的1950年代艺术电影。没有背景音乐，只有刷漆的声音。";
export async function loadSingleNodeTutorialReferences(kind: "image" | "video", signal: AbortSignal) {
  const names = kind === "image" ? ["cloudPaintingReference"] : ["cloudPaintingReference", "womanReference"];
  return Promise.all(names.map(async (name, index) => {
    const response = await fetch(`/onboarding/${name}.png`, { signal });
    if (!response.ok) throw new Error(`教学参考图读取失败（HTTP ${response.status}）`);
    const blob = await response.blob();
    if (!blob.size || blob.type !== "image/png") throw new Error("教学参考图无效，请刷新后重试");
    return new File([blob], `图${index + 1}.png`, { type: "image/png" });
  }));
}


export type CanvasTutorialStep = { nodeId: string; selector: string; title: string; description: string };
export function createCanvasTutorialSteps(nodes: Node[], edges: Edge[]): CanvasTutorialStep[] {
  const items = nodes.filter(node => !["group", "canvasGroup"].includes(node.type ?? ""));
  const byId = new Map(items.map(node => [node.id, node])), incoming = new Map(items.map(node => [node.id, 0])), targets = new Map<string, string[]>();
  for (const edge of edges) if (byId.has(edge.source) && byId.has(edge.target)) { incoming.set(edge.target, incoming.get(edge.target)! + 1); targets.set(edge.source, [...targets.get(edge.source) ?? [], edge.target]); }
  const queue = items.filter(node => !incoming.get(node.id)), ordered: Node[] = [];
  for (let index = 0; index < queue.length; index++) {
    const node = queue[index]!; ordered.push(node);
    for (const target of targets.get(node.id) ?? []) { incoming.set(target, incoming.get(target)! - 1); if (!incoming.get(target)) queue.push(byId.get(target)!); }
  }
  const visited = new Set(ordered.map(node => node.id));
  ordered.push(...items.filter(node => !visited.has(node.id)));
  const steps: CanvasTutorialStep[] = [{ nodeId: "", selector: ".vue-flow", title: "认识教学画布", description: "这是从“教学引导”项目复制的独立画布，保留原有素材、节点、提示词和连线。你可以在副本中练习，原项目不会被修改。" }];
  for (const node of ordered) {
    const label = String(node.data?.label || "节点"), type = node.type ?? "";
    steps.push({ nodeId: node.id, selector: ".contentCard", title: `查看「${label}」`, description: "点击节点查看其中保存的内容。拖动节点调整位置，缩放画布查看细节；这些内容来自教学项目。" });
    const generation = /GenerationNode$/.test(type) || type === "remote-textNode" || type === "scriptNode";
    if (!generation) continue;
    steps.push({ nodeId: node.id, selector: ".promptInputWrap, .promptCard", title: `查看「${label}」的提示词`, description: typeof node.data?.prompt === "string" && node.data.prompt.trim() ? "输入框保留了该节点原有的创作要求。阅读并修改提示词，理解它与上方素材之间的关系，不需要重新抄写示例内容。" : "点击输入框填写该节点的创作要求，描述你希望生成的内容、画面或动作，再结合参考素材继续创作。" });
    if (edges.some(edge => edge.target === node.id) || node.data?.localReferences?.length) steps.push({ nodeId: node.id, selector: ".referenceCovers, .referenceList, .promptCard", title: "理解参考素材与连线", description: `${edges.some(edge => edge.target === node.id) ? "画布连线表示上游节点向当前节点提供参考。" : "这些参考素材直接保存在当前节点中。"}输入框上方显示实际引用的素材；点击缩略图查看，使用 @ 按钮将对应素材插入提示词。` });
    else if (items.some(source => source.id !== node.id && /image/i.test(source.type ?? ""))) steps.push({ nodeId: node.id, selector: '.vue-flow__handle[data-handleid="in"]', title: "连接参考图片", description: "需要参考图时，从已有图片节点右侧的输出连接点拖线到当前节点左侧输入点。引用成功后，输入框上方会出现素材缩略图，再使用 @ 按钮插入引用。" });
    steps.push({ nodeId: node.id, selector: ".promptFooter", title: `配置并生成「${label}」`, description: "选择已接入且支持当前参考素材的模型，核对参数，再点击输入框右下角上箭头生成。没有可用模型时先到设置的 API 配置中接入。教学不会自动调用模型，生成失败时可修改当前节点后重试。" });
  }
  steps.push({ nodeId: "", selector: ".vue-flow", title: "继续你的创作", description: "回看节点之间的素材传递关系，继续调整提示词、引用与连线，生成自己的作品。修改会保存到当前副本，原“教学引导”项目保持不变。" });
  return steps;
}
