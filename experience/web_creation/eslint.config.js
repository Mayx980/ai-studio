import fs from 'node:fs'
import js from '@eslint/js'
import vue from 'eslint-plugin-vue'
import globals from 'globals'

const autoImportFile = new URL('./.eslintrc-auto-import.json', import.meta.url)
const autoImportGlobals = fs.existsSync(autoImportFile)
  ? JSON.parse(fs.readFileSync(autoImportFile, 'utf8')).globals
  : {}

export default [
  {
    ignores: [
      'coverage/**',
      'dist/**',
      'dist-scenario/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
      'pnpm-lock.yaml',
      'bundle-report.html',
      'components.d.ts',
      'auto-imports.d.ts'
    ]
  },
  js.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.{js,mjs,vue}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...autoImportGlobals
      }
    },
    rules: {
      semi: ['warn', 'never'],
      quotes: ['warn', 'single', { avoidEscape: true }],
      'no-console': 'warn',
      'no-debugger': 'warn',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'vue/multi-word-component-names': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/multiline-html-element-content-newline': 'off',
      'vue/html-closing-bracket-newline': 'off',
      'vue/html-indent': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/html-self-closing': [
        'error',
        {
          html: { void: 'always', normal: 'never', component: 'always' },
          svg: 'always',
          math: 'always'
        }
      ]
    }
  },
  {
    files: ['*.cjs'],
    languageOptions: {
      globals: { ...globals.node, module: 'readonly' }
    }
  },
  {
    files: ['scripts/**/*.mjs'],
    rules: { 'no-console': 'off' }
  }
]
