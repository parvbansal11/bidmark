import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'], include: ['src/app/**/*.test.{ts,tsx}'] },
  server: {
    proxy: { '/api': 'http://127.0.0.1:8001', '/health': 'http://127.0.0.1:8001' },
    host: true,
    port: 5173,
  },
})
