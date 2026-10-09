import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import type {BrowserContext,Download,Frame,Locator,Page} from '@playwright/test';
import type {NativeReportKind,NativeReportPayload} from '@creatoros/contract';
import {completionWaitMs,executionTimeoutMs,remainingDeadlineMs} from '@creatoros/contract/timeout-policy';
import {guardedLaunch,chromiumSandboxOpts} from '../browser/chromium-guard';
import {launchWithBrowser} from '../browser/browser-launch';

export type WechatCreatorPlatform='wechatOfficial'|'wechatVideo';
export type WechatBrowserDiagnostic={platform:WechatCreatorPlatform;stage:'openProfile'|'navigate'|'readIdentity'|'prepare'|'download'|'submit';kind?:NativeReportKind;code:string;exceptionName:string;failureKind?:'NAVIGATION_ABORTED'|'CONNECTION_RESET'|'TUNNEL_CONNECTION_FAILED'|'TARGET_CLOSED'};
export type WechatBrowserControls={signal?:AbortSignal;deadlineAt?:string|null;timeoutMs?:number;onStopped?:()=>Promise<void>;onStopUnconfirmed?:(retry:()=>Promise<void>)=>void;onDiagnostic?:(event:WechatBrowserDiagnostic)=>void};
export type WechatNativeDownload={kind:NativeReportKind;bytes:Uint8Array;filename:string;sourcePath:NativeReportPayload['sourcePath'];selection:NativeReportPayload['selection'];expectedRows?:number};
export type WechatCreatorIdentity={platformIdentity:string;displayName:string;source:string};
export class WechatBrowserSourceError extends Error{
 constructor(readonly code:string,message:string){super(message);this.name='WechatBrowserSourceError';}
}
const origins:Record<WechatCreatorPlatform,string>={wechatOfficial:'https://mp.weixin.qq.com',wechatVideo:'https://channels.weixin.qq.com'};
const paths:Record<NativeReportKind,NativeReportPayload['sourcePath']>={officialContent:'/misc/appmsganalysis',officialFollowers:'/misc/useranalysis',channelsDaily:'/platform/statistic/post',channelsFollowers:'/platform/statistic/follower',channelsWorks:'/platform/statistic/post'};
const kinds:Record<WechatCreatorPlatform,readonly NativeReportKind[]>={wechatOfficial:['officialContent','officialFollowers'],wechatVideo:['channelsDaily','channelsFollowers','channelsWorks']};
const MAX_BYTES=25*1024*1024;
// SEMANTIC_BOUNDARY_ALLOW: 固定错误协议与诊断脱敏，不推断内容或登录状态。
const diagnosticCodes=new Set(['BROWSER_OPERATION_FAILED','BROWSER_STOP_UNCONFIRMED','DOWNLOAD_EMPTY','DOWNLOAD_FAILED','EXECUTION_DEADLINE_EXCEEDED','EXECUTION_DEADLINE_INVALID','EXECUTION_TIMEOUT_INVALID','FILENAME_INVALID','FILENAME_MISSING','IDENTITY_MISSING','IDENTITY_SOURCE_INVALID','IDENTITY_WITNESS_MISSING','LOGIN_REQUIRED','REPORT_LINK_MISSING','REPORT_LINK_AMBIGUOUS','REPORT_NOT_READY','REPORT_PAGE_MISSING','REPORT_SECTION_MISSING','REPORT_SECTION_AMBIGUOUS','REPORT_PLATFORM_MISMATCH','REPORT_TOO_LARGE','REPORT_WINDOW_INVALID','REPORT_WINDOW_MISSING','REPORT_WITNESS_MISSING','REPORT_RESPONSE_INVALID','SOURCE_URL_INVALID','WRONG_PLATFORM_IDENTITY']);
const diagnosticNames=new Set(['Error','TimeoutError','TypeError','ReferenceError','SyntaxError','WechatBrowserSourceError']);
type Trace=Pick<WechatBrowserDiagnostic,'stage'|'kind'>;
function protocolFailure(error:unknown):WechatBrowserDiagnostic['failureKind']{
 if(!(error instanceof Error))return undefined;
 // 固定Chromium/Playwright协议分类只帮助查错，不据此推断Cookie、账号或采集状态。
 if(error.message.includes('net::ERR_ABORTED'))return 'NAVIGATION_ABORTED';
 if(error.message.includes('net::ERR_CONNECTION_RESET'))return 'CONNECTION_RESET';
 if(error.message.includes('net::ERR_TUNNEL_CONNECTION_FAILED'))return 'TUNNEL_CONNECTION_FAILED';
 if(error.message.includes('Target page, context or browser has been closed'))return 'TARGET_CLOSED';
 return undefined;
}
function emitDiagnostic(controls:WechatBrowserControls,platform:WechatCreatorPlatform,trace:Trace,error:unknown){
 try{const failureKind=protocolFailure(error);controls.onDiagnostic?.({platform,...trace,code:error instanceof WechatBrowserSourceError&&diagnosticCodes.has(error.code)?error.code:'BROWSER_OPERATION_FAILED',exceptionName:error instanceof Error&&diagnosticNames.has(error.name)?error.name:'UnknownError',...(failureKind?{failureKind}:{})});}catch{/* 诊断端口不能影响原错误、关闭或宿主停止确认。 */}
}

