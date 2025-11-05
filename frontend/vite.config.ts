import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@cfg': path.resolve(__dirname, '../cfg/src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // 将大型库单独打包
          'monaco-editor': ['@monaco-editor/react', 'monaco-editor'],
          'react-flow': ['@xyflow/react'],
          'g6': ['@antv/g6'],
          'dagre': ['dagre'],
          // React 相关库单独打包
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
})
