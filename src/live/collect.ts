// 开始/停止采集：启动后台和 exe、连接直播间、持续采集等开播
import { computed, ref } from 'vue'
import { invoke } from '@tauri-apps/api/tauri'
import { ElMessage } from 'element-plus'
import type { LiveInfoImp } from '@/types'
import { detectPlatform } from './platform'
import {
    douyinCookie,
    exePath,
    inputUrl,
    projectPath,
    pushUrl,
    roomId,
    saveStartSettings,
    useBackend,
    useExe,
} from './settings'
import {
    clearLiveStart,
    collectPlatform,
    collecting,
    diamond,
    keptFans,
    liveInfo,
    runtime,
    setLiveStart,
    socketStatus,
} from './state'
import { loginState } from './login'
import { resetMessages } from './messages'
import { resetPushers } from './pusher'
import { setBackendRunning } from './backend'
import { resetHandlers } from './handlers'
import { destroyPlayer, playStream } from './player'
import { fetchRoomLive, setRoomLive } from './rooms'
import { connectDouyin, disconnectDouyin } from './douyin'
import { ensureTikTokEnv, startTikTok, stopTikTok } from './tiktok'

// 采集方式：once 只采集一次；persist 没开播时持续检查，开播后自动开始。选择会记住
export type StartMode = 'once' | 'persist'
export const startMode = ref<StartMode>(
    localStorage.getItem('start_mode') === 'persist' ? 'persist' : 'once',
)

// 采集按钮上的文字：跟随连接状态
export const startButtonText = computed(() => {
    switch (socketStatus.value) {
        case 'connected':
            return '采集中'
        case 'connecting':
            return '连接中'
        case 'reconnecting':
            return '重连中'
        case 'waiting':
            return '等待开播'
        default:
            return startMode.value === 'persist' ? '持续采集' : '开始采集'
    }
})

// 持续采集：检查间隔和已检查次数
export const WAIT_LIVE_INTERVAL = 30_000
export const waitChecks = ref(0)

// 是否正在启动采集：防止重复点击
let starting = false

// 下拉菜单选择采集方式后直接开始
export const onStartCommand = (mode: StartMode) => {
    startMode.value = mode
    localStorage.setItem('start_mode', mode)
    startListen()
}

// 点「开始采集」
export const startListen = async () => {
    saveStartSettings()
    const url = inputUrl.value.trim()
    if (useExe.value && !roomId.value.trim()) {
        ElMessage.error('请先输入房间号')
        return
    }
    if (useBackend.value && !projectPath.value.trim()) {
        ElMessage.error('请先选择项目后台目录')
        return
    }
    if (useExe.value && !exePath.value.trim()) {
        ElMessage.error('请先选择 exe 文件')
        return
    }
    if (starting) return
    starting = true
    if (detectPlatform(url) === 'douyin' && loginState.value.level === 'warn') {
        ElMessage.warning(loginState.value.detail)
    }
    try {
        await doStart(url, startMode.value === 'persist')
    } finally {
        starting = false
    }
}

// 启动后台和 exe：后台已经在运行就复用；exe 已经在运行且参数没变也复用。返回是否成功
const startProcesses = async () => {
    try {
        let backendStarted = false
        if (useBackend.value) {
            backendStarted = await invoke<boolean>('run_npm_dev', {
                projectPath: projectPath.value.trim(),
                pushUrl: pushUrl.value.trim() || null,
            })
            setBackendRunning(true)
        }
        // 后台是新启动的且要用 exe：等后台起来，避免 exe 连不上
        if (backendStarted && useExe.value) {
            await new Promise((resolve) => setTimeout(resolve, 5000))
        }
        if (useExe.value) {
            await invoke<boolean>('run_external_exe', {
                exePath: exePath.value.trim(),
                roomId: roomId.value.trim(),
            })
        } else {
            // 没有勾选「使用 exe」：之前打开的 exe 关掉
            await invoke('stop_external_processes')
        }
        return true
    } catch (error) {
        ElMessage.error('启动失败，请检查目录、exe 或环境')
        console.error(error)
        return false
    }
}

const doStart = async (url: string, persist: boolean) => {
    // 先清空上一次的采集。exe 不在这里关闭：已经在运行就复用，只有点「停止」才关闭
    await stopCollect(false)
    // 启动后台/exe 期间点了停止，就不再继续
    const token = runtime.startToken
    runtime.persistUrl = persist ? url : ''
    if (!(await startProcesses()) || token !== runtime.startToken) return
    if (!url) {
        // 没有填直播间：只启动后台和 exe
        collectPlatform.value = 'douyin'
        collecting.value = true
        return
    }
    if (persist) {
        // TikTok 先确认组件已安装，避免等到开播才弹安装提示
        if (detectPlatform(url) === 'tiktok' && !(await ensureTikTokEnv())) return
        if (token !== runtime.startToken) return
        waitForLive(url, token)
        return
    }
    await collectRoom(url, token, false)
}

