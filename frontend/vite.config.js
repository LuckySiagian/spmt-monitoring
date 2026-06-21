import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '0.0.0.0',  // LAN access
    strictPort: true,
    proxy: {
      // REST: /api/* on the dev server is forwarded to the Go backend.
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api/, '')
      },
      // WebSocket: /ws is proxied to the backend (ws: true enables the upgrade).
      // Routing it here means LAN clients only ever need port 5173, never 8080.
      '/ws': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        ws: true
      }
    }
  }
})
