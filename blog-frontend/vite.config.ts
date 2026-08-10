import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('react-markdown') || id.includes('remark-')) return 'markdown'
          if (id.includes('qrcode.react')) return 'qrcode'
          if (id.includes('react') || id.includes('react-router')) return 'react-vendor'
          if (id.includes('lucide-react')) return 'icons'
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8082',
      '/feed.xml': 'http://localhost:8082',
      '/rss': 'http://localhost:8082',
      '/sitemap.xml': 'http://localhost:8082',
    },
  },
})