// 采集一个直播间。quiet 为 true 时(持续采集的等待中)没开播不弹提示。
// 返回 live 已开始采集，offline 没开播，error 获取失败，cancelled 期间被停止或重新开始了，
// failed 是 TikTok 采集进程没能启动(组件缺失等)，等待也没有意义
type CollectResult = 'live' | 'offline' | 'error' | 'failed' | 'cancelled'
const collectRoom = async (url: string, token: number, quiet: boolean): Promise<CollectResult> => {
    if (detectPlatform(url) === 'tiktok') {
        // 等待中先用轻量接口检查是否开播，开播了再启动采集进程
        if (quiet) {
            const live = await fetchRoomLive(url)
            if (token !== runtime.startToken) return 'cancelled'
            setRoomLive(url, live)
            if (!live) return 'offline'
        }
        const ok = await startTikTok(url)
        if (token !== runtime.startToken) return 'cancelled'
        return ok ? 'live' : 'failed'
    }
    collectPlatform.value = 'douyin'
    collecting.value = true
    // 根据直播间地址获取 room_id 等字段
    let roomJson: LiveInfoImp
    let roomInfo: any
    try {
        roomJson = await invoke('get_live_html', {
            url,
            cookie: douyinCookie.value.trim() || null,
        })
        roomInfo = JSON.parse(roomJson.room_info)
    } catch (e) {
        if (token !== runtime.startToken) return 'cancelled'
        console.error('get_live_html error:', e)
        setRoomLive(url, false)
        if (!quiet) ElMessage.error('获取直播间信息失败，请检查地址或网络')
        return 'error'
    }
    // 获取期间点了停止或重新开始
    if (token !== runtime.startToken) return 'cancelled'
    if (!roomInfo.id_str) {
        setRoomLive(url, false)
        if (!quiet) ElMessage.error('没有获取到直播间信息，请检查地址')
        return 'error'
    }
    // 正在直播：status 有值且不是 4(已停播)
    if (roomInfo.status && roomInfo.status !== 4) {
        setRoomLive(url, true)
        ElMessage.success(quiet ? '主播已开播，开始采集' : '已连接直播间，开始采集')
        liveInfo.value = {
            uid: roomInfo.owner.id_str,
            status: roomInfo.status,
            title: roomInfo.title,
            name: roomInfo.owner.nickname,
            roomId: roomInfo.id_str,
            avatar: roomInfo.owner.avatar_thumb.url_list[0],
            fans: keptFans(url),
            customer: roomInfo.user_count_str,
            totalLike: roomInfo.stats.total_user_str,
        }
        // 开播时间：抖音页面数据里目前没有，按开始采集的时间算(界面显示「已采集」)
        setLiveStart(roomInfo.create_time || roomInfo.start_time)
        // 播放：整理出可选的清晰度，用上次选的那一档
        const streamUrl = roomInfo.stream_url
        playStream(
            streamUrl,
            streamUrl?.flv_pull_url?.[streamUrl?.default_resolution]?.replace('http://', 'https://'),
        )
        connectDouyin(url, roomInfo.id_str, roomJson.unique_id, roomJson.ttwid)
        return 'live'
    }
    // 没在直播：只有主播信息
    setRoomLive(url, false)
    if (!quiet) ElMessage.warning('主播当前没有在直播')
    liveInfo.value = {
        uid: roomInfo.id_str,
        status: 4,
        title: quiet ? '未开播，等待开播中' : '已停播',
        name: roomInfo.nickname,
        roomId: roomInfo.id_str,
        avatar: roomInfo.avatar_thumb?.url_list?.[0] || liveInfo.value.avatar,
        fans: keptFans(url),
        customer: 0,
        totalLike: 0,
    }
    destroyPlayer()
    clearLiveStart()
    return 'offline'
}

// 持续采集：没开播就每隔一段时间检查一次，开播后自动开始采集；点「停止」或重新开始就结束等待
export const waitForLive = async (url: string, token: number) => {
    waitChecks.value = 0
    let notified = false
    while (token === runtime.startToken) {
        socketStatus.value = 'waiting'
        waitChecks.value++
        const result = await collectRoom(url, token, true)
        if (token !== runtime.startToken || result === 'cancelled') return
        if (result === 'failed') {
            socketStatus.value = 'closed'
            return
        }
        if (result === 'live') {
            if (detectPlatform(url) === 'tiktok') ElMessage.success('主播已开播，开始采集')
            return
        }
        // 抖音没开播时 collectRoom 会打开推送开关，等待期间关掉
        collecting.value = false
        socketStatus.value = 'waiting'
        if (!notified) {
            notified = true
            ElMessage.info('主播还没开播，开播后会自动开始采集')
        }
        await new Promise((resolve) => setTimeout(resolve, WAIT_LIVE_INTERVAL))
    }
}

// 停止采集并清空直播和消息。stopExe 为 true 时同时关闭 exe(点「停止」时)；开始采集时传 false，exe 保持运行
export const stopCollect = async (stopExe = true) => {
    // 作废正在进行的启动和持续采集的等待
    runtime.startToken++
    runtime.persistUrl = ''
    waitChecks.value = 0
    // 先停止推送：之后到达的消息不再发给后台，队列里没发出去的和重试中的全部取消
    collecting.value = false
    resetPushers()
    if (stopExe) {
        try {
            await invoke('stop_external_processes')
        } catch (error) {
            console.error('stop_external_processes error:', error)
        }
    }
    destroyPlayer()
    resetMessages()
    resetHandlers()
    disconnectDouyin()
    await stopTikTok()
    socketStatus.value = 'closed'
    diamond.value = 0
    clearLiveStart()
}
