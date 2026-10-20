import {markRaw} from 'vue'
import Navigator from '../_uiux/nav.vue'
import { creationPortKey } from '../ports/creation'
import { createScenario } from '../scenarios/creation'
export function installComposition({app}){const port=createScenario(new URLSearchParams(location.search).get('scenario')||import.meta.env.VITE_EXPERIENCE_SCENARIO||'default');port.scenarioNavigator=location.pathname.startsWith('/_uiux')?markRaw(Navigator):null;app.provide(creationPortKey,port);}
