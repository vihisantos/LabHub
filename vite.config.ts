import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

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
      includeAssets: ['favicon.svg'],
      workbox: {
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
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
          { src: '/favicon.svg', sizes: '192x192', type: 'image/svg+xml' },
          { src: '/favicon.svg', sizes: '512x512', type: 'image/svg+xml' },
        ],
        shortcuts: [
          { name: 'PCs', short_name: 'PCs', url: '/pcare/pcs' },
          { name: 'Scanner', short_name: 'Scanner', url: '/pcare/asset-scanner' },
          { name: 'Novo PC', short_name: 'Novo PC', url: '/pcare/pcs/new' },
          { name: 'Estoque Geral', short_name: 'Estoque', url: '/general-stock' },
        ],
      },
    }),
  ],
})
