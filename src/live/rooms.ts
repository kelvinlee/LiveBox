// 已保存的直播间，以及检查它们是否在直播
import { computed, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/tauri'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { LiveInfoImp } from '@/types'
import { getLocalJson } from '@/utils/storage'
import { detectPlatform } from './platform'
import { douyinCookie, inputUrl, tiktokProxy } from './settings'
import { liveInfo } from './state'

export interface SavedRoom {
    id: string
    name: string
    url: string
}
const SAVED_ROOMS_KEY = 'saved_rooms'
const loadSavedRooms = (): SavedRoom[] => {
    const list = getLocalJson<unknown>(SAVED_ROOMS_KEY, [])
    return Array.isArray(list) ? (list as SavedRoom[]) : []
}
export const savedRooms = ref<SavedRoom[]>(loadSavedRooms())
const persistSavedRooms = () => {
    localStorage.setItem(SAVED_ROOMS_KEY, JSON.stringify(savedRooms.value))
}
// 其他窗口修改了直播间列表时同步
window.addEventListener('storage', (e) => {
    if (e.key === SAVED_ROOMS_KEY) savedRooms.value = loadSavedRooms()
})

export const roomPopVisible = ref(false)
// 正在新建/编辑的直播间：id 为空表示新建
export const roomForm = ref<SavedRoom | null>(null)
// 当前地址对应的已保存直播间
export const activeRoom = computed(() =>
    savedRooms.value.find((room) => room.url === inputUrl.value.trim()),
)

// ---------- 是否在直播 ----------
// 检查结果 10 分钟内不重复请求
const ROOM_LIVE_TTL = 10 * 60 * 1000
// key 为直播间地址；at 是检查的时间
export const roomLive = ref<Record<string, { live: boolean; at: number }>>({})
// 正在检查的直播间地址
export const roomChecking = ref('')
let roomCheckRunning = false

export const setRoomLive = (url: string, live: boolean) => {
    if (!url) return
    roomLive.value[url] = { live, at: Date.now() }
}

// 判断直播间是否在直播；获取失败按未开播处理
export const fetchRoomLive = async (url: string) => {
    try {
        if (detectPlatform(url) === 'tiktok') {
            const live = await invoke<boolean | null>('check_tiktok_live', {
                uniqueId: url,
                proxy: tiktokProxy.value.trim() || null,
            })
            return live === true
        }
        const roomJson = await invoke<LiveInfoImp>('get_live_html', {
            url,
            cookie: douyinCookie.value.trim() || null,
        })
        const info = JSON.parse(roomJson.room_info)
        return !!(info.id_str && info.status && info.status !== 4)
    } catch {
        return false
    }
}

// 依次检查列表里的直播间：一个检查完再检查下一个，列表关闭后停止
const checkRoomsLive = async () => {
    if (roomCheckRunning) return
    roomCheckRunning = true
    try {
        for (const room of savedRooms.value.slice()) {
            if (!roomPopVisible.value) break
            const cached = roomLive.value[room.url]
            if (cached && Date.now() - cached.at < ROOM_LIVE_TTL) continue
            roomChecking.value = room.url
            setRoomLive(room.url, await fetchRoomLive(room.url))
        }
    } finally {
        roomChecking.value = ''
        roomCheckRunning = false
    }
}
// 打开直播间列表时检查
watch(roomPopVisible, (visible) => {
    if (visible) checkRoomsLive()
})

// ---------- 新建、编辑、删除 ----------
export const openRoomForm = (room?: SavedRoom) => {
    if (room) {
        roomForm.value = { ...room }
        return
    }
    // 新建时带上当前输入的地址；如果正在采集这个地址，名称默认用主播昵称
    const url = inputUrl.value.trim()
    const isCurrent = liveInfo.value.status !== 0 && url === localStorage.getItem('url')
    roomForm.value = { id: '', name: isCurrent ? liveInfo.value.name : '', url }
}

export const saveRoomForm = () => {
    const form = roomForm.value
    if (!form) return
    const url = form.url.trim()
    if (!url) {
        ElMessage.error('请输入直播间地址')
        return
    }
    if (savedRooms.value.some((r) => r.url === url && r.id !== form.id)) {
        ElMessage.error('这个地址已经保存过了')
        return
    }
    const name = form.name.trim() || url
    const exist = savedRooms.value.find((r) => r.id === form.id)
    if (exist) {
        // 正在使用被编辑的直播间时，地址跟着更新
        if (inputUrl.value.trim() === exist.url) inputUrl.value = url
        exist.name = name
        exist.url = url
    } else {
        savedRooms.value.push({
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            name,
            url,
        })
    }
    persistSavedRooms()
    roomForm.value = null
}

export const selectRoom = (room: SavedRoom) => {
    inputUrl.value = room.url
    roomPopVisible.value = false
}

export const removeRoom = async (room: SavedRoom) => {
    try {
        await ElMessageBox.confirm(`删除直播间「${room.name}」？`, '删除直播间', {
            type: 'warning',
            confirmButtonText: '删除',
            cancelButtonText: '取消',
        })
    } catch {
        return
    }
    savedRooms.value = savedRooms.value.filter((r) => r.id !== room.id)
    persistSavedRooms()
}
