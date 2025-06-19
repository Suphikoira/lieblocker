import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        popup: 'popup.html',
        content: 'content.js',
        background: 'background.js',
        'supabase-client': 'supabase-client.js'
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]'
      }
    },
    outDir: 'dist'
  }
})