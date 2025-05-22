import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    assetsInlineLimit: 0 // 全てのアセットをファイルとして出力
  },
  publicDir: 'public', // publicディレクトリの明示的な指定
  base: '/' // ベースパスを明示的に指定
})
