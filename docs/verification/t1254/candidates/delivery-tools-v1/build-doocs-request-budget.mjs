import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
const sourceSHA = 'fe2393bbb03ccb9fd294a70bd6496d605c84cf05277b8c24a6d680e78cffd375'
const testSHA = 'fed3d3b0bd928f26cfec2f7e216a263006fcd48d9f0234d3c6936e0f305f672e'
const lockSHA = '39783fe46a01a7177590f07745c24bfe3f60e0b4b7ba561346168fb949070d08'
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
function argument(name) { const index = process.argv.indexOf(name); assert.ok(index >= 0 && process.argv[index + 1], name + '必需'); return fs.realpathSync(process.argv[index + 1]) }
const rootIndex = process.argv.indexOf('--root')
const repoRoot = rootIndex >= 0 ? fs.realpathSync(process.argv[rootIndex + 1]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const helperPath = path.join(repoRoot, 'docs/verification/t1246/round-2/unit/owned-pg-runtime.cjs')
assert.equal(sha(fs.readFileSync(helperPath)), '393f88771f732e57959ce948a61104fe616c6090faa3e21808186a6df7df3dea')
const runtime = createRequire(import.meta.url)(helperPath)
assert.equal(process.platform, 'darwin', '此已验复现入口使用macOS隔离器，其他平台须另核隔离消费者')
const sourcesOwnerRoot = argument('--owned-sources-root')
const nativeRoot = argument('--native-source-root')
const staticRoot = argument('--static-source-root')
const manager = argument('--pnpm-executable')
const sourcesIdentity = JSON.parse(fs.readFileSync(path.join(sourcesOwnerRoot, '.t1254-owned.json'), 'utf8'))
function sourceOwner() {
  const stat = fs.lstatSync(sourcesOwnerRoot)
  assert.ok(!stat.isSymbolicLink() && stat.ino === sourcesIdentity.inode && stat.uid === sourcesIdentity.uid && stat.uid === process.getuid() && (stat.mode & 0o077) === 0)
  assert.equal(sourcesIdentity.root, sourcesOwnerRoot)
}
sourceOwner()
const home = process.env.HOME
assert.ok(home && path.isAbsolute(home) && home !== '/')
for (const source of [nativeRoot, staticRoot]) {
  assert.ok(source.startsWith(sourcesOwnerRoot + path.sep) && !source.startsWith(home + path.sep), '须使用HOME外、同一自有根下的两独立已原锁安装源码')
  assert.equal(sha(fs.readFileSync(path.join(source, 'packages/shared/src/utils/fetch.ts'))), sourceSHA)
  assert.equal(sha(fs.readFileSync(path.join(source, 'packages/shared/src/utils/fetch.test.ts'))), testSHA)
  assert.equal(sha(fs.readFileSync(path.join(source, 'pnpm-lock.yaml'))), lockSHA)
  assert.equal(JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8')).packageManager, 'pnpm@12.6.0')
}
assert.notEqual(nativeRoot, staticRoot)
const entry = path.join(repoRoot, 'frontend/public/reference-editors/doocs-md/index.html')
const graph = path.join(staticRoot, 'scripts/creatoros-request-budget-static-delivery.mjs')
assert.ok(fs.statSync(graph).isFile())
const stages = [
  ['manager-version', manager, ['--version'], sourcesOwnerRoot, 120000],
  ['native-wxt-prepare', manager, ['--filter', '@md/web', 'exec', 'wxt', 'prepare'], nativeRoot, 900000],
  ['static-wxt-prepare', manager, ['--filter', '@md/web', 'exec', 'wxt', 'prepare'], staticRoot, 900000],
  ['native-shared-types', manager, ['--filter', '@md/shared', 'run', 'type-check'], nativeRoot, 900000],
  ['static-shared-types', manager, ['--filter', '@md/shared', 'run', 'type-check'], staticRoot, 900000],
  ['native-build', process.execPath, ['scripts/build-native.mjs'], nativeRoot, 3600000],
  ['native-verify', process.execPath, ['scripts/verify-native-build.mjs'], nativeRoot, 900000],
  ['static-build', manager, ['--filter', '@md/web', 'run', 'build'], staticRoot, 3600000],
]
const prepareMs = 120000, graphMs = 900000, afterMs = 120000, lifecycleMs = 2160000
const totalMs = prepareMs + stages.reduce((sum, stage) => sum + stage[4] + lifecycleMs, 0) + graphMs + lifecycleMs + afterMs
const bornAt = performance.now(), control = new AbortController(), timer = setTimeout(() => control.abort(Error('BUILD_ABSOLUTE_DEADLINE')), totalMs)
const stop = () => control.abort(Error('BUILD_INTERRUPTED'))
process.once('SIGINT', stop); process.once('SIGTERM', stop)
const nonce = crypto.randomBytes(16).toString('hex')
const output = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 't1254-two-source-rebuild-' + nonce + '-')))
fs.chmodSync(output, 0o700)
const identity = { task: 'T-1254', nonce, root: output, uid: process.getuid(), inode: fs.statSync(output).ino }
fs.writeFileSync(path.join(output, '.t1254-owned.json'), JSON.stringify(identity), { mode: 0o600 })
const records = []
let passed = false
const write = (name, data) => fs.writeFileSync(path.join(output, name), JSON.stringify(data, null, 2) + '\n')
function deadline() { control.signal.throwIfAborted(); assert.ok(performance.now() - bornAt < totalMs) }
function tree(root, relative = '') {
  const rows = []
  for (const item of fs.readdirSync(path.join(root, relative), { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) {
    const name = path.posix.join(relative, item.name), file = path.join(root, name)
    assert.equal(item.isSymbolicLink(), false)
    if (item.isDirectory()) rows.push(...tree(root, name))
    else { const bytes = fs.readFileSync(file); rows.push({ file: name, size: bytes.length, sha256: sha(bytes) }) }
  }
  return rows
}
try {
  for (const name of ['tmp', 'config', 'data', 'cache', 'logs', 'reports', 'frozen-entry']) fs.mkdirSync(path.join(output, name))
  fs.writeFileSync(path.join(output, 'empty.npmrc'), '')
  fs.copyFileSync(entry, path.join(output, 'frozen-entry/index.html'))
  fs.copyFileSync(path.join(path.dirname(entry), 'favicon.png'), path.join(output, 'frozen-entry/favicon.png'))
  fs.cpSync(path.join(path.dirname(entry), 'assets'), path.join(output, 'frozen-entry/assets'), { recursive: true })
  write('inputs.json', { nativeRoot, staticRoot, sourcesIdentity, node: { file: process.execPath, sha256: sha(fs.readFileSync(process.execPath)) }, manager: { file: manager, sha256: sha(fs.readFileSync(manager)) }, sourceSHA, testSHA, lockSHA, sourceContainedGraphSHA: sha(fs.readFileSync(graph)), noDependencyInstall: true, noSourceOrLockByteMutationIntended: true, noProductionCopy: true })
  const profile = '(version 1) (allow default) (deny file-read* (subpath ' + JSON.stringify(home) + ')) (deny file-write* (subpath ' + JSON.stringify(home) + ')) (deny network*) (allow network-bind network-inbound (local ip "localhost:*")) (allow network-outbound (remote ip "localhost:*"))'
  const profilePath = path.join(output, 'child.sb'); fs.writeFileSync(profilePath, profile)
  const env = { HOME: home, PATH: path.dirname(process.execPath) + ':' + path.dirname(manager) + ':/usr/bin:/bin:/usr/sbin:/sbin', CI: '1', LANG: 'C', LC_ALL: 'C', CREATOROS_EMBED: '1', TMPDIR: path.join(output, 'tmp'), XDG_CONFIG_HOME: path.join(output, 'config'), XDG_DATA_HOME: path.join(output, 'data'), XDG_CACHE_HOME: path.join(output, 'cache'), GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: path.join(output, 'empty.npmrc'), GIT_CONFIG_SYSTEM: path.join(output, 'empty.npmrc') }
  if (Object.hasOwn(process.env, 'CODEX_HOME')) env.CODEX_HOME = process.env.CODEX_HOME
  for (const key of ['NPM_CONFIG_USERCONFIG', 'npm_config_userconfig', 'NPM_CONFIG_GLOBALCONFIG', 'npm_config_globalconfig']) env[key] = path.join(output, 'empty.npmrc')
  const complete = [...stages, ['static-graph', process.execPath, [graph, staticRoot, path.join(output, 'frozen-entry/index.html'), path.join(output, 'static-delivery'), path.join(output, 'reports/static-graph.json')], staticRoot, graphMs]]
  assert.ok(performance.now() - bornAt <= prepareMs)
  for (let index = 0; index < complete.length; index++) {
    deadline(); sourceOwner()
    const required = complete.slice(index).reduce((sum, stage) => sum + stage[4] + lifecycleMs, 0) + afterMs
    assert.ok(totalMs - (performance.now() - bornAt) >= required, '完整future slots才启动下一阶段')
    const [name, program, args, cwd, budgetMs] = complete[index]
    const result = await runtime.boundedProcess('/usr/bin/sandbox-exec', ['-f', profilePath, program, ...args], { cwd, env, signal: control.signal, log: path.join(output, 'logs', name + '.log'), budgetMs })
    records.push({ name, ...result }); write(name + '-exit.json', result)
    assert.ok(result.code === 0 && result.processClosed && !result.budgetExhausted && result.remainingOwnedGroupMembers.length === 0)
    if (name === 'manager-version') assert.equal(fs.readFileSync(result.log, 'utf8').trim(), '12.6.0')
  }
  deadline()
  write('output-inventories.json', { native: tree(path.join(nativeRoot, 'apps/web/dist-native')), static: tree(path.join(output, 'static-delivery')), noProductionCopy: true })
  passed = true
}
catch (error) { write('error.json', { message: error.message, stack: error.stack }) }
finally {
  try { deadline() } catch { passed = false }
  write('summary.json', { passed, nonce, ownedRoot: output, records: records.map(({ name, code, processClosed, remainingOwnedGroupMembers }) => ({ name, code, processClosed, remainingOwnedGroupMembers })), totalMs, outputRetained: true, noProductionCopy: true, noApp: true, noActualPublicOrRequestAcceptanceClaimed: true })
  clearTimeout(timer); process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop)
  console.log(output); process.exitCode = passed ? 0 : 1
}
