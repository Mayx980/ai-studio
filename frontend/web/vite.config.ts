import { fileURLToPath } from "node:url";
import { readFileSync } from "@toonflow/file";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import components from "unplugin-vue-components/vite";
import { ElementPlusResolver } from "unplugin-vue-components/resolvers";
import desktopConfig from "../../electrobun.config.ts";
import postcssConfig from "../../postcss.config.ts";
import { i18nPlugin } from "@toonflow/i18n/vite";

import studioRelay from "./studioRelay";

// ACT: 内置节点按包的公开导出解析，不依赖另一台机器是否已重建 workspace 链接。
const builtinNodeAliases = ["nodes/textNode", "nodes/imageGenerationNode", "nodes/videoGenerationNode", "nodes/audioGenerationNode", "nodes/imageNode", "nodes/videoNode", "nodes/audioNode", "nodeShared"].flatMap(name => {
  const packageRoot = new URL(`../${name}/`, import.meta.url);
  const packageInfo = JSON.parse(readFileSync(new URL("package.json", packageRoot), "utf8"));
  return Object.entries(packageInfo.exports as Record<string, string>).map(([path, target]) => ({
    find: `${packageInfo.name}/${path.slice(2)}`,
    replacement: fileURLToPath(new URL(target, packageRoot)),
  }));
});

export default defineConfig(({ mode }) => ({
  css: { postcss: postcssConfig },
  define: {
    "import.meta.env.VITE_PLATFORM_PORTAL": mode.startsWith("platform"),
    "import.meta.env.VITE_STUDIO_RELAY": mode === "studio",
    "import.meta.env.appVersion": JSON.stringify(desktopConfig.app.version),
  },
  server: {
    proxy: ["scenario", "platformScenario"].includes(mode) ? undefined : {
      "/mcp": { target: "http://127.0.0.1:3000", changeOrigin: false },
      "/a2a": { target: "http://127.0.0.1:3000", changeOrigin: false },
      "/api": {
        target: "http://127.0.0.1:3000",
        changeOrigin: false,
        configure(proxy) {
          proxy.on("proxyReq", (request, incoming) => {
            request.setHeader("x-toonflow-local-client", ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(incoming.socket.remoteAddress ?? "") ? "1" : "0");
          });
        },
      },
    },
  },
  resolve: {
    alias: [
      ...builtinNodeAliases,
      { find: "@", replacement: fileURLToPath(new URL("./src", import.meta.url)) },
      { find: /^shiki$/, replacement: fileURLToPath(new URL("./src/lib/shiki.ts", import.meta.url)) },
    ],
  },
  build: {
    outDir: mode === "platformScenario" ? "../../build/platformScenario" : mode === "platform" ? "../../build/platform" : mode === "scenario" ? "../../build/scenario" : "../../build/web",
    emptyOutDir: true,
  },
  plugins: [
    {
      name: "experienceComposition",
      transformIndexHtml: {
        order: "pre",
        handler: html => ["scenario", "platformScenario"].includes(mode) ? html.replace("/src/composition/production.ts", "/src/composition/scenario.ts") : html,
      },
    },
    ...(mode === "studio" ? [studioRelay()] : []),
    i18nPlugin(),
    vue(),
    components({
      globsExclude: ["src/components/settings/panels/**/*Dialog.vue"],
      dts: "src/types/components.d.ts",
      resolvers: [
        ElementPlusResolver(),
        (name) => {
          if (name.startsWith("Icon")) return { name, from: "@tabler/icons-vue" };
        },
      ],
    }),
  ],
}));
