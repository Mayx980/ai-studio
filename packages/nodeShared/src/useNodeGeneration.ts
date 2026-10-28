import { useNode, useVueFlow } from "@vue-flow/core";
import { computed, ref, type Ref } from "vue";
import { nodeTools, z } from "@toonflow/nodes-scaffold/nodeTools";
import type { NodeOutputs } from "@toonflow/nodes-scaffold/values";

export function useNodeGeneration(outputs: Readonly<Ref<NodeOutputs>>, cancel: () => void) {
  const { node } = useNode();
  const flow = useVueFlow();
  const status = ref<"idle" | "running" | "succeeded" | "failed">("idle");
  const error = ref("");
  const generating = computed(() => status.value === "running");
  const getStatus = () => ({ status: status.value, outputs: outputs.value, ...(error.value ? { error: error.value } : {}) });

  nodeTools.register({
    name: "getGenerationStatus",
    description: "查询本次打开节点后的生成状态（idle/running/succeeded/failed）、当前输出和最近一次生成错误。当前输出可能来自之前的生成；idle 不表示没有历史输出，只有 succeeded 表示本次生成成功",
    parameters: z.strictObject({}),
    execute: getStatus,
  });
  nodeTools.register({
    name: "cancelGeneration",
    description: "请求停止当前后台生成；cancellationRequested 表示已发出停止请求，随后用 getGenerationStatus 查询终止状态。不会删除已有输出，不能保证供应商撤销任务或费用",
    parameters: z.strictObject({}),
    execute() {
      const cancellationRequested = generating.value;
      if (cancellationRequested) cancel();
      return { ...getStatus(), cancellationRequested };
    },
  });

  async function run<T>(task: () => Promise<T>): Promise<T> {
    if (generating.value) throw new Error("节点正在生成，请等待完成");
    status.value = "running";
    error.value = "";
    const referenceSnapshot = flow.getEdges.value.filter(edge => edge.target === node.id && edge.sourceHandle?.startsWith("row:")).map(edge => ({ key: JSON.stringify([edge.source, edge.sourceHandle]), value: flow.findNode(edge.source)?.data.outputs?.[edge.sourceHandle!]?.value }));
    try {
      const result = await task();
      if (node.data.scriptReferenceVersions) for (const reference of referenceSnapshot) if (typeof reference.value === "string") node.data.scriptReferenceVersions[reference.key] = reference.value;
      status.value = "succeeded";
      return result;
    } catch (failure) {
      status.value = "failed";
      const message = (failure as { response?: { data?: { message?: string } } })?.response?.data?.message;
      error.value = failure instanceof Error && failure.name === "AbortError" ? "生成已取消"
        : message || (failure instanceof Error ? failure.message : "生成失败");
      throw failure;
    }
  }

  return { generating, run };
}
