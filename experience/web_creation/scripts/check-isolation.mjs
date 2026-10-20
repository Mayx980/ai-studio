import {
  scanExperienceOutput,
  readModeArgument,
  reportTerminalResult
} from './experience-isolation.mjs'
const requested = readModeArgument(process.argv),
  mode = requested === 'connected' ? 'production' : requested,
  outDir =
    requested === 'connected' ? 'dist-connected' : mode === 'scenario' ? 'dist-scenario' : 'dist'
reportTerminalResult(scanExperienceOutput({ root: process.cwd(), outDir, mode }))
