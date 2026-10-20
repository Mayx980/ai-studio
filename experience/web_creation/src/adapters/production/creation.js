import { reactive } from 'vue'
export function createProductionAdapter(){return {state:reactive({available:false}),notify(){},isScenario:false}}
