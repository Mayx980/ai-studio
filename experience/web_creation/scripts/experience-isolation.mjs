import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { brotliDecompressSync, gunzipSync } from 'node:zlib'

const SCENARIO_MODULE_IDENTITIES = [
  '/src/scenarios/',
  '/src/_uiux/',
  '/src/composition/scenario.',
  '/modules/_uiux.'
]
const PRODUCTION_OUTPUT_IDENTITIES = [
  '/_uiux',
  'data-uiux-id',
  'VITE_EXPERIENCE_SCENARIO',
  'EXPERIENCE_SCENARIO',
  'src/scenarios/',
  'uiux_manifest.md',
  'experience/preview/'
]
const TRANSPORT_MODULE_IDENTITIES = [
  '@tauri-apps/plugin-http',
  'axios',
  'cross-fetch',
  'node-fetch',
  'node:http',
  'node:https',
  'undici'
]
const GLOBAL_TRANSPORT_NAMES = '(?:fetch|XMLHttpRequest|WebSocket|EventSource)'
const GLOBAL_TRANSPORT_MEMBER_IDENTITY = new RegExp(
  `\\b(?:window|globalThis|self)\\s*(?:\\?\\.|\\.)\\s*${GLOBAL_TRANSPORT_NAMES}\\b|` +
    '\\bnavigator\\s*(?:\\?\\.|\\.)\\s*sendBeacon\\b'
)
const GLOBAL_TRANSPORT_IDENTITY = new RegExp(
  `(?:^|[^\\w$.])${GLOBAL_TRANSPORT_NAMES}\\b|${GLOBAL_TRANSPORT_MEMBER_IDENTITY.source}`
)
const COMPUTED_TRANSPORT_MEMBER_IDENTITY =
  /\b(?:window|globalThis|self)\s*(?:\?\.\s*)?\[\s*(?:'(?:fetch|XMLHttpRequest|WebSocket|EventSource)'|"(?:fetch|XMLHttpRequest|WebSocket|EventSource)"|`(?:fetch|XMLHttpRequest|WebSocket|EventSource)`)\s*\]|\bnavigator\s*(?:\?\.\s*)?\[\s*(?:'sendBeacon'|"sendBeacon"|`sendBeacon`)\s*\]/
