import { computed, ref } from "vue";
import { useNode, useVueFlow } from "@vue-flow/core";
import type { NodeData } from "@toonflow/nodes-scaffold/connection";
import { useNodeEvent } from "@toonflow/nodes-scaffold/nodeEvent";
import { isNodeOutput, type NodeInputValue } from "@toonflow/nodes-scaffold/values";
import { useNodeInputs } from "@toonflow/nodes-scaffold/nodeInputs";

export function useNodeReferences(handleId = "in") {
  const { id, node } = useNode<NodeData & { referenceOrder?: Record<string, string[]>; localReferences?: (NodeInputValue & { name?: string })[] }>();
  const flow = useVueFlow();
  const { removeEdges } = flow;
  const inputs = useNodeInputs(flow);
  const inputValues = ref<NodeInputValue[]>([]);
  const previews = ref(new Map<string, string>());
  const refList = computed({
    get() {
      const order = new Map(node.data.referenceOrder?.[handleId]?.map((key, index) => [key, index]));
      const local = node.data.localReferences ?? [];
      if (!Array.isArray(local) || local.some(item => !item || item.source !== "local" || typeof item.sourceHandle !== "string" || !/^local:[a-f0-9-]+$/.test(item.sourceHandle) || !isNodeOutput(item) || item.dataType !== "IMAGE" || (item.name !== undefined && (typeof item.name !== "string" || item.name.length > 80)))) throw new Error("节点内参考图片数据无效");
      const values = [...inputValues.value, ...local].flatMap(item => {
        if (item.dataType !== "STRING" || !item.sourceHandle.startsWith("row:") || flow.findNode(item.source)?.data.contentKind !== "script") return [item];
        const images = inputs.getTargetValues(item.source, `rowIn:${item.sourceHandle.slice(4)}`).filter(reference => reference.dataType === "IMAGE");
        return [item, ...images.map(reference => ({ ...reference, source: item.source, sourceHandle: `${item.sourceHandle}/reference/${encodeURIComponent(JSON.stringify([reference.source, reference.sourceHandle]))}` }))];
      });
      return values.sort((a, b) => (order.get(referenceKey(a)) ?? order.size) - (order.get(referenceKey(b)) ?? order.size));
    },
    set(values: NodeInputValue[]) {
      node.data.referenceOrder = { ...node.data.referenceOrder, [handleId]: values.map(referenceKey) };
    },
  });
  const referenceMentions = computed(() => refList.value.flatMap((item, index) =>
    typeof item.dataType === "string" && ["IMAGE", "VIDEO", "AUDIO", "STRING", "FILE"].includes(item.dataType)
      ? [{
          id: referenceKey(item),
          name: node.data.localReferences?.find(local => referenceKey(local) === referenceKey(item))?.name || `参考 ${index + 1}`,
          value: `{{ref ${index + 1}}}`,
          avatar: previews.value.get(referenceKey(item)) || undefined,
        }]
      : []
  ));

  useNodeEvent().on(`input:${handleId}`, (values) => {
    inputValues.value = values;
    const ids = new Set([...values, ...(node.data.localReferences ?? [])].filter(item => item.dataType === "IMAGE" || item.dataType === "VIDEO").map(referenceKey));
    for (const key of previews.value.keys()) {
      if (!ids.has(key)) previews.value.delete(key);
    }
  });

  function setReferencePreview(item: NodeInputValue, url: string) {
    previews.value.set(referenceKey(item), url);
  }

  function removeReference(item: NodeInputValue) {
    if (node.data.localReferences?.some(local => referenceKey(local) === referenceKey(item))) {
      node.data.localReferences = node.data.localReferences.filter(local => referenceKey(local) !== referenceKey(item));
      previews.value.delete(referenceKey(item));
      return;
    }
    const sourceHandle = item.sourceHandle.split("/reference/")[0];
    removeEdges(edges => edges.filter(edge =>
      edge.target === id && edge.targetHandle === handleId && edge.source === item.source && edge.sourceHandle === sourceHandle
    ));
  }

  return { refList, referenceMentions, setReferencePreview, removeReference };
}

function referenceKey(item: NodeInputValue) {
  return encodeURIComponent(JSON.stringify([item.source, item.sourceHandle]));
}
