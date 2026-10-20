import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { optimize as optimizeSvgContent } from 'svgo'
import { colors, formatBytes } from './check-console.mjs'

const root = process.cwd()
const bitmapExtensions = new Set(['.avif', '.jpeg', '.jpg', '.png', '.webp'])
const svgExtensions = new Set(['.svg'])
const ignoredDirs = new Set(['.git', 'dist', 'node_modules', 'coverage'])
const defaultInputs = ['src', 'public']
const defaultOutDir = 'public/optimized-assets'
let sharpInstance

const usage = `Usage:
  pnpm run assets:check
  pnpm run assets:optimize -- [--format webp|avif|jpeg|png] [--quality 78] [--widths 320,640]
  node scripts/asset-optimize.mjs --input src/assets --out-dir public/optimized-assets --write

Defaults:
  - dry-run unless --write is passed
  - input directories: src, public
  - output directory: public/optimized-assets
  - bitmap format: webp
  - source files are never overwritten`

const parseArgs = argv => {
  const options = {
    dryRun: true,
    inputs: [],
    outDir: defaultOutDir,
    format: 'webp',
    quality: 78,
    widths: [],
    includeSvg: true,
    help: false
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = argv[index + 1]

    if (arg === '--help' || arg === '-h') {
      options.help = true
    } else if (arg === '--write') {
      options.dryRun = false
    } else if (arg === '--dry-run') {
      options.dryRun = true
    } else if (arg === '--input' && next) {
      options.inputs.push(next)
      index += 1
    } else if (arg.startsWith('--input=')) {
      options.inputs.push(arg.slice('--input='.length))
    } else if (arg === '--out-dir' && next) {
      options.outDir = next
      index += 1
    } else if (arg.startsWith('--out-dir=')) {
      options.outDir = arg.slice('--out-dir='.length)
    } else if (arg === '--format' && next) {
      options.format = next
      index += 1
    } else if (arg.startsWith('--format=')) {
      options.format = arg.slice('--format='.length)
    } else if (arg === '--quality' && next) {
      options.quality = Number(next)
      index += 1
    } else if (arg.startsWith('--quality=')) {
      options.quality = Number(arg.slice('--quality='.length))
    } else if (arg === '--widths' && next) {
      options.widths = parseWidths(next)
      index += 1
    } else if (arg.startsWith('--widths=')) {
      options.widths = parseWidths(arg.slice('--widths='.length))
    } else if (arg === '--no-svg') {
      options.includeSvg = false
    }
  }

  if (!options.inputs.length) options.inputs = defaultInputs
  return options
}

const parseWidths = value => {
  return value
    .split(',')
    .map(item => Number(item.trim()))
    .filter(item => Number.isInteger(item) && item > 0)
}

const fail = message => {
  console.error(`${colors.red(colors.bold('[assets]'))} ${message}`)
  process.exit(1)
}

const loadSharp = async () => {
  if (sharpInstance) return sharpInstance

  try {
    sharpInstance = (await import('sharp')).default
    return sharpInstance
  } catch (error) {
    fail(
      `sharp could not be loaded for bitmap optimization.\n${error.message}\n\nTry reinstalling optional dependencies with pnpm, or run SVG-only optimization with --input pointing to SVG files.`
    )
  }
}

const ensureValidOptions = options => {
  if (!['avif', 'jpeg', 'jpg', 'png', 'webp'].includes(options.format)) {
    fail(`unsupported bitmap format "${options.format}"`)
  }

  if (!Number.isFinite(options.quality) || options.quality < 1 || options.quality > 100) {
    fail(`quality must be an integer from 1 to 100, received "${options.quality}"`)
  }

  options.format = options.format === 'jpg' ? 'jpeg' : options.format
}

const walk = dir => {
  if (!fs.existsSync(dir)) return []

  const files = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) {
        files.push(...walk(fullPath))
      }
      continue
    }

    if (entry.isFile()) files.push(fullPath)
  }

  return files
}

