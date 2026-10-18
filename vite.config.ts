import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { pwaBuild } from './scripts/pwa-build'

export default defineConfig({
  plugins: [react(), tailwindcss(), pwaBuild()],
})
