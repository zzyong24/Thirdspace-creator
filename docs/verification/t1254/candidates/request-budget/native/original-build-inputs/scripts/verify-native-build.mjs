import assert from 'node:assert/strict'
import {parseSync} from '../apps/web/node_modules/vite/dist/node/index.js'
import {readFileSync,readdirSync,statSync,existsSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../apps/web/dist-native')
const css=readFileSync(path.join(root,'native.css'),'utf8')
const graph=JSON.parse(readFileSync(path.join(root,'native-build-graph.json'),'utf8'))
for(const module of ['apps/web/src/components/editor/EditorPanel.vue','apps/web/src/components/editor/PreviewPanel.vue','apps/web/src/components/editor/RightSlider.vue','packages/core/src/renderer/index.ts'])assert.ok(graph.modules.includes(module),module)
assert.equal(existsSync(path.join(root,'index.html')),false)
assert.equal(/hsl\(var\(--(?:foreground|background|primary|border|accent)/.test(css),false)
const checked=[],unresolvedProductionMacros=[];let parsedJs=0
const propertyName=node=>!node?.computed&&node?.property?.type==='Identifier'?node.property.name:node?.property?.type==='Literal'?node.property.value:undefined
function checkMacros(node,file){
 if(!node||typeof node!=='object')return
 if(node.type==='MemberExpression'&&propertyName(node)==='NODE_ENV'&&node.object?.type==='MemberExpression'&&propertyName(node.object)==='env'&&node.object.object?.type==='Identifier'&&node.object.object.name==='process')unresolvedProductionMacros.push({file,start:node.start})
 for(const value of Object.values(node))if(Array.isArray(value))value.forEach(child=>checkMacros(child,file));else if(value&&typeof value==='object')checkMacros(value,file)
}
function scan(directory){for(const name of readdirSync(directory)){const file=path.join(directory,name);if(statSync(file).isDirectory())scan(file);else if(name.endsWith('.js')){const text=readFileSync(file,'utf8'),parsed=parseSync(file,text);assert.equal(parsed.errors.length,0,file);parsedJs++;checkMacros(parsed.program,path.relative(root,file));for(const match of text.matchAll(/(?:from\s*|import\s*\()\s*["']([^"']+)["']/g)){const specifier=match[1];if(specifier.startsWith('.')){assert.ok(existsSync(path.resolve(directory,specifier)),specifier);checked.push(specifier)}else assert.equal(/^(https?:|\/)/.test(specifier),false,specifier)}}}}
scan(root)
assert.deepEqual(unresolvedProductionMacros,[],'所有真实JS生产宏必须由构建替换；字符串示例不算宏')
for(const match of css.matchAll(/url\(\s*["']?([^"')\s]+)/g)){const url=match[1];if(url.startsWith('data:')||url.startsWith('#'))continue;if(url.startsWith('/reference-editors/doocs-md/native/'))assert.ok(existsSync(path.join(root,url.slice('/reference-editors/doocs-md/native/'.length))),url);else {assert.equal(/^(https?:|\/)/.test(url),false,url);assert.ok(existsSync(path.join(root,url)),url)}}
console.log(JSON.stringify({result:'PASS',fixture:'构建文件与ESM相对依赖/CSS URL检查',entry:'native.js',css:'native.css',base:'/reference-editors/doocs-md/native/',modules:graph.modules.length,dependencies:graph.dependencies.length,checkedImports:checked.length,parsedJs,unresolvedProductionMacros:unresolvedProductionMacros.length,notVerified:['服务器HTTP静态路由由主会话集成后验证','真实浏览器像素']},null,2))
