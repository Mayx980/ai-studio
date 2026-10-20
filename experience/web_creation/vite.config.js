import { defineConfig } from 'vite'
import {createExperienceIsolationPlugin} from './scripts/experience-isolation.mjs'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
export default defineConfig(({mode})=>({plugins:[vue(),createExperienceIsolationPlugin({scenario:mode==='scenario'})],resolve:{alias:{'@':fileURLToPath(new URL('./src',import.meta.url)),'@fe-composition':fileURLToPath(new URL(mode==='scenario'?'./src/composition/scenario.js':'./src/composition/production.js',import.meta.url))}},server:{host:'127.0.0.1'},build:{outDir:mode==='scenario'?'dist-scenario':'dist',manifest:true}}))
