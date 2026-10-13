import assert from 'node:assert/strict';
const jsdomModule=process.env.CREATOROS_TEST_JSDOM_MODULE??'/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/frontend/node_modules/jsdom/lib/api.js';const nativeFixtureModule=process.env.CREATOROS_NATIVE_FIXTURE_MODULE??'/tmp/t1053-native-video/source/apps/web/native-dom-fixture-dist/native.js';
const {JSDOM}=await import(jsdomModule);
const dom=new JSDOM('<!doctype html><html><body><input id="outside"><div id="surface"></div></body></html>',{url:'http://127.0.0.1:4318/projects/real-host-route'});const win=dom.window;
for(const key of ['window','document','navigator','location','localStorage','sessionStorage','HTMLElement','Element','HTMLCanvasElement','Image','HTMLImageElement','HTMLVideoElement','HTMLMediaElement','SVGElement','AbortController','AbortSignal','Node','NodeFilter','DocumentFragment','FocusEvent','ShadowRoot','CustomEvent','Event','KeyboardEvent','MouseEvent','MutationObserver','DOMRect','getComputedStyle'])Object.defineProperty(globalThis,key,{configurable:true,value:key==='window'?win:(win as any)[key]});
Object.assign(globalThis,{AudioBuffer:class{},ResizeObserver:class{observe(){}unobserve(){}disconnect(){}},requestAnimationFrame:()=>1,cancelAnimationFrame:()=>{}});win.requestAnimationFrame=()=>1;win.cancelAnimationFrame=()=>{};win.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}) as any;
win.HTMLElement.prototype.scrollIntoView=()=>{};
// 显式DOM fixture：JSDOM没有像素/GPU/OffscreenCanvas，不用它证明出图。
const context=new Proxy({measureText:()=>({width:10}),getImageData:()=>({data:new Uint8ClampedArray(4)}),canvas:null},{get:(target,key)=>key in target?(target as any)[key]:()=>{},set:(target,key,value)=>{(target as any)[key]=value;return true;}});
win.HTMLCanvasElement.prototype.getContext=()=>context as any;win.HTMLCanvasElement.prototype.toDataURL=()=> 'data:image/png;base64,fixture';win.HTMLCanvasElement.prototype.toBlob=callback=>callback(new Blob(['fixture'],{type:'image/png'}) as any);
class FakeOffscreenCanvas{width:number;height:number;constructor(w:number,h:number){this.width=w;this.height=h;}getContext(){return context;}convertToBlob(){return Promise.resolve(new Blob(['fixture'],{type:'image/png'}));}}
Object.assign(globalThis,{OffscreenCanvas:FakeOffscreenCanvas});
const shadow=document.getElementById('surface')!.attachShadow({mode:'open'}),container=document.createElement('div'),portalContainer=document.createElement('div');shadow.append(container,portalContainer);
// 浏览器没有Node process；在导入原生模块前显式移除它，Bun宿主环境只在最终退出前恢复。
const savedProcess=globalThis.process;assert.equal(Reflect.deleteProperty(globalThis,'process'),true);assert.equal('process' in globalThis,false);
const {mount}=await import(nativeFixtureModule);
let changed=0,errors:string[]=[];const abort=new AbortController();
const surface=document.getElementById('surface')!,parking=document.createElement('div');document.body.append(parking);
const transcript=document.createElement('div');transcript.slot='creatoros-transcript';transcript.dataset.creatorosAddon='transcript';transcript.textContent='真实宿主转录占位，仅验证槽位';
const director=document.createElement('div');director.slot='creatoros-director';director.dataset.creatorosAddon='director';const composer=document.createElement('textarea');composer.value='尚未发送的原输入';director.append(composer);surface.append(transcript,director);
const theme={mode:'light',tokens:{'--creatoros-brand':'#6d4aff'},fontFamily:'system-ui',fontSize:'14px',density:'comfortable'};
const options={workspaceAddons:true,owner:{groupId:'group-a',accountId:null,projectId:'project-a',outputId:'output-a',sourceVersionId:'base-a'},theme,portalContainer,signal:abort.signal,onChanged(){changed++;},onError(message:string){errors.push(message);},importMedia:async()=>({mediaId:'registered-fixture'})};
const handle=await mount(container,options);const checks:string[]=[];const wait=()=>new Promise(r=>setTimeout(r,35));const check=(name:string,condition:unknown)=>{assert.ok(condition,name);checks.push(name);};
const content=(value:any)=>{const copy=structuredClone(value);delete copy.metadata.updatedAt;for(const scene of copy.scenes)delete scene.updatedAt;return JSON.stringify(copy);};
try{
 await handle.request('load',{document:null,outputId:'output-a',title:'原生工作区',media:[]});await wait();
 const left=container.querySelector('slot[name="creatoros-transcript"]') as HTMLSlotElement,right=container.querySelector('slot[name="creatoros-director"]') as HTMLSlotElement;
 check('两个真实named slot投影同一宿主DOM',left&&right&&left.assignedElements()[0]===transcript&&right.assignedElements()[0]===director);
 check('workspace模式去除重复标题且原四区留存',!container.querySelector('.native-workbench > header')&&container.querySelectorAll('[role="tab"]').length===4&&container.querySelector('canvas'));
 const assets=container.querySelector('[data-native-core-panel]')!,properties=container.querySelector('#native-panel-properties')!,preview=container.querySelector('canvas')!,timeline=container.querySelector('[data-native-core-panel].pb-3')!;
 check('空工程默认素材/编导',container.querySelector('#native-tab-assets')?.getAttribute('aria-selected')==='true'&&container.querySelector('#native-tab-director')?.getAttribute('aria-selected')==='true');
 const before=await handle.request('context'),beforeChanges=changed;
 for(const panel of ['transcript','properties','assets','director']){assert.deepEqual(await handle.request('open-addon',{panel}),{panel});await wait();check('打开'+panel+'只改变页签',container.querySelector('#native-tab-'+panel)?.getAttribute('aria-selected')==='true');}
 const after=await handle.request('context');check('页签不改正式JSON/epoch/dirty事件',content(before.document)===content(after.document)&&before.contextEpoch===after.contextEpoch&&changed===beforeChanges);
 check('素材/属性/画面/时间轴实例未重挂',assets===container.querySelector('#native-panel-assets')&&properties===container.querySelector('#native-panel-properties')&&preview===container.querySelector('canvas')&&timeline===container.querySelector('[data-native-core-panel].pb-3'));
 check('唯一输入DOM/草稿保留',right.assignedElements()[0]===director&&director.firstChild===composer&&composer.value==='尚未发送的原输入');
 (container.querySelector('[aria-label="文字"]') as HTMLElement).click();await wait();(container.querySelector('[draggable="true"] button') as HTMLElement).click();await wait();
 const count=(document:any)=>document.scenes.flatMap((scene:any)=>[scene.tracks.main,...scene.tracks.overlay,...scene.tracks.audio]).flatMap((track:any)=>track.elements).length;
 check('原手工添加命令仍有效',count((await handle.request('snapshot')).document)===1);
 composer.focus();const del=new KeyboardEvent('keydown',{key:'Delete',bubbles:true,composed:true,cancelable:true});composer.dispatchEvent(del);await wait();check('编导Delete不删除时间轴',!del.defaultPrevented&&count((await handle.request('snapshot')).document)===1);
 const paste=new Event('paste',{bubbles:true,composed:true,cancelable:true});Object.defineProperty(paste,'clipboardData',{value:{items:[],files:[],types:['text/plain'],getData:()=>composer.value}});composer.dispatchEvent(paste);check('编导粘贴不接管原生剪辑板',!paste.defaultPrevented);
 handle.update({disabled:true});check('disabled不禁用slot或tabs，原生core与portal禁用',!container.inert&&portalContainer.inert&&Array.from(container.querySelectorAll<HTMLElement>('[data-native-core-panel]')).every(e=>e.inert)&&!director.inert&&!composer.disabled);
 await handle.request('open-addon',{panel:'properties'});await wait();check('禁用中切到属性仍保持原生禁用',properties.inert);
 await handle.request('open-addon',{panel:'transcript'});await wait();check('禁用中可看宿主诊断与转录',!container.querySelector<HTMLElement>('#native-panel-transcript')!.inert&&left.assignedElements()[0]===transcript);
 const keyboard=container.querySelector('#native-tab-director') as HTMLElement;keyboard.dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true,composed:true,cancelable:true}));await wait();check('页签键盘可达且保实例',container.querySelector('#native-tab-director')?.getAttribute('aria-selected')==='true'&&composer.value==='尚未发送的原输入');
 handle.update({visible:false});await wait();check('hidden整个原生工作面inert且保留同一实例',container.inert&&portalContainer.inert&&preview===container.querySelector('canvas'));
 handle.update({visible:true,disabled:false});await wait();check('恢复显示后同一原生与宿主稿保留',!container.inert&&preview===container.querySelector('canvas')&&composer.value==='尚未发送的原输入');
 // 宿主负责在dispose之前同步回迁；这里只验native不清掉light DOM。
 parking.append(director,transcript);await handle.dispose();check('原生dispose不删已回迁宿主DOM',container.childElementCount===0&&portalContainer.childElementCount===0&&parking.contains(composer));
 await assert.rejects(async()=>handle.request('open-addon',{panel:'assets'}),{name:'AbortError'});
 const next=await mount(container,{...options,owner:{...options.owner,outputId:'output-b',sourceVersionId:'base-b'},signal:new AbortController().signal});await next.request('load',{document:null,outputId:'output-b',title:'下一稿',media:[]});await wait();check('新owner页签重置且不共用旧正式工程',container.querySelector('#native-tab-assets')?.getAttribute('aria-selected')==='true'&&(await next.request('snapshot')).document.metadata.id==='output-b');await next.dispose();
 check('无React或宿主错误',errors.length===0);
 console.log(JSON.stringify({status:'PASS-仅真实React/slot的DOM夹具',checks,count:checks.length,pixels:false,mp4:false,realWebGPU:false,processGlobalDuringProbe:false},null,2));
}finally{await handle.dispose();dom.window.close();Object.defineProperty(globalThis,'process',{configurable:true,writable:true,value:savedProcess});}
