import {scanExperienceOutput,readModeArgument,reportTerminalResult} from './experience-isolation.mjs'
const mode=readModeArgument(process.argv);reportTerminalResult(scanExperienceOutput({root:process.cwd(),outDir:mode==='scenario'?'dist-scenario':'dist',mode}))
