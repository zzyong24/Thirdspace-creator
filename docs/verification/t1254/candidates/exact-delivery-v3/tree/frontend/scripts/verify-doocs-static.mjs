import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
const BASE = '/reference-editors/doocs-md/'
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
function owned(base, relative) {
  assert.ok(typeof relative === 'string' && relative && !path.isAbsolute(relative))
  const target = path.resolve(base, relative)
  assert.ok(target.startsWith(base + path.sep), '交付路径须属于明确根目录')
  return target
}
async function inventory(root, relative = '') {
  const rows = []
  for (const item of await fs.readdir(ownedDirectory(root, relative), { withFileTypes: true })) {
    assert.equal(item.isSymbolicLink(), false, '交付不跟随符号链接')
    const name = path.posix.join(relative, item.name)
    if (item.isDirectory()) rows.push(...await inventory(root, name))
    else { assert.ok(item.isFile()); rows.push(name) }
  }
  return rows.sort()
}
function ownedDirectory(root, relative) { return relative ? owned(root, relative) : root }
function strip(node) { while (node && ts.isParenthesizedExpression(node)) node = node.expression; return node }
function string(node) { node = strip(node); return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : null }
// SEMANTIC_BOUNDARY_ALLOW: 仅校验实际资源路径、AST协议、字节及CSP；不判断创作内容。
export async function verifyDoocsStatic({ repoRoot, manifest: suppliedManifest } = {}) {
  assert.ok(repoRoot && path.isAbsolute(repoRoot), '须传入项目绝对根')
  repoRoot = await fs.realpath(repoRoot)
  const publicRoot = path.join(repoRoot, 'frontend/public/reference-editors')
  const root = path.join(publicRoot, 'doocs-md')
  const manifest = suppliedManifest ?? JSON.parse(await fs.readFile(path.join(repoRoot, 'reference-editors/manifest.json'), 'utf8'))
  const descriptor = manifest['doocs-md']?.static
  assert.ok(descriptor && descriptor.deliveryMode === 'static', 'Doocs static完整交付清单必需')
  const actual = await inventory(path.join(root, 'static'))
  assert.deepEqual(actual, Object.keys(descriptor.bundleFiles).sort(), 'static整套文件集一致')
  for (const name of actual) assert.equal(sha(await fs.readFile(owned(path.join(root, 'static'), name))), descriptor.bundleFiles[name], 'static实际摘要：' + name)
  const html = await fs.readFile(path.join(root, 'index.html'), 'utf8')
  assert.equal(sha(html), descriptor.entrySha256, '真实root HTML摘要')
  const policy = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"\s*\/?>/i.exec(html)?.[1]
  assert.equal(policy, descriptor.preservedCsp, '原全部CSP字节一致')
  assert.ok(policy?.split(';').map(value => value.trim()).includes("connect-src 'none'"))
  assert.equal(/<script\b(?![^>]*\bsrc\s*=)[^>]*>\s*\S/i.test(html), false, 'self策略不执行inline脚本')
  for (const [name, expected] of Object.entries(descriptor.frozenRootFiles)) {
    assert.ok(name === 'favicon.png' || name.startsWith('assets/'), '仅既有冻结root资源')
    assert.equal(sha(await fs.readFile(owned(root, name))), expected, '冻结root资源字节不变')
  }
  for (const [name, expected] of [[descriptor.sourceArchive, descriptor.sourceArchiveSha256], [descriptor.patch, descriptor.patchSha256], [descriptor.fixedBaseArchive, descriptor.fixedBaseSha256]]) assert.equal(sha(await fs.readFile(owned(publicRoot, name))), expected, '源码／补丁／固定a7实际摘要：' + name)
  const checked = []
  async function reference(value, from, kind) {
    if (!value || /^(?:data:|blob:|#)/.test(value)) return
    assert.equal(/^(?:https?:)?\/\//.test(value), false, '不得外链加载资源：' + value)
    const clean = decodeURIComponent(value.split(/[?#]/)[0])
    const target = clean.startsWith(BASE) ? owned(root, clean.slice(BASE.length)) : clean.startsWith('/') ? null : path.resolve(path.dirname(from), clean)
    assert.ok(target && target.startsWith(root + path.sep), '本套资源图归属：' + value)
    const relative = path.relative(root, target).split(path.sep).join('/')
    assert.ok(relative.startsWith('static/') || Object.hasOwn(descriptor.frozenRootFiles, relative), '非static须是明确冻结root资源')
    const stat = await fs.lstat(target)
    assert.ok(stat.isFile() && !stat.isSymbolicLink(), '引用是真实本地文件：' + value)
    checked.push({ kind, from: path.relative(root, from), reference: value, file: relative })
  }
  for (const match of html.matchAll(/<(?:script|link|img)\b[^>]*\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) await reference(match[1], path.join(root, 'index.html'), 'html')
  for (const match of html.matchAll(/url\(\s*["']?([^"')\s]+)/gi)) await reference(match[1], path.join(root, 'index.html'), 'html-css')
  let parsedJs = 0
  for (const name of actual) {
    const file = owned(path.join(root, 'static'), name)
    if (name.endsWith('.css')) for (const match of (await fs.readFile(file, 'utf8')).matchAll(/url\(\s*["']?([^"')\s]+)/gi)) await reference(match[1], file, 'css-url')
    if (!name.endsWith('.js')) continue
    const code = await fs.readFile(file, 'utf8')
    const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
    assert.equal(source.parseDiagnostics.length, 0, '真实生成JS语法完整：' + name)
    const pending = []
    function add(value, kind) { pending.push([value, kind]) }
    function prefix(node) {
      const plus = node.parent
      if (!ts.isBinaryExpression(plus) || plus.operatorToken.kind !== ts.SyntaxKind.PlusToken || plus.left !== node || !ts.isIdentifier(plus.right)) return false
      let enclosing = plus.parent
      while (enclosing && !(ts.isArrowFunction(enclosing) || ts.isFunctionExpression(enclosing) || ts.isFunctionDeclaration(enclosing))) enclosing = enclosing.parent
      return !!enclosing?.parameters.some(parameter => ts.isIdentifier(parameter.name) && parameter.name.text === plus.right.text) && (strip(enclosing.body) === plus || ts.isReturnStatement(plus.parent))
    }
    function pathnameMembership(node) {
      let call = node.parent
      while (call && ts.isParenthesizedExpression(call)) call = call.parent
      if (!call || !ts.isCallExpression(call) || call.arguments.length !== 1 || strip(call.arguments[0]) !== node) return false
      const member = (value, name) => !!value && ts.isPropertyAccessExpression(value) && value.name.text === name
      const callee = strip(call.expression)
      if (!member(callee, 'includes')) return false
      const pathname = strip(callee.expression)
      if (!member(pathname, 'pathname')) return false
      const location = strip(pathname.expression)
      if (!member(location, 'location')) return false
      const windowObject = strip(location.expression)
      return !!windowObject && ts.isIdentifier(windowObject) && windowObject.text === 'window'
    }
    function visit(node) {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) { const value = string(node.moduleSpecifier); if (value !== null) add(value, 'js-import') }
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) { const value = string(node.arguments[0]); if (value !== null) add(value, 'js-import') }
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === '__vite__mapDeps') {
        const fn = strip(node.initializer)
        assert.ok(fn && ts.isArrowFunction(fn))
        const cache = fn.parameters[1], table = fn.parameters[2]
        assert.ok(cache && ts.isIdentifier(cache.name) && ts.isIdentifier(cache.initializer) && cache.initializer.text === '__vite__mapDeps')
        const reuse = strip(table?.initializer)
        assert.ok(reuse && ts.isBinaryExpression(reuse) && reuse.operatorToken.kind === ts.SyntaxKind.BarBarToken)
        const assign = strip(reuse.right)
        assert.ok(assign && ts.isBinaryExpression(assign) && assign.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(assign.left) && ts.isIdentifier(assign.left.expression) && assign.left.expression.text === cache.name.text && ts.isArrayLiteralExpression(assign.right))
        for (const entry of assign.right.elements) { const value = string(entry); assert.ok(value); add(value.startsWith(BASE) ? value : BASE + value, 'vite-preload-table') }
      }
      const literal = string(node)
      // 括号的同一字面量只在内层节点校验一次。
      if (literal?.startsWith(BASE) && !ts.isParenthesizedExpression(node) && !(literal === BASE && (prefix(node) || pathnameMembership(node)))) add(literal, 'js-base-resource')
      ts.forEachChild(node, visit)
    }
    visit(source)
    for (const [value, kind] of pending) await reference(value, file, kind)
    parsedJs++
  }
  return { passed: true, files: actual.length, parsedJs, references: checked.length, entrySha256: descriptor.entrySha256, sourceArchiveSha256: descriptor.sourceArchiveSha256, patchSha256: descriptor.patchSha256, preservedCsp: policy, readOnly: true, browserExecutionNotClaimed: true }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rootIndex = process.argv.indexOf('--root')
  const repoRoot = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
  console.log(JSON.stringify(await verifyDoocsStatic({ repoRoot }), null, 2))
}
