import fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import {chromium} from '@playwright/test';
import * as guardModule from '../browser/chromium-guard';
import * as launchModule from '../browser/browser-launch';
import {Readable} from 'node:stream';
import type {BrowserContext,Download,Frame,Locator,Page} from '@playwright/test';
import {describe,expect,it,vi} from 'vitest';
vi.mock('node:fs/promises',async importOriginal=>({...await importOriginal<typeof import('node:fs/promises')>()}));
import {createWechatBrowserSource,createWechatNativeDomReportWitness,type WechatCreatorPlatform,type WechatIdentityWitness,type WechatReportWitness,type WechatReportPageState,WechatBrowserSourceError} from './wechat-browser-source';
// 仅Chromium/页面/下载为明确fixture，实际source负责账号核对、原生事件、字节边界和停止协议。
// 不连接真实账号，不把以下displayName或stable ID宣称为两平台已测身份字段。
const origins={wechatOfficial:'https://mp.weixin.qq.com',wechatVideo:'https://channels.weixin.qq.com'};

describe('T1364 独立只读导航source契约',()=>{
 it('正式source提供独立observeNavigation，不借采集prepare或下载',{timeout:120000,retry:0},()=>{
  const f=fixture();expect((f.source as unknown as {observeNavigation?:unknown}).observeNavigation).toBeTypeOf('function');
 });
 it('启动排队完成后scope变化在第一次goto前停止；实停和释放不同事件',{timeout:120000,retry:0},async()=>{
  const f=fixture(),events:string[]=[],error=Object.assign(Error('SCOPE_CHANGED'),{code:'SCOPE_CHANGED'});let stopped:(()=>Promise<void>)|undefined;
  let released=false;const close=vi.fn(async()=>{if(!released){released=true;await stopped?.();}});f.context.close=close;
  const source=createWechatBrowserSource({identityWitness:f.identityWitness,reportWitness:f.reportWitness,openProfile:async(_dir,_headless,c)=>{stopped=c.onStopped;return f.context;}});
  await expect(source.observeNavigation('/synthetic-only-profile','fixture-platform-id',{diagnosticRunId:'scope-after-guard',privateEvidenceDir:'/tmp/synthetic-unused',deadlineAt:new Date(Date.now()+2450000).toISOString(),assertScopeFresh:async()=>{throw error;},onBrowserOpened:()=>events.push('opened'),onContextCloseStarted:()=>events.push('close-started'),onPhysicalStopped:()=>events.push('physical-stopped'),onStopped:async()=>{events.push('released');}})).rejects.toBe(error);
  expect(f.page.goto).not.toHaveBeenCalled();expect(f.reportWitness.prepare).not.toHaveBeenCalled();expect(close).toHaveBeenCalled();expect(events).toEqual(['opened','close-started','physical-stopped','released']);
 });
 it('期限先耗尽从未启动，只释放未启动租约，不伪造实停',{timeout:120000,retry:0},async()=>{
  const f=fixture(),events:string[]=[];
  await expect(f.source.observeNavigation('/synthetic-only-profile','fixture-platform-id',{diagnosticRunId:'expired-before-open',privateEvidenceDir:'/tmp/synthetic-unused',deadlineAt:new Date(Date.now()-1).toISOString(),assertScopeFresh:async()=>{},onBrowserOpened:()=>events.push('opened'),onPhysicalStopped:()=>events.push('physical-stopped'),onStopped:async()=>{events.push('released-unopened');}})).rejects.toMatchObject({code:'EXECUTION_DEADLINE_EXCEEDED'});
  expect(events).toEqual(['released-unopened']);expect(f.openProfile).not.toHaveBeenCalled();
 });
 it('原执行deadline耗尽且close挂起保stopPending，不新给120秒或冒实停释放',{timeout:120000,retry:0},async()=>{
  const f=fixture(),base=Date.now();let clock=base,resolveClose:(()=>void)|undefined,retry:(()=>Promise<void>)|undefined;const events:string[]=[];
  const source=createWechatBrowserSource({now:()=>clock,identityWitness:f.identityWitness,openProfile:async(_directory,_headless,c)=>{const context={...f.context,close:()=>new Promise<void>(resolve=>{resolveClose=()=>{void c.onStopped?.().then(resolve);};})} as BrowserContext;return context;}});
  await expect(source.observeNavigation('/synthetic-only-profile','fixture-platform-id',{diagnosticRunId:'pending-close',privateEvidenceDir:'/tmp/synthetic-unused',deadlineAt:new Date(base+2450000).toISOString(),assertScopeFresh:async()=>{clock=base+2450001;throw Error('合成耗尽');},onBrowserOpened:()=>events.push('opened'),onPhysicalStopped:()=>events.push('physical'),onStopped:async()=>{events.push('released');},onStopUnconfirmed:fn=>{retry=fn;}})).rejects.toMatchObject({code:'BROWSER_STOP_UNCONFIRMED',resourceStopUnconfirmed:true});
  expect(events).toEqual(['opened']);expect(retry).toBeTypeOf('function');resolveClose?.();await Promise.resolve();expect(events).toEqual(['opened','physical','released']);
 });
});
const selection={startDate:'2026-10-07',endDate:'2026-10-08',timeZone:'Asia/Shanghai' as const,meaning:'statisticsDates' as const};
function fixture(platform:WechatCreatorPlatform='wechatVideo'){
 const onStopped=vi.fn(async()=>{}),onStopUnconfirmed=vi.fn<(retry:()=>Promise<void>)=>void>();
 let currentKind='channelsDaily',href:string|null=null,downloadFailure:Error|undefined,observedIdentity='fixture-platform-id',loggedOut=false,streamClosed:(()=>void)|undefined;
 const order:string[]=[],bytes=new Map<string,Uint8Array>([
  ['officialContent',Buffer.from([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1])],
  ['officialFollowers',Buffer.from('<html><table><tr><td>fixture</td></tr></table></html>')],
  ['channelsDaily',Buffer.from('fixture CSV daily')],['channelsFollowers',Buffer.from('fixture CSV followers')],['channelsWorks',Buffer.from('fixture CSV works')],
 ]);
 const locator={getAttribute:vi.fn(async()=>href),click:vi.fn(async()=>{order.push('click:'+currentKind);})} as unknown as Locator;
 const createDownload=():Download=>({failure:async()=>null,suggestedFilename:()=>currentKind+(platform==='wechatOfficial'?'.xls':'.csv'),createReadStream:async()=>{const stream=Readable.from([bytes.get(currentKind)!],{autoDestroy:false}),destroy=stream.destroy.bind(stream);stream.destroy=(error?:Error)=>{streamClosed?.();return destroy(error);};return stream;}}) as unknown as Download;
 const page={goto:vi.fn(async()=>{}),url:()=>origins[platform]+'/',waitForEvent:vi.fn(async(_event:string,options:{timeout:number})=>{order.push('listen:'+currentKind);expect(options.timeout).toBeGreaterThanOrEqual(120000);if(downloadFailure)throw downloadFailure;return createDownload();})} as unknown as Page;
 const request={get:vi.fn(async()=>({status:()=>200,headers:()=>({'content-disposition':'attachment; filename="native.xls"'}),body:async()=>bytes.get(currentKind)!,dispose:vi.fn(async()=>{})}))};
 const close=vi.fn(async()=>{await onStopped();});
 const context={pages:()=>[page],newPage:async()=>page,close,request} as unknown as BrowserContext;
 const openProfile=vi.fn(async(_directory:string,_headless:boolean,controls:{signal?:AbortSignal;onStopped?:()=>Promise<void>})=>{expect(controls.onStopped).toBe(onStopped);return context;});
 const identityWitness:WechatIdentityWitness={
  read:vi.fn(async(_page,p)=>({platform:p,platformIdentity:observedIdentity,displayName:'明确fixture显示名',sourcePath:'/fixture-account-information'})),
  isLoggedOut:vi.fn(async()=>loggedOut),
 };
 const reportWitness:WechatReportWitness={prepare:vi.fn(async(_page,_platform,kind)=>{
  currentKind=kind;order.push('prepare:'+kind);
  const state:WechatReportPageState=kind==='channelsWorks'?{selection:{...selection,meaning:'publishedDates'},dates:[],selectedWindow:true,reportedRows:13,visibleRows:10}:{selection:{...selection},dates:['2026-10-07','2026-10-08']};
  return {scope:page,download:locator,state};
 })};
 const source=createWechatBrowserSource({identityWitness,reportWitness,openProfile});
 return {source,onStopped,onStopUnconfirmed,openProfile,identityWitness,reportWitness,context,page,close,request,locator,order,bytes,controls:{onStopped,onStopUnconfirmed},setHref:(value:string|null)=>{href=value;},setDownloadFailure:(value:Error)=>{downloadFailure=value;},setIdentity:(value:string)=>{observedIdentity=value;},setLoggedOut:(value:boolean)=>{loggedOut=value;},setStreamClosed:(value:()=>void)=>{streamClosed=value;}};
}
describe('T1110 微信受管browser source（明确浏览器fixture）',()=>{
 it.each(['wait_entry_or_centre','recover_owner','hover_owner','wait_associated_entry'] as const)('T1367 %s菜单诊断仅发固定子阶段/计数，忽略附带私密字段且日志失败不改错误或实停',async entryPhase=>{
  const f=fixture(),error=new WechatBrowserSourceError('REPORT_LINK_MISSING','原中文不变'),onDiagnostic=vi.fn(()=>{throw Error('合成日志接收失败');});
  vi.mocked(f.reportWitness.prepare).mockImplementationOnce(async(_page,_platform,_kind,op)=>{
   op.onEntryObservation?.({entryPhase,entryVisibleCount:0,centreVisibleCount:0,centreClicked:false,privateUrl:'https://channels.weixin.qq.com/?token=synthetic-private',profile:'/synthetic-private-profile'} as never);throw error;
  });
  await expect(f.source.collectNativeReports('wechatVideo','/fixture-profile','fixture-platform-id',{...f.controls,onDiagnostic})).rejects.toBe(error);
  expect(onDiagnostic).toHaveBeenCalledWith({platform:'wechatVideo',stage:'prepare',kind:'channelsDaily',code:'REPORT_LINK_MISSING',exceptionName:'WechatBrowserSourceError',entryObservation:{entryPhase,entryVisibleCount:0,centreVisibleCount:0,centreClicked:false}});
  expect(JSON.stringify(onDiagnostic.mock.calls)).not.toContain('synthetic-private');expect(f.onStopped).toHaveBeenCalledOnce();expect(f.close).toHaveBeenCalledOnce();
 });
 it.each([
  {entryPhase:'private-phase',entryVisibleCount:0,centreClicked:false},
  {entryPhase:{toString:():string=> 'initial',secret:'private-value'},entryVisibleCount:0,centreClicked:false},
  {entryPhase:'initial',entryVisibleCount:-1,centreClicked:false},
  {entryPhase:'initial',entryVisibleCount:0.5,centreClicked:false},
  {entryPhase:'initial',entryVisibleCount:10001,centreClicked:false},
  {entryPhase:'initial',entryVisibleCount:0,centreVisibleCount:NaN,centreClicked:false},
  {entryPhase:'initial',entryVisibleCount:0,centreClicked:'private-value'},
 ])('T1363非法菜单诊断元数据被省略且不泄漏 %#',async value=>{
  const f=fixture(),error=new WechatBrowserSourceError('REPORT_LINK_MISSING','原中文不变'),onDiagnostic=vi.fn();
  vi.mocked(f.reportWitness.prepare).mockImplementationOnce(async(_page,_platform,_kind,op)=>{op.onEntryObservation?.(value as never);throw error;});
  await expect(f.source.collectNativeReports('wechatVideo','/fixture-profile','fixture-platform-id',{...f.controls,onDiagnostic})).rejects.toBe(error);
  expect(onDiagnostic).toHaveBeenCalledOnce();expect(onDiagnostic.mock.calls[0]?.[0]).not.toHaveProperty('entryObservation');expect(JSON.stringify(onDiagnostic.mock.calls)).not.toContain('private');expect(f.onStopped).toHaveBeenCalledOnce();
 });
 it('T1363后续report不会继承前一入口子步骤，下载失败也不附旧prepare诊断',async()=>{
  const f=fixture(),onDiagnostic=vi.fn();
  vi.mocked(f.reportWitness.prepare).mockImplementationOnce(async(_page,_platform,_kind,op)=>{op.onEntryObservation?.({entryPhase:'wait_target_route',entryVisibleCount:1,centreClicked:false});return {scope:f.page,download:f.locator,state:{selection,dates:['2026-10-07','2026-10-08']}};});
  f.setDownloadFailure(Error('明确合成下载失败'));
  await expect(f.source.collectNativeReports('wechatVideo','/fixture-profile','fixture-platform-id',{...f.controls,onDiagnostic})).rejects.toMatchObject({code:'DOWNLOAD_FAILED'});
  expect(onDiagnostic.mock.calls[0]?.[0]).not.toHaveProperty('entryObservation');expect(f.onStopped).toHaveBeenCalledOnce();
 });
 it('T1363下一report准备失败不继承前一report菜单进度',async()=>{
  const f=fixture(),onDiagnostic=vi.fn(),prepare=f.reportWitness.prepare;
  f.reportWitness.prepare=async(...args)=>{
   if(args[2]==='channelsFollowers')throw new WechatBrowserSourceError('REPORT_PAGE_MISSING','明确合成下一报表失败');
   args[3].onEntryObservation?.({entryPhase:'wait_target_route',entryVisibleCount:1,centreClicked:false});return prepare(...args);
  };
  await expect(f.source.collectNativeReports('wechatVideo','/fixture-profile','fixture-platform-id',{...f.controls,onDiagnostic})).rejects.toMatchObject({code:'REPORT_PAGE_MISSING'});
  expect(onDiagnostic.mock.calls[0]?.[0]).toMatchObject({kind:'channelsFollowers',code:'REPORT_PAGE_MISSING'});expect(onDiagnostic.mock.calls[0]?.[0]).not.toHaveProperty('entryObservation');expect(f.onStopped).toHaveBeenCalledOnce();
 });
 it('缺稳定字段witness诚实不可用，未启动资源通知释放，不误报登录',async()=>{
  const onStopped=vi.fn(async()=>{}),openProfile=vi.fn(async()=>({}) as BrowserContext),source=createWechatBrowserSource({openProfile});
  expect(source.configured).toBe(false);await expect(source.login('wechatOfficial','/fixture-profile',{onStopped})).rejects.toMatchObject({code:'IDENTITY_WITNESS_MISSING'});
  expect(openProfile).not.toHaveBeenCalled();expect(onStopped).toHaveBeenCalledOnce();
  const f=fixture();expect(createWechatBrowserSource({identityWitness:f.identityWitness}).configured).toBe(false);expect(f.source.configured).toBe(true);
 });
 it.each(['wechatOfficial','wechatVideo'] as const)('%s扫码只返回真实reader给的稳定ID，并保原signal/停止证明',async(platform)=>{
  const f=fixture(platform),controller=new AbortController();
  expect(await f.source.login(platform,'/fixture-profile',{...f.controls,signal:controller.signal})).toEqual({platformIdentity:'fixture-platform-id',displayName:'明确fixture显示名',source:platform+':/fixture-account-information'});
  expect(f.openProfile).toHaveBeenCalledWith('/fixture-profile',false,expect.objectContaining({signal:expect.any(AbortSignal),onStopped:f.onStopped}));
  expect(f.onStopped).toHaveBeenCalledOnce();expect(f.close).toHaveBeenCalledOnce();
 });
 it('昵称存在但stable ID为空必须失败，不能兜底为昵称或随机身份',async()=>{
  const f=fixture();f.setIdentity('');await expect(f.source.login('wechatVideo','/fixture-profile',f.controls)).rejects.toMatchObject({code:'IDENTITY_MISSING'});expect(f.onStopped).toHaveBeenCalledOnce();
 });
 it('采集前重读错账号就阻断全部导出',async()=>{
  const f=fixture();f.setIdentity('another-real-account');await expect(f.source.collectNativeReports('wechatVideo','/fixture-profile','fixture-platform-id',f.controls)).rejects.toMatchObject({code:'WRONG_PLATFORM_IDENTITY'});
  expect(f.reportWitness.prepare).not.toHaveBeenCalled();expect(f.onStopped).toHaveBeenCalledOnce();
 });
 it('只有明确登录页才LOGIN_REQUIRED，下载失败保持普通失败',async()=>{
  const expired=fixture();expired.setLoggedOut(true);await expect(expired.source.readIdentity('wechatVideo','/fixture-profile','fixture-platform-id',expired.controls)).rejects.toMatchObject({code:'LOGIN_REQUIRED'});
  const download=fixture();download.setDownloadFailure(Error('fixture download failed'));await expect(download.source.collectNativeReports('wechatVideo','/fixture-profile','fixture-platform-id',download.controls)).rejects.toMatchObject({code:'DOWNLOAD_FAILED'});
  expect(download.onStopped).toHaveBeenCalledOnce();
 });
 it.each([false,true])('首份prepare失败只发固定诊断，诊断回调抛错=%s仍拒绝并确认实停',async throwing=>{
  const f=fixture(),secret='https://channels.weixin.qq.com/?token=private-test-token /private/profile Cookie=test-secret';
  vi.mocked(f.reportWitness.prepare).mockRejectedValueOnce(Error(secret));
  const onDiagnostic=vi.fn(()=>{if(throwing)throw Error('diagnostic callback '+secret);});
  await expect(f.source.collectNativeReports('wechatVideo','/fixture-profile','fixture-platform-id',{...f.controls,onDiagnostic})).rejects.toMatchObject({code:'BROWSER_OPERATION_FAILED'});
  expect(onDiagnostic).toHaveBeenCalledOnce();
  expect(onDiagnostic).toHaveBeenCalledWith({platform:'wechatVideo',stage:'prepare',kind:'channelsDaily',code:'BROWSER_OPERATION_FAILED',exceptionName:'Error'});
  expect(JSON.stringify(onDiagnostic.mock.calls)).not.toContain('private-test-token');expect(JSON.stringify(onDiagnostic.mock.calls)).not.toContain('/private/profile');expect(JSON.stringify(onDiagnostic.mock.calls)).not.toContain('test-secret');
  expect(f.close).toHaveBeenCalledOnce();expect(f.onStopped).toHaveBeenCalledOnce();
 });
 it.each([
  ['net::ERR_ABORTED at https://channels.weixin.qq.com/?token=private-test-token','NAVIGATION_ABORTED'],
  ['net::ERR_CONNECTION_RESET at https://channels.weixin.qq.com/?token=private-test-token','CONNECTION_RESET'],
  ['net::ERR_TUNNEL_CONNECTION_FAILED at https://channels.weixin.qq.com/?token=private-test-token','TUNNEL_CONNECTION_FAILED'],
  ['Target page, context or browser has been closed Cookie=test-secret','TARGET_CLOSED'],
 ])('导航失败分类%s仅发固定协议类别，不改变原普通失败和关闭',async(message,failureKind)=>{
  const f=fixture(),onDiagnostic=vi.fn();vi.mocked(f.page.goto).mockRejectedValueOnce(Error(message));
  await expect(f.source.collectNativeReports('wechatVideo','/fixture-profile','fixture-platform-id',{...f.controls,onDiagnostic})).rejects.toMatchObject({code:'BROWSER_OPERATION_FAILED'});
  expect(onDiagnostic).toHaveBeenCalledWith({platform:'wechatVideo',stage:'navigate',code:'BROWSER_OPERATION_FAILED',exceptionName:'Error',failureKind});
  expect(JSON.stringify(onDiagnostic.mock.calls)).not.toContain('private-test-token');expect(JSON.stringify(onDiagnostic.mock.calls)).not.toContain('Cookie');
  expect(f.identityWitness.read).not.toHaveBeenCalled();expect(f.reportWitness.prepare).not.toHaveBeenCalled();expect(f.close).toHaveBeenCalledOnce();expect(f.onStopped).toHaveBeenCalledOnce();
 });
 it('登录复核自身失败不覆盖原窗口错误，不能据失败探针判掉登录',async()=>{
  const f=fixture();vi.mocked(f.reportWitness.prepare).mockRejectedValueOnce(new WechatBrowserSourceError('REPORT_WINDOW_MISSING','fixture window missing'));
  vi.mocked(f.identityWitness.isLoggedOut).mockResolvedValueOnce(false).mockRejectedValueOnce(ReferenceError('fixture failed probe'));
  const onDiagnostic=vi.fn();await expect(f.source.collectNativeReports('wechatVideo','/fixture-profile','fixture-platform-id',{...f.controls,onDiagnostic})).rejects.toMatchObject({code:'REPORT_WINDOW_MISSING'});
  expect(onDiagnostic).toHaveBeenCalledWith({platform:'wechatVideo',stage:'prepare',kind:'channelsDaily',code:'REPORT_WINDOW_MISSING',exceptionName:'WechatBrowserSourceError'});expect(f.onStopped).toHaveBeenCalledOnce();
 });
 it('SourceError的任意code与name不进入固定诊断，原异常仍按原类型拒绝',async()=>{
  const f=fixture(),error=new WechatBrowserSourceError('private-source-code','secret-message');error.name='private-error-name';
  vi.mocked(f.reportWitness.prepare).mockRejectedValueOnce(error);const onDiagnostic=vi.fn();
  await expect(f.source.collectNativeReports('wechatVideo','/fixture-profile','fixture-platform-id',{...f.controls,onDiagnostic})).rejects.toBe(error);
  expect(onDiagnostic).toHaveBeenCalledWith({platform:'wechatVideo',stage:'prepare',kind:'channelsDaily',code:'BROWSER_OPERATION_FAILED',exceptionName:'UnknownError'});expect(JSON.stringify(onDiagnostic.mock.calls)).not.toContain('private-');expect(f.onStopped).toHaveBeenCalledOnce();
 });
 it.each(['wechatOfficial','wechatVideo'] as const)('%s逐份接收原生字节；监听在点击前；callback完成后才读下一份',async(platform)=>{
  const f=fixture(platform),received:string[]=[];
  const result=await f.source.collectNativeReports(platform,'/fixture-profile','fixture-platform-id',f.controls,async report=>{received.push(report.kind);f.order.push('commit:'+report.kind);expect(report.bytes).toEqual(f.bytes.get(report.kind));});
  const expected=platform==='wechatOfficial'?['officialContent','officialFollowers']:['channelsDaily','channelsFollowers','channelsWorks'];
  expect(result.map(report=>report.kind)).toEqual(expected);expect(received).toEqual(expected);expect(result.map(report=>report.selection.meaning)).toEqual(expected.map(kind=>kind==='channelsWorks'?'publishedDates':'statisticsDates'));
  if(platform==='wechatVideo')expect(result.find(report=>report.kind==='channelsWorks')?.expectedRows).toBe(13);
  for(const [index,kind] of expected.entries()){
   expect(f.order.indexOf('listen:'+kind)).toBeLessThan(f.order.indexOf('click:'+kind));
   if(index+1<expected.length)expect(f.order.indexOf('commit:'+kind)).toBeLessThan(f.order.indexOf('prepare:'+expected[index+1]));
  }
  expect(f.onStopped).toHaveBeenCalledOnce();
 });
 it('后续报表失败保已交第一份，不重发原报告',async()=>{
  const f=fixture(),prepare=f.reportWitness.prepare;
  f.reportWitness.prepare=vi.fn(async(...args:Parameters<WechatReportWitness['prepare']>)=>{if(args[2]==='channelsFollowers')throw Error('fixture second report failed');return prepare(...args);});
  const received:string[]=[];await expect(f.source.collectNativeReports('wechatVideo','/fixture-profile','fixture-platform-id',f.controls,async report=>{received.push(report.kind);})).rejects.toMatchObject({code:'BROWSER_OPERATION_FAILED'});
  expect(received).toEqual(['channelsDaily']);expect(f.onStopped).toHaveBeenCalledOnce();
 });
 it('标签已改但真实日期仍旧，不触发下载；单篇旧页面总数同样拒绝',async()=>{
  const f=fixture();f.reportWitness.prepare=vi.fn(async()=>({scope:f.page,download:f.locator,state:{selection:{...selection},dates:['2026-10-08']}}));
  await expect(f.source.collectNativeReports('wechatVideo','/fixture-profile','fixture-platform-id',f.controls)).rejects.toMatchObject({code:'REPORT_NOT_READY'});expect(f.locator.click).not.toHaveBeenCalled();
  const g=fixture(),prepare=g.reportWitness.prepare;g.reportWitness.prepare=vi.fn(async(...args:Parameters<WechatReportWitness['prepare']>)=>{const value=await prepare(...args);if(args[2]==='channelsWorks')value.state.reportedRows=4;return value;});
  await expect(g.source.collectNativeReports('wechatVideo','/fixture-profile','fixture-platform-id',g.controls)).rejects.toMatchObject({code:'REPORT_NOT_READY'});
 });
 it('公众号popup缺事件仅请求当前DOM同源href，回执不带查询/会话参数',async()=>{
  const f=fixture('wechatOfficial');f.setHref('/fixture-native-export?session=fixture-only');f.setDownloadFailure(Error('fixture popup has no download'));
  const result=await f.source.collectNativeReports('wechatOfficial','/fixture-profile','fixture-platform-id',f.controls);
  expect(f.request.get).toHaveBeenCalledTimes(2);expect(f.request.get).toHaveBeenCalledWith('https://mp.weixin.qq.com/fixture-native-export?session=fixture-only',expect.objectContaining({maxRedirects:0,timeout:120000}));
  expect(result.map(report=>report.filename)).toEqual(['native.xls','native.xls']);expect(result.map(report=>report.sourcePath)).toEqual(['/misc/appmsganalysis','/misc/useranalysis']);expect(JSON.stringify(result)).not.toContain('session');
 });
 it('跨origin原生href与超大下载拒绝，不复制凭据到其他站点',async()=>{
  const foreign=fixture('wechatOfficial');foreign.setHref('https://other.invalid/export');foreign.setDownloadFailure(Error('fixture popup timeout'));
  await expect(foreign.source.collectNativeReports('wechatOfficial','/fixture-profile','fixture-platform-id',foreign.controls)).rejects.toMatchObject({code:'SOURCE_URL_INVALID'});expect(foreign.request.get).not.toHaveBeenCalled();expect(foreign.locator.click).not.toHaveBeenCalled();
  const huge=fixture();huge.bytes.set('channelsDaily',new Uint8Array(25*1024*1024+1));await expect(huge.source.collectNativeReports('wechatVideo','/fixture-profile','fixture-platform-id',huge.controls)).rejects.toMatchObject({code:'REPORT_TOO_LARGE'});
 });
 it('诊断抛错且关闭未确认仍保宿主租约及原重试，不伪称停止',async()=>{
  const f=fixture();vi.mocked(f.reportWitness.prepare).mockRejectedValueOnce(Error('fixture prepare failed'));f.close.mockRejectedValueOnce(Error('fixture close failed'));
  const onDiagnostic=vi.fn(()=>{throw Error('fixture logger failed');});
  await expect(f.source.collectNativeReports('wechatVideo','/fixture-profile','fixture-platform-id',{...f.controls,onDiagnostic})).rejects.toMatchObject({code:'BROWSER_STOP_UNCONFIRMED',resourceStopUnconfirmed:true});
  expect(onDiagnostic).toHaveBeenCalledOnce();expect(f.onStopped).not.toHaveBeenCalled();const retry=f.onStopUnconfirmed.mock.calls[0]?.[0];expect(retry).toBeTypeOf('function');await retry!();expect(f.onStopped).toHaveBeenCalledOnce();expect(f.close).toHaveBeenCalledTimes(2);
 });
 it('关闭失败保onStopUnconfirmed原重试，未实际关闭不释放宿主',async()=>{
  const f=fixture();f.close.mockRejectedValueOnce(Error('fixture stop unconfirmed'));
  await expect(f.source.login('wechatVideo','/fixture-profile',f.controls)).rejects.toMatchObject({code:'BROWSER_STOP_UNCONFIRMED',resourceStopUnconfirmed:true});
  expect(f.onStopped).not.toHaveBeenCalled();const retry=f.onStopUnconfirmed.mock.calls[0]?.[0];expect(retry).toBeTypeOf('function');await retry!();expect(f.onStopped).toHaveBeenCalledOnce();expect(f.close).toHaveBeenCalledTimes(2);
 });
 it('取消原signal会停止当前context，不等待下载或自动重发',async()=>{
  const f=fixture(),controller=new AbortController();let entered!:()=>void;
  const started=new Promise<void>(resolve=>{entered=resolve;});f.identityWitness.read=vi.fn(async()=>{entered();return new Promise<never>(()=>{});});
  const run=f.source.login('wechatVideo','/fixture-profile',{...f.controls,signal:controller.signal});await started;controller.abort(Error('fixture cancelled'));
  await expect(run).rejects.toThrow('fixture cancelled');expect(f.close).toHaveBeenCalled();expect(f.reportWitness.prepare).not.toHaveBeenCalled();
 });
 it('继承原绝对期限，不把剩余期限重新扩成两分钟',async()=>{
  const f=fixture(),deadlineAt=new Date(Date.now()+800).toISOString();
  const source=createWechatBrowserSource({identityWitness:f.identityWitness,reportWitness:f.reportWitness,openProfile:async(...args)=>{const value=await f.openProfile(...args);expect(args[2].deadlineAt).toBe(deadlineAt);return value;}});
  await source.login('wechatVideo','/fixture-profile',{...f.controls,deadlineAt});
  const options=vi.mocked(f.page.goto).mock.calls[0]?.[1];expect(options?.timeout).toBeGreaterThan(0);expect(options?.timeout).toBeLessThanOrEqual(800);expect(f.onStopped).toHaveBeenCalledOnce();
 });
 it('近30天旧7天表格不能用自身范围自证ready，等实际目标30天才交下载',async()=>{
  // 同源iframe/可见控件是明确fixture；selectionReader先真实报告旧7天，再报告新30天。
  const start='2026-09-09',end='2026-10-08',dates=Array.from({length:30},(_,i)=>new Date(Date.parse(start+'T00:00:00Z')+i*86400000).toISOString().slice(0,10));
  const locator={filter:()=>locator,first:()=>locator,count:async()=>1,click:vi.fn(async()=>{}),evaluateAll:async()=>[]} as unknown as Locator;
  const frame={url:()=>origins.wechatVideo+'/fixture-analysis',getByText:()=>locator,locator:()=>locator} as unknown as Frame;
  const page={url:()=>origins.wechatVideo+'/',locator:()=>locator,frames:()=>[frame],goto:vi.fn(async()=>{})} as unknown as Page;
  const reader=vi.fn(async()=>({selection:{...selection,startDate:start,endDate:end},dates}));
  reader.mockResolvedValueOnce({selection:{...selection,startDate:'2026-10-02',endDate:end},dates:dates.slice(-7)});
  const witness=createWechatNativeDomReportWitness(reader,{now:()=>Date.parse('2026-10-09T04:00:00Z')}),signal=new AbortController().signal;
  const result=await witness.prepare(page,'wechatVideo','channelsDaily',{signal,timeoutMs:()=>120000});
  expect(reader).toHaveBeenCalledTimes(2);expect(result.state.selection).toMatchObject({startDate:start,endDate:end});expect(result.state.dates).toHaveLength(30);
 });
 it('下载结束瞬间取消，原异步下载不得晚交onReport',async()=>{
  const f=fixture(),controller=new AbortController(),onReport=vi.fn(async()=>{});
  f.setStreamClosed(()=>controller.abort(Error('fixture cancel at download completion')));
  const run=f.source.collectNativeReports('wechatVideo','/fixture-profile','fixture-platform-id',{...f.controls,signal:controller.signal},onReport);
  await expect(run).rejects.toThrow('fixture cancel at download completion');
  // 外层race已结束仍等待当前event-loop结算，以覆盖旧内部promise晚交callback的真实风险。
  await new Promise<void>(resolve=>setTimeout(resolve,0));expect(onReport).not.toHaveBeenCalled();expect(f.openProfile).toHaveBeenCalledOnce();
 });
});

