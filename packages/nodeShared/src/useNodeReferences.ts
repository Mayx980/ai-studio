import { computed, ref } from "vue";
import { useNode, useVueFlow } from "@vue-flow/core";
import type { NodeData } from "@toonflow/nodes-scaffold/connection";
import { useNodeEvent } from "@toonflow/nodes-scaffold/nodeEvent";
import type { NodeInputValue } from "@toonflow/nodes-scaffold/values";
import { useNodeInputs } from "@toonflow/nodes-scaffold/nodeInputs";

export function useNodeReferences(handleId = "in") {
  const { id, node } = useNode<NodeData & { referenceOrder?: Record<string, string[]> }>();
  const flow = useVueFlow();
  const { removeEdges } = flow;
  const inputs = useNodeInputs(flow);
  const inputValues = ref<NodeInputValue[]>([]);
  const previews = ref(new Map<string, string>());
  const refList = computed({
    get() {
      const order = new Map(node.data.referenceOrder?.[handleId]?.map((key, index) => [key, index]));
      const values = inputValues.value.flatMap(item => {
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
          name: `参考 ${index + 1}`,
          value: `{{ref ${index + 1}}}`,
          avatar: previews.value.get(referenceKey(item)) || undefined,
        }]
      : []
  ));

  useNodeEvent().on(`input:${handleId}`, (values) => {
    inputValues.value = values;
    const ids = new Set(values.filter(item => item.dataType === "IMAGE" || item.dataType === "VIDEO").map(referenceKey));
    for (const key of previews.value.keys()) {
      if (!ids.has(key)) previews.value.delete(key);
    }
  });

  function setReferencePreview(item: NodeInputValue, url: string) {
    previews.value.set(referenceKey(item), url);
  }

  function removeReference(item: NodeInputValue) {
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
