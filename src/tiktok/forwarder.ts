import axios from 'axios'
import type { TikTokEvent } from './types'

// A queue belongs to one capture session and snapshots its destination.
export class TikTokForwarder {
    private queue: TikTokEvent[] = []
    private sending = false
    private closed = false
    private controller = new AbortController()

    constructor(private url: string, private report: (message: string) => void) {}

    enqueue(event: TikTokEvent) {
        if (this.closed || !this.url) return
        if (this.queue.length >= 2000) {
            this.report('推送积压，部分消息未推送；请检查接收服务')
            return
        }
        this.queue.push(event)
        void this.flush()
    }

    private async flush() {
        if (this.sending || this.closed) return
        this.sending = true
        try {
            while (!this.closed && this.queue.length) {
                const type = this.queue[0].type
                const items: TikTokEvent[] = []
                while (this.queue[0]?.type === type && items.length < 100) items.push(this.queue.shift()!)
                try {
                    await axios.post(this.url, {
                        type: `${type}_batch`, platform: 'tiktok',
                        items: items.map(item => ({ ...item, platform: 'tiktok' })),
                    }, { signal: this.controller.signal, timeout: 10000 })
                } catch {
                    // An ambiguous HTTP timeout must not replay gifts and reward them twice.
                    if (!this.closed) this.report('部分消息推送失败，请检查接收服务；未自动重发以避免重复奖励')
                }
            }
        } finally {
            this.sending = false
        }
    }

    close() {
        this.closed = true
        this.queue = []
        this.controller.abort()
    }
}
