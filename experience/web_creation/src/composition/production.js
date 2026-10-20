import { creationPortKey } from '../ports/creation'
import { createProductionAdapter } from '../adapters/production/creation'
export function installComposition({app}){app.provide(creationPortKey,createProductionAdapter())}
