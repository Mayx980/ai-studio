import type { CreationTemplate } from "./creationTemplates";

// ACT: 使用已有达人种草视频展示可复制编排，不声明为该视频的原始生成记录。
export const curatedCreatorTemplate: CreationTemplate = {
  "id": "creatorRecommendationProject",
  "name": "达人开箱逛买",
  "category": "达人种草",
  "kind": "video",
  "prompt": "创意：达人开箱逛买\nBased on the uploaded product image and info, create a video.\nProduct Name: Creator Shopping Haul Product 2\nKey Selling Points: Accurate product appearance, clear everyday utility, simple operation, and a believable purchase reason.",
  "media": {
    "path": "/templates/creatorRecommendation.mp4",
    "name": "达人种草.mp4",
    "mimeType": "video/mp4"
  },
  "references": [],
  "ratio": "9:16",
  "resolution": "720P",
  "duration": 15,
  "project": {
    "files": [
      {
        "path": "canvas.json",
        "sha256": "a36a4f0f123d4faae54219c15bc07c4b500e3a9bc9eecb09c8e664c3a6194828"
      },
      {
        "path": "assets/creativeRequest/content.md",
        "sha256": "fefc2972674d66142bc71371d501546c5d3a3c211e66d9a10982b6f4510c0c19"
      },
      {
        "path": "assets/reference.png",
        "sha256": "0cf6b5c6ae4cd4a73d47692bf27a8b157c5248e03ec43f9809b0489365b0a11c"
      },
      {
        "path": "assets/creatorRecommendation.mp4",
        "sha256": "ddf84a97d9f15a444dbda2b7d969604e07532fb1bd2395d3511e53ea1527afbc"
      }
    ],
    "canvases": [
      "canvas.json"
    ]
  }
};

export const curatedCreatorFiles: Record<string, string> = {
  "canvas.json": "/templates/creatorProject/canvas.json",
  "assets/creativeRequest/content.md": "/templates/creatorProject/requirements.md",
  "assets/reference.png": "/templates/creatorProject/reference.png",
  "assets/creatorRecommendation.mp4": "/templates/creatorRecommendation.mp4"
};
