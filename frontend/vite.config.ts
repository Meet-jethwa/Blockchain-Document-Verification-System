import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'https://blockchain-document-verification-system-hdpm.onrender.com',
        changeOrigin: true,
        secure: true,
      },
    },
  },
})
