import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

function copyPoppinsFonts(): Plugin {
  return {
    name: 'copy-poppins-fonts',
    buildStart() {
      try {
        const require = createRequire(import.meta.url)
        const pkgDir = path.dirname(require.resolve('@fontsource/poppins/package.json'))
        const destDir = path.resolve(__dirname, 'public/fonts')
        fs.mkdirSync(destDir, { recursive: true })
        for (const weight of [400, 500, 600, 700, 800]) {
          const src = path.join(pkgDir, 'files', `poppins-latin-${weight}-normal.woff2`)
          if (fs.existsSync(src)) {
            fs.copyFileSync(src, path.join(destDir, `poppins-latin-${weight}-normal.woff2`))
          }
        }
      } catch {
        /* package not installed yet */
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), copyPoppinsFonts()],
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_DEV_API_PROXY || 'http://localhost:4000',
        changeOrigin: true,
      },
      '/privacy': {
        target: process.env.VITE_DEV_API_PROXY || 'http://localhost:4000',
        changeOrigin: true,
      },
      '/delete-account': {
        target: process.env.VITE_DEV_API_PROXY || 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
})
