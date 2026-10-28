import { readFileSync } from 'fs'
import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// package.json "version", baked into the renderer as __APP_VERSION__ (the splash's version note).
const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as { version: string }

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
    // Two pages: the app (index.html) and the cold-start splash (splash.html, the design file
    // verbatim); the main process loads splash first and switches to index on app:splashDone.
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          splash: resolve('src/renderer/splash.html')
        }
      }
    },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react(), tailwindcss()]
  }
})
