import { inject } from 'vue'
export const creationPortKey=Symbol('creation-port')
export function useCreation(){const port=inject(creationPortKey);if(!port)throw new Error('创作能力未装配');return port}
