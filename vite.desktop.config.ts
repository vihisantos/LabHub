import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Build do entry desktop (Lab Hub TV) usado pelo Tauri.
 * Produz em desktop/renderer/ com base relativa (file:// no Tauri).
 */
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    host: 'localhost',
  },
  build: {
    outDir: 'desktop/renderer',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, 'desktop.html'),
      },
    },
  },
})