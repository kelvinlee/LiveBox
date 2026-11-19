// 礼物种类记录和补发礼物
// 收到过的礼物种类长期保存在应用数据目录里(由 Rust 端读写)，抖音和 TikTok 各一份，
// 不放在 localStorage：清理浏览数据不会丢，多个窗口共用同一份
import { computed, markRaw, ref } from 'vue'
import axios from 'axios'
import { invoke } from '@tauri-apps/api/tauri'
import { listen } from '@tauri-apps/api/event'
import { ElMessage } from 'element-plus'
import { escapeHtml, giftIconHtml } from '@/utils/format'
import { PLATFORMS, type Platform } from './platform'
import { pushUrl, roomId } from './settings'
import { pushMsg, type ChatItem } from './messages'
import { PUSH_TIMEOUT } from './pusher'

// gift 是礼物的完整数据，补发时原样发给后台
export interface GiftKind {
    id: string
    name: string
    diamondCount: number
    icon: string
    gift: any
}

export const giftCatalogs = ref<Record<Platform, GiftKind[]>>({ douyin: [], tiktok: [] })
const knownGiftIds: Record<Platform, Set<string>> = {
    douyin: new Set(),
    tiktok: new Set(),
}

// 把礼物种类加入当前窗口的列表(不写文件)
const addGiftKindsLocal = (platform: Platform, kinds: GiftKind[]) => {
    const known = knownGiftIds[platform]
    if (!known) return
    kinds.forEach((kind) => {
        if (!kind || !kind.id || known.has(kind.id)) return
        known.add(kind.id)
        // 礼物数据不需要响应式
        giftCatalogs.value[platform].push({ ...kind, gift: markRaw(kind.gift || {}) })
    })
}

// 写入长期存储，失败时提示一次
let giftSaveErrorShown = false
const saveGiftKinds = async (platform: Platform, kinds: GiftKind[]) => {
    try {
        await invoke('add_gift_kinds', { platform, kinds })
    } catch (e) {
        console.error('保存礼物种类失败:', e)
        if (!giftSaveErrorShown) {
            giftSaveErrorShown = true
            ElMessage.error('礼物种类保存失败: ' + String(e))
        }
    }
}

// 加载已保存的礼物种类，并监听其他窗口新记录的礼物。返回取消监听的方法
export const initGiftCatalog = async () => {
    let unlisten: (() => void) | null = null
    try {
        unlisten = await listen<{ platform: Platform; kinds: GiftKind[] }>(
            'gift-kinds-added',
            (event) => addGiftKindsLocal(event.payload.platform, event.payload.kinds),
        )
        for (const platform of PLATFORMS) {
            // 加载完成前本窗口已经收到的礼物也要补存进去
            const receivedBeforeLoad = giftCatalogs.value[platform].slice()
            const saved = await invoke<GiftKind[]>('get_gift_catalog', { platform })
            const savedIds = new Set(saved.map((g) => g.id))
            addGiftKindsLocal(platform, saved)
            const missing = receivedBeforeLoad.filter((g) => !savedIds.has(g.id))
            if (missing.length) await saveGiftKinds(platform, missing)
        }
    } catch (e) {
        console.error('加载礼物种类失败:', e)
    }
    return () => unlisten?.()
}

// 收到礼物时记录它的种类：只有第一次见到的礼物才会写入
export const recordGiftKind = (platform: Platform, giftId: string, gift: any) => {
    if (!gift || !giftId || giftId === '0' || knownGiftIds[platform].has(giftId)) return
    // 转成普通对象，和正常推送给后台的格式一致
    const giftJson = typeof gift.toJSON === 'function' ? gift.toJSON() : gift
    const kind: GiftKind = {
        id: giftId,
        name: gift.name || '未知礼物',
        diamondCount: gift.diamondCount || 0,
        icon: gift.icon?.urlListList?.[0] || '',
        gift: giftJson,
    }
    addGiftKindsLocal(platform, [kind])
    saveGiftKinds(platform, [kind])
}

// ---------- 补发礼物 ----------
export const resendVisible = ref(false)
export const resendSending = ref(false)
export const resendTarget = ref<{ name: string; avatar: string; user: any }>({
    name: '',
    avatar: '',
    user: null,
})
export const resendGiftId = ref('')
// 补发使用哪一套礼物
export const resendPlatform = ref<Platform>('douyin')
export const resendCount = ref(1)
export const giftKeyword = ref('')

export const switchResendPlatform = (platform: Platform) => {
    if (resendPlatform.value === platform) return
    resendPlatform.value = platform
    resendGiftId.value = ''
}

// 按价格从低到高排列，同价按名称
export const filteredGifts = computed(() => {
    const keyword = giftKeyword.value.trim().toLowerCase()
    return giftCatalogs.value[resendPlatform.value]
        .filter((g) => !keyword || g.name.toLowerCase().includes(keyword))
        .sort(
            (a, b) =>
                (a.diamondCount || 0) - (b.diamondCount || 0) ||
                a.name.localeCompare(b.name, 'zh-CN'),
        )
})
export const selectedGift = computed(() =>
    giftCatalogs.value[resendPlatform.value].find((g) => g.id === resendGiftId.value),
)

// 点击消息列表里的观众，打开补发礼物
export const openResend = (item: ChatItem) => {
    if (!item.user) return
    resendTarget.value = {
        name: item.name,
        avatar: item.user.AvatarThumb?.urlListList?.[0] || '',
        user: markRaw(item.user),
    }
    // 默认使用这条消息所在平台的礼物
    const platform: Platform = item.platform === 'tiktok' ? 'tiktok' : 'douyin'
    if (resendPlatform.value !== platform) resendGiftId.value = ''
    resendPlatform.value = platform
    resendCount.value = 1
    giftKeyword.value = ''
    resendVisible.value = true
}

// 补发：按正常礼物消息的格式发给后台，多一个 resend 标记
export const sendResend = async () => {
    const kind = selectedGift.value
    const target = resendTarget.value
    if (!kind || !target.user || resendSending.value) return
    if (pushUrl.value.trim() === '') {
        ElMessage.error('请先在设置里填写推送地址')
        return
    }
    const count = Math.max(1, Math.floor(resendCount.value || 1))
    const id = 'resend_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    const item = {
        id,
        type: 'gift',
        user: target.user,
        gift: kind.gift,
        repeatCount: count,
        totalCount: count,
        repeatEnd: 1,
        platform: resendPlatform.value,
        // 标记这是手动补发的礼物
        resend: true,
    }
    resendSending.value = true
    try {
        await axios.post(
            pushUrl.value.trim() + '/' + roomId.value,
            { type: 'gift_batch', items: [item] },
            { timeout: PUSH_TIMEOUT },
        )
        ElMessage.success(`已补发 ${kind.name} x${count} 给 ${target.name}`)
        pushMsg({
            id,
            type: 'gift',
            name: target.name,
            user: target.user,
            platform: resendPlatform.value,
            msg: `补发 ${giftIconHtml(kind.icon)} ${escapeHtml(kind.name)} x${count}个 (${kind.diamondCount}钻)`,
        })
        resendVisible.value = false
    } catch (e) {
        // 补发不自动重试，避免后台实际已经收到时重复发放
        ElMessage.error('补发失败，后台没有确认收到: ' + String(e))
    } finally {
        resendSending.value = false
    }
}
