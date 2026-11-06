<template>
    <section class="tiktok-page">
        <div class="toolbar">
            <el-input v-model="account" :disabled="active || busy" placeholder="TikTok @用户名或 https://www.tiktok.com/@用户名/live" @keyup.enter="start" />
            <el-button type="primary" :loading="busy" :disabled="active" @click="start">开始采集</el-button>
            <el-button :disabled="!active || busy" @click="stopFromButton">停止采集</el-button>
            <el-button @click="settings = true">设置</el-button>
        </div>
        <div class="status" role="status">{{ status }}</div>
        <div v-if="pushError" class="warning" role="alert">{{ pushError }}</div>
        <div class="capture-layout">
            <div class="video-panel">
                <div class="room-heading">
                    <img v-if="room.avatar" :src="room.avatar" alt="主播头像" />
                    <div><strong>{{ room.name || 'TikTok LIVE' }}</strong><p>{{ room.title }}</p></div>
                    <span>在线 {{ room.viewers }} · 点赞 {{ totalLikes }} · 礼物 {{ diamonds }} 钻</span>
                </div>
                <div class="video-stage">
                    <video ref="video" controls autoplay playsinline muted></video>
                    <p v-if="!streams.length" class="video-placeholder">{{ videoStatus || '开始采集后显示直播视频' }}</p>
                </div>
                <div class="video-controls">
                    <el-select v-if="streams.length" v-model="selectedStream" :disabled="!active" placeholder="视频线路" @change="playSelected">
                        <el-option v-for="(stream, index) in streams" :key="stream.url" :label="stream.label" :value="index" />
                    </el-select>
                    <span v-else class="video-status">暂无视频线路</span>
                    <el-button :disabled="!active" @click="refreshVideo">刷新视频</el-button>
                    <span class="video-status">{{ videoStatus }}</span>
                </div>
            </div>
            <aside class="messages-panel">
                <el-checkbox-group v-model="filters" class="filters">
                    <el-checkbox label="chat">弹幕</el-checkbox>
                    <el-checkbox label="gift">礼物</el-checkbox>
                    <el-checkbox label="like">点赞</el-checkbox>
                </el-checkbox-group>
                <div ref="messageBox" class="messages" aria-label="TikTok 实时消息">
                    <p v-if="!messages.length" class="empty">等待直播间消息</p>
                    <p v-for="message in visibleMessages" :key="message.id" :class="message.type">
                        <strong>{{ message.user.nickName || message.user.uniqueId }}：</strong>
                        <span>{{ messageText(message) }}</span>
                    </p>
                </div>
            </aside>
        </div>
        <el-dialog v-model="settings" title="TikTok 采集设置" width="540px">
            <el-form label-position="top" :disabled="active || busy">
                <el-form-item label="代理地址（可选，仅用于 TikTok）">
                    <el-input v-model="proxy" placeholder="http://127.0.0.1:7890 或 socks5://127.0.0.1:7890" />
                </el-form-item>
                <el-form-item label="Euler Stream API Key（可选，仅保留在本次页面内）">
                    <el-input v-model="apiKey" type="password" show-password autocomplete="off" />
                </el-form-item>
                <el-form-item label="消息推送地址（可选）"><el-input v-model="pushUrl" placeholder="例如 http://127.0.0.1:3000/events" /></el-form-item>
                <el-form-item label="接收服务的房间号（启用推送时必填）"><el-input v-model="pushRoom" /></el-form-item>
            </el-form>
            <p class="settings-tip">Windows 版本。实时消息需要连接 Euler Stream 签名服务。推送地址为“地址/房间号”，消息包含 platform: tiktok；此页面不会自动启动后台或游戏。</p>
            <template #footer><el-button type="primary" @click="settings = false">完成</el-button></template>
        </el-dialog>
    </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { invoke } from '@tauri-apps/api/tauri'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { ElMessage } from 'element-plus'
import Hls from 'hls.js'
import Flv from 'flv.js'
import { TikTokForwarder } from '../tiktok/forwarder'
import type { TikTokEvent, TikTokRoom, TikTokStream, WorkerMessage } from '../tiktok/types'

