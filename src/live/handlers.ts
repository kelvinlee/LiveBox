// 直播消息处理：抖音和 TikTok 共用，负责显示到消息列表和推送给后台
import { markRaw } from 'vue'
import { escapeHtml, giftIconHtml } from '@/utils/format'
import type { Platform } from './platform'
import { checkList, pushUrl } from './settings'
import { diamond, liveInfo, setFans } from './state'
import { isDuplicate, lastMessage, pushMsg, scrollToBottom } from './messages'
import { pushChat, pushGift, pushLike } from './pusher'
import { recordGiftKind } from './gifts'

// 消息里保留观众信息用于补发，不需要响应式
const rawUser = (user: any) => (user ? markRaw(user) : null)

// 聊天
export const onChat = (platform: Platform, id: string, user: any, content: string) => {
    if (isDuplicate(id)) return
    if (checkList.value.includes('chat')) {
        pushMsg({
            id,
            type: 'chat',
            name: user?.nickName,
            user: rawUser(user),
            platform,
            msg: escapeHtml(content),
        })
    }
    if (pushUrl.value == '') return
    pushChat({ id, type: 'chat', platform, user, content })
}

// 礼物连击记录：key 为 平台_用户_礼物_连击组，value 为已经统计过的数量
// 连击礼物每次下发的 repeatCount 是累计值，连击结束时还会再发一条 repeatEnd=1 的消息(数量和上一条相同)，
// 直接按条推送会重复，所以这里只推送相对上一条的增量。抖音和 TikTok 规则相同
const giftComboMap = new Map<string, { count: number; at: number }>()
const GIFT_COMBO_TTL = 10 * 60 * 1000
const pruneGiftCombo = () => {
    if (giftComboMap.size < 2000) return
    const now = Date.now()
    giftComboMap.forEach((v, k) => {
        if (now - v.at > GIFT_COMBO_TTL) giftComboMap.delete(k)
    })
}

// 礼物
export const onGift = (
    platform: Platform,
    data: {
        id: string
        user: any
        gift: any
        giftId: string
        // 本条消息里的累计数量
        total: number
        repeatEnd: number
        groupId: string
    },
) => {
    const { id, user, gift, giftId, repeatEnd, groupId } = data
    if (isDuplicate(id)) return
    recordGiftKind(platform, giftId, gift)
    const total = data.total || 1
    // 本次实际新增的数量
    let count = total
    if (groupId && groupId !== '0') {
        const key = `${platform}_${user?.id}_${giftId}_${groupId}`
        const prev = giftComboMap.get(key)?.count || 0
        if (gift?.combo || repeatEnd === 1) {
            count = total - prev
        }
        giftComboMap.set(key, { count: Math.max(total, prev), at: Date.now() })
        pruneGiftCombo()
        // 连击结束消息或者重复消息，没有新增数量
        if (count <= 0) return
    }
    const diamondCount = gift?.diamondCount || 0
    const icon = gift?.icon?.urlListList?.[0] || ''
    if (checkList.value.includes('gift')) {
        pushMsg({
            id,
            type: 'gift',
            name: user?.nickName,
            user: rawUser(user),
            platform,
            msg: `送出 ${giftIconHtml(icon)} ${escapeHtml(gift?.name)} x${count}个 (${diamondCount}钻)`,
        })
    }
    // 计算主播收益
    diamond.value += diamondCount * count
    if (pushUrl.value == '') return
    pushGift({
        id,
        type: 'gift',
        platform,
        user,
        gift,
        // 本次新增数量
        repeatCount: count,
        // 连击累计数量
        totalCount: total,
        repeatEnd,
    })
}

// 进入直播间
export const onJoin = (platform: Platform, id: string, user: any) => {
    if (isDuplicate(id)) return
    if (!checkList.value.includes('comein')) return
    pushMsg({
        id,
        type: 'join',
        name: user?.nickName,
        user: rawUser(user),
        platform,
        msg: '来了',
    })
}

// 点赞
export const onLike = (
    platform: Platform,
    id: string,
    user: any,
    count: number,
    total: number,
) => {
    if (isDuplicate(id)) return
    liveInfo.value = { ...liveInfo.value, totalLike: total }
    if (checkList.value.includes('like')) {
        // 同一个人连续点赞只显示一条，数量往上加；中间有别的消息就重新开始一条
        // 只影响列表显示，推送给后台的数据不合并
        const likes = Math.max(1, Number(count) || 1)
        const likeKey = `${platform}_${user?.id?.toString() ?? user?.nickName}`
        const last = lastMessage()
        if (last && last.type === 'like' && last.likeKey === likeKey) {
            last.likeCount = (last.likeCount || 0) + likes
            last.msg = `为主播点赞了 x ${last.likeCount}`
            scrollToBottom()
        } else {
            pushMsg({
                id,
                type: 'like',
                name: user?.nickName,
                user: rawUser(user),
                platform,
                likeKey,
                likeCount: likes,
                msg: `为主播点赞了 x ${likes}`,
            })
        }
    }
    if (pushUrl.value == '') return
    pushLike({ id, type: 'like', platform, user, like: count })
}

// 关注
export const onFollow = (platform: Platform, id: string, user: any, followCount: unknown) => {
    if (isDuplicate(id)) return
    setFans(followCount)
    if (!checkList.value.includes('follow')) return
    pushMsg({
        id,
        type: 'follow',
        name: user?.nickName,
        user: rawUser(user),
        platform,
        msg: '关注了主播',
    })
}

// 开始/停止采集时清空连击记录
export const resetHandlers = () => {
    giftComboMap.clear()
}
