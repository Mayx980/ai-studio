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
const builtinNodeAliases = ["textNode", "imageGenerationNode", "videoGenerationNode", "audioGenerationNode", "imageNode", "videoNode", "audioNode"].map(name => {
  const packageRoot = new URL(`../../packages/nodes/${name}/`, import.meta.url);
  const packageInfo = JSON.parse(readFileSync(new URL("package.json", packageRoot), "utf8"));
  return {
    find: `${packageInfo.name}/component`,
    replacement: fileURLToPath(new URL(packageInfo.exports["./component"], packageRoot)),
  };
});

export default defineConfig(({ mode }) => ({
  css: { postcss: postcssConfig },
  define: {
    "import.meta.env.VITE_STUDIO_RELAY": mode === "studio",
    "import.meta.env.appVersion": JSON.stringify(desktopConfig.app.version),
  },
  server: {
    proxy: {
      "/mcp": { target: mode === "studio" ? "http://127.0.0.1:3107" : "http://127.0.0.1:3000", changeOrigin: false },
      "/a2a": { target: mode === "studio" ? "http://127.0.0.1:3107" : "http://127.0.0.1:3000", changeOrigin: false },
      "/api": {
        target: mode === "studio" ? "http://127.0.0.1:3107" : "http://127.0.0.1:3000",
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
    outDir: "../../build/web",
    emptyOutDir: true,
  },
  plugins: [
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
