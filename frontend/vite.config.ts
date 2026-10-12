import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // MapLibre (~1 MB) is lazy-loaded in its own chunk; it is irreducible, so silence the size warning for it.
  build: { chunkSizeWarningLimit: 1200 },
  server: { proxy: { '/api': 'http://localhost:8000' } },
})
