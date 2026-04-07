import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': resolve(__dirname, './src')
      }
    },
    server: {
      proxy: {
        '/agent': {
          target: env.VITE_LANGGRAPH_API_URL || 'http://localhost:2024',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/agent/, '')
        }
      }
    }
  }
})
