import { createWorkspace } from '../state/creation'
export function createScenario(scenario = 'default') {
  return createWorkspace(scenario)
}
