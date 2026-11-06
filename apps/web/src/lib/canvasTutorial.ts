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


export type CanvasTutorialStep = { nodeId: string; selector: string; title: string; description: string; area?: "toolbar" };
export function createCanvasTutorialSteps(nodes: Node[], edges: Edge[]): CanvasTutorialStep[] {
  const items = nodes.filter(node => !["group", "canvasGroup"].includes(node.type ?? ""));
  const female = items.find(node => node.type === "remote-imageGenerationNode" && String(node.data?.label ?? "").includes("女大学生"));
  const male = items.find(node => node.type === "remote-imageGenerationNode" && String(node.data?.label ?? "").includes("男主播"));
  const video = items.find(node => node.type === "remote-videoGenerationNode");
  if (female && male && video && items.length === 3) return createPortraitTutorialSteps(female, male, video, edges);
  const byId = new Map(items.map(node => [node.id, node])), incoming = new Map(items.map(node => [node.id, 0])), targets = new Map<string, string[]>();
  for (const edge of edges) if (byId.has(edge.source) && byId.has(edge.target)) { incoming.set(edge.target, incoming.get(edge.target)! + 1); targets.set(edge.source, [...targets.get(edge.source) ?? [], edge.target]); }
  const queue = items.filter(node => !incoming.get(node.id)), ordered: Node[] = [];
  for (let index = 0; index < queue.length; index++) {
    const node = queue[index]!; ordered.push(node);
    for (const target of targets.get(node.id) ?? []) { incoming.set(target, incoming.get(target)! - 1); if (!incoming.get(target)) queue.push(byId.get(target)!); }
  }
  const visited = new Set(ordered.map(node => node.id));
  ordered.push(...items.filter(node => !visited.has(node.id)));
  const steps: CanvasTutorialStep[] = [{ nodeId: "", selector: ".vue-flow", title: "认识教学画布", description: "从当前画布开始，依次查看图片、提示词、视频引用和生成操作。引导会保留现有节点、素材和连线，不会自动提交生成。" }];
  for (const node of ordered) {
    const label = String(node.data?.label || "节点"), type = node.type ?? "";
    steps.push({ nodeId: node.id, selector: ".contentCard", title: `查看「${label}」`, description: "点击节点查看其中保存的内容。拖动节点调整位置，缩放画布查看细节；引导根据当前节点逐步讲解。" });
    const generation = /GenerationNode$/.test(type) || type === "remote-textNode" || type === "scriptNode";
    if (!generation) continue;
    steps.push({ nodeId: node.id, selector: ".promptInputWrap, .promptCard", title: `查看「${label}」的提示词`, description: typeof node.data?.prompt === "string" && node.data.prompt.trim() ? "输入框保留了该节点原有的创作要求。阅读并修改提示词，理解它与上方素材之间的关系，不需要重新抄写示例内容。" : "点击输入框填写该节点的创作要求，描述你希望生成的内容、画面或动作，再结合参考素材继续创作。" });
    if (edges.some(edge => edge.target === node.id) || node.data?.localReferences?.length) steps.push({ nodeId: node.id, selector: ".referenceCovers, .referenceList, .promptCard", title: "理解参考素材与连线", description: `${edges.some(edge => edge.target === node.id) ? "画布连线表示上游节点向当前节点提供参考。" : "这些参考素材直接保存在当前节点中。"}输入框上方显示实际引用的素材；点击缩略图查看，使用 @ 按钮将对应素材插入提示词。` });
    else if (type === "remote-videoGenerationNode" && items.some(source => source.id !== node.id && /image/i.test(source.type ?? ""))) steps.push({ nodeId: node.id, selector: '.vue-flow__handle[data-handleid="in"]', title: "连接参考图片", description: "需要参考图时，从已有图片节点右侧的输出连接点拖线到当前节点左侧输入点。引用成功后，输入框上方会出现素材缩略图，再使用 @ 按钮插入引用。" });
    steps.push({ nodeId: node.id, selector: ".promptFooter", title: `配置并生成「${label}」`, description: "选择已接入且支持当前参考素材的模型，核对参数，再点击输入框右下角上箭头生成。没有可用模型时先到设置的 API 配置中接入。教学不会自动调用模型，生成失败时可修改当前节点后重试。" });
  }
  steps.push({ nodeId: "", selector: ".vue-flow", title: "继续你的创作", description: "回看节点之间的素材传递关系，继续调整提示词、引用与连线，生成自己的作品。修改会保存到当前项目；重新打开引导只会讲解现有节点，不会重置素材或提示词。" });
  return steps;
}

