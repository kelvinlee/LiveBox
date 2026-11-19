// TikTok 采集：由 Python 采集进程(TikTokLive)完成，事件结构已经整理成和抖音一致
import { h, ref } from 'vue'
import { invoke } from '@tauri-apps/api/tauri'
import { listen } from '@tauri-apps/api/event'
import { getCurrent } from '@tauri-apps/api/window'
import { ElMessage, ElMessageBox } from 'element-plus'
import Logo from '@/assets/logo.png'
import { toCount } from '@/utils/format'
import { pythonPath, tiktokProxy } from './settings'
import {
    collectPlatform,
    collecting,
    keptFans,
    liveInfo,
    runtime,
    setFans,
    clearLiveStart,
    setLiveStart,
    socketStatus,
} from './state'
import { setRoomLive } from './rooms'
import { hasPlayer, playStream } from './player'
import { onChat, onFollow, onGift, onJoin, onLike } from './handlers'
import { waitForLive } from './collect'

// 当前窗口的 label：采集事件按窗口区分
const windowLabel = (() => {
    try {
        return getCurrent().label
    } catch {
        return 'main'
    }
})()
// 当前采集会话号：0 表示没有采集，-1 表示正在启动
let tiktokSession = 0
// 启动期间先收到的事件，拿到会话号后再处理
let pendingEvents: Array<{ session: number; event: any }> = []
// 当前采集的 TikTok 地址
let tiktokUrl = ''
// 采集是否已经由脚本给出了结束原因(直播结束/没开播/出错)
let tiktokEnded = false

// 监听采集进程发来的事件。返回取消监听的方法
export const initTikTokListener = async () => {
    try {
        return await listen<{ window: string; session: number; events: any[] }>(
            'tiktok-event',
            (e) => {
                const { window: label, session, events } = e.payload
                if (label !== windowLabel) return
                if (tiktokSession === -1) {
                    events.forEach((event) => pendingEvents.push({ session, event }))
                    return
                }
                if (session !== tiktokSession) return
                events.forEach(handleTikTokEvent)
            },
        )
    } catch (e) {
        console.error('listen tiktok-event error:', e)
        return () => {}
    }
}

export const stopTikTok = async () => {
    if (tiktokSession === 0) return
    tiktokSession = 0
    pendingEvents = []
    try {
        await invoke('stop_tiktok')
    } catch (e) {
        console.error('stop_tiktok error:', e)
    }
}

// 正在安装 TikTok 运行环境：防止重复安装
let envInstalling = false

// 检查 Python 和 TikTokLive，缺少时询问后自动安装，装好后直接继续，不需要重启程序
export const ensureTikTokEnv = async () => {
    if (envInstalling) {
        ElMessage.info('正在安装 TikTok 运行环境，请稍候')
        return false
    }
    const python = pythonPath.value.trim() || null
    const proxy = tiktokProxy.value.trim() || null
    type Env = { python: boolean; pythonError: string | null; installed: boolean }
    let env: Env
    try {
        env = await invoke<Env>('check_tiktok_env', { python })
    } catch (e) {
        ElMessage.error(String(e))
        return false
    }
    if (env.installed) return true
    // 设置里填了 Python 路径但不可用：让用户自己处理，不自动安装
    if (!env.python && python) {
        ElMessageBox.alert(env.pythonError || 'Python 不可用', 'Python 不可用', {
            confirmButtonText: '知道了',
        })
        return false
    }
    const needPython = !env.python
    try {
        await ElMessageBox.confirm(
            needPython
                ? 'TikTok 采集需要 Python 运行环境，电脑上没有找到。是否自动安装 Python 3.12(约 26MB，只为当前用户安装，不需要管理员权限)和 TikTokLive 组件？'
                : 'TikTok 采集需要安装 TikTokLive 组件(大约需要一分钟)。会为本程序单独创建 Python 环境，不影响电脑上已有的 Python。现在安装吗？',
            needPython ? '安装 Python' : '安装 TikTok 组件',
            { confirmButtonText: '安装', cancelButtonText: '取消' },
        )
    } catch {
        return false
    }
    envInstalling = true
    // 安装进度：文字跟随进度事件更新
    const progressText = ref(needPython ? '正在下载 Python...' : '正在安装 TikTokLive 组件...')
    const loading = ElMessage({
        message: () => h('span', progressText.value),
        duration: 0,
        type: 'info',
    })
    let unlistenProgress: (() => void) | null = null
    try {
        if (needPython) {
            unlistenProgress = await getCurrent().listen<{
                stage: string
                percent: number | null
            }>('python-install-progress', (e) => {
                const { stage, percent } = e.payload
                if (stage === 'download') {
                    progressText.value = `正在下载 Python... ${percent ?? 0}%`
                } else if (stage === 'install') {
                    progressText.value = '正在安装 Python，请稍候(约 1 分钟)...'
                }
            })
            await invoke('install_python', { proxy })
        }
        progressText.value = '正在安装 TikTokLive 组件...'
        await invoke('install_tiktok_env', { python, proxy })
        ElMessage.success(
            needPython ? 'Python 和 TikTokLive 组件安装完成' : 'TikTokLive 组件安装完成',
        )
        return true
    } catch (e) {
        ElMessageBox.alert(String(e), '安装失败', { confirmButtonText: '知道了' })
        return false
    } finally {
        unlistenProgress?.()
        loading.close()
        envInstalling = false
    }
}

