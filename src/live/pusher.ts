// 推送队列：把消息批量 POST 给后台
// - POST 进行中时先入队，本次请求结束后再发下一批
// - 请求失败(后台没启动、超时等)会把这一批放回队列重试，不直接丢弃
// - 每批限制条数，请求体过大(413)时自动减小批量
// - 请求带超时，避免某个请求一直挂起导致后面的消息全部卡住
// - 停止采集时清空队列、取消重试，停止后不会再有消息发给后台
// 同时统计推送情况，显示在底栏
import { computed, reactive, watch } from 'vue'
import axios from 'axios'
import { collecting } from './state'
import { pushUrl, roomId, useBackend } from './settings'
import { backendRunning } from './backend'

// 能否推送：勾选了「使用后台」并且后台在运行。不能推送时收到的消息直接丢弃
const canPush = computed(() => useBackend.value && backendRunning.value)

export const PUSH_TIMEOUT = 10000
// 积压超过这个条数就提示推送跟不上
const BACKLOG_WARN = 200

// 每个推送队列的状态
interface QueueState {
    backlog: number
    // 连续失败次数，成功一次就清零
    failCount: number
    lastError: string
}
const queues = reactive<QueueState[]>([])

// 本次采集的推送统计，开始/停止采集时清零
const stats = reactive({
    sent: 0,
    // 后台明确拒绝(4xx)的条数
    rejected: 0,
    // 积压太多被丢弃的条数
    dropped: 0,
    // 后台没有运行被丢弃的条数
    skipped: 0,
    lastRejectReason: '',
})

const resets: Array<() => void> = []
export const resetPushers = () => {
    resets.forEach((reset) => reset())
    stats.sent = 0
    stats.rejected = 0
    stats.dropped = 0
    stats.skipped = 0
    stats.lastRejectReason = ''
}
// 后台停止了：队列里还没发出去的消息也丢弃，不再重试
watch(canPush, (ok) => {
    if (ok) return
    stats.skipped += queues.reduce((sum, q) => sum + q.backlog, 0)
    resets.forEach((reset) => reset())
})

// 请求失败的原因，给用户看
const describeError = (err: any) => {
    const status = err?.response?.status
    if (status) return `后台返回 HTTP ${status}`
    if (err?.code === 'ECONNABORTED') return `请求超时(${PUSH_TIMEOUT / 1000} 秒)`
    return '连不上后台，请确认后台已经启动、推送地址正确'
}

const createPusher = (batchType: string, maxBuffer: number) => {
    let buffer: any[] = []
    let sending = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let batchSize = 50
    // 队列代数：清空后加一，清空前发出的请求结束时不再放回队列、不再继续发送
    let generation = 0
    queues.push({ backlog: 0, failCount: 0, lastError: '' })
    const state = queues[queues.length - 1]
    const syncBacklog = () => {
        state.backlog = buffer.length
    }

    resets.push(() => {
        generation++
        buffer = []
        if (retryTimer) clearTimeout(retryTimer)
        retryTimer = null
        // 正在进行的请求无法撤回，结束后按代数判断，不会再触发后续发送
        sending = false
        state.backlog = 0
        state.failCount = 0
        state.lastError = ''
    })

    const flush = () => {
        if (sending || retryTimer || buffer.length === 0) return
        if (pushUrl.value == '') {
            buffer = []
            syncBacklog()
            return
        }
        sending = true
        const gen = generation
        const batch = buffer.splice(0, batchSize)
        syncBacklog()
        const url = pushUrl.value + '/' + roomId.value
        let retryDelay = 0
        axios
            .post(url, { type: batchType, items: batch }, { timeout: PUSH_TIMEOUT })
            .then(() => {
                if (gen !== generation) return
                state.failCount = 0
                state.lastError = ''
                stats.sent += batch.length
            })
            .catch((err) => {
                // 队列已经被清空(停止采集)：失败的这一批直接丢弃
                if (gen !== generation) return
                const status = err?.response?.status
                if (status === 413 && batch.length > 1) {
                    // 请求体过大：减小批量后重发
                    batchSize = Math.max(1, Math.floor(batch.length / 2))
                    buffer.unshift(...batch)
                } else if (status >= 400 && status < 500) {
                    // 后台明确拒绝，重试也不会成功
                    console.error(`${batchType} 推送被拒绝(${status})，丢弃 ${batch.length} 条`)
                    stats.rejected += batch.length
                    stats.lastRejectReason = describeError(err)
                } else {
                    // 网络错误、超时、5xx：放回队列稍后重试
                    state.failCount++
                    state.lastError = describeError(err)
                    buffer.unshift(...batch)
                    retryDelay = Math.min(1000 * state.failCount, 5000)
                }
                syncBacklog()
            })
            .finally(() => {
                // 队列已经被清空：不改动新一轮的状态，也不继续发送
                if (gen !== generation) return
                sending = false
                if (retryDelay > 0) {
                    retryTimer = setTimeout(() => {
                        retryTimer = null
                        flush()
                    }, retryDelay)
                } else {
                    flush()
                }
            })
    }

    return (item: any) => {
        if (!collecting.value) return
        if (!canPush.value) {
            stats.skipped++
            return
        }
        buffer.push(item)
        // 后台长时间不可用时限制积压数量，丢弃最旧的
        if (buffer.length > maxBuffer) {
            const over = buffer.length - maxBuffer
            buffer.splice(0, over)
            stats.dropped += over
        }
        syncBacklog()
        flush()
    }
}