function createPortraitTutorialSteps(female: Node, male: Node, video: Node, edges: Edge[]): CanvasTutorialStep[] {
  const connected = (source: Node) => edges.some(edge => edge.source === source.id && edge.sourceHandle === "image" && edge.target === video.id && edge.targetHandle === "in");
  const imageHandle = (source: Node) => `.vue-flow__node[data-id="${CSS.escape(source.id)}"] .vue-flow__handle[data-handleid="image"]`;
  return [
    { nodeId: "", selector: ".vue-flow", title: "从人物图片到剧情视频", description: "本次学习依次创建女主图片、男主图片，再将两张图片连接到视频节点生成短片。教学已放好示例节点、图片、提示词和连线，供你对照练习；现有图片是示例素材，引导不会自动生成。" },
    { nodeId: "", area: "toolbar", selector: ".addNodeButton", title: "创建女主图片节点", description: "自己创作时，点击底部工具栏的“＋”，在添加节点菜单中选择“图片”，即可建立图片生成节点。本教学已准备“图1 女大学生”，可直接点下一步查看它的输入框，无需重复添加。" },
    { nodeId: female.id, selector: ".promptInputWrap, .promptCard", title: "输入女主图片提示词", description: "点击女主节点，在下方输入框填写人物提示词：20岁女大学生、低马尾、黑色连帽外套、白色T恤及影棚写实风格。完整示例提示词已保留，可以阅读或修改。" },
    { nodeId: female.id, selector: ".modelSelect, .promptFooter", title: "选择女主图片模型与参数", description: "选择已接入的图片模型，核对比例、清晰度和图片数量。没有可用模型时，先到设置的 API 配置中接入模型，再返回当前节点。" },
    { nodeId: female.id, selector: ".sendButton, .promptFooter", title: "生成女主图片", description: "点击输入框右下角的上箭头生成图片，成功后图片会显示在女主节点中。教学展示的图片可直接用于后续步骤；是否重新生成由你决定，下一步按钮不会提交生成。" },
    { nodeId: "", area: "toolbar", selector: ".addNodeButton", title: "创建男主图片节点", description: "点击底部“＋”，选择“图片”建立第二个人物节点，并命名为“图2 男主播”。教学已准备对应节点，下一步会打开其输入框。" },
    { nodeId: male.id, selector: ".promptInputWrap, .promptCard", title: "输入男主图片提示词", description: "在男主节点输入框填写人物提示词：22岁男主播、黑色锡纸烫短发、黑色缎面衬衫、银色十字架项链和圆环耳饰。完整影棚人像提示词已保留，可按需要调整。" },
    { nodeId: male.id, selector: ".modelSelect, .promptFooter", title: "选择男主图片模型与参数", description: "为男主选择已接入的图片模型，核对画面比例、清晰度和数量。可与女主使用相同模型和参数，保持人物图片的整体风格一致。" },
    { nodeId: male.id, selector: ".sendButton, .promptFooter", title: "生成男主图片", description: "点击右下角上箭头生成男主图片，成功后检查人物外观。确认两个人物图片都可用后继续；本教学也可直接使用已有的两张示例图片练习连接。" },
    { nodeId: "", area: "toolbar", selector: ".addNodeButton", title: "添加视频节点", description: "点击底部“＋”，选择“视频”，在两个人物图片旁添加一个视频生成节点。教学已准备“新手教学 · 10秒人像剧情”，空白视频区域用于展示后续生成结果。" },
    { nodeId: "", selector: imageHandle(female), title: "将女主图片连接到视频", description: `从女主图片节点右侧的输出圆点拖线，到视频节点左侧的输入圆点松开，将图1作为视频参考。${connected(female) ? "当前女主连线已存在，核对后即可继续，无需重复连接。" : "连接成功后，视频输入框上方会出现女主参考图。"}` },
    { nodeId: "", selector: imageHandle(male), title: "将男主图片连接到视频", description: `再从男主图片节点右侧的输出圆点拖线，到同一个视频节点左侧输入点，将图2也作为视频参考。${connected(male) ? "当前男主连线已存在，核对后即可继续。" : "连接后，视频节点应同时接收两个图片节点的输出。"}` },
    { nodeId: video.id, selector: ".referenceCovers, .referenceList, .promptCard", title: "核对两张人物参考图", description: "点击视频节点，在输入框上方确认同时出现女主图1、男主图2的缩略图。点击缩略图可查看素材，使用输入框的 @ 按钮可把对应人物引用插入提示词。" },
    { nodeId: video.id, selector: ".promptInputWrap, .promptCard", title: "输入视频剧情提示词", description: "填写10秒剧情：女生观看直播、送出礼物，男主播微笑回应，再切回女生。完整示例已按0–2、2–4、4–7、7–10秒分段保留，描述人物、镜头、动作和蓝紫色礼物光点，并明确图1女主、图2男主的对应关系。" },
    { nodeId: video.id, selector: ".modelSelect, .promptFooter", title: "选择视频模型与生成参数", description: "选择支持当前两张人物参考图的视频模型，核对参考图模式、画面比例、清晰度和10秒时长。模型未接入或不支持这些参考素材时，先配置或更换模型。" },
    { nodeId: video.id, selector: ".sendButton, .promptFooter", title: "生成剧情视频", description: "确认两张图片、人物对应关系和提示词后，点击视频输入框右下角上箭头提交生成。等待期间可离开画布，页面内任务继续运行；引导本身不会自动调用模型。" },
    { nodeId: video.id, selector: ".contentCard", title: "查看生成的视频", description: "生成成功后，视频显示在当前节点中，点击播放并检查人物、镜头顺序与动作。若不满意，可修改该视频节点的提示词或参考图后重新生成。视频区域为空时，表示该节点尚无可播放结果。" },
    { nodeId: "", selector: ".vue-flow", title: "开始自己的画布创作", description: "你已了解创建人物图片、填写提示词、生成图片、添加视频节点、连接参考图并生成视频的完整流程。可继续在教学项目练习；返回首页再次新建画布会得到空画布，底部“引导流程”可随时重新打开本教学。" },
  ];
}