export interface WechatOperationControls{signal:AbortSignal;timeoutMs(requested?:number):number}
/** 内部受信端口：只能读取普通账号信息页真实stable ID，不接受公开调用者assert的ID。
 * 宿主装配已实测的普通页reader；默认缺失仍失败，不猜uin/session或昵称。
 */
export interface WechatIdentityWitness{
 read(page:Page,platform:WechatCreatorPlatform,controls:WechatOperationControls):Promise<{platform:WechatCreatorPlatform;platformIdentity:string;displayName:string;sourcePath:string}|null>;
 /** 仅真实登录页/平台明确会话无效证据可返回true；网络、导出失败、空ID都不算。 */
 isLoggedOut(page:Page,platform:WechatCreatorPlatform,controls:WechatOperationControls):Promise<boolean>;
}
export interface WechatReportPageState{
 selection:NativeReportPayload['selection'];
 /** 日报须实际表格出现完整日期；选项标签本身不构成数据ready证明。 */
 dates:readonly string[];
 /** 公众号图表/分页页：实际可见输入与当前原生href独立核对的日期，不是假造表格日期。 */
 windowEvidence?:{kind:'nativeDateInputs';startDate:string;endDate:string};
 /** 单篇须实际选中本窗口且页面总数已更新；不是第一页可见行数。 */
 selectedWindow?:boolean;reportedRows?:number;visibleRows?:number;
}
export interface WechatPreparedReport{scope:Page|Frame;download:Locator;state:WechatReportPageState;verify?:()=>Promise<void>}
export interface WechatReportWitness{
 prepare(page:Page,platform:WechatCreatorPlatform,kind:NativeReportKind,controls:WechatOperationControls):Promise<WechatPreparedReport>;
}
const fail=(code:string,message:string):never=>{throw new WechatBrowserSourceError(code,message);};
function officialUrl(value:string,base:string,platform:WechatCreatorPlatform):URL{
 let url:URL;try{url=new URL(value,base);}catch{return fail('SOURCE_URL_INVALID','平台原生链接无效');}
 if(url.origin!==origins[platform]||url.username||url.password)return fail('SOURCE_URL_INVALID','平台原生链接不属于当前官方会话');
 return url;
}
function filename(value:string):string{
 const name=path.posix.basename(value.replace(/\\/g,'/'));
 if(!name||name==='.'||name==='..'||name.length>200||/[\x00-\x1f]/.test(name))return fail('FILENAME_INVALID','平台原生报表文件名无效');
 return name;
}
function headerFilename(header:string|undefined):string{
 if(!header)return fail('FILENAME_MISSING','平台下载响应没有原生文件名');
 const extended=/filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header)?.[1];
 const ordinary=/filename\s*=\s*(?:"([^"]+)"|([^;]+))/i.exec(header);
 try{return filename(extended?decodeURIComponent(extended.trim()):(ordinary?.[1]??ordinary?.[2]??'').trim());}
 catch(error){if(error instanceof WechatBrowserSourceError)throw error;return fail('FILENAME_INVALID','平台原生报表文件名无效');}
}
/** SEMANTIC_BOUNDARY_ALLOW: 只校验日期协议与页面已显示的日期集合，不解释内容或推断指标口径。 */
function datesBetween(start:string,end:string):string[]{
 const valid=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
 if(!valid(start)||!valid(end)||start>end)return fail('REPORT_WINDOW_INVALID','平台报表日期范围无效');
 const days=(Date.parse(end+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/86400000+1;
 if(days>10000)return fail('REPORT_WINDOW_INVALID','平台报表日期范围过大');
 return Array.from({length:days},(_,i)=>new Date(Date.parse(start+'T00:00:00Z')+i*86400000).toISOString().slice(0,10));
}
function assertReady(kind:NativeReportKind,state:WechatReportPageState){
 const selected=state.selection,work=kind==='channelsWorks';
 if(selected.timeZone!=='Asia/Shanghai'||selected.meaning!==(work?'publishedDates':'statisticsDates'))return fail('REPORT_WINDOW_INVALID','平台报表统计口径与页面不符');
 const expected=datesBetween(selected.startDate,selected.endDate);
 if(work){
  if(!state.selectedWindow||!Number.isSafeInteger(state.reportedRows)||state.reportedRows!<0||!Number.isSafeInteger(state.visibleRows)||state.visibleRows!<0||state.visibleRows!>state.reportedRows!)return fail('REPORT_NOT_READY','单篇视频窗口与页面总数尚未就绪');
 }else if(kind.startsWith('official')&&state.windowEvidence?.kind==='nativeDateInputs'){
  if(state.windowEvidence.startDate!==selected.startDate||state.windowEvidence.endDate!==selected.endDate||state.dates.some(day=>!expected.includes(day)))return fail('REPORT_NOT_READY','原生下载日期尚未对应当前选择');
 }else{
  const actual=[...new Set(state.dates)].sort();
  if(actual.length!==expected.length||actual.some((v,i)=>v!==expected[i]))return fail('REPORT_NOT_READY','报表表格日期尚未更新完整');
 }
}
function operation(signal:AbortSignal,deadline:number):WechatOperationControls{
 return {signal,timeoutMs(requested?:number){signal.throwIfAborted();const remaining=remainingDeadlineMs(deadline)!;if(remaining<=0)return fail('EXECUTION_DEADLINE_EXCEEDED','原采集期限已用尽');return Math.min(executionTimeoutMs(requested),remaining);}};
}
async function open(directory:string,headless:boolean,controls:WechatBrowserControls):Promise<BrowserContext>{
 return guardedLaunch(directory,async()=>{
  controls.signal?.throwIfAborted();await mkdir(directory,{recursive:true});controls.signal?.throwIfAborted();
  const {chromium}=await import('@playwright/test');
  return launchWithBrowser(selection=>chromium.launchPersistentContext(directory,{...selection,...chromiumSandboxOpts(),headless,viewport:{width:1440,height:900},locale:'zh-CN',timezoneId:'Asia/Shanghai',acceptDownloads:true,args:['--no-first-run','--no-default-browser-check']}));
 },{label:'微信创作者浏览器',signal:controls.signal,onStopped:controls.onStopped});
}
async function closeProfile(context:BrowserContext,controls:WechatBrowserControls){
 try{await context.close();}catch{
  controls.onStopUnconfirmed?.(()=>context.close());
  throw Object.assign(new WechatBrowserSourceError('BROWSER_STOP_UNCONFIRMED','微信浏览器停止尚未确认，请保留原任务等待清理'),{resourceStopUnconfirmed:true});
 }
}
/** 尚未打开任何浏览器时，明确通知宿主释放已经取得的租约。 */
async function rejectBeforeOpen(controls:WechatBrowserControls,error:WechatBrowserSourceError):Promise<never>{
 try{await controls.onStopped?.();}catch{
  controls.onStopUnconfirmed?.(async()=>{await controls.onStopped?.();});
  throw Object.assign(new WechatBrowserSourceError('BROWSER_STOP_UNCONFIRMED','微信浏览器资源释放尚未确认'),{resourceStopUnconfirmed:true});
 }
 throw error;
}
async function bounded<T>(action:()=>Promise<T>,signal:AbortSignal):Promise<T>{
 signal.throwIfAborted();let abort:(()=>void)|undefined;
 try{return await Promise.race([Promise.resolve().then(action),new Promise<never>((_,reject)=>{abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();})]);}
 finally{if(abort)signal.removeEventListener('abort',abort);}
}
async function bytesFromDownload(download:Download,controls:WechatOperationControls):Promise<Uint8Array>{
 const stream=await download.createReadStream();if(!stream)return fail('DOWNLOAD_FAILED','平台原生下载没有返回文件');
 const chunks:Buffer[]=[];let size=0;
 try{
  for await(const chunk of stream as AsyncIterable<Uint8Array>){controls.signal.throwIfAborted();const bytes=Buffer.from(chunk);size+=bytes.length;if(size>MAX_BYTES)return fail('REPORT_TOO_LARGE','平台原生报表超过25MiB');chunks.push(bytes);}
  if(!size)return fail('DOWNLOAD_EMPTY','平台原生下载为空');return Buffer.concat(chunks,size);
 }finally{if('destroy' in stream&&typeof stream.destroy==='function')stream.destroy();}
}
async function receiveReport(context:BrowserContext,page:Page,platform:WechatCreatorPlatform,kind:NativeReportKind,prepared:WechatPreparedReport,controls:WechatOperationControls):Promise<WechatNativeDownload>{
 officialUrl(prepared.scope.url(),origins[platform],platform);assertReady(kind,prepared.state);
 await prepared.verify?.();controls.signal.throwIfAborted();
 // 监听先于点击；公众号短暂popup无download时，仅回退当前DOM真实原生href。
 const href=await prepared.download.getAttribute('href',{timeout:controls.timeoutMs()});
 if(href&&/^(?:https?:)?\/\//i.test(href))officialUrl(href,prepared.scope.url(),platform);
 const pending=page.waitForEvent('download',{timeout:controls.timeoutMs()});void pending.catch(()=>{});
 await prepared.download.click({timeout:controls.timeoutMs()});
 let bytes:Uint8Array,name:string;
 try{
  const downloaded=await pending;const failure=await downloaded.failure();
  if(failure)return fail('DOWNLOAD_FAILED','平台原生下载未完成');
  name=filename(downloaded.suggestedFilename());bytes=await bytesFromDownload(downloaded,controls);
 }catch(error){
  if(error instanceof WechatBrowserSourceError||controls.signal.aborted)throw error;
  if(platform!=='wechatOfficial'||!href)return fail('DOWNLOAD_FAILED','平台原生下载未完成');
  const url=officialUrl(href,prepared.scope.url(),platform);
  const response=await context.request.get(url.href,{timeout:controls.timeoutMs(),maxRedirects:0,failOnStatusCode:false});
  try{
   if(response.status()!==200)return fail('DOWNLOAD_FAILED','平台原生下载响应未成功');
   const size=Number(response.headers()['content-length']);if(Number.isFinite(size)&&size>MAX_BYTES)return fail('REPORT_TOO_LARGE','平台原生报表超过25MiB');
   name=headerFilename(response.headers()['content-disposition']);bytes=await response.body();
   if(!bytes.byteLength)return fail('DOWNLOAD_EMPTY','平台原生下载为空');if(bytes.byteLength>MAX_BYTES)return fail('REPORT_TOO_LARGE','平台原生报表超过25MiB');
  }finally{await response.dispose();}
 }
 // 只返回官方pathname/basename；含会话参数的URL不进入回执、日志或service DTO。
 return {kind,bytes,filename:name,sourcePath:paths[kind],selection:{...prepared.state.selection},...(kind==='channelsWorks'?{expectedRows:prepared.state.reportedRows}: {})};
}
export function createWechatBrowserSource(deps:{identityWitness?:WechatIdentityWitness;reportWitness?:WechatReportWitness;openProfile?:typeof open;now?:()=>number}={}){
 const now=deps.now??Date.now;
 async function withProfile<T>(platform:WechatCreatorPlatform,directory:string,headless:boolean,controls:WechatBrowserControls,budgets:number[],run:(context:BrowserContext,page:Page,op:WechatOperationControls,trace:Trace)=>Promise<T>):Promise<T>{
  if(!deps.identityWitness)return rejectBeforeOpen(controls,new WechatBrowserSourceError('IDENTITY_WITNESS_MISSING','尚未核实微信普通账号信息页的稳定身份字段，不能完成绑定'));
  let localEnd:number;try{localEnd=now()+executionTimeoutMs(controls.timeoutMs,completionWaitMs(budgets));}catch{return rejectBeforeOpen(controls,new WechatBrowserSourceError('EXECUTION_TIMEOUT_INVALID','微信采集执行预算无效'));}
  const inherited=controls.deadlineAt===undefined||controls.deadlineAt===null?null:Date.parse(controls.deadlineAt);
  if(inherited!==null&&!Number.isFinite(inherited))return rejectBeforeOpen(controls,new WechatBrowserSourceError('EXECUTION_DEADLINE_INVALID','原采集期限无效'));
  if(inherited!==null&&inherited<=now())return rejectBeforeOpen(controls,new WechatBrowserSourceError('EXECUTION_DEADLINE_EXCEEDED','原采集期限已用尽'));
  const end=inherited===null?localEnd:Math.min(inherited,localEnd),controller=new AbortController();
  const signal=controls.signal?AbortSignal.any([controls.signal,controller.signal]):controller.signal;
  const timer=setTimeout(()=>controller.abort(new WechatBrowserSourceError('EXECUTION_DEADLINE_EXCEEDED','原采集期限已用尽')),Math.max(0,end-now()));
  const trace:Trace={stage:'openProfile'};const managed={...controls,signal};let context:BrowserContext|undefined;let abort:(()=>void)|undefined;
  try{
   // guardedLaunch承担启动前失败/迟到context的真实停止确认；不能在其外提前放行profile。
   context=await (deps.openProfile??open)(directory,headless,managed);
   const current=context;abort=()=>{void current.close().catch(()=>{});};signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
   const page=context.pages()[0]??await context.newPage(),op=operation(signal,end);
   return await bounded(async()=>{trace.stage='navigate';await page.goto(origins[platform]+'/',{waitUntil:'domcontentloaded',timeout:op.timeoutMs()});return run(current,page,op,trace);},signal);
  }catch(error){
   emitDiagnostic(controls,platform,trace,error);
   if(signal.aborted)throw signal.reason;
   if(error instanceof WechatBrowserSourceError)throw error;
   // Playwright导航/请求异常可能含临时会话URL；外部诊断只收到脱敏普通失败。
   return fail('BROWSER_OPERATION_FAILED','微信后台页面或原生下载暂未完成，请查看原任务');
  }finally{
   clearTimeout(timer);if(abort)signal.removeEventListener('abort',abort);
   if(context)await closeProfile(context,managed);
  }
 }
 async function identity(page:Page,platform:WechatCreatorPlatform,op:WechatOperationControls,expected?:string,login=false):Promise<WechatCreatorIdentity>{
  if(!login&&await deps.identityWitness!.isLoggedOut(page,platform,op))return fail('LOGIN_REQUIRED','微信后台需要本人重新登录');
  const observed=await deps.identityWitness!.read(page,platform,op);op.signal.throwIfAborted();
  officialUrl(page.url(),origins[platform],platform);
  if(!observed||observed.platform!==platform||!observed.platformIdentity.trim()||!observed.displayName.trim())return fail('IDENTITY_MISSING','未读到普通账号信息页的真实稳定身份');
  if(!/^\/(?!\/)[^?#\x00-\x1f]*$/.test(observed.sourcePath))return fail('IDENTITY_SOURCE_INVALID','稳定身份来源必须是脱敏普通账号信息页面');
  if(expected!==undefined&&observed.platformIdentity!==expected)return fail('WRONG_PLATFORM_IDENTITY','当前微信账号与原绑定身份不同');
  return {platformIdentity:observed.platformIdentity,displayName:observed.displayName,source:platform+':'+observed.sourcePath};
 }
 return {
  /** 宿主仅在实际身份和报表witness均装配时开放真实扫码/同步能力。 */
  configured:Boolean(deps.identityWitness&&deps.reportWitness),
  login(platform:WechatCreatorPlatform,directory:string,controls:WechatBrowserControls={}):Promise<WechatCreatorIdentity>{return withProfile(platform,directory,false,controls,[120000,120000,480000,120000],(_context,page,op,trace)=>{trace.stage='readIdentity';return identity(page,platform,op,undefined,true);});},
  readIdentity(platform:WechatCreatorPlatform,directory:string,expectedIdentity:string,controls:WechatBrowserControls={}):Promise<WechatCreatorIdentity>{if(!expectedIdentity.trim())return rejectBeforeOpen(controls,new WechatBrowserSourceError('IDENTITY_MISSING','原绑定缺少稳定身份'));return withProfile(platform,directory,true,controls,[120000,120000,120000,120000],(_context,page,op,trace)=>{trace.stage='readIdentity';return identity(page,platform,op,expectedIdentity);});},
  async collectNativeReports(platform:WechatCreatorPlatform,directory:string,expectedIdentity:string,controls:WechatBrowserControls={},onReport?:(report:WechatNativeDownload)=>Promise<void>):Promise<WechatNativeDownload[]>{
   if(!expectedIdentity.trim())return rejectBeforeOpen(controls,new WechatBrowserSourceError('IDENTITY_MISSING','原绑定缺少稳定身份'));
   return withProfile(platform,directory,true,controls,[120000,120000,120000,...kinds[platform].flatMap(()=>Array.from({length:10},()=>120000)),120000],async(context,page,op,trace)=>{
    trace.stage='readIdentity';await identity(page,platform,op,expectedIdentity);if(!deps.reportWitness)return fail('REPORT_WITNESS_MISSING','尚未核实原生报表的页面选择与就绪观察');
    const reports:WechatNativeDownload[]=[];
    for(const kind of kinds[platform]){
     op.signal.throwIfAborted();
     try{
      trace.stage='prepare';trace.kind=kind;const prepared=await deps.reportWitness.prepare(page,platform,kind,op);op.signal.throwIfAborted();
      trace.stage='download';const report=await receiveReport(context,page,platform,kind,prepared,op);op.signal.throwIfAborted();
      // 原service port可逐页提交；后续失败保留先前已提交证据，不在worker写库。
      trace.stage='submit';await onReport?.(report);reports.push(report);
     }catch(error){if(op.signal.aborted)throw error;if(error instanceof WechatBrowserSourceError&&error.code==='WRONG_PLATFORM_IDENTITY')throw error;let loggedOut=false;try{loggedOut=await deps.identityWitness!.isLoggedOut(page,platform,op);}catch{op.signal.throwIfAborted();}if(loggedOut)return fail('LOGIN_REQUIRED','微信后台需要本人重新登录');throw error;}
    }
    return reports;
   });
  },
 };
}
/** 原生DOM操作层。selectionReader必须从实际日期/行数读取；不能用标签文本代签ready。
 * 通用内部端口；正式宿主装配wechat-dom-witness，公开API不得注入selector、链接或身份。
 */
export function createWechatNativeDomReportWitness(selectionReader:(scope:Page|Frame,kind:NativeReportKind,controls:WechatOperationControls)=>Promise<WechatReportPageState|null>,options:{now?:()=>number}={}):WechatReportWitness{
 return {async prepare(page,platform,kind,controls){
  if(!kinds[platform].includes(kind))return fail('REPORT_PLATFORM_MISMATCH','原生报表不属于当前平台');
  const current=officialUrl(page.url(),origins[platform],platform),sourcePath=paths[kind];
  // SEMANTIC_BOUNDARY_ALLOW: T1109实测近30天以昨日结束；这里只核平台日期协议。
  // 固定本次操作的目标窗口，不能让旧7天表格用自身起止日期自证近30天已ready。
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date((options.now??Date.now)()));
  const dayZero=Date.parse(today+'T00:00:00Z'),expectedEnd=new Date(dayZero-86400000).toISOString().slice(0,10),expectedStart=new Date(dayZero-30*86400000).toISOString().slice(0,10);
  const hrefs=await page.locator('a[href]').evaluateAll(elements=>elements.map(element=>element.getAttribute('href')).filter((value):value is string=>!!value));
  let target:URL|undefined;
  for(const href of hrefs){try{const url=officialUrl(href,current.href,platform);if(url.pathname===sourcePath){target=url;break;}}catch{/* 不接收其他origin或会话跳转。 */}}
  if(target)await page.goto(target.href,{waitUntil:'domcontentloaded',timeout:controls.timeoutMs()});
  else if(platform==='wechatVideo')await page.goto(origins[platform]+sourcePath,{waitUntil:'domcontentloaded',timeout:controls.timeoutMs()});
  else return fail('REPORT_LINK_MISSING','当前公众号页面没有原生报表入口');
  const label=kind==='officialContent'?'下载数据明细':kind==='officialFollowers'?'下载表格':'下载表格';
  const searchEnd=Date.now()+controls.timeoutMs();let scope:Page|Frame|undefined;
  while(!scope){
   controls.signal.throwIfAborted();const candidates:ReadonlyArray<Page|Frame>=platform==='wechatVideo'?page.frames().filter(frame=>{try{return new URL(frame.url()).origin===origins[platform];}catch{return false;}}):[page];
   for(const candidate of candidates){if(await candidate.getByText(label,{exact:true}).filter({visible:true}).count()){scope=candidate;break;}}
   if(!scope){if(Date.now()>=searchEnd)return fail('REPORT_PAGE_MISSING','同源报表页面尚未出现原生下载入口');await delay(250,undefined,{signal:controls.signal});}
  }
  if(platform==='wechatVideo'){
   const section=kind==='channelsDaily'?'全部视频':kind==='channelsWorks'?'单篇视频':'关注者增长';
   const tab=scope.getByText(section,{exact:true}).filter({visible:true});if(await tab.count())await tab.first().click({timeout:controls.timeoutMs()});
   const thirtyDays=scope.locator('.filter-row:has(.filter-extra) label:has(input[value="2"])').filter({visible:true});if(await thirtyDays.count()!==1)return fail('REPORT_WINDOW_MISSING','未找到唯一可见的详情近30天控件');await thirtyDays.click({timeout:controls.timeoutMs()});
  }
  const readyEnd=Date.now()+controls.timeoutMs();
  for(;;){
   controls.signal.throwIfAborted();const state=await selectionReader(scope,kind,controls);
   if(state){try{
    if(platform==='wechatVideo'&&kind!=='channelsWorks'&&(state.selection.startDate!==expectedStart||state.selection.endDate!==expectedEnd))return fail('REPORT_NOT_READY','近30天表格尚未更新到实际目标窗口');
    assertReady(kind,state);return {scope,download:scope.getByText(label,{exact:true}).filter({visible:true}).first(),state};}catch(error){if(!(error instanceof WechatBrowserSourceError)||error.code!=='REPORT_NOT_READY')throw error;}}
   if(Date.now()>=readyEnd)return fail('REPORT_NOT_READY','实际报表日期和页面行数尚未就绪');await delay(250,undefined,{signal:controls.signal});
  }
 }};
}
