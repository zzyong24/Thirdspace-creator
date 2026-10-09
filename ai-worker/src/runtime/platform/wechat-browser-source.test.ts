import {Readable} from 'node:stream';
import type {BrowserContext,Download,Frame,Locator,Page} from '@playwright/test';
import {describe,expect,it,vi} from 'vitest';
import {createWechatBrowserSource,createWechatNativeDomReportWitness,type WechatCreatorPlatform,type WechatIdentityWitness,type WechatReportWitness,type WechatReportPageState,WechatBrowserSourceError} from './wechat-browser-source';
// 仅Chromium/页面/下载为明确fixture，实际source负责账号核对、原生事件、字节边界和停止协议。
// 不连接真实账号，不把以下displayName或stable ID宣称为两平台已测身份字段。
const origins={wechatOfficial:'https://mp.weixin.qq.com',wechatVideo:'https://channels.weixin.qq.com'};
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
