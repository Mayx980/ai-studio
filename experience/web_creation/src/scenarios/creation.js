import { installStudio } from './studio'
import { installStoryGuide } from './story-guide'
import { installLocalMedia } from '../state/local-media'
import demoVideo from './assets/local-demo.webm?inline'
import { createWorkspace } from '../state/creation'
export function createScenario(scenario = 'default') {
  const p = createWorkspace(scenario)
  installLocalMedia(p, demoVideo)
  installStoryGuide(p)
  installStudio(p, demoVideo)
  return p
}
