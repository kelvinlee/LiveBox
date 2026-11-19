// 采集的公共状态：连接状态、主播信息、统计数字
import { computed, ref } from 'vue'
import Logo from '@/assets/logo.png'
import type { SocketStatus } from '@/utils/RustSocket'
import { toCount } from '@/utils/format'
import type { Platform } from './platform'

// 采集连接状态：抖音由 websocket 更新，TikTok 由采集进程更新；waiting 是持续采集在等开播
export type CollectStatus = SocketStatus | 'connecting' | 'waiting'
export const socketStatus = ref<CollectStatus>('closed')
export const socketStatusText = computed(() => {
    switch (socketStatus.value) {
        case 'connected':
            return '已连接'
        case 'connecting':
            return '连接中'
        case 'reconnecting':
            return '重连中'
        case 'waiting':
            return '等待开播'
        default:
            return '未连接'
    }
})

// 当前采集的平台
export const collectPlatform = ref<Platform>('douyin')

// 是否正在采集：只有采集中收到的消息才会推送给后台
export const collecting = ref(false)

// 每次开始/停止都会加一：用来作废正在进行中的启动和等待
export const runtime = {
    startToken: 0,
    // 持续采集的直播间地址：TikTok 刚开播时采集进程可能仍报未开播，这时回到等待
    persistUrl: '',
}

// 主播信息；status 为 0 表示还没开始，4 表示已停播
export const liveInfo = ref({
    uid: '888888',
    status: 0,
    title: '直播标题',
    name: 'GiccooBox',
    roomId: '888888',
    avatar: Logo as string,
    fans: 0 as number,
    customer: 0 as number | string,
    totalLike: 0 as number | string,
})
export type LiveInfo = typeof liveInfo.value

// 开播时间(毫秒时间戳)，0 表示不知道。
// liveStartKnown 为 false 时平台没给开播时间，用的是开始采集的时间，界面显示成「已采集」
export const liveStartAt = ref(0)
export const liveStartKnown = ref(false)
// 平台给的开播时间是秒；不合理(0、在未来)时按开始采集的时间算
export const setLiveStart = (seconds: unknown) => {
    const ms = toCount(seconds) * 1000
    if (ms > 0 && ms <= Date.now() + 60_000) {
        liveStartAt.value = ms
        liveStartKnown.value = true
    } else if (!liveStartAt.value) {
        liveStartAt.value = Date.now()
        liveStartKnown.value = false
    }
}
export const clearLiveStart = () => {
    liveStartAt.value = 0
    liveStartKnown.value = false
}

// 主播收益(钻)
export const diamond = ref(0)

// 粉丝数：按直播间记住上一次的数字，重新开始采集、重连时先显示它，不会先变成 0 再跳回来
const lastFans = new Map<string, number>()
let fansRoomKey = ''
export const keptFans = (key: string) => {
    fansRoomKey = key
    return lastFans.get(key) ?? 0
}
// 只接受大于 0 的粉丝数：分享等消息里粉丝数是 0，不能拿来覆盖
export const setFans = (value: unknown) => {
    const n = toCount(value)
    if (n <= 0) return
    if (fansRoomKey) lastFans.set(fansRoomKey, n)
    if (liveInfo.value.fans !== n) liveInfo.value = { ...liveInfo.value, fans: n }
}
