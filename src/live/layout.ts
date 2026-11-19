// 画面和弹幕之间的距离：拖动分隔条调整，分别记住两种布局的大小
import { ref, watch } from 'vue'
import { getLocalJson } from '@/utils/storage'

// 弹幕在右侧时弹幕栏的宽度(px)
export const CHAT_WIDTH_DEFAULT = 320
export const CHAT_WIDTH_MIN = 240
// 画面至少留这么宽：放得下头像、名字和五项统计
export const STAGE_WIDTH_MIN = 560
// 弹幕在下方时画面占的高度比例(%)
export const VIDEO_RATIO_DEFAULT = 48
export const VIDEO_RATIO_MIN = 20
export const VIDEO_RATIO_MAX = 80

const num = (key: string, fallback: number) => {
    const v = Number(getLocalJson<unknown>(key, fallback))
    return Number.isFinite(v) && v > 0 ? v : fallback
}

export const chatWidth = ref(num('chat_width', CHAT_WIDTH_DEFAULT))
export const videoRatio = ref(num('video_ratio', VIDEO_RATIO_DEFAULT))
watch(chatWidth, (v) => localStorage.setItem('chat_width', String(Math.round(v))))
watch(videoRatio, (v) => localStorage.setItem('video_ratio', String(Math.round(v * 10) / 10)))

// 窗口变窄后，弹幕栏不能把画面挤得太小
export const clampChatWidth = (width: number, total: number) =>
    Math.round(Math.max(CHAT_WIDTH_MIN, Math.min(width, total - STAGE_WIDTH_MIN)))

export const clampVideoRatio = (ratio: number) =>
    Math.max(VIDEO_RATIO_MIN, Math.min(VIDEO_RATIO_MAX, ratio))
