import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'

// 版本号取自 tauri.conf.json，构建时注入，网页和程序里都能显示
const tauriConf = JSON.parse(
    readFileSync(new URL('./src-tauri/tauri.conf.json', import.meta.url), 'utf-8'),
)

// https://vitejs.dev/config/
export default defineConfig(async () => ({
    plugins: [vue()],
    define: {
        __APP_VERSION__: JSON.stringify(tauriConf.package.version),
    },
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
    // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
    //
    // 1. prevent vite from obscuring rust errors
    clearScreen: false,
    // 2. tauri expects a fixed port, fail if that port is not available
    server: {
        port: 1420,
        strictPort: true,
        watch: {
            // 3. tell vite to ignore watching `src-tauri`
            ignored: ['**/src-tauri/**'],
        },
    },
}))
