import WebSocket from 'tauri-plugin-websocket-api'
import { ConnectionConfig } from 'tauri-plugin-websocket-api'

// 连接参数：每次(重)连接都会重新获取，保证签名、cookie 是最新的
export interface SocketConn {
    url: string
    opts: ConnectionConfig
}

export type SocketStatus = 'connected' | 'reconnecting' | 'closed'

export interface SocketHooks {
    // 连接状态变化
    onStatus?: (status: SocketStatus, detail?: string) => void
    // 重连之前调用，返回 false 则停止重连（例如直播已结束）
    beforeReconnect?: (attempt: number) => Promise<boolean>
}

// 建立连接的超时时间
const CONNECT_TIMEOUT = 15000
// 超过这个时间没有收到任何数据，认为连接已经假死，主动重连
const STALE_TIMEOUT = 30000
// 连接状态检查间隔
const WATCHDOG_INTERVAL = 5000
// 连接稳定超过这个时间后，重连退避归零
const STABLE_TIME = 60000
// 重连最大间隔
const MAX_RECONNECT_DELAY = 30000

// WebSocket类对象：带心跳、断线检测、自动重连
class SocketCli {
    // 获取连接参数
    getConn: () => SocketConn
    // websocket实例
    ws: WebSocket | null
    // 收到消息的回调函数：只会收到 Binary 类型的消息
    callBack: (msg: any) => void
    hooks: SocketHooks
    // 心跳链接间隔，默认10秒
    heartbeatInterval: number
    // 心跳定时器
    heartbeatTimer: any
    // 连接检查定时器
    watchdogTimer: any
    // 重连定时器
    reconnectTimer: any
    // 心跳消息：可以自定义
    pingMsg: any
    // 是否已手动关闭：手动关闭后不再重连
    closed: boolean
    // 连接代数：每次(重)连接+1，旧连接的消息一律丢弃，避免新旧连接同时出消息导致重复
    generation: number
    // 最后一次收到数据的时间
    lastActiveAt: number
    // 本次连接建立的时间
    connectedAt: number
    // 连续重连次数
    reconnectAttempts: number

    // 构造函数
    constructor(
        getConn: () => SocketConn,
        callBack: (msg: any) => void,
        pingMsg: any = '',
        hooks: SocketHooks = {}
    ) {
        this.getConn = getConn
        this.ws = null
        this.callBack = callBack
        this.hooks = hooks
        this.heartbeatInterval = 10000
        this.heartbeatTimer = null
        this.watchdogTimer = null
        this.reconnectTimer = null
        this.pingMsg = pingMsg
        this.closed = false
        this.generation = 0
        this.lastActiveAt = 0
        this.connectedAt = 0
        this.reconnectAttempts = 0
        this.connect()
    }

    // 建立连接
    async connect() {
        if (this.closed) return
        const gen = ++this.generation
        try {
            const conn = this.getConn()
            // 插件会改写 headers，每次传一份拷贝
            const opts: ConnectionConfig = {
                ...conn.opts,
                headers: conn.opts.headers
                    ? { ...(conn.opts.headers as Record<string, string>) }
                    : undefined,
            }
            const ws = await this.connectWithTimeout(conn.url, opts)
            // 等待期间已经被关闭或者被新的连接取代
            if (this.closed || gen !== this.generation) {
                ws.disconnect().catch(() => {})
                return
            }
            this.ws = ws
            this.lastActiveAt = Date.now()
            this.connectedAt = Date.now()
            ws.addListener((msg: any) => this.onRawMessage(gen, msg))
            // 是否开启心跳
            this.pingMsg && this.startHeartbeat(gen)
            this.startWatchdog(gen)
            console.log('WebSocket opened')
            this.hooks.onStatus?.('connected')
        } catch (e) {
            console.log('WebSocket connection failed:', e)
            if (!this.closed && gen === this.generation) {
                this.reconnect('连接失败')
            }
        }
    }