const MODULE_SPECIFIER =
  /(?:\b(?:import|export)\s+(?:[\w*$,\s{}]+?\s+from\s+)?|\b(?:import|require)\s*\(\s*)["']([^"']+)["']/g
const HOST_HTTP_CALL = /\b[\w$]+(?:\s*\.\s*[\w$]+)*\s*\(\s*["'`]plugin:http\|fetch["'`]/i
const DIRECT_BUSINESS_OUTPUT =
  /(?:\bfetch|\bWebSocket|\bEventSource|\bsendBeacon)\s*\(\s*["'`](?:https?:\/\/|wss?:\/\/|\/(?:api|v[0-9]+)(?:\/|["'`]))/i
const XHR_BUSINESS_OUTPUT =
  /\.open\s*\(\s*["'`](?:GET|POST|PUT|PATCH|DELETE)["'`]\s*,\s*["'`](?:https?:\/\/|\/(?:api|v[0-9]+)(?:\/|["'`]))/i
const BUSINESS_ENDPOINT_OUTPUT = /\b(?:window|globalThis|self)\s*\.\s*__businessEndpoint\b/

const normalize = value =>
  String(value || '')
    .replace(/\\/g, '/')
    .split('?')[0]

const productionModuleFinding = id => {
  const normalized = normalize(id)
  return (
    SCENARIO_MODULE_IDENTITIES.some(identity => normalized.includes(identity)) ||
    normalized.endsWith('.manifest.md') ||
    normalized.split('/').includes('fixtures')
  )
}

const REGEX_PREFIX_KEYWORDS = new Set([
  'await',
  'case',
  'delete',
  'do',
  'else',
  'in',
  'instanceof',
  'new',
  'of',
  'return',
  'throw',
  'typeof',
  'void',
  'yield'
])

const regexLiteralStarts = (source, index) => {
  let cursor = index - 1
  while (cursor >= 0 && /\s/.test(source[cursor])) cursor -= 1
  if (cursor < 0) return true
  if (source.slice(Math.max(0, cursor - 1), cursor + 1) === '=>') return true
  if ('([{,;:=!?&|+-*%^~'.includes(source[cursor])) return true
  if (/[\w$]/.test(source[cursor])) {
    const end = cursor + 1
    while (cursor >= 0 && /[\w$]/.test(source[cursor])) cursor -= 1
    return REGEX_PREFIX_KEYWORDS.has(source.slice(cursor + 1, end))
  }
  return false
}

const projectSource = (source, { maskQuotedLiterals, maskTemplateText }) => {
  let output = ''
  const contexts = [{ kind: 'code', depth: 0 }]
  for (let index = 0; index < source.length; index += 1) {
    const current = source[index]
    const following = source[index + 1] || ''
    const context = contexts.at(-1)
    if (['code', 'expression'].includes(context.kind)) {
      if (["'", '"'].includes(current)) {
        output += maskQuotedLiterals ? ' ' : current
        contexts.push({ kind: 'quoted', quote: current })
      } else if (current === '`') {
        output += maskTemplateText ? ' ' : current
        contexts.push({ kind: 'template', depth: 0 })
      } else if (source.startsWith('<!--', index)) {
        output += '    '
        index += 4
        while (index < source.length) {
          if (source.startsWith('-->', index)) {
            output += '   '
            index += 2
            break
          }
          output += source[index] === '\n' ? '\n' : ' '
          index += 1
        }
      } else if (current === '/' && following === '/') {
        output += '  '
        index += 1
        while (index + 1 < source.length && source[index + 1] !== '\n') {
          output += ' '
          index += 1
        }
      } else if (current === '/' && following === '*') {
        output += '  '
        index += 1
        while (index + 1 < source.length) {
          const next = source[index + 1]
          const after = source[index + 2] || ''
          if (next === '*' && after === '/') {
            output += '  '
            index += 2
            break
          }
          output += next === '\n' ? '\n' : ' '
          index += 1
        }
      } else if (current === '/' && regexLiteralStarts(source, index)) {
        output += maskQuotedLiterals ? ' ' : current
        contexts.push({ kind: 'regex', inClass: false })
      } else {
        output += current
        if (context.kind === 'expression' && current === '{') {
          context.depth += 1
        } else if (context.kind === 'expression' && current === '}') {
          context.depth -= 1
          if (context.depth === 0) contexts.pop()
        }
      }
    } else if (context.kind === 'quoted') {
      output += maskQuotedLiterals && current !== '\n' ? ' ' : current
      if (current === '\\') {
        if (following) {
          output += maskQuotedLiterals && following !== '\n' ? ' ' : following
          index += 1
        }
      } else if (current === context.quote) {
        contexts.pop()
      }
    } else if (context.kind === 'template') {
      if (current === '\\') {
        output += maskTemplateText && current !== '\n' ? ' ' : current
        if (following) {
          output += maskTemplateText && following !== '\n' ? ' ' : following
          index += 1
        }
      } else if (current === '`') {
        output += maskTemplateText ? ' ' : current
        contexts.pop()
      } else if (current === '$' && following === '{') {
        output += maskTemplateText ? '  ' : '${'
        contexts.push({ kind: 'expression', depth: 1 })
        index += 1
      } else {
        output += maskTemplateText && current !== '\n' ? ' ' : current
      }
    } else if (context.kind === 'regex') {
      output += maskQuotedLiterals && current !== '\n' ? ' ' : current
      if (current === '\\') {
        if (following) {
          output += maskQuotedLiterals && following !== '\n' ? ' ' : following
          index += 1
        }
      } else if (current === '[') {
        context.inClass = true
      } else if (current === ']') {
        context.inClass = false
      } else if (current === '/' && !context.inClass) {
        contexts.pop()
        while (index + 1 < source.length && /[a-z]/i.test(source[index + 1])) {
          index += 1
          output += maskQuotedLiterals ? ' ' : source[index]
        }
      } else if (current === '\n') {
        contexts.pop()
      }
    }
  }
  return output
}

const stripSourceComments = source =>
  projectSource(source, {
    maskQuotedLiterals: false,
    maskTemplateText: false
  })

const maskSourceLiterals = source =>
  projectSource(source, {
    maskQuotedLiterals: true,
    maskTemplateText: true
  })

const executableMatches = (source, pattern, code = maskSourceLiterals(source)) => {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`
  const matcher = new RegExp(pattern.source, flags)
  return [...source.matchAll(matcher)].filter(match => code[match.index] === source[match.index])
}

const transportModuleFinding = (source, code = maskSourceLiterals(source)) =>
  executableMatches(source, MODULE_SPECIFIER, code)
    .map(match => match[1])
    .some(module =>
      TRANSPORT_MODULE_IDENTITIES.some(
        identity => module === identity || module.startsWith(`${identity}/`)
      )
    )

const computedTransportFinding = (source, code = maskSourceLiterals(source)) =>
  executableMatches(source, COMPUTED_TRANSPORT_MEMBER_IDENTITY, code).length > 0

const scenarioSourceFinding = source => {
  const body = stripSourceComments(String(source || ''))
  const code = maskSourceLiterals(body)
  return (
    transportModuleFinding(body, code) ||
    executableMatches(body, HOST_HTTP_CALL, code).length > 0 ||
    GLOBAL_TRANSPORT_IDENTITY.test(code) ||
    computedTransportFinding(body, code)
  )
}

const outputBody = output =>
  output.type === 'chunk' ? String(output.code || '') : String(output.source || '')

export const createExperienceIsolationPlugin = ({ scenario }) => ({
  name: 'experience-isolation',
  transform(source, id) {
    const normalized = normalize(id)
    if (!scenario || !normalized.includes('/src/') || normalized.includes('/node_modules/'))
      return null
    if (scenarioSourceFinding(source)) {
      this.error(`Scenario source 可达 business transport：${normalized}`)
    }
    return null
  },
  generateBundle(_options, bundle) {
    if (scenario) return
    const forbidden = [...this.getModuleIds()]
      .filter(id => this.getModuleInfo?.(id)?.isIncluded !== false)
      .filter(productionModuleFinding)
      .map(normalize)
      .sort()
    if (forbidden.length) {
      this.error(`production 模块图可达 Scenario/UIUX 源：\n${forbidden.join('\n')}`)
    }
    const emitted = Object.entries(bundle || {})
      .filter(([, output]) =>
        PRODUCTION_OUTPUT_IDENTITIES.some(identity => outputBody(output).includes(identity))
      )
      .map(([file]) => file)
      .sort()
    if (emitted.length) {
      this.error(`production 产物含 Scenario/UIUX/Preview identity：\n${emitted.join('\n')}`)
    }
  }
})

const enumerateOutput = root => {
  const files = []
  const pending = [root]
  while (pending.length) {
    const current = pending.pop()
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name)
      const metadata = fs.lstatSync(target)
      if (metadata.isSymbolicLink()) throw new Error(`terminal output 不得含 symlink：${target}`)
      if (metadata.isDirectory()) {
        pending.push(target)
      } else if (metadata.isFile()) {
        files.push(target)
      } else {
        throw new Error(`terminal output 含 special file：${target}`)
      }
    }
  }
  return files.sort()
}

const decodedBytes = file => {
  const bytes = fs.readFileSync(file)
  if (file.endsWith('.gz')) return gunzipSync(bytes)
  if (file.endsWith('.br')) return brotliDecompressSync(bytes)
  return bytes
}

const productionPathFinding = relative => {
  const normalized = normalize(relative).toLowerCase()
  const pieces = normalized.split('/')
  return (
    pieces.some(piece => ['_uiux', 'fixtures', 'preview', 'scenarios'].includes(piece)) ||
    pieces.at(-1) === 'uiux_manifest.md'
  )
}

const productionOutputFinding = body =>
  PRODUCTION_OUTPUT_IDENTITIES.some(identity => body.includes(identity))

const scenarioOutputFinding = body => {
  const source = stripSourceComments(body)
  const code = maskSourceLiterals(source)
  return (
    transportModuleFinding(source, code) ||
    executableMatches(source, HOST_HTTP_CALL, code).length > 0 ||
    executableMatches(source, DIRECT_BUSINESS_OUTPUT, code).length > 0 ||
    executableMatches(source, XHR_BUSINESS_OUTPUT, code).length > 0 ||
    BUSINESS_ENDPOINT_OUTPUT.test(code) ||
    GLOBAL_TRANSPORT_MEMBER_IDENTITY.test(code) ||
    computedTransportFinding(source, code)
  )
}

export const scanExperienceOutput = ({ root, outDir, mode }) => {
  if (!['production', 'scenario'].includes(mode)) {
    throw new Error(`terminal scanner mode 无效：${mode}`)
  }
  const projectRoot = path.resolve(root)
  const outputRoot = path.resolve(projectRoot, outDir)
  const relativeOutput = path.relative(projectRoot, outputRoot)
  if (!relativeOutput || relativeOutput.startsWith('..') || path.isAbsolute(relativeOutput)) {
    throw new Error(`terminal output 越出 Experience entity：${outDir}`)
  }
  const metadata = fs.lstatSync(outputRoot)
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new Error(`terminal output 不是普通目录：${outDir}`)
  }
  const files = enumerateOutput(outputRoot)
  if (!files.length) throw new Error(`terminal output 为空：${outDir}`)
  const findings = []
  for (const file of files) {
    const relative = normalize(path.relative(outputRoot, file))
    let body
    try {
      body = decodedBytes(file).toString('utf8')
    } catch (error) {
      throw new Error(`terminal output 压缩内容不可读：${relative}：${error.message}`, {
        cause: error
      })
    }
    if (
      mode === 'production' &&
      (productionPathFinding(relative) || productionOutputFinding(body))
    ) {
      findings.push(relative)
    }
    if (mode === 'scenario' && scenarioOutputFinding(body)) findings.push(relative)
  }
  if (findings.length) {
    throw new Error(
      `${mode} terminal output 违反 Experience isolation：\n${[...new Set(findings)].sort().join('\n')}`
    )
  }
  return { mode, outDir: normalize(outDir), files: files.length, status: 'passed' }
}

export const readModeArgument = arguments_ => {
  const index = arguments_.indexOf('--mode')
  if (index === -1 || !arguments_[index + 1]) throw new Error('缺少 --mode production|scenario')
  return arguments_[index + 1]
}

export const reportTerminalResult = result => {
  process.stdout.write(`${JSON.stringify(result)}\n`)
}
