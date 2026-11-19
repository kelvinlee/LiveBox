// 内嵌后台(npm run dev)：日志、停止、重启
import { ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/tauri'
import { listen } from '@tauri-apps/api/event'
import { ElMessage } from 'element-plus'
import { getLocalBoolean } from '@/utils/storage'
import { projectPath, pushUrl } from './settings'

// ---------- 后台是否在运行 ----------
// 后台没有运行时不推送消息(直接丢弃)，见 pusher.ts
export const backendRunning = ref(false)
export const setBackendRunning = (running: boolean) => {
    backendRunning.value = running
}
// 向 Rust 端确认一次：本程序启动的后台还活着，或者推送地址的端口在监听
export const refreshBackendRunning = async () => {
    try {
        backendRunning.value = await invoke<boolean>('backend_running', {
            pushUrl: pushUrl.value.trim() || null,
        })
    } catch (e) {
        console.error('backend_running error:', e)
        backendRunning.value = false
    }
}
// 定时确认后台状态：后台崩溃、被外部结束时也能及时停止推送。返回停止定时的方法
export const watchBackendRunning = (intervalMs = 3000) => {
    refreshBackendRunning()
    const timer = setInterval(refreshBackendRunning, intervalMs)
    return () => clearInterval(timer)
}

export interface BackendLog {
    seq: number
    stream: string
    line: string
}
// 界面上最多保留的日志行数
const MAX_LOG_LINES = 1000
export const backendLogs = ref<BackendLog[]>([])
// 每追加一次日志加一，日志面板据此滚动到底部
export const backendLogVersion = ref(0)

export const logCollapsed = ref(getLocalBoolean('logCollapsed', false))
watch(logCollapsed, (v) => localStorage.setItem('logCollapsed', String(v)))

const appendBackendLogs = (logs: BackendLog[]) => {
    if (!logs.length) return
    backendLogs.value.push(...logs)
    if (backendLogs.value.length > MAX_LOG_LINES) {
        backendLogs.value.splice(0, backendLogs.value.length - MAX_LOG_LINES)
    }
    backendLogVersion.value++
}

export const clearBackendLogs = () => {
    backendLogs.value = []
}

// 先监听实时日志，再拉取已有日志，两者按序号去重合并。返回取消监听的方法
export const initBackendLogs = async () => {
    let historyLoaded = false
    let historyMaxSeq = 0
    const pending: BackendLog[] = []
    // 后台按固定间隔把日志合并成一批推送过来
    const unlisten = await listen<BackendLog[]>('backend-log', (event) => {
        if (!historyLoaded) {
            pending.push(...event.payload)
            return
        }
        appendBackendLogs(event.payload.filter((log) => log.seq > historyMaxSeq))
    })
    try {
        const history = await invoke<BackendLog[]>('get_backend_logs')
        if (history.length) historyMaxSeq = history[history.length - 1].seq
        appendBackendLogs([...history, ...pending.filter((log) => log.seq > historyMaxSeq)])
    } catch (e) {
        console.error('get_backend_logs error:', e)
        appendBackendLogs(pending)
    }
    historyLoaded = true
    return unlisten
}

export const stopBackend = async () => {
    try {
        const stopped = await invoke<boolean>('stop_npm_dev')
        await refreshBackendRunning()
        if (stopped) {
            ElMessage.success('后台已停止')
        } else {
            ElMessage.info('没有由本程序启动的后台在运行')
        }
    } catch (e) {
        ElMessage.error(String(e))
    }
}

// 重启后台：后台报错或卡死时使用
export const backendRestarting = ref(false)
export const restartBackend = async () => {
    if (backendRestarting.value) return
    const projectPathStr = projectPath.value.trim()
    if (!projectPathStr) {
        ElMessage.error('请先在设置里选择后台目录')
        return
    }
    backendRestarting.value = true
    try {
        await invoke('restart_npm_dev', { projectPath: projectPathStr })
        setBackendRunning(true)
        ElMessage.success('后台已重新启动')
    } catch (e) {
        ElMessage.error('重启后台失败: ' + String(e))
    } finally {
        backendRestarting.value = false
    }
}
