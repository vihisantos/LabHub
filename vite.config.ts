/// <reference types="vitest/config" />
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { visualizer } from 'rollup-plugin-visualizer'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'logo.svg', 'logo-192.png', 'logo-512.png', 'push-sw.js', 'app-icons/*.svg'],
      workbox: {
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // NOTE: navigateFallback removido intencionalmente.
        // O problema: quando um novo deploy muda os hashes dos assets,
        // o SW antigo não consegue servir a página e cai no offline.html,
        // fazendo a TV ficar presa nessa tela mesmo estando online.
        // Com navigateFallback desligado, o SW deixa o navegador fazer
        // a requisição normal para o servidor, que sempre serve o HTML
        // mais recente. O offline.html ainda existe como PWA offline page
        // mas não é mais interceptado automaticamente.
      },
      manifest: {
        name: 'Lab Hub',
        short_name: 'Lab Hub',
        description: 'Hub de aplicações para laboratórios',
        theme_color: '#1e293b',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/logo-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/logo-512.png', sizes: '512x512', type: 'image/png' },
        ],
        shortcuts: [
          { name: 'PCs', short_name: 'PCs', url: '/pcare/pcs' },
          { name: 'Scanner', short_name: 'Scanner', url: '/pcare/asset-scanner' },
          { name: 'Estoque Geral', short_name: 'Estoque', url: '/general-stock' },
        ],
      },
    }),
    process.env.ANALYZE && visualizer({
      open: true,
      gzipSize: true,
      brotliSize: true,
      filename: 'dist/stats.html',
    }),
  ],
  server: {
    proxy: {
      '/api/tv': {
        target: 'http://127.0.0.1:5001',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    pool: 'threads',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: 'coverage',
      include: ['src/**'],
      exclude: [
        'src/**/__tests__/**',
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
        'src/**/*.d.ts',
        'src/apps/reservalab/api/**',
        '**/*.py',
        '**/.env*',
      ],
      thresholds: {
        statements: 20,
        branches: 14,
        functions: 16,
        lines: 20,
      },
    },
  },
})
