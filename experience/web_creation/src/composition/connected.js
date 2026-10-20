import { creationPortKey } from '../ports/creation'
import { createConnectedPort } from '../adapters/connected/creation'
export function installComposition({ app }) {
  app.provide(creationPortKey, createConnectedPort())
}
