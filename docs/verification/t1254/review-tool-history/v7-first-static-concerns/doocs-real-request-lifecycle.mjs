import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import { pathToFileURL } from 'node:url'

// 此驱动只操作本轮已核 owned 源码模块和 loopback，不替换 global fetch。
const modulePath = process.argv[2]
const phase = process.argv[3]
const reportPath = process.argv[4]
assert.ok(modulePath && reportPath && ['red', 'green'].includes(phase))
const { default: service } = await import(pathToFileURL(modulePath).href)
const sourceSha256 = crypto.createHash('sha256').update(fs.readFileSync(modulePath)).digest('hex')
const cases = phase === 'red'
  ? [{ name: '原默认预算应容许31秒完整正文', delayMs: 31_000, expected: 'success' }]
  : [
      { name: '默认预算收到31秒完整正文', delayMs: 31_000, expected: 'success' },
      { name: '默认120秒在完整body上abort', delayMs: 125_000, expected: 'abort' },
      { name: '显式160秒保留130秒完整正文', delayMs: 130_000, timeoutMs: 160_000, expected: 'success' },
    ]
const records = []
let failed = false
for (const definition of cases) {
  const nonce = crypto.randomBytes(16).toString('hex')
  let requests = 0
  let releaseAt = null
  let releaseTimer = null
  const sockets = new Set()
  const server = http.createServer((req, res) => {
    requests++
    assert.equal(req.method, 'POST')
    assert.equal(req.url, '/owned/' + nonce)
    res.writeHead(200, { 'content-type': 'application/json', 'connection': 'close' })
    // 先发送真实响应头，延迟的是完整正文；覆盖 fetch 后的 body 读取寿命。
    res.flushHeaders()
    releaseTimer = setTimeout(() => {
      releaseAt = performance.now()
      res.end(JSON.stringify({ nonce, kind: 'owned-loopback-complete-body' }))
    }, definition.delayMs)
  })
  server.on('connection', socket => {
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const endpoint = 'http://127.0.0.1:' + server.address().port + '/owned/' + nonce
  const bornAt = performance.now()
  let value = null
  let error = null
  let assertionError = null
  let elapsedMs = null
  let listenerClosed = false
  try {
    const config = definition.timeoutMs === undefined ? {} : { timeout: definition.timeoutMs }
    try { value = await service.post(endpoint, { nonce }, config) }
    catch (caught) { error = { name: caught?.name, message: caught?.message } }
    elapsedMs = performance.now() - bornAt
    assert.equal(requests, 1, '单调用只发送原一次请求，无retry')
    if (definition.expected === 'success') {
      assert.equal(error, null, '合法完整正文应成功')
      assert.deepEqual(value, { nonce, kind: 'owned-loopback-complete-body' })
      assert.ok(releaseAt !== null && releaseAt - bornAt >= definition.delayMs - 100)
      assert.ok(elapsedMs >= definition.delayMs - 100)
    }
    else {
      assert.equal(error?.name, 'AbortError')
      assert.equal(value, null)
      assert.ok(elapsedMs >= 119_500, '原120秒出生预算无续期')
      assert.equal(releaseAt, null, '到deadline时未伪造完整正文')
    }
  }
  catch (caught) { failed = true; assertionError = { name: caught.name, message: caught.message } }
  finally {
    clearTimeout(releaseTimer)
    for (const socket of sockets) socket.destroy()
    server.closeAllConnections()
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    listenerClosed = !server.listening
  }
  records.push({ ...definition, nonce, endpoint, requests, elapsedMs, bodyReleaseElapsedMs: releaseAt === null ? null : releaseAt - bornAt, value, error, assertionError, listenerClosed, remainingSockets: sockets.size })
}
fs.writeFileSync(reportPath, JSON.stringify({ task: 'T-1254', phase, modulePath, sourceSha256, records, expectedRed: phase === 'red', passed: !failed, noGlobalFetchOverride: true, actualLoopback: true, noOfficialModelOrApp: true }, null, 2) + '\n')
process.exitCode = failed ? 1 : 0