export const femaleTutorialPrompt = "专业影棚人像摄影，电影感写实风格，真人实拍，中画幅相机，85mm定焦镜头，f/2.0浅景深，电影级宽银幕画幅，纯白无缝背景纸，干净无杂物。20岁女大学生，淡颜系长相，身形纤细柔和，气质青涩干净，鹅蛋脸，面部轮廓流畅柔和，下颌线纤细，肤色白皙通透，保留真实细腻皮肤肌理与面部绒毛，可见毛孔，不过度磨皮，自然野生细眉，眼型圆润舒展，浅卧蚕柔和，瞳色深黑清亮，眼神澄澈懵懂，带着天然的好奇感，鼻梁秀气小巧，鼻头圆润，唇形薄厚适中，唇色淡粉自然，唇角平直。乌黑长发扎低马尾，颅顶蓬松，脸颊散落多根细碎胎毛碎发，发丝轻盈有空气感，身着宽松黑色连帽外套，内搭简单白色圆领T恤，双肩背黑色皮质背包。主光柔光箱正面漫射柔光，辅光反光板柔和补暗部，均匀面光，无生硬阴影，发丝边缘柔和通透，低饱和清透色调，干净韩式写真质感。";
export const maleTutorialPrompt = "专业影棚人像摄影，电影感写实风格，真人实拍，中画幅相机，85mm定焦镜头，f/2.0浅景深，电影级宽银幕画幅，纯白无缝背景纸，干净无杂物。22岁男主播，冷感浓颜长相，轮廓立体锋利，下颌线清晰利落，肤色白皙通透，保留真实细腻皮肤肌理与面部绒毛，可见毛孔，不过度磨皮，剑眉浓密有型，眉峰清晰，眼型狭长，瞳色深黑清亮，眼神松弛温柔，鼻梁高挺立体，鼻型精致，唇形饱满，唇色柔和偏淡，唇角自然舒展。黑色蓬松凌乱锡纸烫短发，发丝层次丰富有空气感，左耳佩戴银色圆环耳圈，脖颈佩戴银色十字架吊坠项链，身着垂感黑色缎面翻领衬衫，面料自带细腻柔光光泽，领口微敞。主光柔光箱45度侧前方打光，辅光反光板柔和填充暗部，轮廓光勾勒发丝与肩颈线条，光比适中，低饱和高级暗调，干净清冷的直播氛围感，电影感写实。";
export const portraitVideoTutorialPrompt = `10 秒人像剧情短片，电影写实质感，50mm 定焦镜头，浅景深，柔和胶片颗粒，2.39 电影宽画幅。
图1女大学生 20 岁，干净清冷，低马尾黑发，细碎刘海散落脸颊，黑色连帽外套内搭白色基础 T 恤，眼神澄澈，带着试探与好奇；
图2男主播 22 岁，轮廓立体，黑色锡纸烫短发，黑色缎面垂感衬衫，银色十字架项链，银色圆环耳饰，气质松弛温柔。

0-2 秒：纯黑极简背景，柔和轮廓柔光，低对比暗调。近景特写，女生双手捧着手机，微微歪头，目光落在手机直播间画面，指尖悬浮在屏幕礼物按钮上方，眼神带着新鲜的观望好奇，睫毛安静，面部光影层次细腻，背景完全压暗虚化，焦点锁定女生面部与手机屏幕。
2-4 秒：同机位保持不动，女生嘴角浮起淡淡的浅笑意，指尖缓慢落下轻点屏幕，柔和通透的蓝紫色光点礼物特效从触碰位置向外缓缓漂浮散开，光点光晕轻薄朦胧，不刺眼，发丝伴随极轻微呼吸感晃动。
4-7 秒：硬切，镜头聚焦手机屏幕内部画面，屏幕内是直播间，男生端坐，收到礼物提示后缓缓抬眼看向镜头，唇角舒展，温和浅笑，轻轻点头示意感谢，神态自然松弛，是主播习惯性礼貌回应，面部光线均匀柔和，画面干净。
7-10 秒：切回女生特写，机位微微向前缓慢推镜，看到男生的回应，女生眼睛微微发亮，好奇感被满足，浅浅扬起笑容，身体微微前倾，专注凝视屏幕，眼神带着新鲜感与意犹未尽，蓝紫色光点特效慢慢消散。人物仅保留极细微面部微表情、发丝轻柔飘动，全程无大幅度肢体动作，画面稳定无闪烁，人物五官全程清晰，只有发丝、衣料边缘带有极轻微自然运动模糊。整体低饱和暗调，蓝紫光点作为画面唯一亮色点缀，克制高级，氛围感安静治愈。`;