const account = ref(localStorage.getItem('tiktok.account') || '')
const proxy = ref(localStorage.getItem('tiktok.proxy') || '')
const apiKey = ref('')
const pushUrl = ref(localStorage.getItem('tiktok.pushUrl') || '')
const pushRoom = ref(localStorage.getItem('tiktok.pushRoom') || '')
const settings = ref(false)
const busy = ref(false)
const active = ref(false)
const status = ref('请输入 TikTok 主播用户名，开始采集')
const videoStatus = ref('')
const pushError = ref('')
const room = ref<TikTokRoom>({ id: '', name: '', title: '', avatar: '', viewers: 0, streams: [] })
const streams = ref<TikTokStream[]>([])
const selectedStream = ref(0)
const totalLikes = ref(0)
const diamonds = ref(0)
const filters = ref(['chat', 'gift', 'like'])
const messages = ref<TikTokEvent[]>([])
const visibleMessages = computed(() => messages.value.filter(item => filters.value.includes(item.type)))
const video = ref<HTMLVideoElement>()
const messageBox = ref<HTMLElement>()
let sessionId = ''
let unlisten: UnlistenFn | undefined
let forwarder: TikTokForwarder | undefined
let hls: Hls | undefined
let flv: ReturnType<typeof Flv.createPlayer> | undefined
let disposed = false
let playerGeneration = 0
let nativeError: (() => void) | undefined

function destroyPlayer() {
    playerGeneration++
    hls?.destroy()
    hls = undefined
    flv?.destroy()
    flv = undefined
    if (video.value) {
        if (nativeError) video.value.removeEventListener('error', nativeError)
        nativeError = undefined
        video.value.pause()
        video.value.removeAttribute('src')
        video.value.load()
    }
}

function playSelected() {
    destroyPlayer()
    const element = video.value
    const source = streams.value[selectedStream.value]
    if (!element || !source) return
    const generation = playerGeneration
    videoStatus.value = '正在加载视频（默认静音，可在播放器内开启声音）'
    const failed = () => {
        if (generation === playerGeneration) videoStatus.value = '视频播放失败，请切换线路或刷新视频；弹幕采集继续运行'
    }
    const play = () => {
        if (generation !== playerGeneration) return
        videoStatus.value = ''
        void element.play().catch(() => { if (generation === playerGeneration) videoStatus.value = '请点击播放器开始播放' })
    }
    if (source.format === 'hls' && Hls.isSupported()) {
        hls = new Hls()
        hls.on(Hls.Events.MANIFEST_PARSED, play)
        hls.on(Hls.Events.ERROR, (_event, data) => { if (data.fatal) failed() })
        hls.loadSource(source.url)
        hls.attachMedia(element)
    } else if (source.format === 'hls' && element.canPlayType('application/vnd.apple.mpegurl')) {
        element.src = source.url
        nativeError = failed
        element.addEventListener('error', failed)
        play()
    } else if (source.format === 'flv' && Flv.isSupported()) {
        flv = Flv.createPlayer({ type: 'flv', url: source.url, isLive: true })
        flv.on(Flv.Events.ERROR, failed)
        flv.attachMediaElement(element)
        flv.load()
        play()
    } else {
        videoStatus.value = '当前视频格式不受播放器支持，请尝试其他线路'
    }
}

function messageText(event: TikTokEvent) {
    if (event.type === 'chat') return event.content || ''
    if (event.type === 'like') return `点赞了 ${event.like || 0} 次`
    return `送出 ${event.gift?.name || '礼物'} × ${event.repeatCount || 1}（${event.gift?.diamondCount || 0} 钻/个）`
}

function receive(data: WorkerMessage) {
    if (data.type === 'status') {
        status.value = data.message
        if (data.state === 'ended' || data.state === 'stopped') destroyPlayer()
    } else if (data.type === 'room') {
        const previous = streams.value[selectedStream.value]
        room.value = data.room
        streams.value = data.room.streams
        const match = streams.value.findIndex(s => s.label === previous?.label)
        const preferred = streams.value.findIndex(s => s.format === 'flv')
        selectedStream.value = match < 0 ? Math.max(0, preferred) : match
        if (streams.value.length) playSelected()
    } else if (data.type === 'stats') {
        room.value.viewers = data.viewers
    } else if (data.type === 'video_error') {
        videoStatus.value = data.message
    } else if (data.type === 'exit') {
        active.value = false
        forwarder?.close()
        destroyPlayer()
        if (!status.value.includes('失败') && !status.value.includes('结束') && !status.value.includes('停止')) status.value = 'TikTok 采集程序已退出，请重新采集'
    } else if (data.type === 'event') {
        const event = data.event
        if (event.type === 'like') totalLikes.value = event.total || totalLikes.value
        if (event.type === 'gift') diamonds.value += (event.gift?.diamondCount || 0) * (event.repeatCount || 1)
        messages.value.push(event)
        if (messages.value.length > 500) messages.value.splice(0, messages.value.length - 500)
        forwarder?.enqueue(event)
        void nextTick(() => { if (messageBox.value) messageBox.value.scrollTop = messageBox.value.scrollHeight })
    }
}

