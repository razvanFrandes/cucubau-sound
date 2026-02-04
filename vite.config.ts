import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { copyFileSync, mkdirSync, readdirSync, statSync } from 'fs'

function copyDir(src: string, dest: string) {
  mkdirSync(dest, { recursive: true })
  for (const file of readdirSync(src)) {
    const srcPath = resolve(src, file)
    const destPath = resolve(dest, file)
    if (statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath)
    } else {
      copyFileSync(srcPath, destPath)
    }
  }
}

export default defineConfig({
  base: './',
  plugins: [
    react(),
    {
      name: 'copy-extension-files',
      writeBundle() {
        // Copy manifest and icons
        copyFileSync('public/manifest.json', 'dist/manifest.json')
        copyDir('public/icons', 'dist/icons')
      }
    }
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'popup.html'),
        background: resolve(__dirname, 'src/background/index.ts'),
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === 'background') {
            return 'background.js'
          }
          return 'assets/[name]-[hash].js'
        },
      },
    },
  },
})
