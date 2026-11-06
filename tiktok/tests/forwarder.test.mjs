import assert from 'node:assert/strict'
import { once } from 'node:events'
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const root = path.resolve(import.meta.dirname, '../..')
const output = path.join(root, '.build/tests/forwarder.mjs')
await fs.mkdir(path.dirname(output), { recursive: true })
const source = await fs.readFile(path.join(root, 'src/tiktok/forwarder.ts'), 'utf8')
await fs.writeFile(output, ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020 } }).outputText)
const { TikTokForwarder } = await import(pathToFileURL(output).href)
const user = { id: '9007199254740993', uniqueId: 'viewer', nickName: '观众', avatarThumb: { urlListList: [] } }

test('forwards chat, final gifts and like deltas with session-scoped destination', async () => {
    const received = []
    const server = http.createServer(async (req, res) => {
        let body = ''
        for await (const chunk of req) body += chunk
        received.push({ path: req.url, body: JSON.parse(body) })
        res.end('ok')
    }).listen(0, '127.0.0.1')
    await once(server, 'listening')
    const errors = []
    const forwarder = new TikTokForwarder(`http://127.0.0.1:${server.address().port}/events/game-1`, message => errors.push(message))
    try {
        forwarder.enqueue({ id: '1', type: 'chat', user, content: '你好' })
        forwarder.enqueue({ id: '2', type: 'gift', user, gift: { id: '5655', name: 'Rose', diamondCount: 1 }, repeatCount: 5 })
        forwarder.enqueue({ id: '3', type: 'like', user, like: 2, total: 100 })
        for (let n = 0; n < 100 && received.length < 3; n++) await new Promise(resolve => setTimeout(resolve, 10))
        assert.deepEqual(received.map(r => r.body.type), ['chat_batch', 'gift_batch', 'like_batch'])
        assert.ok(received.every(r => r.path === '/events/game-1' && r.body.platform === 'tiktok'))
        assert.equal(received[1].body.items[0].repeatCount, 5)
        assert.equal(received[0].body.items[0].user.id, '9007199254740993')
        assert.equal(received[2].body.items[0].like, 2)
        assert.deepEqual(errors, [])
        forwarder.close()
        forwarder.enqueue({ id: '4', type: 'chat', user, content: 'stale' })
        await new Promise(resolve => setTimeout(resolve, 30))
        assert.equal(received.length, 3)
    } finally {
        forwarder.close()
        server.closeAllConnections()
        await new Promise(resolve => server.close(resolve))
    }
})

test('stopping aborts in-flight requests and discards queued gifts', async () => {
    let requests = 0
    const server = http.createServer((_req, _res) => { requests++ }).listen(0, '127.0.0.1')
    await once(server, 'listening')
    const errors = []
    const forwarder = new TikTokForwarder(`http://127.0.0.1:${server.address().port}/room`, message => errors.push(message))
    try {
        forwarder.enqueue({ id: '1', type: 'chat', user, content: 'test' })
        for (let n = 0; n < 100 && !requests; n++) await new Promise(resolve => setTimeout(resolve, 10))
        forwarder.enqueue({ id: '2', type: 'gift', user, repeatCount: 5 })
        forwarder.close()
        await new Promise(resolve => setTimeout(resolve, 50))
        assert.equal(requests, 1)
        assert.deepEqual(errors, [])
    } finally {
        forwarder.close()
        server.closeAllConnections()
        await new Promise(resolve => server.close(resolve))
    }
})