export const pushChat = createPusher('chat_batch', 5000)
export const pushGift = createPusher('gift_batch', 20000)
export const pushLike = createPusher('like_batch', 5000)

// 底栏显示的推送状态：文字固定不变(不放会一直变的数字，免得底栏跳动)，具体数字放在鼠标提示里。
// level：idle 未采集 / ok 正常 / warn 需要注意 / error 推送失败
export const pushStatus = computed(() => {
    if (!collecting.value) {
        return { level: 'idle', text: '推送未开始', detail: '开始采集后，消息会推送给后台' }
    }
    if (!pushUrl.value.trim()) {
        return {
            level: 'warn',
            text: '未设置推送地址',
            detail: '消息不会发给后台，请在设置里填写推送地址',
        }
    }
    if (!useBackend.value) {
        return {
            level: 'idle',
            text: '未使用后台，消息不推送',
            detail: '设置里没有勾选「使用后台」，收到的消息直接丢弃，不发给后台',
        }
    }
    if (!backendRunning.value) {
        return {
            level: 'warn',
            text: '后台没有运行，消息不推送',
            detail:
                '后台停止或没有启动时，收到的消息直接丢弃。启动或重启后台后会自动恢复推送' +
                (stats.skipped ? `。已丢弃 ${stats.skipped} 条` : ''),
        }
    }
    const backlog = queues.reduce((sum, q) => sum + q.backlog, 0)
    const failing = queues.reduce<QueueState | null>(
        (worst, q) => (q.failCount > (worst?.failCount ?? 0) ? q : worst),
        null,
    )
    const extra: string[] = []
    if (stats.rejected) extra.push(`被拒绝 ${stats.rejected} 条`)
    if (stats.dropped) extra.push(`积压过多丢弃 ${stats.dropped} 条`)
    const notes = [
        `已推送 ${stats.sent} 条`,
        backlog ? `待推送 ${backlog} 条` : '',
        ...extra,
        stats.lastRejectReason ? `最近一次拒绝：${stats.lastRejectReason}` : '',
    ]
        .filter(Boolean)
        .join('，')
    if (failing) {
        return {
            level: 'error',
            text: '推送失败，重试中',
            detail: `${failing.lastError}。已重试 ${failing.failCount} 次，${notes}`,
        }
    }
    if (backlog > BACKLOG_WARN) {
        return { level: 'warn', text: '推送积压，后台处理不过来', detail: notes }
    }
    if (extra.length) {
        return {
            level: 'warn',
            text: stats.rejected ? '推送中，有消息被后台拒绝' : '推送中，有消息因积压过多被丢弃',
            detail: notes,
        }
    }
    return {
        level: 'ok',
        text: '推送正常',
        detail: notes,
    }
})
