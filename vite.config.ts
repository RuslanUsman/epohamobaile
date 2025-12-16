import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // локально — '/', при билде — '/epohamobaile/'
  base: command === 'serve' ? '/' : '/epohamobaile/',
}))
