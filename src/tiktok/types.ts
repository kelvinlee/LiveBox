export interface TikTokUser {
    id: string
    uniqueId: string
    nickName: string
    avatarThumb: { urlListList: string[] }
}
export interface TikTokEvent {
    id: string
    type: 'chat' | 'gift' | 'like'
    user: TikTokUser
    content?: string
    like?: number
    total?: number
    repeatCount?: number
    gift?: { id: string; name: string; diamondCount: number; icon: { urlListList: string[] } }
}
export interface TikTokStream { label: string; format: 'hls' | 'flv'; url: string }
export interface TikTokRoom {
    id: string
    name: string
    title: string
    avatar: string
    viewers: number
    streams: TikTokStream[]
}
export type WorkerMessage =
    | { type: 'status'; state: string; message: string; code?: string }
    | { type: 'room'; room: TikTokRoom }
    | { type: 'stats'; viewers: number }
    | { type: 'video_error'; message: string }
    | { type: 'event'; event: TikTokEvent }
    | { type: 'exit' }
