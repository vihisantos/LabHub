import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Build do entry desktop (Lab Hub TV) usado pelo Electron.
 * Produz em desktop/renderer/ com base relativa (file:// no Electron).
 */
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'desktop/renderer',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'desktop.html'),
      },
    },
  },
})
