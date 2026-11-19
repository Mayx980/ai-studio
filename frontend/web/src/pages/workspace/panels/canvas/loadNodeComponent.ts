import { studio } from "@/ports";
import type { NodeTypesObject } from "@vue-flow/core";
import { shallowReactive, type Component } from "vue";

type NodeComponent = Exclude<NodeTypesObject[string], string>;

const components = shallowReactive(new Map<string, NodeComponent>());
const requests = new Map<string, Promise<NodeComponent>>();
const sources = new Map<string, string>();
const builtinNodes: Record<string, () => Promise<{ default: Component }>> = {
  textNode: () => import("@toonflow/node-text/component"),
  imageGenerationNode: () => import("@toonflow/node-image-generation/component"),
  videoGenerationNode: () => import("@toonflow/node-video-generation/component"),
  audioGenerationNode: () => import("@toonflow/node-audio-generation/component"),
  imageNode: () => import("@toonflow/node-image/component"),
  videoNode: () => import("@toonflow/node-video/component"),
  audioNode: () => import("@toonflow/node-audio/component"),
};

export function getNodeIcon(type?: string): Component | undefined {
  if (!type?.startsWith("remote-")) return;
  return (components.get(type.slice(7)) as { icon?: Component } | undefined)?.icon;
}

export function loadNodeComponent(name: string, url: string, force = false): Promise<NodeComponent> {
  const pending = requests.get(name);
  if (pending) return pending;
  // ACT: 原型内置节点与页面同版，避免服务端已安装的旧 UMD 绕过浏览器模型配置。
  if (Object.hasOwn(builtinNodes, name)) {
    const request = builtinNodes[name]!().then(({ default: loaded }) => {
      const component = loaded as NodeComponent;
      components.set(name, component);
      return component;
    }).finally(() => requests.delete(name));
    requests.set(name, request);
    return request;
  }
  const nodeWindow = window as typeof window & { toonflowNodes?: NodeTypesObject };
  const cached = components.get(name) ?? (Object.hasOwn(nodeWindow.toonflowNodes ?? {}, name) ? nodeWindow.toonflowNodes?.[name] : undefined);
  // ACT: 同名节点只加载一份脚本，所有画布共享进行中的重载，避免互相清除全局导出。
  const request = (async () => {
    const scriptUrl = force ? `${url}${url.includes("?") ? "&" : "?"}reload=${crypto.randomUUID()}` : url;
    const code = await studio.loadPluginSource(scriptUrl, "node");
    if (!force && cached && (typeof cached === "object" || typeof cached === "function") && sources.get(name) === code) { components.set(name, cached); return cached; }
    if (code.includes("toonflowTiptapHost")) await import("@/lib/tiptapHost");
    return new Promise<NodeComponent>((resolve, reject) => {
      delete nodeWindow.toonflowNodes?.[name];
      const script = document.createElement("script");
      script.src = scriptUrl;
      script.onload = () => {
        script.remove();
        const component = nodeWindow.toonflowNodes?.[name];
        if (!Object.hasOwn(nodeWindow.toonflowNodes ?? {}, name) || !component || (typeof component !== "object" && typeof component !== "function")) {
          reject(new Error(`节点脚本未导出 ${name} 组件`));
          return;
        }
        sources.set(name, code);
        resolve(component);
      };
      script.onerror = () => {
        script.remove();
        delete nodeWindow.toonflowNodes?.[name];
        reject(new Error("节点脚本加载失败"));
      };
      document.head.append(script);
    });
  })().then(component => {
    components.set(name, component);
    return component;
  }).finally(() => requests.delete(name));
  requests.set(name, request);
  return request;
}
