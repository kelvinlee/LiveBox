// 文字和数字的格式化工具

// 文字转义：聊天、昵称等内容来自观众，不能直接当 HTML 渲染
export const escapeHtml = (text: unknown) =>
    String(text ?? '').replace(
        /[&<>"']/g,
        (c) =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
    )

// 礼物图标：只接受 http(s) 地址
export const giftIconHtml = (icon: string) =>
    icon && /^https?:\/\//.test(icon)
        ? `<img src="${escapeHtml(icon)}" style="width: 20px; margin-top:-0.2em"/>`
        : ''

// 转成数字：protobuf 的 Long、数字字符串都可以，无法识别时为 0
export const toCount = (v: unknown) => {
    const n = Number(String(v ?? '').trim())
    return Number.isFinite(n) ? n : 0
}

// 统计数字：过万显示成「x.x万」，过亿显示成「x.x亿」；已经是「1.2万」这类文字的原样显示
export const formatCount = (value: unknown) => {
    const text = String(value ?? '').trim()
    if (!/^\d+(\.\d+)?$/.test(text)) return text || '0'
    const n = Number(text)
    const short = (v: number, unit: string) =>
        `${(Math.floor(v * 10) / 10).toFixed(1).replace(/\.0$/, '')}${unit}`
    if (n >= 100_000_000) return short(n / 100_000_000, '亿')
    if (n >= 10_000) return short(n / 10_000, '万')
    return text
}

// 直播时长：时:分:秒，例如 1:05:09；不到 1 小时显示 分:秒
export const formatDuration = (ms: number) => {
    const total = Math.max(0, Math.floor(ms / 1000))
    const h = Math.floor(total / 3600)
    const m = Math.floor((total % 3600) / 60)
    const s = total % 60
    const pad = (n: number) => String(n).padStart(2, '0')
    return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

// 时长：不到 1 小时 / x 小时 / x 天
export const formatAge = (ms: number) => {
    const hours = Math.floor(ms / (60 * 60 * 1000))
    if (hours < 1) return '不到 1 小时'
    if (hours < 24) return `${hours} 小时`
    return `${Math.floor(hours / 24)} 天`
}
