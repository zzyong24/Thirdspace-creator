import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {File} from 'node:buffer'
import {readFileSync} from 'node:fs'
const require=createRequire(new URL('file:///tmp/t1053-native-doocs/packages/core/package.json'))
const {JSDOM}=require('jsdom')
const dom=new JSDOM('<!doctype html><html lang="zh-CN"><head><title>CreatorOS 夹具标题</title></head><body><input id="outside"><div id="host"></div></body></html>',{url:'https://fixture.local/projects/owner/output',pretendToBeVisual:true})
const w=dom.window
for(const key of ['window','document','Window','NodeFilter','Text','DocumentFragment','Selection','CSSStyleSheet','HTMLButtonElement','HTMLAnchorElement','Node','Element','HTMLElement','SVGElement','ShadowRoot','Document','MutationObserver','CustomEvent','Event','MouseEvent','KeyboardEvent','Range','DOMParser','FileReader','Image','HTMLInputElement','HTMLTextAreaElement','HTMLSelectElement','HTMLCanvasElement','HTMLImageElement','XMLSerializer'])Object.defineProperty(globalThis,key,{value:key==='window'?w:key==='document'?w.document:w[key],configurable:true,writable:true})
Object.defineProperty(globalThis,'navigator',{value:w.navigator,configurable:true})
Object.defineProperty(globalThis,'File',{value:File,configurable:true})
Object.defineProperty(globalThis,'localStorage',{value:w.localStorage,configurable:true})
Object.defineProperty(globalThis,'sessionStorage',{value:w.sessionStorage,configurable:true})
globalThis.getComputedStyle=w.getComputedStyle.bind(w)
globalThis.requestAnimationFrame=w.requestAnimationFrame.bind(w)
globalThis.cancelAnimationFrame=w.cancelAnimationFrame.bind(w)
globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}}
w.ResizeObserver=globalThis.ResizeObserver
w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}})
w.Range.prototype.getClientRects=()=>[]
w.Range.prototype.getBoundingClientRect=()=>({left:0,right:0,top:0,bottom:0,width:0,height:0})
w.HTMLElement.prototype.scrollIntoView=()=>{}
document.execCommand=()=>false
const shadow=document.getElementById('host').attachShadow({mode:'open'})
const style=document.createElement('style');style.textContent=readFileSync(new URL('file:///tmp/t1053-native-doocs/apps/web/dist-native/native.css'),'utf8');shadow.appendChild(style)
function surfaces(){const container=document.createElement('div'),portal=document.createElement('div');container.style.height='600px';portal.dataset.nativePortal='';shadow.append(container,portal);return {container,portal}}
const tokens={'--creatoros-text':'#111111','--creatoros-surface':'#ffffff','--creatoros-surface-subtle':'#f3f3f3','--creatoros-border':'#dddddd','--creatoros-border-strong':'#bbbbbb','--creatoros-brand':'#3333dd','--creatoros-brand-soft':'#eeeeff','--creatoros-text-muted':'#666666','--creatoros-brand-foreground':'#ffffff'}
const theme={mode:'light',tokens,fontFamily:'sans-serif',fontSize:'14px',density:'comfortable'}
const title=document.title,lang=document.documentElement.lang,head=document.head.innerHTML,bodyChildren=document.body.children.length
const module=await import('/tmp/t1053-native-doocs/apps/web/dist-native/native.js')
assert.equal(typeof module.mount,'function')
const changed=[],errors=[],imports=[]
let deferImports=false,lateReceipt
const pause=()=>new Promise(resolve=>setTimeout(resolve,30))
const first=surfaces(),owner={accountId:'account-fixture',outputId:'output-fixture',sourceVersionId:'source-fixture'}
const cancel=new AbortController()
const handle=await module.mount(first.container,{owner,theme,portalContainer:first.portal,signal:cancel.signal,onChanged:value=>changed.push(value),onError:value=>errors.push(value),importMedia:async file=>{imports.push(file);if(deferImports)return await new Promise(resolve=>{lateReceipt=resolve});return {mediaId:'creatoros-asset:import-asset:import-file'}}})
assert.equal(first.container.querySelectorAll('.cm-editor').length,1)
assert.ok(first.container.querySelector('#output'))
assert.equal(first.container.querySelector('iframe'),null)
assert.equal(document.title,title);assert.equal(document.documentElement.lang,lang);assert.equal(document.head.innerHTML,head)
const markdown='<!-- creatoros-paragraph:p-1 -->\n\n# 真实原生正文\n\n段落文字。\n\n<img src="creatoros-asset:asset-1:file-1" alt="素材">\n\n```html\n<img src="https://fixture.invalid/literal.png">\n```'
const layout={schemaVersion:1,editor:'doocs-md',editorCommit:'a7c17fc4cda92e3c13aa7e24f06615cfa4219b31',themeId:'grace',themeSettings:{primaryColor:'#c05050',fontFamily:'sans-serif',fontSize:'16px',codeBlockTheme:'none',headingStyles:{},isShowLineNumber:true,isMacCodeBlock:true},customCss:'p { letter-spacing:1px; }',exportOptions:{useIndent:true,useJustify:false}}
const blob=new Blob(['image-fixture'],{type:'image/png'})
await handle.request('load',{document:{title:'原生稿件',markdown,layout},assets:[{assetId:'asset-1',assetFileId:'file-1',blob}]})
const initial=await handle.request('snapshot')
assert.equal(initial.markdown,markdown);assert.equal(initial.layout.themeId,'grace');assert.equal(initial.layout.customCss,layout.customCss)
const exact=first.container.querySelector('#output img');assert.ok(exact.src.startsWith('blob:'))
assert.ok(first.container.querySelector('#output code').textContent.includes('https://fixture.invalid/literal.png'))
const priorUrl=exact.src
await handle.request('load',{document:{title:'更新',markdown:markdown+'\n\n保持图片',layout}})
assert.equal(first.container.querySelector('#output img').src,priorUrl)
const beforeTheme=await handle.request('snapshot')
handle.update({theme:{...theme,mode:'dark',density:'compact',tokens:{...tokens,'--creatoros-surface':'#101010'}}})
assert.equal(first.portal.style.getPropertyValue('--creatoros-surface'),'#101010');assert.ok(first.portal.classList.contains('dark'))
assert.deepEqual(await handle.request('snapshot'),beforeTheme)
handle.update({disabled:true});assert.ok(first.container.hasAttribute('inert'));assert.ok(first.portal.hasAttribute('inert'));handle.update({disabled:false})
const exported=await handle.request('export-html')
assert.ok(exported.html.includes('真实原生正文'));assert.ok(exported.bindings.some(binding=>binding.key==='asset-1:file-1'&&binding.url===priorUrl))
await handle.request('load',{document:{title:'缺图',markdown:'<img src="https://fixture.invalid/no-fetch.png" srcset="https://fixture.invalid/large.png 2x">'}})
assert.ok(first.container.querySelector('#output img').src.startsWith('data:image/svg+xml'))
assert.equal(first.container.querySelector('#output img').hasAttribute('srcset'),false)

