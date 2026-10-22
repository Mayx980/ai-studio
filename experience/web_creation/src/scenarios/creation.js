import { installLocalMedia } from '../state/local-media'
import demoVideo from './assets/local-demo.webm?inline'
import { createWorkspace } from '../state/creation'
export function createScenario(scenario = 'default') {
  const p = createWorkspace(scenario)
  installLocalMedia(p, demoVideo)
  const generate = p.runGeneration
  p.runGeneration = id => {
    const n = p.state.nodes.find(n => n.id === id),
      input = n?.prompt || ''
    generate(id)
    if (n?.type === '文字')
      setTimeout(() => {
        if (n.status === 'success')
          n.text =
            '创作目标：' + input + '\n\n风格建议：自然、清晰，突出产品特点与活动信息。（模拟文案）'
      }, 720)
  }
  return p
}