// 候选诊断/SDK预算回归：仅合成SDK和生命周期端口，不启动浏览器。
describe('T1110 五字段内部快照与default-open预算候选',()=>{
 const observation={exactTabCount:1,visibleTabCount:0,frameElementVisible:false,documentReadyState:'complete',bodyTextLength:123};
 it('SECTION_MISSING诊断重构五字段，不复制额外secret或引用原对象',async()=>{
  const f=fixture(),payload={...observation,url:'https://secret.invalid/?token=fixture-private',Cookie:'fixture-cookie'};
  const error=Object.assign(new WechatBrowserSourceError('REPORT_SECTION_MISSING','fixture original'),{observation:payload});
  vi.mocked(f.reportWitness.prepare).mockRejectedValueOnce(error);const onDiagnostic=vi.fn();
  await expect(f.source.collectNativeReports('wechatVideo','/fixture-profile','fixture-platform-id',{...f.controls,onDiagnostic})).rejects.toBe(error);
  expect(onDiagnostic).toHaveBeenCalledWith({platform:'wechatVideo',stage:'prepare',kind:'channelsDaily',code:'REPORT_SECTION_MISSING',exceptionName:'WechatBrowserSourceError',observation});
  expect(onDiagnostic.mock.calls[0]?.[0].observation).not.toBe(payload);expect(JSON.stringify(onDiagnostic.mock.calls)).not.toContain('fixture-private');expect(JSON.stringify(onDiagnostic.mock.calls)).not.toContain('fixture-cookie');expect(f.onStopped).toHaveBeenCalledOnce();
 });
 it.each([{...observation,bodyTextLength:Infinity},{...observation,documentReadyState:'fixture-secret'},{...observation,visibleTabCount:2}])('非法五字段快照不输出，原失败与停止仍保留',async payload=>{
  const f=fixture(),error=Object.assign(new WechatBrowserSourceError('REPORT_SECTION_MISSING','fixture original'),{observation:payload}),onDiagnostic=vi.fn();
  vi.mocked(f.reportWitness.prepare).mockRejectedValueOnce(error);
  await expect(f.source.collectNativeReports('wechatVideo','/fixture-profile','fixture-platform-id',{...f.controls,onDiagnostic})).rejects.toBe(error);
  expect(onDiagnostic.mock.calls[0]?.[0]).not.toHaveProperty('observation');expect(f.onStopped).toHaveBeenCalledOnce();
 });
 it('其他错误不接受SECTION观察字段',async()=>{
  const f=fixture(),error=Object.assign(new WechatBrowserSourceError('REPORT_WINDOW_MISSING','fixture original'),{observation}),onDiagnostic=vi.fn();vi.mocked(f.reportWitness.prepare).mockRejectedValueOnce(error);
  await expect(f.source.collectNativeReports('wechatVideo','/fixture-profile','fixture-platform-id',{...f.controls,onDiagnostic})).rejects.toBe(error);expect(onDiagnostic.mock.calls[0]?.[0]).not.toHaveProperty('observation');
 });
 it('公开source默认open为SDK显式120秒，guard覆盖双试和清理',async()=>{
  const f=fixture(),guard=vi.spyOn(guardModule,'guardedLaunch').mockImplementation(async(_directory,launch)=>launch()),realLaunch=launchModule.launchWithBrowser;
  const fallback=vi.spyOn(launchModule,'launchWithBrowser').mockImplementation(run=>realLaunch(run,{resolveBundledExecutable:async()=>'/synthetic/browser'}));
  const sdk=vi.spyOn(chromium,'launchPersistentContext').mockResolvedValue(f.context);
  try{
   const source=createWechatBrowserSource({identityWitness:f.identityWitness,reportWitness:f.reportWitness});await source.login('wechatVideo','/tmp/t1110-candidate-sdk-profile',f.controls);
   expect(sdk).toHaveBeenCalledOnce();expect(sdk.mock.calls[0]?.[1]).toMatchObject({channel:'chrome',timeout:120000,headless:false});
   expect(guard.mock.calls[0]?.[2]).toMatchObject({timeoutMs:370000,queueTimeoutMs:370000,onStopped:f.onStopped});expect(f.close).toHaveBeenCalledOnce();expect(f.onStopped).toHaveBeenCalledOnce();
  }finally{sdk.mockRestore();fallback.mockRestore();guard.mockRestore();}
 });
 it('默认open fallback沿同父deadline重新取剩余预算，不能续两分钟',async()=>{
  vi.useFakeTimers();vi.setSystemTime(Date.parse('2026-10-09T04:00:00Z'));const f=fixture();
  const guard=vi.spyOn(guardModule,'guardedLaunch').mockImplementation(async(_directory,launch)=>launch()),realLaunch=launchModule.launchWithBrowser;
  const fallback=vi.spyOn(launchModule,'launchWithBrowser').mockImplementation(run=>realLaunch(run,{resolveBundledExecutable:async()=>'/synthetic/browser'}));
  const sdk=vi.spyOn(chromium,'launchPersistentContext').mockImplementationOnce(async()=>{vi.setSystemTime(Date.now()+45000);throw Error('fixture first launch failed');}).mockResolvedValueOnce(f.context);
  try{
   const deadlineAt=new Date(Date.now()+90000).toISOString(),source=createWechatBrowserSource({identityWitness:f.identityWitness,reportWitness:f.reportWitness});await source.login('wechatVideo','/tmp/t1110-candidate-sdk-profile', {...f.controls,deadlineAt});
   expect(sdk).toHaveBeenCalledTimes(2);expect(sdk.mock.calls[0]?.[1]).toMatchObject({channel:'chrome',timeout:90000});expect(sdk.mock.calls[1]?.[1]).toMatchObject({executablePath:'/synthetic/browser',timeout:45000});
   expect(vi.mocked(f.page.goto).mock.calls[0]?.[1]?.timeout).toBe(45000);expect(f.onStopped).toHaveBeenCalledOnce();
  }finally{sdk.mockRestore();fallback.mockRestore();guard.mockRestore();vi.useRealTimers();}
 });
 it('managed原end明确冻结，默认串行启动余量和显式较早预算不续期',async()=>{
  vi.useFakeTimers();vi.setSystemTime(Date.parse('2026-10-09T04:00:00Z'));try{
   const f=fixture(),start=Date.now();await f.source.login('wechatVideo','/fixture-profile',f.controls);
   const first=f.openProfile.mock.calls[0]?.[2] as {deadlineAt?:string};expect(Date.parse(first.deadlineAt!)-start).toBe(1970000);
   f.openProfile.mockClear();await f.source.login('wechatVideo','/fixture-profile',{...f.controls,timeoutMs:120000});const next=f.openProfile.mock.calls[0]?.[2] as {deadlineAt?:string};expect(Date.parse(next.deadlineAt!)-start).toBe(120000);
  }finally{vi.useRealTimers();}
 });
 it('原取消后fallback不得再次调用SDK，default-open保原signal',async()=>{
  const f=fixture(),controller=new AbortController(),reason=Error('fixture user cancel');
  const guard=vi.spyOn(guardModule,'guardedLaunch').mockImplementation(async(_directory,launch,options)=>{try{return await launch();}catch(error){await options?.onStopped?.();throw error;}}),realLaunch=launchModule.launchWithBrowser;
  const fallback=vi.spyOn(launchModule,'launchWithBrowser').mockImplementation(run=>realLaunch(run,{resolveBundledExecutable:async()=>'/synthetic/browser'}));
  const logging=vi.spyOn(console,'error').mockImplementation(()=>{}),sdk=vi.spyOn(chromium,'launchPersistentContext').mockImplementationOnce(async()=>{controller.abort(reason);throw Error('fixture first launch interrupted');}).mockResolvedValue(f.context);
  try{const source=createWechatBrowserSource({identityWitness:f.identityWitness,reportWitness:f.reportWitness});await expect(source.login('wechatVideo','/tmp/t1110-candidate-sdk-profile',{...f.controls,signal:controller.signal})).rejects.toBe(reason);expect(sdk).toHaveBeenCalledOnce();expect(f.identityWitness.read).not.toHaveBeenCalled();expect(f.onStopped).toHaveBeenCalledOnce();}
  finally{sdk.mockRestore();logging.mockRestore();fallback.mockRestore();guard.mockRestore();}
 });
});

