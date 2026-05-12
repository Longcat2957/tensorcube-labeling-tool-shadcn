import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        // SAM 인코딩/디코딩을 워커 스레드로 분리해서 main process 메인 스레드 안 막히게.
        // 워커 entry 도 main 빌드에 포함. 출력은 out/main/sam-worker.js.
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          'sam-worker': resolve(__dirname, 'src/main/services/sam/samWorker.ts')
        }
      }
    }
  },
  preload: {},
  renderer: {
    resolve: {
      alias: {
        $lib: resolve('src/renderer/src/lib')
      }
    },
    plugins: [svelte(), tailwindcss()]
  }
})