// 启动采集进程，返回是否成功
export const startTikTok = async (url: string): Promise<boolean> => {
    collectPlatform.value = 'tiktok'
    if (!(await ensureTikTokEnv())) return false
    collecting.value = true
    tiktokUrl = url
    tiktokEnded = false
    const uniqueId = url.match(/@([^/?#\s]+)/)?.[1] || url
    liveInfo.value = {
        ...liveInfo.value,
        uid: uniqueId,
        status: 1,
        title: 'TikTok',
        name: '@' + uniqueId.replace(/^@/, ''),
        roomId: '',
        avatar: Logo,
        fans: keptFans(url),
        customer: 0,
        totalLike: 0,
    }
    socketStatus.value = 'connecting'
    tiktokSession = -1
    pendingEvents = []
    try {
        const session = await invoke<number>('start_tiktok', {
            uniqueId: url,
            proxy: tiktokProxy.value.trim() || null,
            python: pythonPath.value.trim() || null,
        })
        // 启动期间被停止了
        if (tiktokSession !== -1) return false
        tiktokSession = session
        const pending = pendingEvents.filter((p) => p.session === session)
        pendingEvents = []
        pending.forEach((p) => handleTikTokEvent(p.event))
        return true
    } catch (e) {
        tiktokSession = 0
        socketStatus.value = 'closed'
        ElMessage.error(String(e))
        return false
    }
}

// 处理采集进程发来的事件
const handleTikTokEvent = (ev: any) => {
    switch (ev.event) {
        case 'status':
            socketStatus.value =
                ev.status === 'connected'
                    ? 'connected'
                    : ev.status === 'reconnecting'
                      ? 'reconnecting'
                      : 'connecting'
            break
        case 'room':
            setRoomLive(tiktokUrl, true)
            liveInfo.value = {
                ...liveInfo.value,
                status: 2,
                roomId: ev.roomId || liveInfo.value.roomId,
                title: ev.title || liveInfo.value.title,
                name: ev.nickName || liveInfo.value.name,
                avatar: ev.avatar || liveInfo.value.avatar,
                customer: ev.userCount || liveInfo.value.customer,
                totalLike: ev.likeCount || liveInfo.value.totalLike,
                fans: toCount(ev.followerCount) || liveInfo.value.fans,
            }
            setFans(ev.followerCount)
            setLiveStart(ev.startTime)
            if ((ev.streamUrl || ev.videoUrl) && !hasPlayer()) playStream(ev.streamUrl, ev.videoUrl)
            break
        case 'chat':
            onChat('tiktok', ev.id, ev.user, ev.content)
            break
        case 'gift':
            onGift('tiktok', {
                id: ev.id,
                user: ev.user,
                gift: ev.gift,
                giftId: ev.giftId,
                total: ev.repeatCount,
                repeatEnd: ev.repeatEnd,
                groupId: ev.groupId,
            })
            break
        case 'like':
            onLike('tiktok', ev.id, ev.user, ev.count, ev.total)
            break
        case 'join':
            onJoin('tiktok', ev.id, ev.user)
            break
        case 'follow':
            onFollow('tiktok', ev.id, ev.user, ev.followCount)
            break
        case 'stats':
            liveInfo.value = { ...liveInfo.value, customer: ev.viewers }
            break
        case 'offline':
            tiktokEnded = true
            setRoomLive(tiktokUrl, false)
            liveInfo.value = { ...liveInfo.value, status: 4 }
            clearLiveStart()
            if (runtime.persistUrl && runtime.persistUrl === tiktokUrl) {
                // 持续采集：回到等待开播
                waitForLive(runtime.persistUrl, runtime.startToken)
            } else {
                ElMessage.warning('主播当前没有在直播')
            }
            break
        case 'live_end':
            tiktokEnded = true
            setRoomLive(tiktokUrl, false)
            liveInfo.value = { ...liveInfo.value, status: 4 }
            clearLiveStart()
            ElMessage.warning('直播已结束，停止采集')
            break
        case 'error':
            console.warn('[tiktok]', ev.message)
            if (ev.fatal) {
                tiktokEnded = true
                setRoomLive(tiktokUrl, false)
                ElMessage.error(ev.message)
            } else if (ev.code === 'rate_limit') {
                ElMessage.warning(ev.message)
            }
            break
        case 'exit':
            tiktokSession = 0
            // 持续采集等待开播时保持「等待开播」状态
            if (socketStatus.value !== 'waiting') socketStatus.value = 'closed'
            if (!tiktokEnded) ElMessage.error('TikTok 采集进程意外退出')
            break
        case 'log':
            console.log('[tiktok]', ev.message)
            break
    }
}
