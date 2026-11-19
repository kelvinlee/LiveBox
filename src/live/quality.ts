// 直播清晰度：从平台的 stream_url 里整理出可选的清晰度，抖音和 TikTok 结构相同
import { getLocalJson } from '@/utils/storage'

export interface Quality {
    // 平台里的标识，例如 origin / hd / FULL_HD1
    key: string
    // 显示的名字，例如 原画 / 超清 / 720p
    name: string
    url: string
    // 越大越清晰
    level: number
}

// 地址里的清晰度后缀(stream-xxx_hd.flv)对应的默认叫法，平台没给名字时用
const SUFFIX_NAMES: Record<string, { name: string; level: number }> = {
    origin: { name: '原画', level: 5 },
    uhd: { name: '蓝光', level: 4 },
    hd: { name: '超清', level: 3 },
    sd: { name: '高清', level: 2 },
    ld: { name: '标清', level: 1 },
}

const https = (url: string) => url.replace(/^http:\/\//, 'https://')

// 名字里带分辨率(720p、1080p60、2K)时按分辨率排序
const levelFromName = (name: string) => {
    if (/2k/i.test(name)) return 1440
    const m = name.match(/(\d{3,4})p/i)
    return m ? Number(m[1]) : 0
}

// 平台的清晰度列表：sdk_key(hd、uhd…) -> 名字和等级
const optionMap = (pull: any) => {
    const map: Record<string, { name: string; level: number }> = {}
    for (const q of pull?.options?.qualities || []) {
        if (q?.sdk_key) map[q.sdk_key] = { name: q.name || q.sdk_key, level: q.level || 0 }
    }
    return map
}

// 整理可选的清晰度，从清晰到模糊排列。
// - TikTok：live_core_sdk_data 里的 stream_data 直接给出每档的地址，名字准确
// - 抖音：stream_data 只是指向页面别处的引用(例如 "$13")，地址要从 flv_pull_url 拿，
//   名字按地址后缀对应清晰度列表。注意抖音的 SD1 是标清(_ld)，SD2 才是高清(_sd)，不能按 key 猜
export const parseQualities = (streamUrl: any): Quality[] => {
    if (!streamUrl) return []
    const pull = streamUrl.live_core_sdk_data?.pull_data
    const options = optionMap(pull)
    const list: Quality[] = []
    const raw = pull?.stream_data
    if (typeof raw === 'string' && raw.trim().startsWith('{')) {
        try {
            const data = JSON.parse(raw)?.data || {}
            for (const [key, opt] of Object.entries(options)) {
                const main = data[key]?.main
                const url = main?.flv || main?.hls
                // ao 是纯音频，不算清晰度
                if (!url || key === 'ao') continue
                list.push({ key, name: opt.name, url: https(url), level: opt.level })
            }
        } catch (e) {
            console.warn('解析清晰度地址失败:', e)
        }
    }
    if (!list.length) {
        const names = streamUrl.resolution_name || {}
        for (const [key, url] of Object.entries<string>(streamUrl.flv_pull_url || {})) {
            if (!url) continue
            const suffix = url.match(/_([a-z]+)\.flv/i)?.[1]?.toLowerCase() || 'origin'
            const known = options[suffix] || SUFFIX_NAMES[suffix]
            const name = known?.name || names[key] || key
            list.push({
                key,
                name,
                url: https(url),
                level: known?.level || levelFromName(name),
            })
        }
    }
    return list.sort((a, b) => b.level - a.level)
}

// 记住用户选的清晰度：按名字记，下次有同名的就用它
const PREF_KEY = 'video_quality'
export const savePreferredQuality = (name: string) => {
    localStorage.setItem(PREF_KEY, JSON.stringify(name))
}

// 选默认清晰度：用户选过的 > 平台默认 > 最清晰的
export const pickQuality = (list: Quality[], platformDefault?: string) => {
    const preferred = getLocalJson<string>(PREF_KEY, '')
    return (
        list.find((q) => q.name === preferred) ||
        list.find((q) => q.key === platformDefault) ||
        list[0]
    )
}
