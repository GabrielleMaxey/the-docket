import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'

const apiPort = Number(process.env.API_PORT || 8787)
// Only React's exact development preamble may run inline; arbitrary inline scripts stay blocked.
const refreshHash = createHash('sha256').update(react.preambleCode.replace('__BASE__', '/')).digest('base64')
const developmentCsp = [
  "default-src 'self'",
  `script-src 'self' 'sha256-${refreshHash}'`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  `img-src 'self' blob: data: http://127.0.0.1:${apiPort} http://localhost:${apiPort}`,
  "media-src 'self' blob: data:",
  `connect-src 'self' http://127.0.0.1:${apiPort} http://localhost:${apiPort} ws://localhost:5173 ws://127.0.0.1:5173 https://icanhazdadjoke.com https://v2.jokeapi.dev`,
  `frame-src 'self' blob: http://127.0.0.1:${apiPort} http://localhost:${apiPort}`,
  "object-src 'none'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'"
].join('; ')

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
    headers: { "Content-Security-Policy": developmentCsp },
    watch: {
      ignored: [
        "**/release/**",
        "**/dist/**",
        "**/build/icons/**"
      ]
    },
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true
      }
    }
  },
  build: {
    cssMinify: "esbuild"
  },
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern-compiler',
        silenceDeprecations: ["legacy-js-api"] // or "modern"
      }
    }},
  plugins: [react()],
})