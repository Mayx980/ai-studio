import { defineConfig } from 'vite'
import { createExperienceIsolationPlugin } from './scripts/experience-isolation.mjs'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
export default defineConfig(({ mode }) => ({
  plugins: [
    vue(),
    createExperienceIsolationPlugin({ scenario: mode === 'scenario' }),
    ...(mode === 'connected'
      ? [
          {
            name: 'load-model-gateway',
            async configureServer(server) {
              const { modelGateway } = await import('./model-connect/gateway.mjs')
              modelGateway().configureServer(server)
            }
          }
        ]
      : [])
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@fe-composition': fileURLToPath(
        new URL(
          mode === 'scenario'
            ? './src/composition/scenario.js'
            : mode === 'connected'
              ? './src/composition/connected.js'
              : './src/composition/production.js',
          import.meta.url
        )
      )
    }
  },
  server: {
    host: '127.0.0.1',
    strictPort: true,
    watch: { usePolling: true, interval: 700, ignored: ['**/dist*/**'] }
  },
  build: {
    outDir:
      mode === 'scenario' ? 'dist-scenario' : mode === 'connected' ? 'dist-connected' : 'dist',
    manifest: true
  }
}))