export async function createPortraitTutorialCanvas(directory: string) {
  const { default: useWorkspaceFiles } = await import("@/lib/workspaceFiles");
  const { uploadNodeFile } = await import("@toonflow/nodes-scaffold/workspaceFiles");
  const files = useWorkspaceFiles(directory);
  const canvas = await files.readJson<{ toonflowCanvas: boolean; nodes: Node[]; edges: Edge[]; viewport?: unknown }>("画布1.json");
  if (!canvas.toonflowCanvas || !Array.isArray(canvas.nodes) || !Array.isArray(canvas.edges) || canvas.nodes.length || canvas.edges.length) throw new Error("教学素材仅可写入新建的空白画布");
  const nodes: Node[] = [];
  for (const [index, name] of ["femaleReference", "maleReference"].entries()) {
    const response = await fetch(`/onboarding/${name}.png`);
    if (!response.ok) throw new Error(`教学图片读取失败（HTTP ${response.status}）`);
    const id = crypto.randomUUID(), prompt = index ? maleTutorialPrompt : femaleTutorialPrompt;
    const file = new File([await response.blob()], `图${index + 1}.png`, { type: "image/png" });
    const path = await uploadNodeFile(files, id, file);
    nodes.push({ id, type: "remote-imageGenerationNode", position: { x: 0, y: index * 480 }, data: { label: index ? "图2 男主播" : "图1 女大学生", prompt, promptModel: [[{ type: "Write", text: prompt }]], outputs: { image: { dataType: "IMAGE", value: { url: path, mimeType: "image/png" } } } } });
  }
  const videoId = crypto.randomUUID();
  nodes.push({ id: videoId, type: "remote-videoGenerationNode", position: { x: 760, y: 240 }, data: { label: "新手教学 · 10秒人像剧情", prompt: portraitVideoTutorialPrompt, promptModel: portraitVideoTutorialPrompt.split("\n").map(text => [{ type: "Write", text }]), duration: 10, resolution: "480P", referenceOrder: { in: nodes.map(node => encodeURIComponent(JSON.stringify([node.id, "image"]))) } } });
  const edges = nodes.slice(0, 2).map(node => ({ id: crypto.randomUUID(), source: node.id, sourceHandle: "image", target: videoId, targetHandle: "in" }));
  await files.writeJson("画布1.json", { ...canvas, nodes, edges });
}


export async function openTutorialProject(kind: "image" | "video" | "canvas") {
  const { useWorkspaceStore } = await import("@/stores/workspace");
  const workspace = useWorkspaceStore();
  const existing = workspace.projectList.filter(project => project.tutorial && project.tutorialEntry === kind).sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)[0];
  const project = existing ?? await workspace.createProject(`${{ canvas: "画布", image: "图片", video: "视频" }[kind]}教学引导`);
  if (existing) await workspace.openProject(existing.directory);
  else {
    project.tutorialEntry = kind;
    if (kind === "canvas") await createPortraitTutorialCanvas(project.directory);
    project.tutorial = kind === "canvas";
  }
  workspace.creationMode = "professional";
  workspace.pendingCanvasEntry = { directory: project.directory, tutorial: true, ...(!existing && kind !== "canvas" ? { nodeType: kind === "image" ? "remote-imageGenerationNode" : "remote-videoGenerationNode" } : {}) };
}