async function start() {
    if (active.value || busy.value) return
    if (!account.value.trim()) { ElMessage.error('请输入 TikTok 用户名'); return }
    let destination = ''
    try {
        if (proxy.value.trim() && !['http:', 'https:', 'socks5:'].includes(new URL(proxy.value.trim()).protocol)) throw new Error('代理地址格式不正确')
        if (pushUrl.value.trim()) {
            const url = new URL(pushUrl.value.trim())
            if (!['http:', 'https:'].includes(url.protocol) || url.search || url.hash || !pushRoom.value.trim()) throw new Error('请填写有效推送地址和房间号，地址不能包含查询参数')
            destination = pushUrl.value.trim().replace(/\/+$/, '') + '/' + encodeURIComponent(pushRoom.value.trim())
        }
    } catch (error) { ElMessage.error(String(error)); return }
    busy.value = true
    try {
        await stop()
        if (!unlisten) unlisten = await listen<{ sessionId: string; data: WorkerMessage }>('tiktok-event', event => {
            if (!disposed && event.payload.sessionId === sessionId) receive(event.payload.data)
        })
        if (disposed) { unlisten?.(); unlisten = undefined; return }
        for (const [key, value] of Object.entries({ account: account.value, proxy: proxy.value, pushUrl: pushUrl.value, pushRoom: pushRoom.value })) {
            // Proxy credentials and API keys are never persisted.
            if (key === 'proxy' && (new URL(value || 'http://localhost').username || new URL(value || 'http://localhost').password)) localStorage.removeItem('tiktok.proxy')
            else localStorage.setItem(`tiktok.${key}`, value)
        }
        messages.value = []
        streams.value = []
        room.value = { id: '', name: '', title: '', avatar: '', viewers: 0, streams: [] }
        totalLikes.value = diamonds.value = 0
        pushError.value = videoStatus.value = ''
        status.value = '正在启动 TikTok 采集组件'
        sessionId = crypto.randomUUID()
        forwarder = new TikTokForwarder(destination, message => { pushError.value = message })
        active.value = true
        await invoke('start_tiktok', { sessionId, config: { account: account.value.trim(), proxy: proxy.value.trim(), apiKey: apiKey.value.trim() } })
    } catch (error) {
        active.value = false
        forwarder?.close()
        status.value = String(error)
        ElMessage.error(String(error))
    } finally { busy.value = false }
}

async function stop() {
    forwarder?.close()
    destroyPlayer()
    if (sessionId) await invoke('stop_tiktok', { sessionId })
    sessionId = ''
    active.value = false
    status.value = 'TikTok 采集已停止'
}

async function stopFromButton() {
    busy.value = true
    try { await stop() } catch (error) { ElMessage.error(String(error)) } finally { busy.value = false }
}

async function refreshVideo() {
    try {
        videoStatus.value = '正在刷新视频地址'
        await invoke('refresh_tiktok_video', { sessionId })
    } catch (error) { videoStatus.value = String(error) }
}

onBeforeUnmount(() => {
    disposed = true
    unlisten?.()
    void stop().catch(() => {})
})
defineExpose({ stop })
</script>

<style scoped>
.tiktok-page { height: 100%; display: flex; flex-direction: column; padding: 16px 20px; gap: 10px; background: #f3f5f8; }
.toolbar { display: flex; gap: 8px; }
.toolbar .el-input { flex: 1; }
.toolbar .el-button + .el-button { margin-left: 0; }
.status, .warning { font-size: 13px; color: #475569; }
.warning { color: #b45309; }
.capture-layout { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 2fr) minmax(240px, 1fr); gap: 16px; }
.video-panel, .messages-panel { border-radius: 10px; background: white; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.room-heading { padding: 12px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 13px; }
.room-heading img { height: 36px; width: 36px; border-radius: 50%; }
.room-heading p { color: #64748b; }
.room-heading > span { margin-left: auto; font-size: 12px; }
.video-stage { position: relative; flex: 1; min-height: 120px; background: #111827; }
video { position: absolute; width: 100%; height: 100%; object-fit: contain; }
.video-placeholder { position: absolute; inset: 30% 16px auto; text-align: center; color: #cbd5e1; pointer-events: none; }
.video-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 10px; }
.video-controls .el-select { width: 160px; }
.video-status { font-size: 12px; color: #64748b; }
.filters { padding: 10px; border-bottom: 1px solid #e5e7eb; }
.filters .el-checkbox { margin-right: 14px; }
.messages { padding: 12px; overflow: auto; flex: 1; font-size: 14px; line-height: 1.7; overflow-wrap: anywhere; }
.messages p { margin-bottom: 8px; }
.gift { color: #a16207; }
.like { color: #db2777; }
.empty, .settings-tip { color: #64748b; font-size: 13px; line-height: 1.7; }
@media (max-width: 700px) { .capture-layout { grid-template-columns: 1fr; overflow: auto; } .video-panel { min-height: 280px; } .messages-panel { min-height: 200px; } .toolbar { flex-wrap: wrap; } }
</style>
