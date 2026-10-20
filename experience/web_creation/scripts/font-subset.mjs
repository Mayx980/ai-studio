import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { colors, formatBytes } from './check-console.mjs'

const root = process.cwd()

const usage = `Usage:
  pnpm run assets:font-subset -- --input src/assets/fonts/source.ttf --output src/assets/fonts/app.woff2 --text-file src/locale/zh-CN.json
  pnpm run assets:font-subset -- --input source.otf --output app.woff2 --text "你好 Workflow"
  pnpm run assets:font-subset -- --input source.ttf --output app.woff2 --unicodes U+4E00-9FFF,U+0020-007E

Requires:
  python3 -m pip install fonttools brotli`

const parseArgs = argv => {
  const options = {
    dryRun: false
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = argv[index + 1]

    if (arg === '--help' || arg === '-h') {
      options.help = true
    } else if (arg === '--dry-run') {
      options.dryRun = true
    } else if (arg === '--input' && next) {
      options.input = next
      index += 1
    } else if (arg.startsWith('--input=')) {
      options.input = arg.slice('--input='.length)
    } else if (arg === '--output' && next) {
      options.output = next
      index += 1
    } else if (arg.startsWith('--output=')) {
      options.output = arg.slice('--output='.length)
    } else if (arg === '--text' && next) {
      options.text = next
      index += 1
    } else if (arg.startsWith('--text=')) {
      options.text = arg.slice('--text='.length)
    } else if (arg === '--text-file' && next) {
      options.textFile = next
      index += 1
    } else if (arg.startsWith('--text-file=')) {
      options.textFile = arg.slice('--text-file='.length)
    } else if (arg === '--unicodes' && next) {
      options.unicodes = next
      index += 1
    } else if (arg.startsWith('--unicodes=')) {
      options.unicodes = arg.slice('--unicodes='.length)
    }
  }

  return options
}

const fail = message => {
  console.error(`${colors.red(colors.bold('[font-subset]'))} ${message}`)
  process.exit(1)
}

const resolvePath = file => path.resolve(root, file)

const ensureTool = () => {
  const check = spawnSync('pyftsubset', ['--version'], {
    encoding: 'utf8'
  })

  if (check.error) {
    fail(
      'pyftsubset is required. Install fontTools and brotli first:\n  python3 -m pip install fonttools brotli'
    )
  }
}

const ensureOptions = options => {
  if (options.help) {
    console.log(usage)
    process.exit(0)
  }

  if (!options.input || !options.output) {
    fail(`${usage}\n\n--input and --output are required`)
  }

  if (!options.text && !options.textFile && !options.unicodes) {
    fail('--text, --text-file, or --unicodes is required so the subset is explicit')
  }

  const input = resolvePath(options.input)
  if (!fs.existsSync(input)) {
    fail(`input font not found: ${options.input}`)
  }

  if (options.textFile) {
    const textFile = resolvePath(options.textFile)
    if (!fs.existsSync(textFile)) {
      fail(`text file not found: ${options.textFile}`)
    }
  }
}

const buildArgs = options => {
  const input = resolvePath(options.input)
  const output = resolvePath(options.output)
  const args = [
    input,
    `--output-file=${output}`,
    '--flavor=woff2',
    '--layout-features=*',
    '--no-hinting',
    '--desubroutinize'
  ]

  if (options.text) args.push(`--text=${options.text}`)
  if (options.textFile) args.push(`--text-file=${resolvePath(options.textFile)}`)
  if (options.unicodes) args.push(`--unicodes=${options.unicodes}`)

  return args
}

const options = parseArgs(process.argv.slice(2))
ensureOptions(options)
ensureTool()

const output = resolvePath(options.output)
const args = buildArgs(options)

console.log(`[font-subset] pyftsubset ${args.map(arg => JSON.stringify(arg)).join(' ')}`)

if (options.dryRun) {
  console.log('[font-subset] dry-run only, no file written')
  process.exit(0)
}

fs.mkdirSync(path.dirname(output), { recursive: true })
const before = fs.statSync(resolvePath(options.input)).size
const result = spawnSync('pyftsubset', args, {
  cwd: root,
  encoding: 'utf8'
})

if (result.status !== 0) {
  fail(
    `pyftsubset failed. If WOFF2 support is missing, install brotli:\n  python3 -m pip install fonttools brotli\n\n${result.stdout}${result.stderr}`
  )
}

const after = fs.statSync(output).size
console.log(
  `[font-subset] wrote ${colors.cyan(path.relative(root, output))} ${formatBytes(before)} -> ${formatBytes(after)}`
)
