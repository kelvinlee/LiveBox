// 抖音登录状态
import { computed, ref } from 'vue'
import { invoke } from '@tauri-apps/api/tauri'
import { ElMessage } from 'element-plus'
import { formatAge } from '@/utils/format'
import { detectPlatform } from './platform'
import { douyinCookie, inputUrl } from './settings'

// 上次同步 Cookie 的时间(毫秒)，0 表示没有记录
const douyinCookieTime = ref(Number(localStorage.getItem('douyinCookieTime')) || 0)
// 登录超过这个时间就提示重新登录
const LOGIN_EXPIRE_MS = 3 * 24 * 60 * 60 * 1000
// 当前时间：每分钟刷新一次，程序一直开着时状态也会按时变成过期
const nowTick = ref(Date.now())
setInterval(() => (nowTick.value = Date.now()), 60 * 1000)

// Cookie 里是否带有登录会话：没有 sessionid 说明只是游客 Cookie
const hasLoginSession = (cookie: string) =>
    cookie.split(';').some((part) => {
        const index = part.indexOf('=')
        if (index < 0) return false
        const name = part.slice(0, index).trim()
        const value = part.slice(index + 1).trim()
        return (name === 'sessionid' || name === 'sessionid_ss') && value !== ''
    })

// 向抖音确认的结果；unknown 表示没有校验过，或者校验时网络失败、无法判断
const loginCheck = ref<'unknown' | 'valid' | 'invalid'>('unknown')

// 打开程序时向抖音确认一次登录是否还有效：只请求这一次，之后不再重复
export const checkDouyinLoginOnce = async () => {
    const cookie = douyinCookie.value.trim()
    if (!cookie || !hasLoginSession(cookie)) return
    try {
        const state = await invoke<string>('check_douyin_login', { cookie })
        // 校验期间用户重新同步了 Cookie，则这次结果作废
        if (douyinCookie.value.trim() !== cookie) return
        if (state === 'valid' || state === 'invalid') loginCheck.value = state
    } catch (e) {
        console.error('check_douyin_login error:', e)
    }
}

// 登录状态：level 为 ok 时是正常提示，warn 时需要用户处理，none 不需要登录
export const loginState = computed(() => {
    if (detectPlatform(inputUrl.value) === 'tiktok') {
        return { level: 'none', text: '免登录', detail: 'TikTok 采集不需要登录' }
    }
    const cookie = douyinCookie.value.trim()
    if (!cookie) {
        return {
            level: 'warn',
            text: '未登录',
            detail: '还没有登录抖音，礼物等消息可能收不到。点击打开设置进行登录',
        }
    }
    if (!hasLoginSession(cookie)) {
        return {
            level: 'warn',
            text: '登录无效',
            detail: '保存的 Cookie 里没有登录信息，请重新登录并同步 Cookie',
        }
    }
    if (loginCheck.value === 'invalid') {
        return {
            level: 'warn',
            text: '登录已失效',
            detail: '抖音返回当前登录已失效，请重新登录并同步 Cookie',
        }
    }
    if (!douyinCookieTime.value) {
        return {
            level: 'warn',
            text: '登录需更新',
            detail: '没有记录上次登录的时间，无法判断是否过期，建议重新同步 Cookie',
        }
    }
    const age = Math.max(0, nowTick.value - douyinCookieTime.value)
    if (age > LOGIN_EXPIRE_MS) {
        return {
            level: 'warn',
            text: '登录已过期',
            detail: `距离上次登录已经 ${formatAge(age)}，超过 3 天，请重新登录并同步 Cookie`,
        }
    }
    return {
        level: 'ok',
        text: '已登录',
        detail: `${formatAge(age)}前登录，3 天后会提示重新登录`,
    }
})

export const openDouyinLogin = async () => {
    try {
        await invoke('open_douyin_login_window')
        ElMessage.success('已打开登录窗口，请在窗口内完成登录后点「同步 Cookie」')
    } catch (e) {
        ElMessage.error(String(e))
    }
}

export const syncDouyinCookies = async () => {
    try {
        const cookie = await invoke<string>('sync_douyin_cookies_from_webview')
        douyinCookie.value = cookie
        localStorage.setItem('douyinCookie', cookie)
        // 记录本次登录(同步)的时间，用于判断是否过期
        douyinCookieTime.value = Date.now()
        localStorage.setItem('douyinCookieTime', String(douyinCookieTime.value))
        // 新同步的 Cookie 不沿用之前的校验结果
        loginCheck.value = 'unknown'
        if (hasLoginSession(cookie)) {
            ElMessage.success('Cookie 已保存')
        } else {
            ElMessage.warning('Cookie 已保存，但里面没有登录信息，请先在登录页完成登录再同步')
        }
    } catch (e) {
        ElMessage.error(String(e))
    }
}