// 身份reader预算必须按真实导航/两段观察列入；不借启动余量覆盖另一个消费者。
describe('T1110 固定内部身份诊断与默认身份串行预算候选',()=>{
 it('T1354 身份读取普通异常只提示核验阶段，保安全code与资源停止',async()=>{
  const f=fixture('wechatOfficial');vi.mocked(f.identityWitness.read).mockRejectedValueOnce(Error('fixture-private-url'));
  await expect(f.source.login('wechatOfficial','/fixture-profile',f.controls)).rejects.toMatchObject({code:'BROWSER_OPERATION_FAILED',message:'微信账号身份暂未核对完成，请查看原任务'});
  expect(f.close).toHaveBeenCalledOnce();expect(f.onStopped).toHaveBeenCalledOnce();
 });
 it.each(['ENTRY_NOT_READY','FIELDS_NOT_READY'])('固定内部身份code %s不输出原message，保原中文普通失败与实停',async code=>{
  const f=fixture('wechatOfficial'),message='微信后台数据尚未就绪，请查看原任务',error=new WechatBrowserSourceError(code,message),onDiagnostic=vi.fn();
  vi.mocked(f.identityWitness.read).mockRejectedValueOnce(error);
  await expect(f.source.login('wechatOfficial','/fixture-profile',{...f.controls,onDiagnostic})).rejects.toBe(error);
  expect(error.message).toBe(message);expect(onDiagnostic).toHaveBeenCalledWith({platform:'wechatOfficial',stage:'readIdentity',code,exceptionName:'WechatBrowserSourceError'});
  expect(f.identityWitness.isLoggedOut).not.toHaveBeenCalled();expect(f.onStopped).toHaveBeenCalledOnce();
 });
 it.each([
  ['wechatOfficial','login',2450000],['wechatOfficial','readIdentity',2450000],['wechatOfficial','collectNativeReports',4850000],
  ['wechatVideo','login',1970000],['wechatVideo','readIdentity',1970000],['wechatVideo','collectNativeReports',8450000],
 ] as const)('%s %s默认逐项计入身份串行预算（原end冻结）',async(platform,method,budget)=>{
  vi.useFakeTimers();vi.setSystemTime(Date.parse('2026-10-09T04:00:00Z'));
  try{
   const f=fixture(platform),start=Date.now();
   if(method==='login')await f.source.login(platform,'/fixture-profile',f.controls);
   else if(method==='readIdentity')await f.source.readIdentity(platform,'/fixture-profile','fixture-platform-id',f.controls);
   else await f.source.collectNativeReports(platform,'/fixture-profile','fixture-platform-id',f.controls);
   const managed=f.openProfile.mock.calls[0]?.[2] as {deadlineAt?:string};expect(Date.parse(managed.deadlineAt!)-start).toBe(budget);
   expect(f.onStopped).toHaveBeenCalledOnce();
   f.openProfile.mockClear();const inherited=new Date(start+90000).toISOString();
   await f.source.login(platform,'/fixture-profile',{...f.controls,timeoutMs:120000,deadlineAt:inherited});
   expect((f.openProfile.mock.calls[0]?.[2] as {deadlineAt?:string}).deadlineAt).toBe(inherited);
  }finally{vi.useRealTimers();}
 });
});

