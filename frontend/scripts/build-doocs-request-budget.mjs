import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
const born = performance.now(), wallBorn = Date.now()
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const machOMagic = new Set(['feedface','cefaedfe','feedfacf','cffaedfe','cafebabe','bebafeca','cafebabf','bfbafeca'])
function arg(name) { const i = process.argv.indexOf(name); assert.ok(i >= 0 && process.argv[i + 1], name + '必需'); return process.argv[i + 1] }
const repo = fs.realpathSync(process.argv.includes('--root') ? arg('--root') : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'))
const helper = path.join(repo, 'docs/verification/t1246/round-2/unit/owned-pg-runtime.cjs')
const helperSHA = '393f88771f732e57959ce948a61104fe616c6090faa3e21808186a6df7df3dea'
assert.equal(process.platform, 'darwin', '此入口仅复现已核macOS隔离消费者')
assert.equal(sha(fs.readFileSync(helper)), helperSHA)
const control = new AbortController()
let lastWall = wallBorn, limit = 3600000, inherited = Infinity, output, timer, watch, binding, afterWritten = false, records = [], generatedScopes = [], passed = false
function deadline() { const now = Date.now(); assert.ok(now >= lastWall, '系统时钟回退'); lastWall = now; control.signal.throwIfAborted(); assert.ok(now < inherited && performance.now() - born < limit, '原期限／单出生期限耗尽') }
function fileRow(file) {
  deadline(); const stat = fs.lstatSync(file), row = { file, mode: stat.mode & 0o777, uid: stat.uid }
  function bytesAt(target) { const bytes = fs.readFileSync(target); row.size = bytes.length; row.sha256 = sha(bytes); const magic = bytes.subarray(0,4).toString('hex'); if (machOMagic.has(magic)) row.machOMagic = magic }
  if (stat.isSymbolicLink()) {
    row.link = fs.readlinkSync(file); row.resolved = fs.realpathSync(file)
    const target = fs.statSync(row.resolved); row.targetKind = target.isDirectory() ? 'directory' : 'file'
    assert.ok(target.isDirectory() || target.isFile())
    if (target.isFile()) bytesAt(row.resolved)
  } else { assert.ok(stat.isFile()); bytesAt(file); assert.equal(fs.realpathSync(file), file) }
  return row
}
function tree(root) {
  const rows = []
  function walk(directory) { deadline(); for (const item of fs.readdirSync(directory, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) { const file = path.join(directory, item.name); if (item.isDirectory()) walk(file); else rows.push(fileRow(file)) } }
  walk(root); return rows
}
function owner(identity) { const stat = fs.lstatSync(identity.root), marker = read(path.join(identity.root, '.t1254-owned.json')); assert.ok(stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === identity.uid && stat.uid === process.getuid() && stat.ino === identity.inode && (stat.mode & 0o077) === 0); assert.equal(fs.realpathSync(identity.root), identity.root); assert.equal(marker.nonce, identity.nonce); assert.equal(marker.inode, identity.inode) }
function guardedPath(root, relative) { assert.ok(relative && !path.isAbsolute(relative)); const file = path.resolve(root, relative); assert.ok(file.startsWith(root + path.sep)); return file }
function sourceFileSet(root) {
  const rows = [], generated = new Set(['apps/web/.wxt','apps/web/dist','apps/web/dist-native'])
  function walk(directory, relative = '') {
    deadline()
    for (const item of fs.readdirSync(directory,{withFileTypes:true})) {
      const name = path.posix.join(relative,item.name)
      if (item.isDirectory()) { if (item.name !== 'node_modules' && !generated.has(name)) walk(path.join(directory,item.name),name) }
      else { assert.ok(item.isFile() || item.isSymbolicLink()); rows.push(name) }
    }
  }
  walk(root); return rows.sort()
}
function scopeGuard(scope, binding) {
  assert.ok(scope.kind === 'source' || scope.kind === 'manager')
  assert.equal(scope.boundary,scope.kind === 'source' ? binding.owner.root : binding.managerToolsRoot)
  assert.ok(scope.root === scope.boundary || scope.root.startsWith(scope.boundary + path.sep))
  assert.equal(fs.realpathSync(scope.root),scope.root)
  const actual = tree(scope.root)
  assert.deepEqual(actual,scope.rows,'完整依赖文件集漂移：' + scope.root)
  for (const row of actual) if (row.link) assert.ok(row.resolved.startsWith(scope.boundary + path.sep),'依赖链接不得越出同归属根：' + row.file)
  return actual
}
function rootCoverage(binding) {
  const roots = new Set(binding.dynamic.rootMachOFiles)
  for (const file of [binding.node,binding.manager]) assert.ok(roots.has(fs.realpathSync(file)),'实际主执行入口须在递归dyld根中：' + file)
  for (const scope of binding.scopes) for (const row of scope.rows) if (row.machOMagic) assert.ok(roots.has(row.resolved ?? row.file),'实际Mach-O依赖须在递归dyld根中：' + row.file)
}
function dynamicGuard(dynamic) {
  for (const expected of [...dynamic.nonSystemFiles, ...dynamic.symlinkChain]) {
    const actual = fileRow(expected.file)
    for (const key of ['mode','uid','size','sha256','link','resolved','targetKind']) if (expected[key] !== undefined) assert.equal(actual[key], expected[key], '实际dyld闭包：' + expected.file + ':' + key)
  }
  for (const edge of dynamic.edges) { deadline(); if (edge.name.startsWith('@rpath/')) assert.equal(edge.rpathAttempts.find(file => fs.existsSync(file)), edge.resolvedRequestedPath, 'dyld首个存在候选保持'); assert.equal(fs.realpathSync(edge.resolvedRequestedPath), edge.realpath) }
}
function bindingGuard(binding) {
  deadline(); owner(binding.owner)
  assert.equal(fs.realpathSync(process.execPath), binding.node)
  for (const expected of binding.rows) assert.deepEqual(fileRow(expected.file), expected, '完整输入字节／模式／链接漂移：' + expected.file)
  for (const scope of binding.scopes) scopeGuard(scope,binding)
  for (const scope of generatedScopes) assert.deepEqual(tree(scope.root), scope.rows, '前一真实prepare生成输入漂移：' + scope.root)
  dynamicGuard(binding.dynamic)
  rootCoverage(binding)
  for (const role of ['native','static']) { const source = binding.sources[role]; assert.ok(source.root.startsWith(binding.owner.root + path.sep)); assert.deepEqual(sourceFileSet(source.root),source.files.map(row => row.file).sort(),'归档之外新增／缺失源码不得进入构建：' + role); for (const expected of source.files) { const actual = fileRow(guardedPath(source.root, expected.file)); if (expected.link) assert.equal(actual.link, expected.link); else { assert.equal(actual.sha256, expected.sha256); assert.equal(actual.size, expected.size); assert.equal(actual.mode, expected.mode) } } }
}
const stop = () => control.abort(Error('构建已取消，保留原nonce，不重发'))
process.once('SIGINT', stop); process.once('SIGTERM', stop)
const write = (name, value) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
try {
  const mode = process.argv.includes('--execute') ? 'execute' : 'prepare'
  if (mode === 'prepare') {
    inherited = Date.parse(arg('--inherited-deadline')); assert.ok(Number.isFinite(inherited) && inherited - Date.now() >= 3600000,'原剩余期限须覆盖完整只读prepare槽')
    const sourceOwner = fs.realpathSync(arg('--owned-sources-root')), identity = read(path.join(sourceOwner, '.t1254-owned.json')); assert.equal(identity.root, sourceOwner); owner(identity)
    const native = fs.realpathSync(arg('--native-source-root')), statik = fs.realpathSync(arg('--static-source-root')), manager = fs.realpathSync(arg('--pnpm-executable'))
    assert.notEqual(native, statik)
    const manifestFile = fs.realpathSync(arg('--manifest')), descriptor = read(manifestFile)['doocs-md']
    const dynamicFile = fs.realpathSync(arg('--dyld-manifest')), dynamic = read(dynamicFile)
    assert.equal(dynamic.fixedNode, fs.realpathSync(process.execPath)); assert.ok(dynamic.nonSystemFiles.length && dynamic.rootMachOFiles.includes(dynamic.fixedNode))
    const sources = {}, scopeRoots = new Set(), rows = [fileRow(fileURLToPath(import.meta.url)), fileRow(helper), fileRow(manifestFile), fileRow(dynamicFile)]
    for (const [role, root] of [['native',native],['static',statik]]) {
      assert.ok(root.startsWith(sourceOwner + path.sep) && !root.startsWith(process.env.HOME + path.sep))
      const inventoryFile = fs.realpathSync(arg('--' + role + '-installed-manifest')), installed = read(inventoryFile)
      assert.equal(installed.sourceRoot, root); assert.ok(installed.files.length > 1000 && installed.ignoreScripts && installed.ignorePnpmfile)
      rows.push(fileRow(inventoryFile)); assert.ok(descriptor[role].sourceFiles.length > 700)
      sources[role] = { root, files: descriptor[role].sourceFiles }
      for (const sourceFile of sources[role].files) rows.push(fileRow(guardedPath(root,sourceFile.file)))
      for (const entry of installed.files) {
        const parts = entry.file.split('/'), index = parts.indexOf('node_modules')
        if (index >= 0) scopeRoots.add(path.join(root, ...parts.slice(0, index + 1)))
      }
      assert.equal(JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).packageManager, 'pnpm@12.6.0')
    }
    const toolRoot = fs.realpathSync(arg('--manager-tools-root')); assert.ok(manager.startsWith(toolRoot + path.sep) && !toolRoot.startsWith(process.env.HOME + path.sep)); scopeRoots.add(toolRoot)
    const publicRoot = path.join(repo,'frontend/public/reference-editors'), editorRoot = path.join(publicRoot,'doocs-md')
    const entry = path.join(editorRoot,'index.html'); rows.push(fileRow(entry))
    for (const file of Object.keys(descriptor.static.frozenRootFiles)) rows.push(fileRow(guardedPath(editorRoot,file)))
    for (const role of ['native','static']) for (const key of ['sourceArchive','patch']) { const file = guardedPath(publicRoot,descriptor[role][key]); const row = fileRow(file); assert.equal(row.sha256, descriptor[role][key + 'Sha256']); rows.push(row) }
    const fixed = fileRow(guardedPath(publicRoot,descriptor.static.fixedBaseArchive)); assert.equal(fixed.sha256, descriptor.static.fixedBaseSha256); rows.push(fixed)
    for (const file of [process.execPath, manager, '/usr/bin/sandbox-exec']) rows.push(fileRow(fs.realpathSync(file)))
    binding = { task:'T-1254', schema:1, owner:identity, node:fs.realpathSync(process.execPath), manager, managerToolsRoot:toolRoot, sources, entry, manifestFile, inheritedDeadline:new Date(inherited).toISOString(), createdAt:new Date(wallBorn).toISOString(), dynamic, rows:[...new Map(rows.map(row => [row.file,row])).values()], scopes:[...scopeRoots].sort().map(root => ({root,kind:root === toolRoot ? 'manager' : 'source',boundary:root === toolRoot ? toolRoot : sourceOwner,rows:tree(root)})), noInstall:true, noProductCopy:true, noApp:true }
    bindingGuard(binding)
    output = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'t1254-rebuild-prepare-'))); fs.chmodSync(output,0o700)
    write('binding.json',binding); write('prepare.json',{ passed:true, prepareOnly:true, noDownloadedCodeExecuted:true, bindingSHA:sha(fs.readFileSync(path.join(output,'binding.json'))), fullRows:binding.rows.length + binding.scopes.reduce((sum,scope) => sum + scope.rows.length,0), inheritedDeadline:binding.inheritedDeadline }); passed = true
  } else {
    const bindingFile = fs.realpathSync(arg('--binding')); assert.equal(sha(fs.readFileSync(bindingFile)),arg('--binding-sha256')); binding = read(bindingFile)
    const review = read(fs.realpathSync(arg('--review')))
    assert.ok(review.approved && review.task === 'T-1254' && review.scope === 'DOOCS_TWO_SOURCE_REBUILD_EXACT_BINDING'); assert.equal(review.bindingSha256,sha(fs.readFileSync(bindingFile))); assert.equal(review.toolSha256,sha(fs.readFileSync(fileURLToPath(import.meta.url))))
    assert.equal(binding.task,'T-1254'); assert.equal(binding.schema,1); inherited = Date.parse(binding.inheritedDeadline); assert.ok(wallBorn >= Date.parse(binding.createdAt) && inherited > wallBorn)
    const n = binding.sources.native.root, s = binding.sources.static.root, manager = binding.manager, lifecycle = 2160000, prepareMs = 3600000, afterMs = 3600000
    const graph = path.join(s,'scripts/creatoros-request-budget-static-delivery.mjs')
    const stages = [['manager-version',manager,['--version'],binding.owner.root,120000],['native-wxt-prepare',manager,['--filter','@md/web','exec','wxt','prepare'],n,900000],['static-wxt-prepare',manager,['--filter','@md/web','exec','wxt','prepare'],s,900000],['native-shared-types',manager,['--filter','@md/shared','run','type-check'],n,900000],['static-shared-types',manager,['--filter','@md/shared','run','type-check'],s,900000],['native-build',binding.node,['scripts/build-native.mjs'],n,3600000],['native-verify',binding.node,['scripts/verify-native-build.mjs'],n,900000],['static-build',manager,['--filter','@md/web','run','build'],s,3600000]]
    limit = Math.min(prepareMs + afterMs + stages.reduce((sum,stage) => sum + stage[4] + lifecycle,0) + 900000 + lifecycle, inherited - wallBorn)
    assert.ok(limit >= 120000,'原剩余期限不足最短正执行槽，禁止启动timer和输入执行')
    timer = setTimeout(() => control.abort(Error('构建绝对期限耗尽')),limit); watch = setInterval(() => { try { deadline() } catch(error) { control.abort(error) } },1000)
    bindingGuard(binding); assert.ok(performance.now() - born < prepareMs)
    output = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'t1254-rebuild-' + crypto.randomBytes(16).toString('hex') + '-'))); fs.chmodSync(output,0o700)
    const identity = { root:output,uid:process.getuid(),inode:fs.statSync(output).ino,nonce:crypto.randomBytes(16).toString('hex') }; write('.t1254-owned.json',identity)
    for (const name of ['tmp','config','data','cache','logs','reports','frozen-entry']) fs.mkdirSync(path.join(output,name))
    fs.writeFileSync(path.join(output,'empty.npmrc'),'')
    fs.copyFileSync(binding.entry,path.join(output,'frozen-entry/index.html'))
    const descriptor = read(binding.manifestFile)['doocs-md'].static
    for (const relative of Object.keys(descriptor.frozenRootFiles)) { const target = guardedPath(path.join(output,'frozen-entry'),relative); fs.mkdirSync(path.dirname(target),{recursive:true}); fs.copyFileSync(guardedPath(path.dirname(binding.entry),relative),target) }
    const home = process.env.HOME; assert.ok(home && path.isAbsolute(home) && home !== '/')
    const profile = '(version 1) (allow default) (deny file-read* (subpath ' + JSON.stringify(home) + ')) (deny file-write* (subpath ' + JSON.stringify(home) + ')) (deny network*) (allow network-bind network-inbound (local ip "localhost:*")) (allow network-outbound (remote ip "localhost:*"))'
    const profileFile = path.join(output,'child.sb'); fs.writeFileSync(profileFile,profile)
    const env = { HOME:home,PATH:path.dirname(binding.node) + ':' + path.dirname(manager) + ':/usr/bin:/bin:/usr/sbin:/sbin',CI:'1',LANG:'C',LC_ALL:'C',CREATOROS_EMBED:'1',TMPDIR:path.join(output,'tmp'),XDG_CONFIG_HOME:path.join(output,'config'),XDG_DATA_HOME:path.join(output,'data'),XDG_CACHE_HOME:path.join(output,'cache'),GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:path.join(output,'empty.npmrc'),GIT_CONFIG_SYSTEM:path.join(output,'empty.npmrc') }
    if (Object.hasOwn(process.env,'CODEX_HOME')) env.CODEX_HOME = process.env.CODEX_HOME
    for (const key of ['NPM_CONFIG_USERCONFIG','npm_config_userconfig','NPM_CONFIG_GLOBALCONFIG','npm_config_globalconfig']) env[key] = path.join(output,'empty.npmrc')
    stages.push(['static-graph',binding.node,[graph,s,path.join(output,'frozen-entry/index.html'),path.join(output,'static-delivery'),path.join(output,'reports/static-graph.json')],s,900000])
    write('source-before.json',{bindingSha256:sha(fs.readFileSync(bindingFile)),review,noInstall:true,noProductCopy:true})
    const runtime = createRequire(import.meta.url)(helper)
    for (let index = 0; index < stages.length; index++) {
      deadline(); owner(identity); bindingGuard(binding)
      const required = stages.slice(index).reduce((sum,stage) => sum + stage[4] + lifecycle,0) + afterMs
      assert.ok(Math.min(limit - (performance.now() - born), inherited - Date.now()) >= required,'剩余完整串行正执行／清理槽才可启动')
      const [name,program,args,cwd,budgetMs] = stages[index]
      write(name + '-command.json',{program:'/usr/bin/sandbox-exec',args:['-f',profileFile,program,...args],cwd,budgetMs})
      let result
      try { result = await runtime.boundedProcess('/usr/bin/sandbox-exec',['-f',profileFile,program,...args],{cwd,env,signal:control.signal,log:path.join(output,'logs',name + '.log'),budgetMs}) }
      catch(error) { write(name + '-unclosed.json',{noClosureReceipt:true,error:error.message,privateLogRetained:true}); throw error }
      records.push({name,...result}); write(name + '-exit.json',result)
      assert.ok(result.processClosed && result.remainingOwnedGroupMembers.length === 0,'真实进程组关闭')
      const bytes = fs.readFileSync(path.join(output,'logs',name + '.log')); write(name + '-log-sha.json',{sha256:sha(bytes),size:bytes.length,processClosed:true,helperFdClosedBeforeReceipt:true})
      assert.ok(result.code === 0 && !result.budgetExhausted && !result.outerAbort)
      if (name === 'manager-version') assert.equal(bytes.toString('utf8').trim(),'12.6.0')
      if (name === 'native-wxt-prepare' || name === 'static-wxt-prepare') { const root = path.join(cwd,'apps/web/.wxt'); const generated = {root,rows:tree(root),actualClosedPrepare:name}; generatedScopes.push(generated); write(name + '-generated-inputs.json',generated) }
    }
    const afterBorn = performance.now(); bindingGuard(binding)
    write('source-after.json',{boundInputsUnchanged:true,bindingSha256:sha(fs.readFileSync(bindingFile)),nativeOutput:tree(path.join(n,'apps/web/dist-native')),staticOutput:tree(path.join(output,'static-delivery')),noAcceptanceOrBrowserClaim:true})
    afterWritten = true
    deadline(); assert.ok(performance.now() - afterBorn < afterMs); passed = true
  }
} catch(error) { if (output) write('error.json',{message:error.message,stack:error.stack}); else console.error(error.stack) }
finally {
  if (output && binding && !afterWritten) { try { bindingGuard(binding); write('source-after.json',{boundInputsUnchanged:true,fullBindingRechecked:true,allFailureReceiptsRetained:true}); afterWritten = true } catch(error) { passed = false; write('source-after-error.json',{message:error.message,stack:error.stack}) } }
  try { deadline() } catch { passed = false }
  if (output) write('summary.json',{passed,startedAt:new Date(wallBorn).toISOString(),elapsedMs:performance.now() - born,inheritedDeadline:Number.isFinite(inherited) ? new Date(inherited).toISOString() : null,records,outputRetained:true,noInstall:true,noProductCopy:true,noApp:true})
  clearTimeout(timer); clearInterval(watch); process.removeListener('SIGINT',stop); process.removeListener('SIGTERM',stop)
  if (output) console.log(output)
  process.exitCode = passed ? 0 : 1
}
