// 抖音采集：websocket 连接和消息解析
import { invoke } from '@tauri-apps/api/tauri'
import { ElMessage } from 'element-plus'
import type { ConnectionConfig } from 'tauri-plugin-websocket-api'
import pako from 'pako'
import { douyin } from '@/proto/dy.js'
import type { LiveInfoImp } from '@/types'
import SocketCli from '@/utils/RustSocket'
import { douyinCookie } from './settings'
import { clearLiveStart, liveInfo, socketStatus } from './state'
import { setRoomLive } from './rooms'
import { onChat, onFollow, onGift, onJoin, onLike } from './handlers'

const USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0'

let socketClient: SocketCli | null = null
const textEncoder = new TextEncoder()

// 连接直播间：带断线检测和自动重连
export const connectDouyin = (liveUrl: string, roomId: string, uniqueId: string, ttwid: string) => {
    // 当前连接参数：重连时可能会被刷新
    const conn = { roomId, uniqueId, ttwid }
    // 每次(重)连接都重新生成签名
    const getConn = () => {
        const sign = window.creatSignature(conn.roomId, conn.uniqueId)
        const fullCookie = douyinCookie.value.trim()
        const socketUrl = `wss://webcast5-ws-web-lf.douyin.com/webcast/im/push/v2/?room_id=${conn.roomId}&compress=gzip&version_code=180800&webcast_sdk_version=1.0.14-beta.0&live_id=1&did_rule=3&user_unique_id=${conn.uniqueId}&identity=audience&signature=${sign}&aid=6383&device_platform=web&browser_language=zh-CN&browser_platform=Win32&browser_name=Mozilla&browser_version=5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36+Edg%2F126.0.0.0`
        const options: ConnectionConfig = {
            // 不要设置 maxWriteBufferSize / maxFrameSize 等，会导致收不到消息
            writeBufferSize: 20000,
            headers: {
                cookie: fullCookie !== '' ? fullCookie : 'ttwid=' + conn.ttwid,
                'user-agent': USER_AGENT,
            },
        }
        return { url: socketUrl, opts: options }
    }
    // 连续重连失败时，重新拉取房间信息：直播结束则停止重连，否则刷新连接参数
    const beforeReconnect = async (attempt: number) => {
        if (attempt < 2) return true
        try {
            const roomJson: LiveInfoImp = await invoke('get_live_html', {
                url: liveUrl,
                cookie: douyinCookie.value.trim() || null,
            })
            const roomInfo = JSON.parse(roomJson.room_info)
            if (roomInfo.id_str && !roomInfo.status) {
                setRoomLive(liveUrl, false)
                ElMessage.warning('直播已结束，停止采集')
                liveInfo.value = { ...liveInfo.value, status: 4 }
                clearLiveStart()
                return false
            }
            if (roomInfo.id_str) {
                conn.roomId = roomInfo.id_str
                conn.uniqueId = roomJson.unique_id
                conn.ttwid = roomJson.ttwid
            }
        } catch (e) {
            // 获取失败(例如网络断开)继续用旧参数重连
            console.error('刷新房间信息失败:', e)
        }
        return true
    }
    const pingMsg = douyin.PushFrame.encode({ payloadType: 'hb' }).finish()
    const client: SocketCli = new SocketCli(getConn, onMessage, pingMsg, {
        onStatus: (status) => {
            // 已经被新的连接取代，不再更新状态
            if (socketClient !== client) return
            socketStatus.value = status
        },
        beforeReconnect,
    })
    socketClient = client
}

export const disconnectDouyin = () => {
    socketClient?.disconnect()
    socketClient = null
}

// 收到 websocket 消息
const onMessage = (msg: any) => {
    const frame = douyin.PushFrame.decode(new Uint8Array(msg.data))
    // 心跳等没有内容的帧直接忽略
    if (!frame.payload || frame.payload.length === 0) return
    const response = douyin.Response.decode(pako.inflate(frame.payload))
    // 需要确认的消息：ack 需要带上 internalExt，否则服务端认为没有确认
    if (response.needAck) {
        const ack = douyin.PushFrame.encode({
            payloadType: 'ack',
            logId: frame.logId,
            payload: textEncoder.encode(response.internalExt || ''),
        }).finish()
        socketClient?.send(ack)
    }
    response.messagesList.forEach((m: any) => {
        // 单条消息解析失败不能影响同一帧里的其他消息
        try {
            dispatchMessage(m.method, m.payload)
        } catch (e) {
            console.error('消息解析失败:', m.method, e)
        }
    })
}

// 按消息类型分发；其他类型(PK 分数、商品、公共文本等)不处理
const dispatchMessage = (method: string, data: Uint8Array) => {
    switch (method) {
        case 'WebcastChatMessage': {
            const { common, user, content } = douyin.ChatMessage.decode(data)
            onChat('douyin', common.msgId.toString(), user, content)
            break
        }
        case 'WebcastGiftMessage': {
            const giftMsg = douyin.GiftMessage.decode(data)
            const { common, user, gift, repeatCount } = giftMsg
            onGift('douyin', {
                id: common.msgId.toString(),
                user,
                gift,
                giftId: (gift?.id ?? giftMsg.giftId).toString(),
                total: parseInt(repeatCount.toString()) || 1,
                repeatEnd: giftMsg.repeatEnd,
                groupId: giftMsg.groupId.toString(),
            })
            break
        }
        case 'WebcastLikeMessage': {
            const { common, user, total, count } = douyin.LikeMessage.decode(data)
            onLike('douyin', common.msgId.toString(), user, parseInt(count.toString()), total as any)
            break
        }
        case 'WebcastMemberMessage': {
            const { common, user } = douyin.MemberMessage.decode(data)
            onJoin('douyin', common.msgId.toString(), user)
            break
        }
        case 'WebcastSocialMessage': {
            // 关注；分享也是这个类型，它的粉丝数是 0，不会覆盖显示的粉丝数
            const { common, user, followCount } = douyin.SocialMessage.decode(data)
            onFollow('douyin', common.msgId.toString(), user, followCount)
            break
        }
        case 'WebcastRoomUserSeqMessage': {
            // 在线人数
            const countMsg = douyin.RoomUserSeqMessage.decode(data)
            liveInfo.value = { ...liveInfo.value, customer: countMsg.onlineUserForAnchor as any }
            break
        }
    }
}
