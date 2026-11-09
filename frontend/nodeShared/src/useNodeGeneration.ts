import { getWorkspaceFailure } from "@toonflow/nodes-scaffold/workspaceFiles";
import { useNode, useVueFlow } from "@vue-flow/core";
import { computed, inject, nextTick, shallowReactive, watch, type Ref } from "vue";
import { nodeTools, z } from "@toonflow/nodes-scaffold/nodeTools";
import type { NodeOutputs } from "@toonflow/nodes-scaffold/values";

export type NodeGenerationTarget = { key: string; save(nodeId: string, outputs: NodeOutputs): Promise<void> };
type GenerationState = { status: "idle" | "running" | "succeeded" | "failed"; error: string; result?: NodeOutputs; cancel?: () => void; pending?: Promise<unknown> };
const tasks = new Map<string, GenerationState>();

export function useNodeGeneration(outputs: Readonly<Ref<NodeOutputs>>, cancel: () => void) {
  const { node } = useNode();
  const flow = useVueFlow();
  const capture = inject<(() => NodeGenerationTarget | undefined) | undefined>("backgroundNodeGeneration", undefined);
  const target = capture?.();
  const key = target ? JSON.stringify([target.key, node.id]) : undefined;
  let state = key ? tasks.get(key) : undefined;
  if (!state) { state = shallowReactive<GenerationState>({ status: "idle", error: "" }); if (key) tasks.set(key, state); }
  const generation = state;
  const generating = computed(() => generation.status === "running");
  const getStatus = () => ({ status: generation.status, outputs: outputs.value, ...(generation.error ? { error: generation.error } : {}) });
  const cancelGeneration = () => generation.cancel?.();
  watch(() => generation.result, result => { if (result && generating.value) Object.assign(outputs.value, result); }, { immediate: true, flush: "sync" });

  nodeTools.register({
    name: "getGenerationStatus",
    description: "查询当前节点的生成任务状态（idle/running/succeeded/failed）、当前输出和最近一次生成错误。当前输出可能来自之前的生成；idle 不表示没有历史输出，只有 succeeded 表示本次生成成功",
    parameters: z.strictObject({}),
    execute: getStatus,
  });
  nodeTools.register({
    name: "cancelGeneration",
    description: "请求停止当前后台生成；cancellationRequested 表示已发出停止请求，随后用 getGenerationStatus 查询终止状态。不会删除已有输出，不能保证供应商撤销任务或费用",
    parameters: z.strictObject({}),
    execute() {
      const cancellationRequested = generating.value;
      if (cancellationRequested) cancelGeneration();
      return { ...getStatus(), cancellationRequested };
    },
  });

  async function run<T>(task: () => Promise<T>): Promise<T> {
    const destination = capture?.() ?? target;
    const destinationKey = destination ? JSON.stringify([destination.key, node.id]) : undefined;
    if (generating.value || destinationKey && tasks.get(destinationKey)?.status === "running") throw new Error("节点正在生成，请等待完成");
    if (destinationKey) tasks.set(destinationKey, generation);
    generation.status = "running";
    generation.error = "";
    generation.result = undefined;
    generation.cancel = cancel;
    const referenceSnapshot = flow.getEdges.value.filter(edge => edge.target === node.id && edge.sourceHandle?.startsWith("row:")).map(edge => ({ key: JSON.stringify([edge.source, edge.sourceHandle]), value: flow.findNode(edge.source)?.data.outputs?.[edge.sourceHandle!]?.value }));
    const pending = (async () => {
      try {
        const result = await task();
        if (node.data.scriptReferenceVersions) for (const reference of referenceSnapshot) if (typeof reference.value === "string") node.data.scriptReferenceVersions[reference.key] = reference.value;
        generation.result = JSON.parse(JSON.stringify(outputs.value)) as NodeOutputs;
        await nextTick();
        if (destination) await destination.save(node.id, generation.result);
        generation.status = "succeeded";
        return result;
      } catch (failure) {
        generation.status = "failed";
        const message = getWorkspaceFailure(failure).message;
        generation.error = failure instanceof Error && failure.name === "AbortError" ? "生成已取消"
          : message || (failure instanceof Error ? failure.message : "生成失败");
        throw failure;
      } finally { generation.cancel = undefined; }
    })();
    generation.pending = pending;
    const settled = () => { if (generation.pending === pending) generation.pending = undefined; };
    void pending.then(settled, settled);
    return pending;
  }

  return { generating, run, background: !!target, cancel: cancelGeneration, wait: () => generation.pending?.then(() => {}, () => {}) };
}
