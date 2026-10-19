import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {mkdtemp,readFile,readdir,rm,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import type {Browser,Page} from '@playwright/test';
import {readWechatNavigationObservation} from './wechat-navigation-observation';
import {createWechatBrowserSource} from './wechat-browser-source';
import {createVerifiedWechatDomWitnesses} from './wechat-dom-witness';
import {guardedLaunch} from '../browser/chromium-guard';

const {chromium}=createRequire(resolve(process.cwd(),'../frontend/package.json'))('@playwright/test') as typeof import('@playwright/test');
const origin='https://channels.weixin.qq.com';
const controls=()=>({signal:new AbortController().signal,timeoutMs:()=>120000,assertScopeFresh:async()=>{}});

describe('T1364 仅合成官方origin的真实Chromium导航结构',()=>{
 let browser:Browser;
 beforeAll(async()=>{browser=await chromium.launch({headless:true,timeout:120000,args:['--disable-background-networking','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost']});},120000);
 afterAll(async()=>{await browser?.close();},120000);
 async function page(html:string){
  const context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'}),page=await context.newPage();
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.origin!==origin&&url.origin!=='https://synthetic-frame.invalid'){await route.abort();return;}
   await route.fulfill({contentType:'text/html; charset=utf-8',body:url.pathname==='/child'?'<nav><button>视频数据</button></nav>':url.pathname==='/outer'?'<iframe src="/child" style="width:500px;height:200px"></iframe>':html});
  });
  await page.goto(origin+'/platform',{waitUntil:'domcontentloaded',timeout:120000});return {page,close:()=>context.close()};
 }
 it.each(['top','iframe','shadow','hidden','overlay','renamed','closed'] as const)('%s与两个0相同时仍有实际结构差异',{timeout:120000,retry:0},async mode=>{
  const content=mode==='top'?'<nav><button>视频数据</button></nav>':mode==='iframe'?'<iframe src="/child" style="width:500px;height:200px"></iframe>':mode==='shadow'?'<x-nav></x-nav><script>document.querySelector("x-nav").attachShadow({mode:"open"}).innerHTML="<nav><button>视频数据</button></nav>"</script>':mode==='hidden'?'<nav hidden><button>视频数据</button></nav>':mode==='overlay'?'<nav><button>视频数据</button></nav><div role="dialog" style="position:fixed;inset:0;background:white;z-index:999">明确合成遮挡</div>':mode==='renamed'?'<nav><button>经营分析</button></nav>':'<x-nav></x-nav><script>document.querySelector("x-nav").attachShadow({mode:"closed"}).innerHTML="<nav><button>视频数据</button></nav>"</script>';
  const f=await page('<!doctype html><body>'+content+'<article>不应采集的合成正文 PRIVATE_BODY_SENTINEL</article></body>');
  try{
   if(mode==='iframe')await f.page.frameLocator('iframe').getByText('视频数据',{exact:true}).waitFor({state:'visible',timeout:120000});
   const result=await readWechatNavigationObservation(f.page,controls());
   expect(result.routeClass).toBe('platform_home');expect(JSON.stringify(result)).not.toContain('PRIVATE_BODY_SENTINEL');
   if(mode==='top')expect(result.roots.some(root=>root.entryExactCount===1&&root.entryVisibleCount===1)).toBe(true);
   if(mode==='iframe')expect(result.roots.some(root=>root.kind==='frame'&&root.entryVisibleCount===1)).toBe(true);
   if(mode==='shadow')expect(result.roots.some(root=>root.kind==='open_shadow'&&root.entryVisibleCount===1)).toBe(true);
   if(mode==='hidden')expect(result.roots.some(root=>root.entryExactCount===1&&root.entryVisibleCount===0)).toBe(true);
   if(mode==='overlay')expect(result.menuCandidates.some(node=>node.text==='视频数据'&&node.occluded)).toBe(true);
   if(mode==='renamed')expect(result.menuCandidates.some(node=>node.text==='经营分析')).toBe(true);
   if(mode==='closed')expect(result.closedShadowUnknownCount).toBeGreaterThan(0);
  }finally{await f.close();}
 });
 it('source真实120秒两张viewport PNG与实停先于释放，未调用报表能力',{timeout:2700000,retry:0},async()=>{
  const f=await page('<h2 class="finder-nickname">明确合成账号</h2><span id="finder-uid-copy" class="finder-uniq-id" data-clipboard-text="synthetic-t1364-id">synthetic-t1364-id</span><nav><button>经营分析</button></nav>');
  const directory=await mkdtemp('/tmp/t1364-worker-'),events:string[]=[],witnesses=createVerifiedWechatDomWitnesses();let prepared=0,downloads=0;
  f.page.on('download',()=>{downloads++;});
  const source=createWechatBrowserSource({...witnesses,reportWitness:{prepare:async()=>{prepared++;throw Error('不得调用prepare');}},openProfile:async(_dir,_headless,c)=>guardedLaunch(null,async()=>f.page.context(),{signal:c.signal,onStopped:c.onStopped,timeoutMs:120000})});
  const started=performance.now();
  try{
   const result=await source.observeNavigation('/synthetic-only-profile','synthetic-t1364-id',{diagnosticRunId:'synthetic-worker-real',privateEvidenceDir:directory,deadlineAt:new Date(Date.now()+2450000).toISOString(),assertScopeFresh:async()=>{},onBrowserOpened:()=>events.push('opened'),onContextCloseStarted:()=>events.push('close-started'),onPhysicalStopped:()=>events.push('physical-stopped'),onStopped:async()=>{events.push('lease-released');}});
   expect(performance.now()-started).toBeGreaterThanOrEqual(120000);expect(Date.parse(result.observationEndedAt)-Date.parse(result.observationStartedAt)).toBeGreaterThanOrEqual(120000);expect(result.sampleCount).toBeLessThanOrEqual(32);expect(result.samples).toHaveLength(result.sampleCount);expect(result.samples.every(sample=>!('menuCandidates' in sample))).toBe(true);
   expect(result.snapshots.map(s=>s.phase)).toEqual(['identity_verified','observation_end']);expect(events).toEqual(['opened','close-started','physical-stopped','lease-released']);expect(prepared).toBe(0);expect(downloads).toBe(0);
   const files=await readdir(directory);expect(files).toHaveLength(2);
   const decoder=await browser.newPage();
   try{for(const snapshot of result.snapshots){
    expect(snapshot.menuCandidates.some(node=>node.text==='经营分析')).toBe(true);expect(snapshot.screenshot.status).toBe('captured');if(snapshot.screenshot.status!=='captured')throw Error('截图缺失');const file=join(directory,snapshot.screenshot.artifactId+'.png'),bytes=await readFile(file);expect(createHash('sha256').update(bytes).digest('hex')).toBe(snapshot.screenshot.sha256);expect((await stat(file)).mode&0o777).toBe(0o600);
    const decoded=await decoder.evaluate(async encoded=>{const image=new Image();image.src='data:image/png;base64,'+encoded;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const ctx=canvas.getContext('2d')!;ctx.drawImage(image,0,0);return {width:image.naturalWidth,height:image.naturalHeight,pixelBytes:ctx.getImageData(0,0,1,1).data.length};},bytes.toString('base64'));
    expect(decoded).toEqual({width:1440,height:900,pixelBytes:4});
   }}finally{await decoder.close();}
   console.info('[t1364-worker-proof]',JSON.stringify({elapsedMs:Math.round(performance.now()-started),sampleCount:result.sampleCount,screenshots:result.snapshots.map(s=>({phase:s.phase,...s.screenshot})),events,prepared,downloads}));
  }finally{await f.close();await rm(directory,{recursive:true,force:true});}
 });
 it('截图中scope改变，晚PNG不落盘也不发布，仍真实关闭释放',{timeout:120000,retry:0},async()=>{
  const f=await page('<nav><button>经营分析</button></nav>'),directory=await mkdtemp('/tmp/t1364-scope-');
  const rawScreenshot=f.page.screenshot.bind(f.page);let changed=false,released=false;
  f.page.screenshot=async options=>{const bytes=await rawScreenshot(options);changed=true;return bytes;};
  const source=createWechatBrowserSource({identityWitness:{isLoggedOut:async()=>false,read:async()=>({platform:'wechatVideo',platformIdentity:'synthetic-scope',displayName:'合成',sourcePath:'/platform'})},openProfile:async(_dir,_headless,c)=>guardedLaunch(null,async()=>f.page.context(),{signal:c.signal,onStopped:c.onStopped})});
  try{await expect(source.observeNavigation('/synthetic-only-profile','synthetic-scope',{diagnosticRunId:'scope-image',privateEvidenceDir:directory,deadlineAt:new Date(Date.now()+2450000).toISOString(),assertScopeFresh:async()=>{if(changed)throw Object.assign(Error('SCOPE_CHANGED'),{code:'SCOPE_CHANGED'});},onStopped:async()=>{released=true;}})).rejects.toBeDefined();expect(await readdir(directory)).toEqual([]);expect(f.page.isClosed()).toBe(true);expect(released).toBe(true);}
  finally{await f.close();await rm(directory,{recursive:true,force:true});}
 });
 it('普通截图失败只记missing；受控时钟保两帧与原结束时刻，不另开浏览器',{timeout:120000,retry:0},async()=>{
  const f=await page('<nav><button>经营分析</button></nav>'),directory=await mkdtemp('/tmp/t1364-missing-');let clock=Date.now(),shots=0,opened=0;
  f.page.screenshot=async()=>{shots++;if(shots===1)setTimeout(()=>{clock+=120000;},10);throw Error('合成截图不可用');};
  const source=createWechatBrowserSource({now:()=>clock,identityWitness:{isLoggedOut:async()=>false,read:async()=>({platform:'wechatVideo',platformIdentity:'synthetic-missing',displayName:'合成',sourcePath:'/platform'})},openProfile:async(_dir,_headless,c)=>{opened++;return guardedLaunch(null,async()=>f.page.context(),{signal:c.signal,onStopped:c.onStopped});}});
  try{const result=await source.observeNavigation('/synthetic-only-profile','synthetic-missing',{diagnosticRunId:'missing-image',privateEvidenceDir:directory,deadlineAt:new Date(Date.now()+2450000).toISOString(),assertScopeFresh:async()=>{}});expect(result.snapshots.map(s=>s.screenshot)).toEqual([{status:'missing'},{status:'missing'}]);expect(Date.parse(result.observationEndedAt)-Date.parse(result.observationStartedAt)).toBe(120000);expect(shots).toBe(2);expect(opened).toBe(1);expect(await readdir(directory)).toEqual([]);}
  finally{await f.close();await rm(directory,{recursive:true,force:true});}
 });
 it('菜单中途出现后又消失，两帧0/0仍保中间可见1的有限私有时序（受控时钟）',{timeout:120000,retry:0},async()=>{
  const f=await page('<nav></nav>'),directory=await mkdtemp('/tmp/t1364-transient-');let clock=Date.now(),shots=0;const screenshot=f.page.screenshot.bind(f.page);const timers:Array<ReturnType<typeof setTimeout>>=[];
  f.page.screenshot=async options=>{const bytes=await screenshot(options);shots++;if(shots===1){timers.push(setTimeout(()=>{void f.page.evaluate(()=>{document.querySelector('nav')!.innerHTML='<button>视频数据</button>';}).then(()=>{clock+=4000;});},20));timers.push(setTimeout(()=>{void f.page.evaluate(()=>{document.querySelector('nav')!.innerHTML='';}).then(()=>{clock+=116000;});},4200));}return bytes;};
  const source=createWechatBrowserSource({now:()=>clock,identityWitness:{isLoggedOut:async()=>false,read:async()=>({platform:'wechatVideo',platformIdentity:'synthetic-transient',displayName:'合成',sourcePath:'/platform'})},openProfile:async(_dir,_headless,c)=>guardedLaunch(null,async()=>f.page.context(),{signal:c.signal,onStopped:c.onStopped})});
  try{const result=await source.observeNavigation('/synthetic-only-profile','synthetic-transient',{diagnosticRunId:'transient-menu',privateEvidenceDir:directory,deadlineAt:new Date(Date.now()+2450000).toISOString(),assertScopeFresh:async()=>{}});expect(result.snapshots.every(snapshot=>snapshot.roots.every(root=>root.entryVisibleCount===0))).toBe(true);expect(result.samples.some(sample=>sample.roots.some(root=>root.entryVisibleCount===1))).toBe(true);expect(result.samples).toHaveLength(result.sampleCount);expect(result.sampleCount).toBeLessThanOrEqual(32);expect(result.samples[0]!.roots[0]!.entryVisibleCount).toBe(0);expect(result.samples.at(-1)!.roots[0]!.entryVisibleCount).toBe(0);expect(shots).toBe(2);}
  finally{timers.forEach(clearTimeout);await f.close();await rm(directory,{recursive:true,force:true});}
 });
 it('跨域frame不读取正文；输出只保存固定路由分类和有限候选',{timeout:120000,retry:0},async()=>{
  const f=await page('<iframe src="https://synthetic-frame.invalid/child?token=SECRET_QUERY"></iframe><nav>'+Array.from({length:150},(_,i)=>'<button>'+('合成'+i+'字'.repeat(100))+'</button>').join('')+'</nav>');
  try{const result=await readWechatNavigationObservation(f.page,controls());expect(result.roots.some(root=>root.kind==='cross_origin_frame')).toBe(true);expect(result.menuCandidates.length).toBeLessThanOrEqual(128);expect(result.menuCandidates.every(node=>node.text.length<=80)).toBe(true);expect(result.truncated).toBe(true);expect(JSON.stringify(result)).not.toContain('SECRET_QUERY');expect(JSON.stringify(result)).not.toContain('synthetic-frame.invalid');}
  finally{await f.close();}
 });
 it.each(['display:none','visibility:hidden','opacity:0'])('嵌套Frame祖先隐藏%s时内层菜单不可冒可见入口',{timeout:120000,retry:0},async style=>{
  const f=await page('<iframe src="/outer" style="width:600px;height:400px;'+style+'"></iframe>');
  try{await f.page.waitForFunction(()=>document.querySelector('iframe')?.contentDocument?.querySelector('iframe')?.contentDocument?.querySelector('button')?.textContent==='视频数据',undefined,{timeout:120000});const result=await readWechatNavigationObservation(f.page,controls());const nested=result.roots.find(root=>root.kind==='frame'&&root.parentRootId!==null&&root.parentRootId!=='frame-0');expect(nested).toBeDefined();expect(nested!.visible).toBe(false);expect(nested!.entryVisibleCount).toBe(0);expect(result.menuCandidates.filter(candidate=>candidate.text==='视频数据').every(candidate=>candidate.visible===false)).toBe(true);}
  finally{await f.close();}
 });
 it('scope失效和取消在DOM读取前拒绝',{timeout:120000,retry:0},async()=>{
  const f=await page('<nav><button>视频数据</button></nav>');
  try{await expect(readWechatNavigationObservation(f.page,{...controls(),assertScopeFresh:async()=>{throw Error('SCOPE_CHANGED');}})).rejects.toThrow('SCOPE_CHANGED');const controller=new AbortController();controller.abort(Error('CANCELLED'));await expect(readWechatNavigationObservation(f.page,{...controls(),signal:controller.signal})).rejects.toThrow('CANCELLED');}
  finally{await f.close();}
 });
 it('Frame在有限读取中卸载不拼接旧结构',{timeout:120000,retry:0},async()=>{
  const f=await page('<iframe src="/child"></iframe>');let checks=0;
  try{await f.page.frameLocator('iframe').getByText('视频数据',{exact:true}).waitFor({state:'visible',timeout:120000});await expect(readWechatNavigationObservation(f.page,{...controls(),assertScopeFresh:async()=>{checks++;if(checks===4)await f.page.locator('iframe').evaluate(node=>node.remove());}})).rejects.toBeDefined();}
  finally{await f.close();}
 });
 it('截图promise晚到于取消时无文件和晚结果，guard仍关闭真实context',{timeout:120000,retry:0},async()=>{
  const f=await page('<nav><button>经营分析</button></nav>'),directory=await mkdtemp('/tmp/t1364-late-image-'),controller=new AbortController();
  const bytes=await f.page.screenshot();let release:((bytes:Buffer)=>void)|undefined;let reached:(()=>void)|undefined;const atScreenshot=new Promise<void>(resolve=>{reached=resolve;});let physical=false,released=false;
  f.page.screenshot=()=>new Promise<Buffer>(resolve=>{release=resolve;reached?.();});
  const source=createWechatBrowserSource({identityWitness:{isLoggedOut:async()=>false,read:async()=>({platform:'wechatVideo',platformIdentity:'synthetic-late',displayName:'合成',sourcePath:'/platform'})},openProfile:async(_dir,_headless,c)=>guardedLaunch(null,async()=>f.page.context(),{signal:c.signal,onStopped:c.onStopped})});
  try{const running=source.observeNavigation('/synthetic-only-profile','synthetic-late',{signal:controller.signal,diagnosticRunId:'late-image',privateEvidenceDir:directory,deadlineAt:new Date(Date.now()+2450000).toISOString(),assertScopeFresh:async()=>{},onPhysicalStopped:()=>{physical=true;},onStopped:async()=>{released=true;}});const rejected=expect(running).rejects.toBeDefined();await atScreenshot;controller.abort(Error('合成原取消'));await rejected;release?.(bytes);await new Promise(resolve=>setTimeout(resolve,0));expect(await readdir(directory)).toEqual([]);expect(f.page.isClosed()).toBe(true);expect(physical).toBe(true);expect(released).toBe(true);}
  finally{release?.(bytes);await f.close();await rm(directory,{recursive:true,force:true});}
 });
});
