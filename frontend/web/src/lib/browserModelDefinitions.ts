import { imageDimensions, imageClaritySizes } from "@toonflow/node-shared/generationDefaults";
import textModel from "./browserModels/textModel";

export const browserModelDefinitions = {
  image: {
    id: "aliyunBailianQwenImage30Pro", label: "阿里云百炼·千问图像生成 3.0 Pro",
    models: [{ id: "qwen-image-3.0-pro", label: "千问图像生成 3.0 Pro", type: "image", mode: ["text", "singleImage", "multiReference"],
      imageRatios: ["1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16", "21:9", "9:21", "2:1", "4:1"],
      imageSizes: [...new Set([...Object.values(imageDimensions).flat(), ...Object.values(imageClaritySizes).flatMap(value => Object.values(value))]), "1K", "2K", "auto"] }],
  },
  video: {
    id: "aliyunWan3Video", label: "阿里云百炼 - 万相 3.0 视频",
    models: [{ id: "wan3Video", label: "万相 3.0 视频生成", type: "video", mode: ["text", "singleImage", ["imageReference:10", "videoReference:5"]], audio: "optional",
      durationResolutionMap: [{ duration: [2, 3, 5, 10, 15, 20, 30], resolution: ["480P", "720P", "1080P"] }] }],
  },
  audio: {
    id: "volcengineSeedAudio", label: "火山引擎 Seed-Audio",
    models: [{ id: "seed-audio-1.0", label: "Seed Audio 1.0", type: "audio", audio: true,
      languages: ["中文", "英文", "日语", "韩语", "墨西哥-西班牙语", "西班牙语", "德语", "法语", "巴西-葡萄牙语", "泰语", "越南语", "马来语", "菲律宾语", "意大利语", "俄语", "荷兰语", "波兰语", "土耳其语"] }],
  },
  text: textModel,
};