const variants=[
 ['svg-image','<svg xmlns="http://www.w3.org/2000/svg"><image href="https://fixture.invalid/svg-image.png" width="100" height="100"/></svg>'],
 ['double-gt','<img alt="合法 a > b" src="https://fixture.invalid/double.png">'],
 ['single-gt',"<img alt='合法 a > b' src='https://fixture.invalid/single.png'>"],
 ['newline','<img\n alt="合法属性"\n src="https://fixture.invalid/newline.png"\n srcset="https://fixture.invalid/newline2.png 2x">'],
 ['known-gt','<img alt="合法 a > b" src="creatoros-asset:asset-1:file-1">'],
 ['gt-srcset','<img alt="合法 a > b" src="creatoros-asset:asset-1:file-1" srcset="https://fixture.invalid/srcset.png 2x">'],
 ['picture','<picture><source srcset="https://fixture.invalid/source.webp 1x, https://fixture.invalid/source2.webp 2x" type="image/webp"><img src="creatoros-asset:asset-1:file-1" alt="合法回退图"></picture>'],
 ['source-gt','<picture><source media="screen and (width > 1px)" srcset="https://fixture.invalid/gt-source.webp 2x"><img src="creatoros-asset:asset-1:file-1" alt="合法回退图"></picture>'],
]
const checks=[]
for(const[name,input]of variants){
 await handle.request('load',{document:{title:name,markdown:input}})
 const snapshot=await handle.request('snapshot')
 const element=first.container.querySelector('#output')
 const imgs=Array.from(element.querySelectorAll('img')).map(img=>({src:img.getAttribute('src'),srcset:img.getAttribute('srcset'),alt:img.getAttribute('alt')}))
 const sources=Array.from(element.querySelectorAll('picture source')).map(source=>({src:source.getAttribute('src'),srcset:source.getAttribute('srcset')}))
 const outside=imgs.concat(sources).some(row=>/https?:/.test((row.src??'')+' '+(row.srcset??'')))
 checks.push({name,unknownNetworkSourcePresent:outside,markdownUnchanged:snapshot.markdown===input,imgs,sources,svgImage:Array.from(element.querySelectorAll('svg image')).map(image=>image.outerHTML)})
}
console.log(JSON.stringify({probe:'实际 PreviewPanel 图片属性和 picture/source 边界',checks},null,2))
assert.ok(checks.every(check=>!check.unknownNetworkSourcePresent),'任一图片响应式来源必须精确绑定或安全降级')
assert.ok(checks.find(check=>check.name==='known-gt').imgs[0].src.startsWith('blob:'),'合法已绑定图和含大于号的属性必须保留')
assert.ok(checks.every(check=>check.markdownUnchanged),'安全预览不能改写规范Markdown正文')

