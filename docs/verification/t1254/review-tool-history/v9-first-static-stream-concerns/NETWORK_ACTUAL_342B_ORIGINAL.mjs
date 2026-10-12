import assert from 'node:assert/strict'
import fs from 'node:fs'
import net from 'node:net'
import crypto from 'node:crypto'

const reportPath = process.argv[2]
assert.ok(reportPath)
const nonce = crypto.randomBytes(16).toString('hex')
const sockets = new Set()
const server = net.createServer(socket => {
  sockets.add(socket)
  socket.on('error', () => {})
  socket.once('close', () => sockets.delete(socket))
  socket.once('data', bytes => {
    assert.equal(bytes.toString(), nonce)
    socket.end(nonce)
  })
})
let loopback = null
let external = null
let listenerClosed = false
let setupTimer = null
let closeTimer = null
try {
  await new Promise((resolve, reject) => {
    setupTimer = setTimeout(() => reject(new Error('owned listener setup original120s deadline')), 120_000)
    server.once('error', error => { clearTimeout(setupTimer); reject(error) })
    server.listen(0, '127.0.0.1', () => { clearTimeout(setupTimer); resolve() })
  })
  loopback = await new Promise((resolve, reject) => {
    const born = performance.now()
    const socket = net.createConnection({ host: '127.0.0.1', port: server.address().port })
    sockets.add(socket)
    const chunks = []
    const timer = setTimeout(() => { socket.destroy(); reject(new Error('owned loopback probe absolute deadline')) }, 120_000)
    socket.once('connect', () => socket.write(nonce))
    socket.on('data', chunk => chunks.push(chunk))
    socket.once('error', reject)
    socket.once('close', () => {
      clearTimeout(timer)
      sockets.delete(socket)
      resolve({ address: '127.0.0.1', port: server.address().port, bytes: Buffer.concat(chunks).toString(), elapsedMs: performance.now() - born })
    })
  })
  assert.equal(loopback.bytes, nonce)
  // TEST-NET-1只用于验证OS应在connect处拒绝；不解析域名或调用任何服务。
  external = await new Promise((resolve, reject) => {
    const born = performance.now()
    const socket = net.createConnection({ host: '192.0.2.1', port: 9 })
    sockets.add(socket)
    let refusal = null
    const timer = setTimeout(() => { socket.destroy(); reject(new Error('non-loopback policy refusal not proven within original120s')) }, 120_000)
    socket.once('connect', () => { socket.destroy(); reject(new Error('sandbox unexpectedly allowed non-loopback connection')) })
    socket.once('error', error => { refusal = { name: error.name, code: error.code, message: error.message } })
    socket.once('close', () => {
      clearTimeout(timer)
      sockets.delete(socket)
      resolve({ address: '192.0.2.1', port: 9, refusal, elapsedMs: performance.now() - born, socketClosed: true })
    })
  })
  assert.ok(['EPERM', 'EACCES'].includes(external.refusal?.code), '必须是实际OS policy拒绝，不能把网络超时/不可达当隔离通过')
}
finally {
  clearTimeout(setupTimer)
  for (const socket of sockets) socket.destroy()
  if (server.listening) await new Promise((resolve, reject) => {
    closeTimer = setTimeout(() => reject(new Error('owned listener close original120s deadline')), 120_000)
    server.close(error => { clearTimeout(closeTimer); error ? reject(error) : resolve() })
  })
  clearTimeout(closeTimer)
  listenerClosed = !server.listening
}
assert.equal(listenerClosed, true)
assert.equal(sockets.size, 0)
fs.writeFileSync(reportPath, JSON.stringify({ task: 'T-1254', nonce, loopback, external, listenerClosed, remainingSockets: sockets.size, setupBudgetMs: 120_000, loopbackBudgetMs: 120_000, refusalBudgetMs: 120_000, closeBudgetMs: 120_000, passed: true, noDNS: true, noOfficialModelOrApp: true }, null, 2) + '\n')
