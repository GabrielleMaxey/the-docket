import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: [
        "**/release/**",
        "**/dist/**",
        "**/build/icons/**"
      ]
    },
    proxy: {
      "/api": {
        target: "http://localhost:8787",
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