// 设置项：都保存在 localStorage，多个窗口共用
import { ref, watch } from 'vue'
import { open } from '@tauri-apps/api/dialog'
import { getLocalBoolean, getLocalJson } from '@/utils/storage'

// 设置弹窗是否打开
export const settingsVisible = ref(false)

// ---------- 直播间地址 ----------
export const inputUrl = ref(localStorage.getItem('url') || '')

// 地址历史：最多保留 20 条，最新的在前
const URL_HISTORY_KEY = 'url_history'
const getUrlHistory = () => {
    const list = getLocalJson<unknown>(URL_HISTORY_KEY, [])
    return Array.isArray(list) ? (list as string[]) : []
}
export const addUrlToHistory = (url: string) => {
    const u = url.trim()
    if (!u) return
    const list = [u, ...getUrlHistory().filter((item) => item !== u)]
        .filter((item) => item.trim())
        .slice(0, 20)
    localStorage.setItem(URL_HISTORY_KEY, JSON.stringify(list))
}
// 地址输入框的候选项
export const queryUrlHistory = (
    queryString: string,
    cb: (results: { value: string }[]) => void,
) => {
    const q = queryString.toLowerCase()
    cb(
        getUrlHistory()
            .filter((u) => !q || u.toLowerCase().includes(q))
            .map((value) => ({ value })),
    )
}

// ---------- 推送和启动项 ----------
// 推送地址
export const pushUrl = ref(localStorage.getItem('pushUrl') || '')
// 启动 exe 使用的房间号，同时是推送地址的最后一段
export const roomId = ref(localStorage.getItem('roomId') || '')
// Node.js 后台目录
export const projectPath = ref(localStorage.getItem('projectPath') || '')
// exe 文件路径
export const exePath = ref(localStorage.getItem('exePath') || '')
export const useBackend = ref(getLocalBoolean('useBackend', true))
export const useExe = ref(getLocalBoolean('useExe', true))

// 开始采集时保存这些设置
export const saveStartSettings = () => {
    localStorage.setItem('url', inputUrl.value.trim())
    addUrlToHistory(inputUrl.value)
    localStorage.setItem('pushUrl', pushUrl.value.trim())
    localStorage.setItem('roomId', roomId.value.trim())
    localStorage.setItem('projectPath', projectPath.value.trim())
    localStorage.setItem('exePath', exePath.value.trim())
    localStorage.setItem('useBackend', String(useBackend.value))
    localStorage.setItem('useExe', String(useExe.value))
}

export const selectProjectPath = async () => {
    const selected = await open({
        directory: true,
        multiple: false,
        title: '选择 Node.js 项目目录',
    })
    if (typeof selected === 'string') {
        projectPath.value = selected
        localStorage.setItem('projectPath', selected)
    }
}

export const selectExePath = async () => {
    const selected = await open({
        multiple: false,
        title: '选择 exe 文件',
        filters: [{ name: 'Executable', extensions: ['exe'] }],
    })
    if (typeof selected === 'string') {
        exePath.value = selected
        localStorage.setItem('exePath', selected)
    }
}

// ---------- 平台相关 ----------
// 从登录 WebView 同步的整段抖音 Cookie
export const douyinCookie = ref(localStorage.getItem('douyinCookie') || '')
// TikTok 代理与 Python 路径
export const tiktokProxy = ref(localStorage.getItem('tiktokProxy') || '')
export const pythonPath = ref(localStorage.getItem('pythonPath') || '')
watch(tiktokProxy, (v) => localStorage.setItem('tiktokProxy', v.trim()))
watch(pythonPath, (v) => localStorage.setItem('pythonPath', v.trim()))

// ---------- 显示哪些消息 ----------
// chat 聊天 / gift 礼物 / like 点赞 / follow 关注 / comein 进场。选择会记住
const MSG_TYPES_KEY = 'msg_types'
const savedTypes = getLocalJson<unknown>(MSG_TYPES_KEY, null)
export const checkList = ref<string[]>(
    Array.isArray(savedTypes) ? (savedTypes as string[]) : ['chat', 'gift', 'like'],
)
watch(checkList, (v) => localStorage.setItem(MSG_TYPES_KEY, JSON.stringify(v)))
