import { markRaw } from 'vue'
import Presentation from '../scenarios/Presentation.vue'
import { installPresentation } from '../scenarios/presentation'
import Navigator from '../_uiux/nav.vue'
import { creationPortKey } from '../ports/creation'
import { createScenario } from '../scenarios/creation'
export function installComposition({ app }) {
  const port = createScenario(
    (new URLSearchParams(location.search).get('demo') === '1'
      ? 'default'
      : new URLSearchParams(location.search).get('scenario')) ||
      import.meta.env.VITE_EXPERIENCE_SCENARIO ||
      'default'
  )
  port.scenarioNavigator = location.pathname.startsWith('/_uiux') ? markRaw(Navigator) : null
  if (new URLSearchParams(location.search).get('demo') === '1') {
    installPresentation(port)
    port.presentationComponent = markRaw(Presentation)
  }
  app.provide(creationPortKey, port)
}