await handle.request('load',{document:{title:'恢复',markdown,layout}})
const tool=Array.from(first.container.querySelectorAll('.native-toolbar button')).find(button=>button.textContent==='加粗');const notificationsBefore=changed.length;tool.click();const immediate=await handle.request('snapshot');console.log(JSON.stringify({probe:'CodeMirror即时改动和通知间隔',notifiedBefore:notificationsBefore,notifiedImmediately:changed.length,currentSnapshotHasNewText:immediate.markdown.includes('**文字**')}));
await new Promise(resolve=>setTimeout(resolve,340))
assert.ok(changed.length>0);assert.ok(changed.at(-1).markdown.includes('**文字**'))
const openMedia=()=>Array.from(first.container.querySelectorAll('.native-toolbar button')).find(button=>button.textContent==='插入图片').click()
openMedia();await pause()
const fileInput=first.portal.querySelector('input[type=file]');assert.ok(fileInput)
const file=new File(['actual-file-fixture'],'fixture.png',{type:'image/png'})
Object.defineProperty(fileInput,'files',{value:[file],configurable:true})
fileInput.dispatchEvent(new Event('change',{bubbles:true}));await pause()
assert.equal(imports.length,1);assert.equal(imports[0],file)
assert.ok((await handle.request('snapshot')).markdown.includes('creatoros-asset:import-asset:import-file'))
assert.ok(Array.from(first.container.querySelectorAll('#output img')).some(image=>image.src.startsWith('blob:')))
assert.equal(document.body.hasAttribute('inert'),false);assert.equal(document.body.style.pointerEvents,'')
deferImports=true;openMedia();await pause()
const slowInput=first.portal.querySelector('input[type=file]')
Object.defineProperty(slowInput,'files',{value:[file],configurable:true})
slowInput.dispatchEvent(new Event('change',{bubbles:true}));await pause();assert.equal(typeof lateReceipt,'function')
assert.equal(localStorage.length,0)
assert.equal(document.body.children.length,bodyChildren)
const second=surfaces(),secondCancel=new AbortController()
const replacement=await module.mount(second.container,{owner:{...owner,outputId:'output-2'},theme,portalContainer:second.portal,signal:secondCancel.signal,onChanged:()=>{},onError:value=>errors.push(value),importMedia:async()=>({mediaId:'creatoros-asset:a:b'})})
assert.equal(first.container.children.length,0)
await assert.rejects(handle.request('snapshot'),/已关闭/)
assert.equal(second.container.querySelectorAll('.cm-editor').length,1)
await replacement.request('load',{document:{title:'新稿',markdown:'新作品内容'}})
lateReceipt({mediaId:'creatoros-asset:late-old-asset:late-old-file'});await pause()
assert.equal((await replacement.request('snapshot')).markdown,'新作品内容')
secondCancel.abort();await replacement.dispose()
assert.equal(second.container.children.length,0);assert.equal(second.portal.children.length,0)
await assert.rejects(replacement.request('snapshot'),/已关闭/)
assert.equal(document.title,title);assert.equal(document.head.innerHTML,head);assert.equal(localStorage.length,0)
assert.deepEqual(errors,[])
console.log(JSON.stringify({result:'PASS',fixture:'Node + jsdom actual dist-native ESM',checks:['原Vue/CodeMirror/PreviewPanel挂载','load/snapshot/export-html真实引擎','精确图片/同owner重新加载保留','稳定段落标记/代码块原字面值','缺图占位及srcset过滤','UI主题与nativeLayout独立','portal tokens和禁用','change回调','真实File先经宿主回执再插图','迟到上传回执不改新owner','弹层不锁body','同文档lease替换','取消/销毁/旧request拒绝','标题/lang/head/body/持久存储无外溢'],notVerified:['真实浏览器像素/布局/焦点层级','系统Clipboard','图片像素与HTML资源ZIP的人工质量','远程MathJax/PlantUML及复杂图表'],stubs:['ResizeObserver','Range空几何','scrollIntoView','execCommand=false（不模拟Clipboard成功）'],imports:imports.length,changes:changed.length},null,2))
w.close()
