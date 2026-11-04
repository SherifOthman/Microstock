import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: Number(process.env.PORT) || 3000,
    host: '0.0.0.0',
    strictPort: false,
    open: false,
    proxy: {
      '/api/cloudflare': {
        target: 'https://api.cloudflare.com/client/v4',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/cloudflare/, ''),
        secure: true,
      },
    },
  },
})