    // 带超时的连接：超时后如果连接又成功了，直接关掉，避免残留连接
    connectWithTimeout(url: string, opts: ConnectionConfig): Promise<WebSocket> {
        return new Promise((resolve, reject) => {
            let timedOut = false
            const timer = setTimeout(() => {
                timedOut = true
                reject(new Error('connect timeout'))
            }, CONNECT_TIMEOUT)
            WebSocket.connect(url, opts).then(
                (ws) => {
                    clearTimeout(timer)
                    if (timedOut) {
                        ws.disconnect().catch(() => {})
                    } else {
                        resolve(ws)
                    }
                },
                (e) => {
                    clearTimeout(timer)
                    reject(e)
                }
            )
        })
    }

    // 收到底层消息
    onRawMessage(gen: number, msg: any) {
        // 旧连接的消息全部丢弃
        if (this.closed || gen !== this.generation) return
        if (msg === null || msg === undefined) return
        // 插件会把读取错误序列化成字符串传过来，说明连接已经出问题
        if (typeof msg === 'string') {
            this.reconnect('连接异常: ' + msg)
            return
        }
        this.lastActiveAt = Date.now()
        if (msg.type === 'Close') {
            this.reconnect('服务端关闭连接')
            return
        }
        if (msg.type !== 'Binary') return
        try {
            this.callBack(msg)
        } catch (e) {
            // 单条消息解析失败不能影响后续消息
            console.error('WebSocket message handle error:', e)
        }
    }

    // 发送心跳
    startHeartbeat(gen: number) {
        this.heartbeatTimer = setInterval(() => {
            this.sendRaw(gen, this.pingMsg)
        }, this.heartbeatInterval)
    }

    // 持续检查连接状态
    startWatchdog(gen: number) {
        this.watchdogTimer = setInterval(() => {
            if (this.closed || gen !== this.generation) return
            const now = Date.now()
            if (now - this.lastActiveAt > STALE_TIMEOUT) {
                this.reconnect('长时间未收到数据')
                return
            }
            if (now - this.connectedAt > STABLE_TIME) {
                this.reconnectAttempts = 0
            }
        }, WATCHDOG_INTERVAL)
    }

    // 清理定时器
    clearTimers() {
        clearInterval(this.heartbeatTimer)
        clearInterval(this.watchdogTimer)
        clearTimeout(this.reconnectTimer)
        this.heartbeatTimer = null
        this.watchdogTimer = null
        this.reconnectTimer = null
    }

    // 关闭当前底层连接
    closeCurrent() {
        const ws = this.ws
        this.ws = null
        ws?.disconnect().catch(() => {})
    }

    // 重连：指数退避，1s 2s 4s ... 最大30s
    reconnect(reason: string) {
        if (this.closed || this.reconnectTimer) return
        // 让旧连接失效
        this.generation++
        this.clearTimers()
        this.closeCurrent()
        const attempt = ++this.reconnectAttempts
        const delay = Math.min(
            1000 * Math.pow(2, attempt - 1),
            MAX_RECONNECT_DELAY
        )
        console.log(`WebSocket ${reason}，${delay}ms 后第 ${attempt} 次重连`)
        this.hooks.onStatus?.('reconnecting', reason)
        this.reconnectTimer = setTimeout(async () => {
            this.reconnectTimer = null
            if (this.closed) return
            if (this.hooks.beforeReconnect) {
                let goOn = true
                try {
                    goOn = await this.hooks.beforeReconnect(attempt)
                } catch (e) {
                    console.error('beforeReconnect error:', e)
                }
                if (this.closed) return
                if (!goOn) {
                    this.disconnect()
                    return
                }
            }
            this.connect()
        }, delay)
    }

    // 底层发送：发送失败说明连接已断开，触发重连
    sendRaw(gen: number, data: any) {
        if (this.closed || gen !== this.generation || !this.ws) return
        this.ws.send([...data]).catch((e: any) => {
            if (this.closed || gen !== this.generation) return
            this.reconnect('发送失败: ' + e)
        })
    }

    // 发送消息
    send(data: any) {
        this.sendRaw(this.generation, data)
    }

    // 断开连接：手动断开后不再重连
    disconnect() {
        if (this.closed) return
        this.closed = true
        this.generation++
        this.clearTimers()
        this.closeCurrent()
        this.hooks.onStatus?.('closed')
    }
}

// 导出对象
export default SocketCli
