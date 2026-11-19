// 消息列表：显示、筛选、裁剪、滚动和去重
import { computed, nextTick, ref } from 'vue'
import { getLocalJson } from '@/utils/storage'

export interface ChatItem {
    id: string
    type: string
    name: string
    msg: string
    user?: any
    platform?: string
    // 连续点赞合并用
    likeKey?: string
    likeCount?: number
}

const welcome = (): ChatItem => ({
    id: '1',
    type: 'chat',
    name: 'Kelvin',
    msg: '欢迎使用弹幕工具',
})

export const messageList = ref<ChatItem[]>([welcome()])

// 消息列表最大长度：超过后裁剪掉旧消息，避免长时间采集后列表无限增长导致界面卡死
export const MAX_MESSAGE_COUNT = 600
const KEEP_MESSAGE_COUNT = 300
// 用户往上翻看时，为了不让正在看的内容跳动，先不裁剪，超过这个数才强制裁剪
const HARD_MAX_MESSAGE_COUNT = 3000
// 裁剪时额外保留的旧礼物条数：礼物比弹幕少得多，筛选「礼物」时不至于被弹幕挤掉
const KEEP_GIFT_COUNT = 300
// 列表是否裁剪过旧消息：裁剪后条数会在一定范围内来回变化，显示成「600+」
export const msgTrimmed = ref(false)

// ---------- 筛选 ----------
// 选中的类型为空表示显示全部，选择会记住
export type MsgKind = 'chat' | 'gift' | 'like' | 'join' | 'follow'
export const MSG_FILTERS: { key: MsgKind; label: string }[] = [
    { key: 'chat', label: '弹幕' },
    { key: 'gift', label: '礼物' },
    { key: 'like', label: '点赞' },
    { key: 'join', label: '进场' },
    { key: 'follow', label: '关注' },
]
const loadMsgFilter = (): MsgKind[] => {
    const saved = getLocalJson<unknown>('msg_filter', [])
    const keys = MSG_FILTERS.map((f) => f.key)
    return Array.isArray(saved) ? saved.filter((k) => keys.includes(k)) : []
}
export const msgFilter = ref<MsgKind[]>(loadMsgFilter())
const msgMatches = (msg: ChatItem) =>
    !msgFilter.value.length || msgFilter.value.includes(msg.type as MsgKind)
export const visibleMessages = computed(() =>
    msgFilter.value.length ? messageList.value.filter(msgMatches) : messageList.value,
)
export const msgCountText = computed(() => {
    const n = visibleMessages.value.length
    if (!msgTrimmed.value) return String(n)
    return msgFilter.value.length ? `${n}+` : `${MAX_MESSAGE_COUNT}+`
})
// 点「全部」清空筛选；点某个类型则切换选中，全部取消后回到「全部」
export const toggleMsgFilter = (key: MsgKind | null) => {
    if (key === null) {
        msgFilter.value = []
    } else if (msgFilter.value.includes(key)) {
        msgFilter.value = msgFilter.value.filter((k) => k !== key)
    } else {
        msgFilter.value = [...msgFilter.value, key]
    }
    localStorage.setItem('msg_filter', JSON.stringify(msgFilter.value))
    // 换了筛选后列表内容整体变化，直接回到最新
    nextTick(() => scrollToBottom(true))
}

// ---------- 滚动 ----------
// 是否自动滚动到底部：用户往上翻看时暂停，手动滚回底部后恢复
export const msgStickBottom = ref(true)
// 翻看期间新来的消息数
export const unreadMsgCount = ref(0)
// 虚拟列表组件，由消息面板设置
let scroller: any = null
export const setChatScroller = (el: any) => {
    scroller = el
}

// 最近一次用户操作列表(滚轮、触摸、键盘)的时间，以及是否按住了鼠标(拖动滚动条)。
// 新消息加入、列表测量高度、裁剪旧消息时也会触发滚动事件，这些不能算作用户在翻看
let msgUserActionAt = 0
let msgPointerDown = false
export const markMsgUserAction = () => {
    msgUserActionAt = Date.now()
}
export const onMsgPointerDown = () => {
    msgPointerDown = true
    markMsgUserAction()
    window.addEventListener(
        'pointerup',
        () => {
            msgPointerDown = false
            markMsgUserAction()
        },
        { once: true },
    )
}
export const onMsgScroll = (e: Event) => {
    const el = e.target as HTMLElement
    if (el?.id !== 'liveMsg') return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    if (atBottom) {
        // 回到底部：恢复自动跟随
        msgStickBottom.value = true
        unreadMsgCount.value = 0
    } else if (msgPointerDown || Date.now() - msgUserActionAt < 800) {
        // 用户主动往上翻：停止自动跟随
        msgStickBottom.value = false
    }
}

// 滚动到底部；force 为 true 时不管当前是否在翻看。
// 用虚拟列表自带的方法：新消息渲染后才测量出实际高度，它会等测量完成再滚到真正的底部
export const scrollToBottom = (force = false) => {
    if (force) {
        msgStickBottom.value = true
        unreadMsgCount.value = 0
    }
    if (!msgStickBottom.value) return
    scroller?.scrollToBottom?.()
}

// 添加一条消息
export const pushMsg = (msg: ChatItem) => {
    messageList.value.push(msg)
    const length = messageList.value.length
    if (
        (msgStickBottom.value && length > MAX_MESSAGE_COUNT) ||
        length > HARD_MAX_MESSAGE_COUNT
    ) {
        const list = messageList.value
        const cut = length - KEEP_MESSAGE_COUNT
        const oldGifts = list
            .slice(0, cut)
            .filter((m) => m.type === 'gift')
            .slice(-KEEP_GIFT_COUNT)
        messageList.value = oldGifts.concat(list.slice(cut))
        msgTrimmed.value = true
    }
    if (msgStickBottom.value) {
        scrollToBottom()
    } else if (msgMatches(msg)) {
        unreadMsgCount.value++
    }
}

// 列表最后一条消息(连续点赞合并用)
export const lastMessage = () => messageList.value[messageList.value.length - 1]

// ---------- 去重 ----------
// 断线重连、连接切换时服务端可能重复下发同一条消息
let seenMsgIds = new Set<string>()
let seenMsgIdsOld = new Set<string>()
export const isDuplicate = (id: string) => {
    if (!id || id === '0') return false
    if (seenMsgIds.has(id) || seenMsgIdsOld.has(id)) return true
    seenMsgIds.add(id)
    // 分两代保存，控制内存占用
    if (seenMsgIds.size >= 5000) {
        seenMsgIdsOld = seenMsgIds
        seenMsgIds = new Set()
    }
    return false
}

// 开始/停止采集时清空列表和去重记录
export const resetMessages = () => {
    msgStickBottom.value = true
    unreadMsgCount.value = 0
    msgTrimmed.value = false
    messageList.value = [welcome()]
    seenMsgIds = new Set()
    seenMsgIdsOld = new Set()
}
