<template>
  <referenceItem v-if="refList.length" v-model="refList" @preview="setReferencePreview" @remove="removeReference" />
</template>

<script setup lang="ts">
import referenceItem from "@toonflow/node-shared/referenceItem";
import { useNodeReferences } from "@toonflow/node-shared/useNodeReferences";
const props = defineProps<{ rowId: string }>();
const { refList, setReferencePreview, removeReference } = useNodeReferences(`rowIn:${props.rowId}`);
</script>
