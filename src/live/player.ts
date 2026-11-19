// 直播画面：播放器、隐藏画面、弹幕位置
import { nextTick, ref } from 'vue'
import DPlayer from 'dplayer'
import Hls from 'hls.js'
import Flv from 'flv.js'
import type { DPlayerImp } from '@/types'
import { scrollToBottom } from './messages'
import { parseQualities, pickQuality, savePreferredQuality, type Quality } from './quality'

// 播放器挂载的元素 id
const PLAYER_ID = 'dplayer'

let dplayer: DPlayerImp | null = null
// flv.js / hls.js 的实例：DPlayer 销毁时不会帮忙关掉，要自己销毁，否则旧的流还在后台下载
let streamPlayer: { destroy: () => void } | null = null
// 当前直播的视频地址：隐藏画面后再显示、重新加载时用它重新播放
let currentVideo: { url: string; live: boolean } | null = null
// 有没有可以播放的直播(用来显示「重新加载」按钮)
export const hasVideo = ref(false)

export const hasPlayer = () => dplayer !== null

// ---------- 清晰度 ----------
// 当前直播可选的清晰度(从清晰到模糊)和正在播放的那一档
export const qualities = ref<Quality[]>([])
export const currentQuality = ref('')

// 按平台给的 stream_url 播放：整理出清晰度，选用户上次选的那一档。
// 解析不出清晰度时用 fallbackUrl 直接播放
export const playStream = (streamUrl: any, fallbackUrl = '') => {
    const list = parseQualities(streamUrl)
    qualities.value = list
    const chosen = pickQuality(list, streamUrl?.default_resolution)
    currentQuality.value = chosen?.key || ''
    const url = chosen?.url || fallbackUrl
    if (url) loadLive(url)
}

// 切换清晰度：重新拉流，选择会记住
export const switchQuality = (key: string) => {
    const q = qualities.value.find((item) => item.key === key)
    if (!q || q.key === currentQuality.value) return
    currentQuality.value = q.key
    savePreferredQuality(q.name)
    destroyPlayer(false)
    loadLive(q.url, currentVideo?.live ?? true)
}

// 弹幕位置：side 在画面右侧，bottom 在画面下方(竖屏窗口用)
export type ChatLayout = 'side' | 'bottom'
export const chatLayout = ref<ChatLayout>(
    localStorage.getItem('chat_layout') === 'bottom' ? 'bottom' : 'side',
)
export const toggleChatLayout = () => {
    chatLayout.value = chatLayout.value === 'side' ? 'bottom' : 'side'
    localStorage.setItem('chat_layout', chatLayout.value)
    nextTick(() => scrollToBottom())
}

// 隐藏直播画面：隐藏时销毁播放器，不再拉流；再显示时重新播放当前直播
export const videoHidden = ref(localStorage.getItem('video_hidden') === 'true')
export const toggleVideo = () => {
    videoHidden.value = !videoHidden.value
    localStorage.setItem('video_hidden', String(videoHidden.value))
    if (videoHidden.value) {
        destroyPlayer(false)
    } else {
        nextTick(() => {
            if (currentVideo && !dplayer) loadLive(currentVideo.url, currentVideo.live)
        })
    }
    nextTick(() => scrollToBottom())
}

// 按地址类型创建播放器：m3u8 用 hls.js，flv 用 flv.js，mp4 直接播放
const createPlayer = (videoUrl: string, live: boolean): DPlayerImp | null => {
    const container = document.getElementById(PLAYER_ID)
    const base = { container, screenshot: false, autoplay: true, live, volume: 0, lang: 'zh-cn' }
    if (videoUrl.includes('m3u8')) {
        return new DPlayer({
            ...base,
            video: {
                url: '',
                type: 'customHls',
                customType: {
                    customHls: (video: any) => {
                        const hls = new Hls()
                        streamPlayer = hls
                        hls.loadSource(videoUrl)
                        hls.attachMedia(video)
                    },
                },
            },
        })
    }
    if (videoUrl.includes('mp4')) {
        return new DPlayer({ ...base, fullScreen: false, video: { url: videoUrl, type: 'mp4' } })
    }
    if (videoUrl.includes('flv')) {
        return new DPlayer({
            ...base,
            video: {
                url: videoUrl,
                type: 'customFlv',
                customType: {
                    customFlv: (video: any) => {
                        const flvPlayer = Flv.createPlayer({ type: 'flv', url: videoUrl })
                        streamPlayer = flvPlayer
                        flvPlayer.attachMediaElement(video)
                        flvPlayer.load()
                    },
                },
            },
        })
    }
    return null
}

// 播放直播；画面隐藏时只记下地址，不播放
export const loadLive = (videoUrl: string, live = true) => {
    currentVideo = { url: videoUrl, live }
    hasVideo.value = true
    if (videoHidden.value || dplayer) return
    dplayer = createPlayer(videoUrl, live)
}

// 销毁播放器；forget 为 false 时保留视频地址(隐藏画面用)，之后还能重新播放
export const destroyPlayer = (forget = true) => {
    if (forget) {
        currentVideo = null
        hasVideo.value = false
        qualities.value = []
        currentQuality.value = ''
    }
    if (streamPlayer) {
        try {
            streamPlayer.destroy()
        } catch (e) {
            console.warn('关闭视频流失败:', e)
        }
        streamPlayer = null
    }
    if (dplayer) {
        dplayer.destroy()
        dplayer = null
    }
}

// 重新加载：画面卡住时用同一个地址重新拉流
export const reloadVideo = () => {
    const video = currentVideo
    if (!video || videoHidden.value) return
    destroyPlayer(false)
    nextTick(() => loadLive(video.url, video.live))
}
