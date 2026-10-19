import {describe,expect,it,vi} from 'vitest';
import {fetchDouyinWorkListExport} from './douyin-cdp';

function deferred<T>(){let resolve!:(value:T)=>void;let reject!:(reason:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
type Phase=string;
type ExportContext=Awaited<ReturnType<NonNullable<NonNullable<Parameters<typeof fetchDouyinWorkListExport>[1]>['openContext']>>>;
// SEMANTIC_BOUNDARY_ALLOW: 夹具只落实原页面协议的投稿主/子tab与下载先监听后点击，不作内容判断。
function fixture(){
 const holds={open:deferred<void>(),channel:deferred<void>(),goto:deferred<void>(),path:deferred<void>(),close:deferred<void>()};
 const entered={open:false,channel:false,goto:false,path:false,close:false};
 const calls={clicks:[] as string[],listeners:0,closed:0};let posts=false,list=false,last='';let fireDownload:(()=>void)|undefined;
 const page={
  goto:async()=>{entered.goto=true;await holds.goto.promise;},waitForTimeout:async()=>{},
  evaluate:async(fn:Function,arg:unknown)=>{if(fn.name==='markDatePickerInPage')return 0;
   const codes=Array.isArray(arg)?arg:(arg as {exportCodes?:number[]}|null)?.exportCodes;
   if(!codes)return 0;const text=String.fromCharCode(...codes);const present=['投稿作品','投稿列表','刷新数据','导出数据'].includes(text)&&(text!=='投稿列表'||posts);
   if(fn.name==='hasVisibleByCharCodesInPage')return present;last=present?text:'';return present?1:0;},
  locator:()=>({count:async()=>last?1:0,click:async()=>{calls.clicks.push(last);if(last==='投稿作品')posts=true;if(last==='投稿列表')list=true;if(last==='导出数据'&&list)fireDownload?.();}}),
  waitForEvent:async()=>{calls.listeners++;return await new Promise<{path():Promise<string>}>(yes=>{fireDownload=()=>yes({path:async()=>{entered.path=true;await holds.path.promise;return '/isolated/PRIVATE_DOWNLOAD.xlsx';}});});},
 };
 const ctx={pages:()=>[page],newPage:async()=>page,cookies:async()=>[{name:'sessionid'}],close:async()=>{entered.close=true;await holds.close.promise;calls.closed++;}};
 const gateway={acquire:async()=>{entered.channel=true;await holds.channel.promise;},report:async()=>{}};
 const phases:Phase[]=[];const readFile=vi.fn(async()=>new Uint8Array([0x50,0x4b,3,4]));
 const opts={authDir:'/isolated/PRIVATE_PROFILE',onProgress:(phase:Phase)=>{phases.push(phase);}};
 const deps={openContext:async()=>{entered.open=true;await holds.open.promise;return ctx as unknown as ExportContext;},readFile,gateway:gateway as never};
 return {holds,entered,calls,phases,opts,deps,readFile};
}

describe('T1212 原导出入口实际等待进度',()=>{
 it('浏览器/限流/导航/下载完成/关闭等待先可观察，旧成功只点击一次导出',async()=>{
  const f=fixture();let settled=false;const pending=fetchDouyinWorkListExport(f.opts,f.deps).finally(()=>{settled=true;});
  try{
   await vi.waitFor(()=>expect(f.entered.open).toBe(true));expect(f.phases.at(-1)).toBe('browser');
   f.holds.open.resolve();await vi.waitFor(()=>expect(f.entered.channel).toBe(true));expect(f.phases.at(-1)).toBe('channel');
   f.holds.channel.resolve();await vi.waitFor(()=>expect(f.entered.goto).toBe(true));expect(f.phases.at(-1)).toBe('navigate');
   f.holds.goto.resolve();await vi.waitFor(()=>expect(f.entered.path).toBe(true));expect(f.phases.at(-1)).toBe('download_finish');expect(settled).toBe(false);
   f.holds.path.resolve();await vi.waitFor(()=>expect(f.entered.close).toBe(true));expect(f.phases.at(-1)).toBe('close');expect(settled).toBe(false);
   f.holds.close.resolve();expect(await pending).toEqual(new Uint8Array([0x50,0x4b,3,4]));
   expect(f.calls.clicks.filter(x=>x==='导出数据')).toEqual(['导出数据']);expect(f.calls.listeners).toBe(1);expect(f.calls.closed).toBe(1);
   expect(f.phases).toEqual(['browser','channel','login','page','navigate','initialize','modal','posts_click','posts_wait','list_click','list_wait','date','refresh','export_click','download_event','download_finish','file_read','close']);
   expect(JSON.stringify(f.phases)).not.toMatch(/PRIVATE|sessionid|isolated|\.xlsx/);
  }finally{Object.values(f.holds).forEach(h=>h.resolve());await pending.catch(()=>{});}
 },120000);
 it.each(['throw','reject'] as const)('%s通知异常不能阻断旧成功或真实关闭，也不打印回调私有异常',async mode=>{
  const f=fixture();Object.values(f.holds).forEach(h=>h.resolve());const warning=vi.spyOn(console,'warn').mockImplementation(()=>{});const log=vi.spyOn(console,'info').mockImplementation(()=>{});
  try{expect(await fetchDouyinWorkListExport({...f.opts,onProgress:()=>{if(mode==='reject')return Promise.reject(Error('PRIVATE_CALLBACK_TOKEN'));throw Error('PRIVATE_CALLBACK_TOKEN');}},f.deps)).toEqual(new Uint8Array([0x50,0x4b,3,4]));expect(f.calls.closed).toBe(1);expect(JSON.stringify([...warning.mock.calls,...log.mock.calls])).not.toContain('PRIVATE_CALLBACK_TOKEN');}finally{warning.mockRestore();log.mockRestore();}
 },120000);
 it('下载完成前取消保原失败，禁止读取文件或重复导出，仍等真实资源关闭',async()=>{
  const f=fixture();const abort=new AbortController();f.holds.open.resolve();f.holds.channel.resolve();f.holds.goto.resolve();
  const pending=fetchDouyinWorkListExport({...f.opts,signal:abort.signal},f.deps);const rejected=pending.catch(e=>e);
  try{await vi.waitFor(()=>expect(f.entered.path).toBe(true));abort.abort(new Error('ISOLATED_CANCELLED'));await vi.waitFor(()=>expect(f.entered.close).toBe(true));f.holds.path.resolve();f.holds.close.resolve();expect((await rejected).message).toBe('ISOLATED_CANCELLED');expect(f.readFile).not.toHaveBeenCalled();expect(f.calls.closed).toBe(1);expect(f.calls.clicks.filter(x=>x==='导出数据')).toHaveLength(1);}finally{Object.values(f.holds).forEach(h=>h.resolve());await rejected;}
 },120000);
});
