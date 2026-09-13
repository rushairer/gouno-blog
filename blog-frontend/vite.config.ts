import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const require = createRequire(import.meta.url)
const gounoUiBootstrap = readFileSync(require.resolve('@gouno/ui/bootstrap.js'), 'utf8')
const gounoBlogFavicon = readFileSync(
  require.resolve('@gouno/ui/brand-icons/gouno-blog.svg'),
  'utf8',
)

function gounoUiRuntimeAssets(): Plugin {
  return {
    name: 'gouno-ui-runtime-assets',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = request.url
          ? new URL(request.url, 'http://localhost').pathname
          : ''
        if (!pathname.endsWith('/favicon.svg')) {
          next()
          return
        }
        response.statusCode = 200
        response.setHeader('Content-Type', 'image/svg+xml; charset=utf-8')
        response.end(gounoBlogFavicon)
      })
    },
    buildStart() {
      this.emitFile({
        type: 'asset',
        fileName: 'favicon.svg',
        source: gounoBlogFavicon,
      })
    },
    transformIndexHtml() {
      return [
        {
          tag: 'script',
          attrs: { 'data-storage-key': 'gouno-blog:theme' },
          children: gounoUiBootstrap,
          injectTo: 'head-prepend',
        },
      ]
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [gounoUiRuntimeAssets(), tailwindcss(), react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8082',
      '/feed.xml': 'http://localhost:8082',
      '/rss': 'http://localhost:8082',
      '/sitemap.xml': 'http://localhost:8082',
    },
  },
})
