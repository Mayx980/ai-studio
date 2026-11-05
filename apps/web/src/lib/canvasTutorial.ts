export const canvasTutorialPrompt = `10 秒人像剧情短片，电影写实质感，50mm 定焦镜头，浅景深，柔和胶片颗粒，2.39 电影宽画幅。
图1女大学生 20 岁，干净清冷，低马尾黑发，细碎刘海散落脸颊，黑色连帽外套内搭白色基础 T 恤，眼神澄澈，带着试探与好奇；
图2男主播 22 岁，轮廓立体，黑色锡纸烫短发，黑色缎面垂感衬衫，银色十字架项链，银色圆环耳饰，气质松弛温柔。

0-2 秒：纯黑极简背景，柔和轮廓柔光，低对比暗调。近景特写，女生双手捧着手机，微微歪头，目光落在手机直播间画面，指尖悬浮在屏幕礼物按钮上方，眼神带着新鲜的观望好奇，睫毛安静，面部光影层次细腻，背景完全压暗虚化，焦点锁定女生面部与手机屏幕。
2-4 秒：同机位保持不动，女生嘴角浮起淡淡的浅笑意，指尖缓慢落下轻点屏幕，柔和通透的蓝紫色光点礼物特效从触碰位置向外缓缓漂浮散开，光点光晕轻薄朦胧，不刺眼，发丝伴随极轻微呼吸感晃动。
4-7 秒：硬切，镜头聚焦手机屏幕内部画面，屏幕内是直播间，男生端坐，收到礼物提示后缓缓抬眼看向镜头，唇角舒展，温和浅笑，轻轻点头示意感谢，神态自然松弛，是主播习惯性礼貌回应，面部光线均匀柔和，画面干净。
7-10 秒：切回女生特写，机位微微向前缓慢推镜，看到男生的回应，女生眼睛微微发亮，好奇感被满足，浅浅扬起笑容，身体微微前倾，专注凝视屏幕，眼神带着新鲜感与意犹未尽，蓝紫色光点特效慢慢消散。人物仅保留极细微面部微表情、发丝轻柔飘动，全程无大幅度肢体动作，画面稳定无闪烁，人物五官全程清晰，只有发丝、衣料边缘带有极轻微自然运动模糊。整体低饱和暗调，蓝紫光点作为画面唯一亮色点缀，克制高级，氛围感安静治愈。`;
export async function loadCanvasTutorialReferences(signal: AbortSignal) {
  return Promise.all(["femaleReference", "maleReference"].map(async (name, index) => {
    const response = await fetch(`/onboarding/${name}.png`, { signal });
    if (!response.ok) throw new Error(`教学参考图读取失败（HTTP ${response.status}）`);
    const blob = await response.blob();
    if (!blob.size || !blob.type.startsWith("image/")) throw new Error("教学参考图无效，请刷新后重试");
    return new File([blob], index === 0 ? "图1 女大学生.png" : "图2 男主播.png", { type: "image/png" });
  }));
}
export const canvasTutorialImagePrompts = [
  "专业影棚人像摄影，电影感写实风格，真人实拍，中画幅相机，85mm定焦镜头，f/2.0浅景深，电影级宽银幕画幅，纯白无缝背景纸，干净无杂物。20岁女大学生，淡颜系长相，身形纤细柔和，气质青涩干净，鹅蛋脸，面部轮廓流畅柔和，下颌线纤细，肤色白皙通透，保留真实细腻皮肤肌理与面部绒毛，可见毛孔，不过度磨皮，自然野生细眉，眼型圆润舒展，浅卧蚕柔和，瞳色深黑清亮，眼神澄澈懵懂，带着天然的好奇感，鼻梁秀气小巧，鼻头圆润，唇形薄厚适中，唇色淡粉自然，唇角平直。乌黑长发扎低马尾，颅顶蓬松，脸颊散落多根细碎胎毛碎发，发丝轻盈有空气感，身着宽松黑色连帽外套，内搭简单白色圆领T恤，双肩背黑色皮质背包。主光柔光箱正面漫射柔光，辅光反光板柔和补暗部，均匀面光，无生硬阴影，发丝边缘柔和通透，低饱和清透色调，干净韩式写真质感。",
  "专业影棚人像摄影，电影感写实风格，真人实拍，中画幅相机，85mm定焦镜头，f/2.0浅景深，电影级宽银幕画幅，纯白无缝背景纸，干净无杂物。22岁男主播，冷感浓颜长相，轮廓立体锋利，下颌线清晰利落，肤色白皙通透，保留真实细腻皮肤肌理与面部绒毛，可见毛孔，不过度磨皮，剑眉浓密有型，眉峰清晰，眼型狭长，瞳色深黑清亮，眼神松弛温柔，鼻梁高挺立体，鼻型精致，唇形饱满，唇色柔和偏淡，唇角自然舒展。黑色蓬松凌乱锡纸烫短发，发丝层次丰富有空气感，左耳佩戴银色圆环耳圈，脖颈佩戴银色十字架吊坠项链，身着垂感黑色缎面翻领衬衫，面料自带细腻柔光光泽，领口微敞。主光柔光箱45度侧前方打光，辅光反光板柔和填充暗部，轮廓光勾勒发丝与肩颈线条，光比适中，低饱和高级暗调，干净清冷的直播氛围感，电影感写实。",
];


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