// 私有图像文件仅使用/tmp合成字节；没有真实浏览器、账户或截图。
async function privateImageDirectory(){return fsPromises.mkdtemp('/tmp/t1110-private-image-fixture-');}
function privateImageFixture(directory?:string,platform:WechatCreatorPlatform='wechatVideo'){
 const f=fixture(platform),originalPrepare=vi.mocked(f.reportWitness.prepare).getMockImplementation()!;
 let current=origins[platform]+'/platform',closed=false;
 const url=vi.spyOn(f.page,'url').mockImplementation(()=>current),error=new WechatBrowserSourceError('REPORT_SECTION_MISSING','fixture original missing section');
 const prepare=vi.mocked(f.reportWitness.prepare).mockImplementation(async(_page,_platform,kind)=>{current=origins[platform]+(kind==='channelsFollowers'?'/platform/statistic/follower':platform==='wechatVideo'?'/platform/statistic/post':'/misc/appmsganalysis');throw error;});
 const screenshot=vi.fn<(_options:unknown)=>Promise<Buffer>>(async()=>Buffer.from('synthetic-private-image-bytes'));Object.assign(f.page,{screenshot});
 f.close.mockImplementation(async()=>{if(!closed){closed=true;await f.onStopped();}});
 const source=createWechatBrowserSource({identityWitness:f.identityWitness,reportWitness:f.reportWitness,openProfile:f.openProfile,privateFailureImageDir:directory});
 return {...f,source,error,screenshot,prepare,originalPrepare,setUrl:(value:string)=>{current=value;},dispose:()=>url.mockRestore()};
}
describe('T1110 受信私有失败图候选（实际/tmp文件+合成Page）',()=>{
 it('私有失败图启用时保存一次viewport，原失败/诊断/停止仍一条且文件0600无账号ID',async()=>{
  const directory=await privateImageDirectory(),f=privateImageFixture(directory),onDiagnostic=vi.fn(),onReport=vi.fn(async()=>{});
  try{
   await expect(f.source.collectNativeReports('wechatVideo','/synthetic-only-profile','fixture-platform-id',{...f.controls,onDiagnostic},onReport)).rejects.toBe(f.error);
   expect(f.screenshot).toHaveBeenCalledOnce();expect(f.screenshot).toHaveBeenCalledWith({type:'png',fullPage:false,timeout:expect.any(Number)});
   const names=await fsPromises.readdir(directory);expect(names).toHaveLength(1);expect(names[0]).toMatch(/^[0-9a-f]{32}\.png$/);
   expect((await fsPromises.lstat(directory+'/'+names[0])).mode&0o777).toBe(0o600);expect((await fsPromises.lstat(directory)).mode&0o777).toBe(0o700);
   expect(await fsPromises.readFile(directory+'/'+names[0])).toEqual(Buffer.from('synthetic-private-image-bytes'));
   expect(onReport).not.toHaveBeenCalled();expect(onDiagnostic).toHaveBeenCalledOnce();expect(f.onStopped).toHaveBeenCalledOnce();
   expect(JSON.stringify(onDiagnostic.mock.calls)).not.toContain(directory);expect(JSON.stringify(onDiagnostic.mock.calls)).not.toContain('synthetic-private-image-bytes');
  }finally{f.dispose();await fsPromises.rm(directory,{recursive:true,force:true});}
 });
 it('同deadline不足120秒仍只用原remaining截图，父期限不续期',async()=>{
  const directory=await privateImageDirectory(),f=privateImageFixture(directory),deadlineAt=new Date(Date.now()+90000).toISOString();
  try{await expect(f.source.collectNativeReports('wechatVideo','/synthetic-only-profile','fixture-platform-id',{...f.controls,deadlineAt})).rejects.toBe(f.error);expect(f.screenshot).toHaveBeenCalledOnce();expect((f.screenshot.mock.calls[0]?.[0] as {timeout:number}).timeout).toBeLessThanOrEqual(90000);expect((await fsPromises.readdir(directory))).toHaveLength(1);}
  finally{f.dispose();await fsPromises.rm(directory,{recursive:true,force:true});}
 });
 it.each(['off','official','identity','ambiguous','download','submit'] as const)('%s不触发私有截图，不新增报告/自动重发',async mode=>{
  const directory=await privateImageDirectory(),platform=mode==='official'?'wechatOfficial':'wechatVideo',f=privateImageFixture(mode==='off'?undefined:directory,platform);
  try{
   if(mode==='identity')f.setIdentity('different-account');
   if(mode==='ambiguous')f.prepare.mockRejectedValueOnce(new WechatBrowserSourceError('REPORT_SECTION_AMBIGUOUS','fixture ambiguous'));
   if(mode==='download'||mode==='submit')f.prepare.mockImplementation(f.originalPrepare);
   if(mode==='download')f.setDownloadFailure(Error('fixture download failed'));
   await expect(f.source.collectNativeReports(platform,'/synthetic-only-profile','fixture-platform-id',f.controls,mode==='submit'?async()=>{throw f.error;}:undefined)).rejects.toBeDefined();
   expect(f.screenshot).not.toHaveBeenCalled();expect(await fsPromises.readdir(directory)).toEqual([]);expect(f.openProfile).toHaveBeenCalledOnce();
  }finally{f.dispose();await fsPromises.rm(directory,{recursive:true,force:true});}
 });
 it.each(['prePath','preForeign','catchUnknown','preLogin','preUnknown','postPath','postLogin','postUnknown'] as const)('%s跳过私有图片，检测不确定不改变原普通失败',async mode=>{
  const directory=await privateImageDirectory(),f=privateImageFixture(directory);
  try{
   if(mode==='prePath'||mode==='preForeign')f.prepare.mockImplementation(async()=>{f.setUrl(mode==='prePath'?origins.wechatVideo+'/platform': 'https://foreign.invalid/platform/statistic/post');throw f.error;});
   const loggedOut=vi.mocked(f.identityWitness.isLoggedOut);loggedOut.mockResolvedValueOnce(false);
   if(mode==='catchUnknown')loggedOut.mockRejectedValueOnce(Error('fixture unknown original login probe'));else loggedOut.mockResolvedValueOnce(false);
   if(mode==='preLogin')loggedOut.mockResolvedValueOnce(true);
   if(mode==='preUnknown')loggedOut.mockRejectedValueOnce(Error('fixture unknown current login state'));
   if(mode==='postLogin')loggedOut.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
   if(mode==='postUnknown')loggedOut.mockResolvedValueOnce(false).mockRejectedValueOnce(Error('fixture unknown post login state'));
   if(mode==='postPath')f.screenshot.mockImplementation(async()=>{f.setUrl(origins.wechatVideo+'/platform');return Buffer.from('synthetic-private-image-bytes');});
   await expect(f.source.collectNativeReports('wechatVideo','/synthetic-only-profile','fixture-platform-id',f.controls)).rejects.toBe(f.error);
   expect(await fsPromises.readdir(directory)).toEqual([]);expect(f.screenshot).toHaveBeenCalledTimes(mode.startsWith('post')?1:0);
  }finally{f.dispose();await fsPromises.rm(directory,{recursive:true,force:true});}
 });
 it.each(['screenshot','write'] as const)('%s普通异常保原SECTION_MISSING与实停，不发第二诊断',async mode=>{
  const directory=await privateImageDirectory(),f=privateImageFixture(directory),onDiagnostic=vi.fn();
  const write=mode==='write'?vi.spyOn(fsPromises,'writeFile').mockRejectedValueOnce(Error('private internal I/O error')):undefined;
  try{if(mode==='screenshot')f.screenshot.mockRejectedValueOnce(Error('private internal screenshot error'));await expect(f.source.collectNativeReports('wechatVideo','/synthetic-only-profile','fixture-platform-id',{...f.controls,onDiagnostic})).rejects.toBe(f.error);expect(await fsPromises.readdir(directory)).toEqual([]);expect(onDiagnostic).toHaveBeenCalledOnce();expect(f.onStopped).toHaveBeenCalledOnce();}
  finally{write?.mockRestore();f.dispose();await fsPromises.rm(directory,{recursive:true,force:true});}
 });
 it.each(['cancel','deadline','localWait'] as const)('%s中断挂起截图，晚bytes不落盘/晚提交/第二诊断',async mode=>{
  const directory=await privateImageDirectory(),f=privateImageFixture(directory),controller=new AbortController(),onDiagnostic=vi.fn(),onReport=vi.fn(async()=>{}),reason=Error('fixture original cancellation');
  let release!:(bytes:Buffer)=>void,entered!:()=>void;const screenshotStarted=new Promise<void>(resolve=>{entered=resolve;});
  f.screenshot.mockImplementation(()=>{entered();return new Promise<Buffer>(resolve=>{release=resolve;});});
  vi.useFakeTimers();try{
   const deadlineAt=new Date(Date.now()+(mode==='deadline'?90000:240000)).toISOString(),run=f.source.collectNativeReports('wechatVideo','/synthetic-only-profile','fixture-platform-id',{...f.controls,signal:controller.signal,deadlineAt,onDiagnostic},onReport);
   const rejected=mode==='cancel'?expect(run).rejects.toBe(reason):mode==='deadline'?expect(run).rejects.toMatchObject({code:'EXECUTION_DEADLINE_EXCEEDED'}):expect(run).rejects.toBe(f.error);
   await screenshotStarted;if(mode==='cancel')controller.abort(reason);else await vi.advanceTimersByTimeAsync(mode==='deadline'?90000:120000);await rejected;
   release(Buffer.from('late synthetic bytes'));await vi.advanceTimersByTimeAsync(0);expect(await fsPromises.readdir(directory)).toEqual([]);expect(onReport).not.toHaveBeenCalled();expect(onDiagnostic).toHaveBeenCalledOnce();expect(f.onStopped).toHaveBeenCalledOnce();
  }finally{vi.useRealTimers();f.dispose();await fsPromises.rm(directory,{recursive:true,force:true});}
 });
 it('原取消中断挂起write，晚write不rename且临时文件清理',async()=>{
  const directory=await privateImageDirectory(),f=privateImageFixture(directory),controller=new AbortController(),reason=Error('fixture original cancellation'),realWrite=fsPromises.writeFile;
  let release!:()=>void,entered!:()=>void;const writing=new Promise<void>(resolve=>{entered=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});
  const write=vi.spyOn(fsPromises,'writeFile').mockImplementationOnce(async(file,data,options)=>{expect((options as {signal?:AbortSignal}).signal).toBeInstanceOf(AbortSignal);await realWrite(file,data,{flag:'wx',mode:0o600});entered();await gate;});
  try{
   const run=f.source.collectNativeReports('wechatVideo','/synthetic-only-profile','fixture-platform-id',{...f.controls,signal:controller.signal}),rejected=expect(run).rejects.toBe(reason);await writing;controller.abort(reason);await rejected;release();await new Promise(resolve=>setTimeout(resolve,10));expect(await fsPromises.readdir(directory)).toEqual([]);expect(f.onStopped).toHaveBeenCalledOnce();
  }finally{release?.();write.mockRestore();f.dispose();await fsPromises.rm(directory,{recursive:true,force:true});}
 });
 it('rename后真实到期立即移除final，原deadline优先而非保留晚图片',async()=>{
  const directory=await privateImageDirectory(),f=privateImageFixture(directory),realRename=fs.renameSync;
  vi.useFakeTimers();const deadlineAt=new Date(Date.now()+240000).toISOString(),rename=vi.spyOn(fs,'renameSync').mockImplementation((from,to)=>{realRename(from,to);vi.setSystemTime(Date.parse(deadlineAt)+1);});
  try{await expect(f.source.collectNativeReports('wechatVideo','/synthetic-only-profile','fixture-platform-id',{...f.controls,deadlineAt})).rejects.toMatchObject({code:'EXECUTION_DEADLINE_EXCEEDED'});expect(rename).toHaveBeenCalledOnce();expect(await fsPromises.readdir(directory)).toEqual([]);expect(f.onStopped).toHaveBeenCalledOnce();}
  finally{rename.mockRestore();vi.useRealTimers();f.dispose();await fsPromises.rm(directory,{recursive:true,force:true});}
 });
 it('rename后到期cleanup瞬时EIO有限重试后真实删除final，仍只原deadline失败',async()=>{
  const directory=await privateImageDirectory(),f=privateImageFixture(directory),realRename=fs.renameSync,realUnlink=fsPromises.unlink;
  let transientFailures=0,finalAttempts=0;
  vi.useFakeTimers();const deadlineAt=new Date(Date.now()+240000).toISOString();
  const rename=vi.spyOn(fs,'renameSync').mockImplementation((from,to)=>{realRename(from,to);vi.setSystemTime(Date.parse(deadlineAt)+1);});
  const unlink=vi.spyOn(fsPromises,'unlink').mockImplementation(async file=>{
   if(String(file).endsWith('.png')){finalAttempts++;if(transientFailures++===0)throw Object.assign(Error('fixture transient I/O error'),{code:'EIO'});}
   return realUnlink(file);
  });
  const onDiagnostic=vi.fn();
  try{
   await expect(f.source.collectNativeReports('wechatVideo','/synthetic-only-profile','fixture-platform-id',{...f.controls,deadlineAt,onDiagnostic})).rejects.toMatchObject({code:'EXECUTION_DEADLINE_EXCEEDED'});
   expect(rename).toHaveBeenCalledOnce();expect(await fsPromises.readdir(directory)).toEqual([]);expect(finalAttempts).toBe(2);expect(onDiagnostic).toHaveBeenCalledOnce();expect(f.onStopped).toHaveBeenCalledOnce();
  }finally{unlink.mockRestore();rename.mockRestore();vi.useRealTimers();f.dispose();await fsPromises.rm(directory,{recursive:true,force:true});}
 });
 it.each(['wide','symlink','outside'] as const)('%s私有目录拒绝保存，原失败不变且不改目录权限',async mode=>{
  const directory=await privateImageDirectory();let configured=directory;
  if(mode==='wide')await fsPromises.chmod(directory,0o755);
  if(mode==='symlink'){configured=directory+'/link';await fsPromises.symlink(directory,configured);}
  if(mode==='outside')configured='/not-under-tmp/t1110-synthetic-only';
  const f=privateImageFixture(configured);
  try{await expect(f.source.collectNativeReports('wechatVideo','/synthetic-only-profile','fixture-platform-id',f.controls)).rejects.toBe(f.error);expect(await fsPromises.readdir(directory)).toEqual(mode==='symlink'?['link']:[]);if(mode==='wide')expect((await fsPromises.lstat(directory)).mode&0o777).toBe(0o755);}
  finally{f.dispose();await fsPromises.rm(directory,{recursive:true,force:true});}
 });
 it('截图普通失败后browser停止未确认仍保真实onStopUnconfirmed，不提前释放',async()=>{
  const directory=await privateImageDirectory(),f=privateImageFixture(directory);f.screenshot.mockRejectedValueOnce(Error('fixture screenshot failed'));f.close.mockRejectedValue(Error('fixture actual stop failed'));
  try{await expect(f.source.collectNativeReports('wechatVideo','/synthetic-only-profile','fixture-platform-id',f.controls)).rejects.toMatchObject({code:'BROWSER_STOP_UNCONFIRMED',resourceStopUnconfirmed:true});expect(f.onStopUnconfirmed).toHaveBeenCalledOnce();expect(f.onStopped).not.toHaveBeenCalled();expect(await fsPromises.readdir(directory)).toEqual([]);}
  finally{f.dispose();await fsPromises.rm(directory,{recursive:true,force:true});}
 });
});
