import { getWorkspaceFailure } from "@toonflow/nodes-scaffold/workspaceFiles";
import { commitCanvasGeneration } from "./generationHistory";
import { nextTick } from "vue";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import type { NodeOutputs } from "@toonflow/nodes-scaffold/values";

const liveCanvases = new Map<string, () => Promise<void>>();
export function registerGenerationCanvas(key: string, flush: () => Promise<void>) {
  liveCanvases.set(key, flush);
  return () => { if (liveCanvases.get(key) === flush) liveCanvases.delete(key); };
}
export function captureGenerationCanvas(directory: string, path: string, settle: () => Promise<void>) {
  const files = useWorkspaceFiles(directory), key = JSON.stringify([directory, path]);
  return { key, async save(nodeId: string, outputs: NodeOutputs) {
    await commitCanvasGeneration(directory, path, nodeId, outputs);
    await nextTick();
    async function flushLive() {
      const flush = liveCanvases.get(key);
      if (!flush) return false;
      try { await flush(); return liveCanvases.get(key) === flush; }
      catch (error) { if (liveCanvases.get(key) === flush) throw error; return false; }
    }
    if (await flushLive()) return;
    await settle();
    if (await flushLive()) return;
    // ACT: 只合并原节点的输出；不恢复已删除节点，冲突时读取新版本重新合并，最多三次。
    for (let attempt = 0; attempt < 3; attempt++) {
      const snapshot = await files.readTextSnapshot(path);
      const canvas = JSON.parse(snapshot.text);
      if (!canvas?.toonflowCanvas || !Array.isArray(canvas.nodes)) throw new Error("原画布格式无效，生成素材已保存在生成历史");
      const node = canvas.nodes.find((item: { id: string }) => item.id === nodeId);
      if (!node) return;
      node.data = { ...node.data, outputs: { ...node.data?.outputs, ...outputs } };
      try { await files.writeTextSnapshot(path, JSON.stringify(canvas), snapshot); }
      catch (error) { if (getWorkspaceFailure(error).code !== "ESTALE" || attempt === 2) throw error; continue; }
      await flushLive();
      return;
    }
  } };
}
