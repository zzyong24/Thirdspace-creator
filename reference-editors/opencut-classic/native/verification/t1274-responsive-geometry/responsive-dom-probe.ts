import assert from 'node:assert/strict';
const jsdomModule=process.env.CREATOROS_TEST_JSDOM_MODULE??'/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/frontend/node_modules/jsdom/lib/api.js';const nativeFixtureModule=process.env.CREATOROS_NATIVE_FIXTURE_MODULE??'/tmp/t1053-native-video/source/apps/web/native-dom-fixture-dist/native.js';
const {JSDOM}=await import(jsdomModule);
const dom=new JSDOM('<!doctype html><html><body><input id="outside"><div id="surface"></div></body></html>',{url:'http://127.0.0.1:4318/projects/real-host-route'});const win=dom.window;
for(const key of ['window','document','navigator','location','localStorage','sessionStorage','HTMLElement','Element','HTMLCanvasElement','Image','HTMLImageElement','HTMLVideoElement','HTMLMediaElement','SVGElement','AbortController','AbortSignal','Node','NodeFilter','DocumentFragment','FocusEvent','ShadowRoot','CustomEvent','Event','KeyboardEvent','MouseEvent','MutationObserver','DOMRect','getComputedStyle'])Object.defineProperty(globalThis,key,{configurable:true,value:key==='window'?win:(win as any)[key]});
let fixtureWidth=1200;const resizeCallbacks=new Set<()=>void>();win.HTMLElement.prototype.getBoundingClientRect=function(){return {width:fixtureWidth,height:700,top:0,left:0,right:fixtureWidth,bottom:700,x:0,y:0,toJSON(){}} as DOMRect;};
Object.assign(globalThis,{AudioBuffer:class{},ResizeObserver:class{callback:()=>void;constructor(callback:()=>void){this.callback=callback;}observe(element:HTMLElement){if(element.classList.contains("native-responsive-workspace"))resizeCallbacks.add(()=>this.callback([{target:element,contentRect:{width:fixtureWidth}}]));}unobserve(){}disconnect(){resizeCallbacks.delete(this.callback);}},requestAnimationFrame:()=>1,cancelAnimationFrame:()=>{}});win.requestAnimationFrame=()=>1;win.cancelAnimationFrame=()=>{};win.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}) as any;
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
const director=document.createElement('div');director.slot='creatoros-director';director.dataset.creatorosAddon='director';const composer=document.createElement('textarea');composer.value='尚未发送的原输入';director.append(composer);const projection=document.createElement('div');projection.slot='creatoros-preview';projection.dataset.creatorosAddon='preview';const materials=document.createElement('div');materials.slot='creatoros-materials';materials.dataset.creatorosAddon='materials';const importButton=document.createElement('button');importButton.textContent='选择素材';materials.append(importButton);surface.append(transcript,director,projection,materials);
const theme={mode:'light',tokens:{'--creatoros-brand':'#6d4aff'},fontFamily:'system-ui',fontSize:'14px',density:'comfortable'};
const options={workspaceAddons:true,owner:{groupId:'group-a',accountId:null,projectId:'project-a',outputId:'output-a',sourceVersionId:'base-a'},theme,portalContainer,signal:abort.signal,onChanged(){changed++;},onError(message:string){errors.push(message);},importMedia:async()=>({mediaId:'registered-fixture'})};
const handle=await mount(container,options);const checks:string[]=[];const wait=()=>new Promise(r=>setTimeout(r,35));const check=(name:string,condition:unknown)=>{assert.ok(condition,name);checks.push(name);};
const content=(value:any)=>{const copy=structuredClone(value);delete copy.metadata.updatedAt;for(const scene of copy.scenes)delete scene.updatedAt;return JSON.stringify(copy);};
try{
 await handle.request('load',{document:null,outputId:'output-a',title:'原生工作区',media:[]});await wait();
 const left=container.querySelector('slot[name="creatoros-transcript"]') as HTMLSlotElement,right=container.querySelector('slot[name="creatoros-director"]') as HTMLSlotElement;
 check('两个真实named slot投影同一宿主DOM',left&&right&&left.assignedElements()[0]===transcript&&right.assignedElements()[0]===director);
 const center=container.querySelector('slot[name="creatoros-preview"]') as HTMLSlotElement;
 const centerCore=container.querySelector('.native-workspace-preview-core') as HTMLElement;
 const centerProjection=container.querySelector('.native-workspace-preview-projection') as HTMLElement;
 check('中心第三named slot投影唯一宿主preview mount',center&&center.assignedElements()[0]===projection&&centerCore&&centerProjection);
 const originalCanvas=centerCore.querySelector('canvas'),originalCore=Array.from(centerCore.children);
 check('空projection不遮挡原操作且原预览无ariaHidden/inert',centerProjection.hidden&&centerProjection.hasAttribute('inert')&&!centerCore.inert&&!centerCore.hasAttribute('aria-hidden'));
 projection.dataset.creatorosPreviewActive='true';await wait();check('仅active标记无真实projection子节点不能覆盖',centerProjection.hidden&&!centerCore.inert);
 projection.removeAttribute('data-creatoros-preview-active');const candidateControls=document.createElement('div'),candidateButton=document.createElement('button');candidateButton.textContent='返回当前画面';candidateControls.append(candidateButton);projection.append(candidateControls);await wait();check('有子节点但无active标记仍不覆盖',centerProjection.hidden&&!centerCore.inert);
 const centerBefore=await handle.request('context'),centerBeforeChanges=changed;
 projection.dataset.creatorosPreviewActive='true';await wait();check('真实projection覆盖中心且原core仅inert/ariaHidden保持尺寸DOM',!centerProjection.hidden&&!centerProjection.hasAttribute('inert')&&centerCore.inert&&centerCore.getAttribute('aria-hidden')==='true'&&!centerCore.hidden&&originalCanvas===centerCore.querySelector('canvas')&&originalCore.every((node,index)=>centerCore.children[index]===node));
 const lockedCore=Array.from(container.querySelectorAll<HTMLElement>('[data-native-core-panel]'));check('真实候选active锁住全部原生core含时间轴且不卸载',lockedCore.every(panel=>panel.inert)&&lockedCore.includes(container.querySelector('[data-native-core-panel].pb-3')!));
 handle.update({disabled:true});await wait();check('disabled不禁用中心projection而保原core禁用',!container.inert&&centerCore.inert&&!centerProjection.hasAttribute('inert')&&!projection.inert);
 candidateButton.focus();const centerDelete=new KeyboardEvent('keydown',{key:'Delete',bubbles:true,composed:true,cancelable:true});candidateButton.dispatchEvent(centerDelete);check('中心候选addon快捷键不接管原生',!centerDelete.defaultPrevented);
 handle.update({disabled:false});await wait();check('恢复disabled仍保候选下原core inert',centerCore.inert&&!centerProjection.hasAttribute('inert'));candidateButton.focus();const enabledDelete=new KeyboardEvent('keydown',{key:'Delete',bubbles:true,composed:true,cancelable:true});candidateButton.dispatchEvent(enabledDelete);check('未禁用时中心addon Delete仍不接管原生',!enabledDelete.defaultPrevented);container.focus();const activeSpace=new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true,composed:true,cancelable:true});container.dispatchEvent(activeSpace);await wait();check('候选active时native container Space不截获也不切旧播放',!activeSpace.defaultPrevented);let returns=0;candidateButton.addEventListener('click',()=>returns++);candidateButton.click();check('候选addon返回按钮仍真实可点击',returns===1);await handle.request('open-addon',{panel:'properties'});await wait();check('candidate active切页签及disabled=false不解除core锁',Array.from(container.querySelectorAll<HTMLElement>('[data-native-core-panel]')).every(panel=>panel.inert));await handle.request('open-addon',{panel:'director'});await wait();
 projection.removeAttribute('data-creatoros-preview-active');await wait();check('移除active恢复原core ariaHidden/inert原值',centerProjection.hidden&&centerProjection.hasAttribute('inert')&&!centerCore.inert&&!centerCore.hasAttribute('aria-hidden')&&originalCanvas===centerCore.querySelector('canvas'));
 handle.update({disabled:true});projection.dataset.creatorosPreviewActive='true';await wait();projection.replaceChildren();await wait();check('清空portal立即透明且不覆盖原disabled状态',centerProjection.hidden&&centerProjection.hasAttribute('inert')&&centerCore.inert&&!centerCore.hasAttribute('aria-hidden'));
 handle.update({disabled:false});projection.append(candidateControls);await wait();handle.update({visible:false});await wait();check('hidden中心projection随原容器inert而保同一core',container.inert&&originalCanvas===centerCore.querySelector('canvas'));handle.update({visible:true});await wait();projection.removeAttribute('data-creatoros-preview-active');await wait();
 const centerAfter=await handle.request('context');check('中心投影不改JSON/epoch/dirty',content(centerBefore.document)===content(centerAfter.document)&&centerBefore.contextEpoch===centerAfter.contextEpoch&&changed===centerBeforeChanges);
 projection.remove();await wait();check('projection解绑透明不拦截原画面',centerProjection.hidden&&!centerCore.inert&&center.assignedElements().length===0);surface.append(projection);

 check('workspace保留compact工程名且原四区留存',container.querySelector('header[data-native-header-compact] input[aria-label="剪辑工程名称"]')&&container.querySelectorAll('[role="tab"]').length===4&&container.querySelector('canvas'));
 const assets=container.querySelector('#native-panel-assets')!,properties=container.querySelector('#native-panel-properties')!,preview=container.querySelector('canvas')!,timeline=container.querySelector('[data-native-core-panel].pb-3')!;
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

 const workspace=container.querySelector<HTMLElement>('.native-responsive-workspace')!;
 const selectView=async(text:string)=>{const button=Array.from(container.querySelectorAll<HTMLButtonElement>('.native-workspace-navigation button')).find(button=>button.textContent===text)!;button.click();await wait();};
 const size=async(width:number)=>{fixtureWidth=width;for(const callback of resizeCallbacks)callback();await wait();};
 const frame=container.querySelector('canvas');
 const panes={left:container.querySelector<HTMLElement>('.native-workspace-left')!,right:container.querySelector<HTMLElement>('.native-workspace-right')!,preview:container.querySelector<HTMLElement>('.native-workspace-center')!,main:container.querySelector<HTMLElement>('.native-workspace-main')!,timeline:container.querySelector<HTMLElement>('.native-workspace-timeline')!};
 const originalPaneNodes={...panes};const stableBefore=await handle.request('context');const changedBefore=changed;
 check('materials第四slot只投影唯一宿主按钮',container.querySelector<HTMLSlotElement>('slot[name="creatoros-materials"]')?.assignedElements()[0]===materials);
 await size(390);check('390按实际容器进入单面板',workspace.dataset.workspaceLayout==='single');
 await selectView('画面');check('390画面独占且其他面板不进入布局',!panes.preview.hidden&&panes.left.hidden&&panes.right.hidden&&panes.timeline.hidden&&!panes.main.hidden);
 await selectView('素材/转录');check('390左侧独占且原canvas仍同节点',!panes.left.hidden&&panes.right.hidden&&panes.preview.hidden&&panes.timeline.hidden&&frame===container.querySelector('canvas'));
 await handle.request('open-addon',{panel:'transcript'});await wait();check('宿主open-addon自动打开转录所在面板',workspace.dataset.workspaceView==='left'&&!panes.left.hidden);
 projection.dataset.creatorosPreviewActive='true';await wait();check('窄屏候选自动进入画面',workspace.dataset.workspaceView==='preview'&&!panes.preview.hidden&&panes.left.hidden);
 projection.removeAttribute('data-creatoros-preview-active');await wait();check('退出候选恢复原转录面板',workspace.dataset.workspaceView==='left'&&!panes.left.hidden&&container.querySelector('#native-tab-transcript')?.getAttribute('aria-selected')==='true');
 await selectView('时间轴');check('390时间轴独占且仍是原时间轴',!panes.timeline.hidden&&panes.main.hidden&&panes.timeline===originalPaneNodes.timeline);
 await selectView('编导/属性');check('390编导独占草稿保持',!panes.right.hidden&&panes.left.hidden&&panes.preview.hidden&&composer.value==='尚未发送的原输入');
 await size(900);check('900按容器进入按需侧栏',workspace.dataset.workspaceLayout==='compact'&&!panes.right.hidden&&panes.left.hidden&&!panes.preview.hidden&&!panes.timeline.hidden);
 await selectView('画面');check('窄桌面可隐藏两侧放大画面',panes.right.hidden&&panes.left.hidden&&!panes.preview.hidden);
 await handle.request('open-addon',{panel:'assets'});await wait();check('窄桌面只打开明确选择侧栏',!panes.left.hidden&&panes.right.hidden&&!panes.preview.hidden);
 importButton.focus();const materialDelete=new KeyboardEvent('keydown',{key:'Delete',bubbles:true,composed:true,cancelable:true});importButton.dispatchEvent(materialDelete);check('materials快捷键仍由宿主控制',!materialDelete.defaultPrevented);
 await size(1200);check('宽屏恢复原三栏及时间轴',workspace.dataset.workspaceLayout==='wide'&&!panes.right.hidden&&!panes.left.hidden&&!panes.preview.hidden&&!panes.timeline.hidden);
 const stableAfter=await handle.request('context');check('反复响应式与候选切换不改工程epoch/dirty',content(stableBefore.document)===content(stableAfter.document)&&stableBefore.contextEpoch===stableAfter.contextEpoch&&changedBefore===changed);
 check('所有面板、canvas和宿主草稿原实例保持',Object.entries(panes).every(([key,node])=>node===originalPaneNodes[key as keyof typeof panes])&&frame===container.querySelector('canvas')&&director.firstChild===composer);

 // 宿主负责在dispose之前同步回迁；这里只验native不清掉light DOM。
 parking.append(director,transcript,projection);await handle.dispose();projection.dataset.creatorosPreviewActive='true';projection.append(candidateControls);await wait();check('旧observer已清理不回写到销毁容器',container.childElementCount===0);
 check('原生dispose不删已回迁宿主DOM',container.childElementCount===0&&portalContainer.childElementCount===0&&parking.contains(composer));
 await assert.rejects(async()=>handle.request('open-addon',{panel:'assets'}),{name:'AbortError'});
 const next=await mount(container,{...options,owner:{...options.owner,outputId:'output-b',sourceVersionId:'base-b'},signal:new AbortController().signal});await next.request('load',{document:null,outputId:'output-b',title:'下一稿',media:[]});await wait();check('新owner页签重置且不共用旧正式工程',container.querySelector('#native-tab-assets')?.getAttribute('aria-selected')==='true'&&(await next.request('snapshot')).document.metadata.id==='output-b');check('换owner不复用旧projection',container.querySelector<HTMLElement>('.native-workspace-preview-projection')?.hidden===true);await next.dispose();
 check('无React或宿主错误',errors.length===0);
 console.log(JSON.stringify({status:'PASS-仅真实React/slot的DOM夹具',checks,count:checks.length,pixels:false,mp4:false,realWebGPU:false,processGlobalDuringProbe:false},null,2));
}finally{await handle.dispose();dom.window.close();Object.defineProperty(globalThis,'process',{configurable:true,writable:true,value:savedProcess});}
