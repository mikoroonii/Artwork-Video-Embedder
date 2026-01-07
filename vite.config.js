import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // These headers are MANDATORY for ffmpeg.wasm to work
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
  optimizeDeps: {
    // This prevents Vite from bugging out when it encounters the FFmpeg WASM code
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
})