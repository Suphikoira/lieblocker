import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    lib: {
      entry: 'src/lib/supabase.ts',
      name: 'LieBlockerBackend',
      fileName: 'lieblocker-backend'
    },
    rollupOptions: {
      external: ['@supabase/supabase-js'],
      output: {
        globals: {
          '@supabase/supabase-js': 'Supabase'
        }
      }
    }
  }
})