const getSourceFiles = options => {
  const outDirAbs = path.resolve(root, options.outDir)
  const files = []

  for (const input of options.inputs) {
    const inputAbs = path.resolve(root, input)
    files.push(...walk(inputAbs))
  }

  return [...new Set(files)]
    .filter(file => {
      const ext = path.extname(file).toLowerCase()
      const isAsset = bitmapExtensions.has(ext) || (options.includeSvg && svgExtensions.has(ext))
      return isAsset && !path.resolve(file).startsWith(`${outDirAbs}${path.sep}`)
    })
    .sort()
}

const getOutputPath = (file, options, variant = {}) => {
  const relative = path.relative(root, file)
  const parsed = path.parse(relative)
  const format = variant.format || parsed.ext.slice(1)
  const widthSuffix = variant.width ? `-${variant.width}w` : ''
  const filename = `${parsed.name}${widthSuffix}.${format}`
  return path.join(root, options.outDir, parsed.dir, filename)
}

const writeResult = (targetPath, buffer, options) => {
  if (options.dryRun) return
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  fs.writeFileSync(targetPath, buffer)
}

const formatSavings = (before, after) => {
  if (!before) return ''
  const ratio = ((before - after) / before) * 100
  const color = ratio >= 0 ? colors.green : colors.yellow
  return color(`${ratio.toFixed(1)}%`)
}

const logResult = ({ source, target, before, after, dryRun }) => {
  const verb = dryRun ? 'would write' : 'wrote'
  const relativeSource = path.relative(root, source)
  const relativeTarget = path.relative(root, target)
  console.log(
    `[assets] ${verb} ${colors.cyan(relativeTarget)} from ${colors.dim(relativeSource)} ${formatBytes(
      before
    )} -> ${formatBytes(after)} (${formatSavings(before, after)})`
  )
}

const optimizeSvg = async (file, options) => {
  const source = fs.readFileSync(file, 'utf8')
  const result = optimizeSvgContent(source, {
    path: file,
    multipass: true,
    plugins: [
      {
        name: 'preset-default',
        params: {
          overrides: {
            removeDesc: false
          }
        }
      }
    ]
  })

  const output = Buffer.from(result.data)
  const target = getOutputPath(file, options, { format: 'svg' })
  writeResult(target, output, options)
  logResult({
    source: file,
    target,
    before: Buffer.byteLength(source),
    after: output.length,
    dryRun: options.dryRun
  })
}

const createSharpPipeline = async (file, width) => {
  const sharp = await loadSharp()
  let pipeline = sharp(file, { animated: false }).rotate()
  if (width) {
    pipeline = pipeline.resize({
      width,
      withoutEnlargement: true
    })
  }
  return pipeline
}

const toBufferByFormat = async (pipeline, options) => {
  if (options.format === 'avif')
    return pipeline.avif({ quality: Math.min(options.quality, 70) }).toBuffer()
  if (options.format === 'jpeg')
    return pipeline.jpeg({ mozjpeg: true, quality: options.quality }).toBuffer()
  if (options.format === 'png')
    return pipeline.png({ compressionLevel: 9, quality: options.quality }).toBuffer()
  return pipeline.webp({ quality: options.quality }).toBuffer()
}

const optimizeBitmap = async (file, options) => {
  const sourceSize = fs.statSync(file).size
  const widths = options.widths.length ? options.widths : [null]

  for (const width of widths) {
    const pipeline = await createSharpPipeline(file, width)
    const output = await toBufferByFormat(pipeline, options)
    const target = getOutputPath(file, options, {
      format: options.format,
      width
    })
    writeResult(target, output, options)
    logResult({
      source: file,
      target,
      before: sourceSize,
      after: output.length,
      dryRun: options.dryRun
    })
  }
}

const options = parseArgs(process.argv.slice(2))
if (options.help) {
  console.log(usage)
  process.exit(0)
}
ensureValidOptions(options)

const files = getSourceFiles(options)
console.log(
  `[assets] ${options.dryRun ? 'dry-run' : 'write'} mode, ${files.length} asset(s), output ${colors.green(
    options.outDir
  )}`
)

if (!files.length) {
  console.log('[assets] no bitmap or SVG assets found')
  process.exit(0)
}

for (const file of files) {
  const ext = path.extname(file).toLowerCase()
  if (svgExtensions.has(ext)) {
    await optimizeSvg(file, options)
  } else {
    await optimizeBitmap(file, options)
  }
}

console.log(`[assets] ${colors.green('done')}`)
