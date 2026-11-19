// 窗口：版本号、Ctrl+N 打开新窗口
import { invoke } from '@tauri-apps/api/tauri'
import { ElMessage } from 'element-plus'

// 当前版本号：构建时从 tauri.conf.json 的 package.version 注入
export const appVersion = __APP_VERSION__

// 打开新的 GiccooBox 窗口
const openNewWindow = async () => {
    try {
        await invoke('open_livebox_window')
        ElMessage.success('已打开新窗口')
    } catch (e) {
        ElMessage.error(String(e))
    }
}

// 快捷键 Ctrl+N(macOS 为 Cmd+N)：打开新窗口。返回取消监听的方法
export const installHotkeys = () => {
    const onKeydown = (e: KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'n') {
            e.preventDefault()
            // 按住不放时不连续开窗口
            if (!e.repeat) openNewWindow()
        }
    }
    window.addEventListener('keydown', onKeydown)
    return () => window.removeEventListener('keydown', onKeydown)
}
