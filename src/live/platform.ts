// 平台：抖音 / TikTok

export type Platform = 'douyin' | 'tiktok'
export const PLATFORMS: Platform[] = ['douyin', 'tiktok']

// 根据地址判断平台：tiktok.com 的地址或 @用户名 为 TikTok，其他为抖音
export const detectPlatform = (url: string): Platform =>
    /tiktok\.com/i.test(url) || url.trim().startsWith('@') ? 'tiktok' : 'douyin'

export const platformName = (platform: Platform) =>
    platform === 'tiktok' ? 'TikTok' : '抖音'

// 平台图标上的字
export const platformGlyph = (platform: Platform) =>
    platform === 'tiktok' ? 'T' : '抖'
