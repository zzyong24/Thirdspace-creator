import fs from 'node:fs';
import {mkdir,lstat,realpath,unlink,writeFile} from 'node:fs/promises';
import {createHash,randomBytes} from 'node:crypto';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import type {BrowserContext,Download,Frame,Locator,Page} from '@playwright/test';
import type {NativeReportKind,NativeReportPayload} from '@creatoros/contract';
import {completionWaitMs,executionTimeoutMs,remainingDeadlineMs} from '@creatoros/contract/timeout-policy';
import {guardedLaunch,chromiumSandboxOpts} from '../browser/chromium-guard';
import {launchWithBrowser} from '../browser/browser-launch';
import {readWechatNavigationObservation,navigationRouteClass,type WechatNavigationObservation} from './wechat-navigation-observation';

export type WechatCreatorPlatform='wechatOfficial'|'wechatVideo';
export type WechatSectionObservation={exactTabCount:number;visibleTabCount:number;frameElementVisible:boolean;documentReadyState:'loading'|'interactive'|'complete';bodyTextLength:number};
export type WechatEntryObservation={entryPhase:'initial'|'wait_entry_or_centre'|'click_centre'|'wait_entry_after_centre'|'click_entry'|'wait_target_route'|'recover_owner'|'hover_owner'|'wait_associated_entry';entryVisibleCount:number;centreVisibleCount?:number;centreClicked:boolean};
/** 内部身份观察只含机械形状；未知字段必须保持null，不得猜身份或登录状态。 */
export type WechatIdentityRootObservation={kind:'top'|'frame'|'openShadow';parent:number|null;visible:boolean;uidRaw:number;uidVisible:number;nameRaw:number;nameVisible:number;uidIdRaw:number;uidIdVisible:number;nameClassRaw:number;nameClassVisible:number;idTextPresent:boolean|null;copyPresent:boolean|null;copyMatches:boolean|null;namePresent:boolean|null;uidInRoot:boolean|null;nameInRoot:boolean|null};
export type WechatIdentityObservation={routeClass:'identity'|'identity_slash'|'official_root'|'platform_post'|'platform_follower'|'micro_post'|'micro_follower'|'official_other'|'foreign'|'unavailable';loginPromptVisible:boolean|null;qrLoginFrameRaw:number|null;qrLoginFrameVisible:number|null;routeUnchanged:boolean;readyState:'loading'|'interactive'|'complete'|'unknown';rootScan:'complete'|'limited'|'not_run'|'unavailable';frameCount:number|null;foreignFrameCount:number|null;unknownShadowCount:number|null;truncated:boolean;roots:WechatIdentityRootObservation[]};
export type WechatBrowserDiagnostic={platform:WechatCreatorPlatform;stage:'openProfile'|'navigate'|'readIdentity'|'prepare'|'download'|'submit';kind?:NativeReportKind;code:string;exceptionName:string;failureKind?:'NAVIGATION_ABORTED'|'CONNECTION_RESET'|'TUNNEL_CONNECTION_FAILED'|'TARGET_CLOSED'|'EXECUTION_CONTEXT_DESTROYED'|'NAVIGATION_INTERRUPTED';observation?:WechatSectionObservation;entryObservation?:WechatEntryObservation;identityObservation?:WechatIdentityObservation};
export type WechatBrowserControls={signal?:AbortSignal;deadlineAt?:string|null;timeoutMs?:number;onStopped?:()=>Promise<void>;onStopUnconfirmed?:(retry:()=>Promise<void>)=>void;onDiagnostic?:(event:WechatBrowserDiagnostic)=>void;assertScopeFresh?:()=>Promise<void>;onBrowserOpened?:(occurredAt:string)=>void;onContextCloseStarted?:(occurredAt:string)=>void;onPhysicalStopped?:(occurredAt:string)=>void};
export type WechatNavigationScreenshot={status:'captured';artifactId:string;sha256:string}|{status:'missing'};
export type WechatNavigationSnapshot=WechatNavigationObservation&{phase:'identity_verified'|'observation_end';observedAt:string;screenshot:WechatNavigationScreenshot};
export type WechatNavigationSample=Pick<WechatNavigationObservation,'routeClass'|'roots'|'closedShadowUnknownCount'|'truncated'>&{sampleIndex:number;observedAt:string;candidateVisibility:Array<{rootId:string;visibleCount:number;occludedCount:number}>};
export type WechatNavigationControls=WechatBrowserControls&{diagnosticRunId:string;privateEvidenceDir:string;deadlineAt:string;assertScopeFresh:()=>Promise<void>};
export type WechatNavigationResult={diagnosticRunId:string;identityMatched:true;observationStartedAt:string;observationEndedAt:string;sampleCount:number;samples:WechatNavigationSample[];snapshots:WechatNavigationSnapshot[]};
function notifyLifecycle(callback:((at:string)=>void)|undefined){try{callback?.(new Date().toISOString());}catch{/* 观察者异常不能跳过真实关闭/释放。 */}}
export type WechatNativeDownload={kind:NativeReportKind;bytes:Uint8Array;filename:string;sourcePath:NativeReportPayload['sourcePath'];selection:NativeReportPayload['selection'];expectedRows?:number};
export type WechatCreatorIdentity={platformIdentity:string;displayName:string;source:string};
export class WechatBrowserSourceError extends Error{
 observation?:WechatSectionObservation;
 constructor(readonly code:string,message:string){super(message);this.name='WechatBrowserSourceError';}
}
const origins:Record<WechatCreatorPlatform,string>={wechatOfficial:'https://mp.weixin.qq.com',wechatVideo:'https://channels.weixin.qq.com'};
const paths:Record<NativeReportKind,NativeReportPayload['sourcePath']>={officialContent:'/misc/appmsganalysis',officialFollowers:'/misc/useranalysis',channelsDaily:'/platform/statistic/post',channelsFollowers:'/platform/statistic/follower',channelsWorks:'/platform/statistic/post'};
const kinds:Record<WechatCreatorPlatform,readonly NativeReportKind[]>={wechatOfficial:['officialContent','officialFollowers'],wechatVideo:['channelsDaily','channelsFollowers','channelsWorks']};
const MAX_BYTES=25*1024*1024;
const SDK_LAUNCH_BUDGET_MS=executionTimeoutMs(120000);
// 单次guard内含system Chrome、fallback及清理；总启动还含原profile排队和guard锁重试。
const LAUNCH_GUARD_BUDGET_MS=completionWaitMs([SDK_LAUNCH_BUDGET_MS,SDK_LAUNCH_BUDGET_MS,120000]);
const STARTUP_BUDGET_MS=completionWaitMs([LAUNCH_GUARD_BUDGET_MS,LAUNCH_GUARD_BUDGET_MS,LAUNCH_GUARD_BUDGET_MS]);
// 内置identity reader实际串行消费者；初始主页goto另计，不能借启动/清理余量。
const IDENTITY_READER_BUDGETS:Record<WechatCreatorPlatform,readonly number[]>={
 wechatOfficial:[480000,120000,480000], // 设置入口观察、设置页导航、AppID/名称观察。
 wechatVideo:[120000,480000], // 普通首页导航、稳定ID/名称观察。
};
// 按实际串行阶段计预算；response与30天点击、download事件与点击分别并行。
const REPORT_STAGE_BUDGETS:Record<WechatCreatorPlatform,readonly number[]>={
 wechatOfficial:Array.from({length:10},()=>120000),
 wechatVideo:[
  120000,120000,120000,120000,120000, // 数据中心观察/点击、子菜单观察/点击、父路由等待。
  120000,120000,120000, // 原initial missing后的独立owner观察、一次hover、关联子入口观察。
  120000,120000,120000, // runtime Frame、可见UI根/标签关联观察、标签点击。
  120000,120000,120000,120000, // 日期控件观察、7天点击、30天点击/响应、实际数据ready。
  120000,120000,120000, // href、点击/下载事件、失败后同Frame probe余量。
 ],
};
// SEMANTIC_BOUNDARY_ALLOW: 固定错误协议与诊断脱敏，不推断内容或登录状态。
const diagnosticCodes=new Set(['BROWSER_OPERATION_FAILED','BROWSER_STOP_UNCONFIRMED','DOWNLOAD_EMPTY','DOWNLOAD_FAILED','EXECUTION_DEADLINE_EXCEEDED','EXECUTION_DEADLINE_INVALID','EXECUTION_TIMEOUT_INVALID','FILENAME_INVALID','FILENAME_MISSING','IDENTITY_MISSING','ENTRY_NOT_READY','FIELDS_NOT_READY','IDENTITY_SOURCE_INVALID','IDENTITY_WITNESS_MISSING','LOGIN_REQUIRED','REPORT_LINK_MISSING','REPORT_LINK_AMBIGUOUS','REPORT_NOT_READY','REPORT_PAGE_MISSING','REPORT_SECTION_MISSING','REPORT_SECTION_AMBIGUOUS','REPORT_PLATFORM_MISMATCH','REPORT_TOO_LARGE','REPORT_WINDOW_INVALID','REPORT_WINDOW_MISSING','REPORT_WITNESS_MISSING','REPORT_RESPONSE_INVALID','SOURCE_URL_INVALID','WRONG_PLATFORM_IDENTITY']);
const diagnosticNames=new Set(['Error','TimeoutError','TypeError','ReferenceError','SyntaxError','WechatBrowserSourceError']);
type Trace=Pick<WechatBrowserDiagnostic,'stage'|'kind'|'entryObservation'>;
function protocolFailure(error:unknown):WechatBrowserDiagnostic['failureKind']{
 if(!(error instanceof Error))return undefined;
 // 固定Chromium/Playwright协议分类只帮助查错，不据此推断Cookie、账号或采集状态。
 if(error.message.includes('net::ERR_ABORTED'))return 'NAVIGATION_ABORTED';
 if(error.message.includes('net::ERR_CONNECTION_RESET'))return 'CONNECTION_RESET';
 if(error.message.includes('net::ERR_TUNNEL_CONNECTION_FAILED'))return 'TUNNEL_CONNECTION_FAILED';
 if(error.message.includes('Target page, context or browser has been closed'))return 'TARGET_CLOSED';
 // 固定Playwright协议首行；仅投影类别，不记录会话URL或据此恢复/重试。
 if(/^(?:(?:page\.(?:evaluate|evaluateHandle)|locator\.evaluateAll): )?Execution context was destroyed, most likely because of a navigation\.?(?:\r?\n|$)/.test(error.message))return 'EXECUTION_CONTEXT_DESTROYED';
 if(/^(?:page\.(?:goto|reload|goBack|goForward): )?Navigation to "[^"\r\n]+" is interrupted by another navigation to "[^"\r\n]+"(?:\r?\n|$)/.test(error.message))return 'NAVIGATION_INTERRUPTED';
 return undefined;
}
function sectionObservation(value:unknown):WechatSectionObservation|undefined{
 if(!value||typeof value!=='object')return undefined;
 const {exactTabCount,visibleTabCount,frameElementVisible,documentReadyState,bodyTextLength}=value as Record<string,unknown>;
 const count=(v:unknown,max:number):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=max;
 if(!count(exactTabCount,10000)||!count(visibleTabCount,10000)||visibleTabCount>exactTabCount||!count(bodyTextLength,1000000)||typeof frameElementVisible!=='boolean')return undefined;
 if(documentReadyState!=='loading'&&documentReadyState!=='interactive'&&documentReadyState!=='complete')return undefined;
 return {exactTabCount,visibleTabCount,frameElementVisible,documentReadyState,bodyTextLength};
}
function entryObservation(value:unknown):WechatEntryObservation|undefined{
 if(!value||typeof value!=='object')return undefined;
 const {entryPhase,entryVisibleCount,centreVisibleCount,centreClicked}=value as Record<string,unknown>;
 if(typeof entryPhase!=='string'||!['initial','wait_entry_or_centre','click_centre','wait_entry_after_centre','click_entry','wait_target_route','recover_owner','hover_owner','wait_associated_entry'].includes(entryPhase))return undefined;
 const count=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=10000;
 if(!count(entryVisibleCount)||centreVisibleCount!==undefined&&!count(centreVisibleCount)||typeof centreClicked!=='boolean')return undefined;
 return {entryPhase:entryPhase as WechatEntryObservation['entryPhase'],entryVisibleCount:entryVisibleCount as number,...(centreVisibleCount===undefined?{}:{centreVisibleCount:centreVisibleCount as number}),centreClicked};
}
/** SEMANTIC_BOUNDARY_ALLOW: 固定白名单协议投影，不接受页面文本、URL或未知键。 */
function identityObservation(value:unknown):WechatIdentityObservation|undefined{
 if(!value||typeof value!=='object')return undefined;
 const record=value as Record<string,unknown>,keys=['routeClass','loginPromptVisible','qrLoginFrameRaw','qrLoginFrameVisible','routeUnchanged','readyState','rootScan','frameCount','foreignFrameCount','unknownShadowCount','truncated','roots'];
 if(Object.keys(record).length!==keys.length||Object.keys(record).some(key=>!keys.includes(key)))return undefined;
 const {routeClass,loginPromptVisible,qrLoginFrameRaw,qrLoginFrameVisible,routeUnchanged,readyState,rootScan,frameCount,foreignFrameCount,unknownShadowCount,truncated}=record;
 const count=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=1000;
 if(!['identity','identity_slash','official_root','platform_post','platform_follower','micro_post','micro_follower','official_other','foreign','unavailable'].includes(routeClass as string)||!['loading','interactive','complete','unknown'].includes(readyState as string)||!['complete','limited','not_run','unavailable'].includes(rootScan as string)||(loginPromptVisible!==null&&typeof loginPromptVisible!=='boolean')||typeof routeUnchanged!=='boolean'||typeof truncated!=='boolean')return undefined;
 if(qrLoginFrameRaw===null?qrLoginFrameVisible!==null:!count(qrLoginFrameRaw)||!count(qrLoginFrameVisible)||Number(qrLoginFrameVisible)>qrLoginFrameRaw)return undefined;
 const skipped=rootScan==='not_run'||rootScan==='unavailable';
 if([frameCount,foreignFrameCount,unknownShadowCount].some(v=>skipped?v!==null:!count(v))||!Array.isArray(record.roots)||record.roots.length>8||skipped&&record.roots.length!==0||!skipped&&record.roots.length===0)return undefined;
 const roots:WechatIdentityRootObservation[]=[];
 const counts=['uidRaw','uidVisible','nameRaw','nameVisible','uidIdRaw','uidIdVisible','nameClassRaw','nameClassVisible'] as const,flags=['idTextPresent','copyPresent','copyMatches','namePresent','uidInRoot','nameInRoot'] as const;
 const rootKeys=['kind','parent','visible',...counts,...flags];
 for(const [index,raw] of record.roots.entries()){
  if(!raw||typeof raw!=='object'||Object.keys(raw).length!==rootKeys.length||Object.keys(raw).some(key=>!rootKeys.includes(key)))return undefined;
  const r=raw as Record<string,unknown>;
  if(!['top','frame','openShadow'].includes(r.kind as string)||typeof r.visible!=='boolean'||(index===0?r.kind!=='top'||r.parent!==null:r.kind==='top'||!Number.isSafeInteger(r.parent)||Number(r.parent)<0||Number(r.parent)>=index)||counts.some(key=>!count(r[key]))||flags.some(key=>r[key]!==null&&typeof r[key]!=='boolean'))return undefined;
  if(Number(r.uidVisible)>Number(r.uidRaw)||Number(r.nameVisible)>Number(r.nameRaw)||Number(r.uidIdVisible)>Number(r.uidIdRaw)||Number(r.nameClassVisible)>Number(r.nameClassRaw))return undefined;
  roots.push({kind:r.kind as WechatIdentityRootObservation['kind'],parent:r.parent as number|null,visible:r.visible as boolean,uidRaw:r.uidRaw as number,uidVisible:r.uidVisible as number,nameRaw:r.nameRaw as number,nameVisible:r.nameVisible as number,uidIdRaw:r.uidIdRaw as number,uidIdVisible:r.uidIdVisible as number,nameClassRaw:r.nameClassRaw as number,nameClassVisible:r.nameClassVisible as number,idTextPresent:r.idTextPresent as boolean|null,copyPresent:r.copyPresent as boolean|null,copyMatches:r.copyMatches as boolean|null,namePresent:r.namePresent as boolean|null,uidInRoot:r.uidInRoot as boolean|null,nameInRoot:r.nameInRoot as boolean|null});
 }
 return {routeClass:routeClass as WechatIdentityObservation['routeClass'],loginPromptVisible:loginPromptVisible as boolean|null,qrLoginFrameRaw:qrLoginFrameRaw as number|null,qrLoginFrameVisible:qrLoginFrameVisible as number|null,routeUnchanged,readyState:readyState as WechatIdentityObservation['readyState'],rootScan:rootScan as WechatIdentityObservation['rootScan'],frameCount:frameCount as number|null,foreignFrameCount:foreignFrameCount as number|null,unknownShadowCount:unknownShadowCount as number|null,truncated,roots};
}
function emitDiagnostic(controls:WechatBrowserControls,platform:WechatCreatorPlatform,trace:Trace,error:unknown){
 try{const failureKind=protocolFailure(error),observation=platform==='wechatVideo'&&trace.stage==='prepare'&&trace.kind&&kinds.wechatVideo.includes(trace.kind)&&error instanceof WechatBrowserSourceError&&error.code==='REPORT_SECTION_MISSING'?sectionObservation(error.observation):undefined,entry=platform==='wechatVideo'&&trace.stage==='prepare'?entryObservation(trace.entryObservation):undefined;controls.onDiagnostic?.({platform,stage:trace.stage,...(trace.kind?{kind:trace.kind}:{}),code:error instanceof WechatBrowserSourceError&&diagnosticCodes.has(error.code)?error.code:'BROWSER_OPERATION_FAILED',exceptionName:error instanceof Error&&diagnosticNames.has(error.name)?error.name:'UnknownError',...(failureKind?{failureKind}:{}),...(observation?{observation}:{}),...(entry?{entryObservation:entry}:{})});}catch{/* 诊断端口不能影响原错误、关闭或宿主停止确认。 */}
}

export interface WechatOperationControls{/** 受信内部意图；交互登录不能由二维码提前结束。 */identityVerification?:'boundIdentity'|'interactiveLogin';signal:AbortSignal;timeoutMs(requested?:number):number;/** 内部固定数字进度；不能增加页面观察或改变原错误。 */onEntryObservation?:(value:WechatEntryObservation|undefined)=>void;onIdentityObservation?:(value:WechatIdentityObservation)=>void}
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
/** SEMANTIC_BOUNDARY_ALLOW: 只接受视频号同Page字段evaluate的固定导航协议，未知异常原样冒泡。 */
export function canRetryWechatVideoIdentityContext(page:Page,error:unknown,controls:WechatOperationControls):boolean{
 controls.signal.throwIfAborted();controls.timeoutMs();
 if(!(error instanceof Error)||error.name!=='Error'||! /^(?:page\.evaluate: )?Execution context was destroyed, most likely because of a navigation\.?(?:\r?\n|$)/.test(error.message)||page.isClosed())return false;
 try{officialUrl(page.url(),origins.wechatVideo,'wechatVideo');}catch{return false;}
 return true;
}
async function open(directory:string,headless:boolean,controls:WechatBrowserControls):Promise<BrowserContext>{
 return guardedLaunch(directory,async()=>{
  controls.signal?.throwIfAborted();await controls.assertScopeFresh?.();controls.signal?.throwIfAborted();await mkdir(directory,{recursive:true});controls.signal?.throwIfAborted();
  const {chromium}=await import('@playwright/test');
  return launchWithBrowser(async selection=>{
   controls.signal?.throwIfAborted();await controls.assertScopeFresh?.();controls.signal?.throwIfAborted();
   const deadline=Date.parse(controls.deadlineAt!),remaining=remainingDeadlineMs(deadline)!;
   if(remaining<=0)return fail('EXECUTION_DEADLINE_EXCEEDED','原采集期限已用尽');
   const timeout=Math.min(executionTimeoutMs(120000),remaining);
   const context=await chromium.launchPersistentContext(directory,{...selection,...chromiumSandboxOpts(),timeout,headless,viewport:{width:1440,height:900},locale:'zh-CN',timezoneId:'Asia/Shanghai',acceptDownloads:true,args:['--no-first-run','--no-default-browser-check']});
   notifyLifecycle(controls.onBrowserOpened);
   if(controls.onContextCloseStarted){const close=context.close.bind(context);context.close=async options=>{notifyLifecycle(controls.onContextCloseStarted);await close(options);};}
   return context;
  });
 },{label:'微信创作者浏览器',timeoutMs:LAUNCH_GUARD_BUDGET_MS,queueTimeoutMs:LAUNCH_GUARD_BUDGET_MS,signal:controls.signal,onStopped:controls.onStopped});
}
async function closeProfile(context:BrowserContext,controls:WechatBrowserControls,remainingCloseMs?:number){
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  const closing=context.close();
  if(remainingCloseMs===undefined)await closing;
  else await Promise.race([closing,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('BROWSER_CLOSE_WAIT_ENDED')),remainingCloseMs);})]);
 }catch{
  controls.onStopUnconfirmed?.(()=>context.close());
  throw Object.assign(new WechatBrowserSourceError('BROWSER_STOP_UNCONFIRMED','微信浏览器停止尚未确认，请保留原任务等待清理'),{resourceStopUnconfirmed:true});
 }finally{if(timer)clearTimeout(timer);}
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
/** 内部本机诊断能力；受信/tmp目录，不返回文件名或路径，不接任意异步sink。 */
async function privateImageDirectory(directory:string,controls:WechatOperationControls):Promise<string>{
 const check=()=>{controls.signal.throwIfAborted();controls.timeoutMs(120000);};check();
 if(!path.isAbsolute(directory))throw new Error('Private image directory is not absolute');
 const temporaryRoot=await realpath('/tmp');check();
 const within=(root:string,value:string)=>{const relative=path.relative(root,value);return relative!==''&&!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative);};
 const requested=path.resolve(directory);
 if(!within(path.resolve('/tmp'),requested)&&!within(temporaryRoot,requested))throw new Error('Private image directory is outside temporary root');
 try{await mkdir(requested,{mode:0o700});}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}check();
 const lexicalRoot=within(path.resolve('/tmp'),requested)?path.resolve('/tmp'):temporaryRoot;
 let component=lexicalRoot;
 for(const segment of path.relative(lexicalRoot,requested).split(path.sep)){component=path.join(component,segment);const entry=await lstat(component);check();if(entry.isSymbolicLink()||!entry.isDirectory())throw new Error('Private image path contains a symbolic link');}
 const stat=await lstat(requested);check();
 if(stat.isSymbolicLink()||!stat.isDirectory()||typeof process.getuid!=='function'||stat.uid!==process.getuid()||(stat.mode&0o077)!==0)throw new Error('Private image directory is not private');
 const resolved=await realpath(requested);check();if(!within(temporaryRoot,resolved))throw new Error('Private image directory escaped temporary root');
 return resolved;
}
async function savePrivateFailureImage(directory:string,bytes:Uint8Array,controls:WechatOperationControls):Promise<{artifactId:string;sha256:string}>{
 const check=()=>{controls.signal.throwIfAborted();controls.timeoutMs(120000);};check();
 if(!bytes.byteLength||bytes.byteLength>MAX_BYTES)throw new Error('Private image size is invalid');
 const destination=await privateImageDirectory(directory,controls);check();
 const name=randomBytes(16).toString('hex'),temporary=path.join(destination,'.'+name+'.part'),final=path.join(destination,name+'.png');let committed=false;
 // 同一清理调用内固定最多三次；无延时timer、后台producer或业务重发。
 // ENOENT说明已清除；永久OS错误仍可能残留，受信root须在排障结束删除整个私有目录。
 const remove=async(file:string):Promise<boolean>=>{
  for(let attempt=0;attempt<3;attempt++){
   try{await unlink(file);return true;}
   catch(error){if((error as NodeJS.ErrnoException|undefined)?.code==='ENOENT')return true;}
  }
  return false;
 },onAbort=()=>{void remove(temporary);void remove(final);};
 controls.signal.addEventListener('abort',onAbort,{once:true});
 try{
  check();await writeFile(temporary,bytes,{flag:'wx',mode:0o600,signal:controls.signal});check();
  // 窄同步finalize，避免任意异步sink晚提交；OS I/O不能即时撤销，真实期限后检会移除final。
  check();fs.renameSync(temporary,final);check();committed=true;return {artifactId:name,sha256:createHash('sha256').update(bytes).digest('hex')};
 }finally{
  await remove(temporary);if(!committed||controls.signal.aborted)await remove(final);controls.signal.removeEventListener('abort',onAbort);
 }
}
async function capturePrivateFailureImage(page:Page,kind:NativeReportKind,directory:string,witness:WechatIdentityWitness,original:WechatOperationControls):Promise<void>{
 original.signal.throwIfAborted();const end=Date.now()+original.timeoutMs(120000),controller=new AbortController(),signal=AbortSignal.any([original.signal,controller.signal]);
 const timer=setTimeout(()=>controller.abort(new Error('Private image observation ended')),Math.max(0,end-Date.now()));
 const controls:WechatOperationControls={signal,timeoutMs(requested){original.signal.throwIfAborted();const remaining=original.timeoutMs(requested);signal.throwIfAborted();const local=end-Date.now();if(local<=0)throw new Error('Private image observation ended');return Math.min(remaining,local);}};
 const check=()=>{controls.signal.throwIfAborted();controls.timeoutMs(120000);};
 const samePath=()=>{try{const url=new URL(page.url());return url.origin===origins.wechatVideo&&!url.username&&!url.password&&url.pathname===paths[kind];}catch{return false;}};
 const currentDataPage=async()=>{check();if(!samePath())return false;const loggedOut=await witness.isLoggedOut(page,'wechatVideo',controls);check();return loggedOut===false&&samePath();};
 try{
  await bounded(async()=>{
   if(!await currentDataPage())return;check();
   const bytes=await page.screenshot({type:'png',fullPage:false,timeout:controls.timeoutMs(120000)});check();
   if(!await currentDataPage())return;check();await savePrivateFailureImage(directory,bytes,controls);
  },signal);
 }catch{original.signal.throwIfAborted();original.timeoutMs(120000);/* 普通截图/检测/IO失败只跳过取证，保原采集错误。 */}
 finally{clearTimeout(timer);controller.abort();}
}
export function createWechatBrowserSource(deps:{identityWitness?:WechatIdentityWitness;reportWitness?:WechatReportWitness;openProfile?:typeof open;now?:()=>number;/** 受信本机诊断配置；默认off，不是公开API参数。 */privateFailureImageDir?:string}={}){
 const now=deps.now??Date.now;
 async function withProfile<T>(platform:WechatCreatorPlatform,directory:string,headless:boolean,controls:WechatBrowserControls,budgets:number[],run:(context:BrowserContext,page:Page,op:WechatOperationControls,trace:Trace)=>Promise<T>,navigationOnly=false):Promise<T>{
  if(!deps.identityWitness)return rejectBeforeOpen(controls,new WechatBrowserSourceError('IDENTITY_WITNESS_MISSING','尚未核实微信普通账号信息页的稳定身份字段，不能完成绑定'));
  let localEnd:number;try{localEnd=now()+executionTimeoutMs(controls.timeoutMs,completionWaitMs(budgets));}catch{return rejectBeforeOpen(controls,new WechatBrowserSourceError('EXECUTION_TIMEOUT_INVALID','微信采集执行预算无效'));}
  const inherited=controls.deadlineAt===undefined||controls.deadlineAt===null?null:Date.parse(controls.deadlineAt);
  if(inherited!==null&&!Number.isFinite(inherited))return rejectBeforeOpen(controls,new WechatBrowserSourceError('EXECUTION_DEADLINE_INVALID','原采集期限无效'));
  if(inherited!==null&&inherited<=now())return rejectBeforeOpen(controls,new WechatBrowserSourceError('EXECUTION_DEADLINE_EXCEEDED','原采集期限已用尽'));
  const end=inherited===null?localEnd:Math.min(inherited,localEnd),controller=new AbortController();
  const signal=controls.signal?AbortSignal.any([controls.signal,controller.signal]):controller.signal;
  const timer=setTimeout(()=>controller.abort(new WechatBrowserSourceError('EXECUTION_DEADLINE_EXCEEDED','原采集期限已用尽')),Math.max(0,end-now()));
  let browserOpened=false,closeStarted=false,physicalStopped=false;
  const scopeFresh=async()=>{signal.throwIfAborted();try{await controls.assertScopeFresh?.();signal.throwIfAborted();}catch(error){controller.abort(error);throw error;}};
  const markOpened=()=>{if(!browserOpened){browserOpened=true;notifyLifecycle(controls.onBrowserOpened);}};
  const markClose=()=>{if(!closeStarted){closeStarted=true;notifyLifecycle(controls.onContextCloseStarted);}};
  const markPhysical=()=>{if(browserOpened&&!physicalStopped){physicalStopped=true;notifyLifecycle(controls.onPhysicalStopped);}};
  const trace:Trace={stage:'openProfile'};const managed={...controls,signal,deadlineAt:new Date(end).toISOString(),...(controls.assertScopeFresh?{assertScopeFresh:scopeFresh}:{}),...(controls.onBrowserOpened||controls.onPhysicalStopped?{onBrowserOpened:markOpened}:{}),...(controls.onContextCloseStarted?{onContextCloseStarted:markClose}:{}),...(controls.onPhysicalStopped?{onStopped:async()=>{markPhysical();await controls.onStopped?.();}}:{})};let context:BrowserContext|undefined;let abort:(()=>void)|undefined;
  try{
   // guardedLaunch承担启动前失败/迟到context的真实停止确认；不能在其外提前放行profile。
   context=await (deps.openProfile??open)(directory,headless,managed);
   markOpened();const current=context;abort=()=>{markClose();void current.close().catch(()=>{});};signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
   const page=context.pages()[0]??await context.newPage(),op=operation(signal,end);op.onEntryObservation=value=>{trace.entryObservation=value;};op.onIdentityObservation=value=>{if(platform==='wechatVideo'&&trace.stage==='readIdentity')try{void Promise.resolve(controls.onDiagnostic?.({platform,stage:'readIdentity',code:'IDENTITY_OBSERVATION',exceptionName:'None',identityObservation:value})).catch(()=>{});}catch{/* 观察者不能改变原身份或清理。 */}};
   return await bounded(async()=>{trace.stage='navigate';await scopeFresh();await page.goto(origins[platform]+'/',{waitUntil:'domcontentloaded',timeout:op.timeoutMs()});await scopeFresh();return run(current,page,op,trace);},signal);
  }catch(error){
   emitDiagnostic(controls,platform,trace,error);
   if(signal.aborted)throw signal.reason;
   if(remainingDeadlineMs(end)!<=0)return fail('EXECUTION_DEADLINE_EXCEEDED','原采集期限已用尽');
   if(error instanceof WechatBrowserSourceError)throw error;
   // Playwright导航/请求异常可能含临时会话URL；外部诊断只收到脱敏普通失败。
   return fail('BROWSER_OPERATION_FAILED',trace.stage==='readIdentity'?'微信账号身份暂未核对完成，请查看原任务':trace.stage==='navigate'||trace.stage==='openProfile'?'微信后台页面暂未就绪，请查看原任务':'微信后台页面或原生下载暂未完成，请查看原任务');
  }finally{
   clearTimeout(timer);if(abort)signal.removeEventListener('abort',abort);
   // 只有新导航诊断有限等待close；原操作保持原行为。清理槽受原绝对end裁剪，不因取消/耗尽续期。
   if(context){markClose();await closeProfile(context,managed,navigationOnly?Math.max(0,Math.min(120000,end-now())):undefined);}
  }
 }
 async function identity(page:Page,platform:WechatCreatorPlatform,op:WechatOperationControls,expected?:string,login=false,assertScopeFresh?:()=>Promise<void>):Promise<WechatCreatorIdentity>{
  let active=op,timer:ReturnType<typeof setTimeout>|undefined,acceptObservation=true;
  if(platform==='wechatVideo'){
   // 原导航120000+字段480000直接相加；不把completion grace借给身份，也不重建原总期限。
   const identityEnd=now()+op.timeoutMs(IDENTITY_READER_BUDGETS.wechatVideo.reduce((total,value)=>total+value,0));
   const local=new AbortController(),signal=AbortSignal.any([op.signal,local.signal]);
   const expired=()=>new WechatBrowserSourceError('EXECUTION_DEADLINE_EXCEEDED','原身份核对期限已用尽');
   active={signal,identityVerification:login?'interactiveLogin':'boundIdentity',timeoutMs(requested){
    const outer=op.timeoutMs(requested);signal.throwIfAborted();const remaining=identityEnd-now();
    if(remaining<=0){local.abort(expired());signal.throwIfAborted();}
    return Math.min(outer,remaining);
   }};
   timer=setTimeout(()=>local.abort(op.signal.aborted?op.signal.reason:expired()),Math.max(0,identityEnd-now()));
  }
  const check=()=>{if(platform==='wechatVideo')active.timeoutMs();else active.signal.throwIfAborted();};
  if(platform==='wechatVideo'){
   let emitted=0;const seen=new Set<string>();
   active.onIdentityObservation=value=>{try{
    if(!acceptObservation||page.isClosed())return;check();
    const safe=identityObservation(value);if(!safe)return;const key=JSON.stringify(safe);
    if(seen.has(key)||emitted>=4)return;seen.add(key);emitted++;op.onIdentityObservation?.(safe);
   }catch{/* 元数据/回调失败不替换原identity结果。 */}};
  }
  const read=async():Promise<WechatCreatorIdentity>=>{
   if(!login){
    for(;;){
     check();if(platform==='wechatVideo'){await assertScopeFresh?.();check();}
     let loggedOut:boolean|null;
     try{loggedOut=await deps.identityWitness!.isLoggedOut(page,platform,active);check();}
     catch(error){check();if(platform!=='wechatVideo'||!canRetryWechatVideoIdentityContext(page,error,active))throw error;loggedOut=null;}
     if(loggedOut!==null){if(loggedOut)return fail('LOGIN_REQUIRED','微信后台需要本人重新登录');break;}
     await delay(250,undefined,{signal:active.signal});check();
    }
   }
   await assertScopeFresh?.();check();
   const observed=await deps.identityWitness!.read(page,platform,active);check();
   if(platform==='wechatVideo'){await assertScopeFresh?.();check();}
   officialUrl(page.url(),origins[platform],platform);
   if(!observed||observed.platform!==platform||!observed.platformIdentity.trim()||!observed.displayName.trim())return fail('IDENTITY_MISSING','未读到普通账号信息页的真实稳定身份');
   if(!/^\/(?!\/)[^?#\x00-\x1f]*$/.test(observed.sourcePath))return fail('IDENTITY_SOURCE_INVALID','稳定身份来源必须是脱敏普通账号信息页面');
   if(expected!==undefined&&observed.platformIdentity!==expected)return fail('WRONG_PLATFORM_IDENTITY','当前微信账号与原绑定身份不同');
   return {platformIdentity:observed.platformIdentity,displayName:observed.displayName,source:platform+':'+observed.sourcePath};
  };
  try{return platform==='wechatVideo'?await bounded(read,active.signal):await read();}
  finally{acceptObservation=false;if(timer)clearTimeout(timer);}
 }
 return {
  /** 宿主仅在实际身份和报表witness均装配时开放真实扫码/同步能力。 */
  configured:Boolean(deps.identityWitness&&deps.reportWitness),
  login(platform:WechatCreatorPlatform,directory:string,controls:WechatBrowserControls={}):Promise<WechatCreatorIdentity>{return withProfile(platform,directory,false,controls,[STARTUP_BUDGET_MS,120000,...IDENTITY_READER_BUDGETS[platform],120000],(_context,page,op,trace)=>{trace.stage='readIdentity';return identity(page,platform,op,undefined,true);});},
  readIdentity(platform:WechatCreatorPlatform,directory:string,expectedIdentity:string,controls:WechatBrowserControls={}):Promise<WechatCreatorIdentity>{if(!expectedIdentity.trim())return rejectBeforeOpen(controls,new WechatBrowserSourceError('IDENTITY_MISSING','原绑定缺少稳定身份'));return withProfile(platform,directory,true,controls,[STARTUP_BUDGET_MS,120000,...IDENTITY_READER_BUDGETS[platform],120000],(_context,page,op,trace)=>{trace.stage='readIdentity';return identity(page,platform,op,expectedIdentity);});},
  async observeNavigation(directory:string,expectedIdentity:string,controls:WechatNavigationControls):Promise<WechatNavigationResult>{
   if(!expectedIdentity.trim())return rejectBeforeOpen(controls,new WechatBrowserSourceError('IDENTITY_MISSING','原绑定缺少稳定身份'));
   if(!/^[A-Za-z0-9._:-]{1,200}$/.test(controls.diagnosticRunId)||!controls.privateEvidenceDir||!controls.deadlineAt||typeof controls.assertScopeFresh!=='function')return rejectBeforeOpen(controls,new WechatBrowserSourceError('NAVIGATION_INPUT_INVALID','导航诊断缺少可信执行上下文'));
   const artifacts:string[]=[];
   try{return await withProfile('wechatVideo',directory,true,controls,[STARTUP_BUDGET_MS,120000,...IDENTITY_READER_BUDGETS.wechatVideo,120000,120000,120000,120000],async(_context,page,op,trace)=>{
    const check=async(active:WechatOperationControls=op)=>{active.signal.throwIfAborted();active.timeoutMs(120000);await controls.assertScopeFresh();active.signal.throwIfAborted();};
    trace.stage='readIdentity';await check();await identity(page,'wechatVideo',op,expectedIdentity,false,check);await check();
    const snapshots:WechatNavigationSnapshot[]=[],samples:WechatNavigationSample[]=[];let sampleCount=0;
    const read=async(active:WechatOperationControls=op)=>{
     await check(active);const result=await readWechatNavigationObservation(page,{...active,assertScopeFresh:()=>check(active)});await check(active);sampleCount++;
     // 中间时序仅保有限root/可见性/遮挡机械事实；实际菜单名仍仅留两份私有snapshot。
     samples.push({sampleIndex:sampleCount,observedAt:new Date(now()).toISOString(),routeClass:result.routeClass,roots:result.roots,closedShadowUnknownCount:result.closedShadowUnknownCount,truncated:result.truncated,candidateVisibility:result.roots.map(root=>({rootId:root.rootId,visibleCount:result.menuCandidates.filter(node=>node.rootId===root.rootId&&node.visible).length,occludedCount:result.menuCandidates.filter(node=>node.rootId===root.rootId&&node.occluded).length}))});
     return result;
    };
    const capture=async(phase:WechatNavigationSnapshot['phase'])=>{
     // 一帧的结构/登录提示/截图/IO共用一个120秒stage，不把每个子步骤各续120秒。
     const controller=new AbortController(),signal=AbortSignal.any([op.signal,controller.signal]),end=now()+op.timeoutMs(120000);
     const active:WechatOperationControls={signal,timeoutMs(requested){signal.throwIfAborted();const remaining=end-now();if(remaining<=0)throw new WechatBrowserSourceError('BROWSER_OPERATION_FAILED','导航诊断取证窗口已结束');return Math.min(op.timeoutMs(requested),remaining);}};
     const timer=setTimeout(()=>controller.abort(new WechatBrowserSourceError('BROWSER_OPERATION_FAILED','导航诊断取证窗口已结束')),Math.max(1,end-now()));
     try{return await bounded(async()=>{
     const observation=await read(active);await check(active);let screenshot:WechatNavigationScreenshot={status:'missing'};
     try{
      const route=navigationRouteClass(page.url());if(route!=='platform_home')throw new WechatBrowserSourceError('SOURCE_URL_INVALID','导航诊断页面不在固定首页');
      if(await deps.identityWitness!.isLoggedOut(page,'wechatVideo',active))throw new WechatBrowserSourceError('LOGIN_REQUIRED','微信后台需要本人重新登录');
      await check(active);const bytes=await page.screenshot({type:'png',fullPage:false,timeout:active.timeoutMs(120000)});await check(active);
      if(navigationRouteClass(page.url())!==route)throw new WechatBrowserSourceError('SOURCE_URL_INVALID','导航诊断页面已变化');
      if(await deps.identityWitness!.isLoggedOut(page,'wechatVideo',active))throw new WechatBrowserSourceError('LOGIN_REQUIRED','微信后台需要本人重新登录');
      await check(active);const saved=await savePrivateFailureImage(controls.privateEvidenceDir,bytes,active);artifacts.push(saved.artifactId);screenshot={status:'captured',...saved};await check(active);
     }catch(error){await check(active);if(error instanceof WechatBrowserSourceError&&['LOGIN_REQUIRED','SOURCE_URL_INVALID'].includes(error.code))throw error;}
     const snapshot={...observation,phase,observedAt:new Date(now()).toISOString(),screenshot};snapshots.push(snapshot);return snapshot;
     },signal);}finally{clearTimeout(timer);controller.abort();}
    };
    await capture('identity_verified');const started=now(),observationStartedAt=new Date(started).toISOString();
    // 120秒为一次有限观察；31个中间样本封顶后仍等原结束时刻，不能用样本数提前结束。
    const end=started+120000,windowController=new AbortController(),windowSignal=AbortSignal.any([op.signal,windowController.signal]);
    const windowTimer=setTimeout(()=>windowController.abort(),Math.max(1,end-now()));
    const active:WechatOperationControls={signal:windowSignal,timeoutMs(requested){windowSignal.throwIfAborted();const remaining=end-now();if(remaining<=0){windowController.abort();windowSignal.throwIfAborted();}return Math.min(op.timeoutMs(requested),remaining);}};
    try{while(now()<end){await check(active);await delay(Math.min(4000,Math.max(1,end-now())),undefined,{signal:windowSignal});await check(active);if(now()<end&&sampleCount<31)await read(active);}}
    catch(error){op.signal.throwIfAborted();if(!windowController.signal.aborted)throw error;}
    finally{clearTimeout(windowTimer);windowController.abort();}
    await capture('observation_end');await check();return {diagnosticRunId:controls.diagnosticRunId,identityMatched:true,observationStartedAt,observationEndedAt:new Date(now()).toISOString(),sampleCount,samples,snapshots};
   },true);}catch(error){for(const artifactId of artifacts)try{await unlink(path.join(controls.privateEvidenceDir,artifactId+'.png'));}catch{/* 仍只可能留在本次0700私有根；不得发布有效索引。 */}throw error;}
  },
  async collectNativeReports(platform:WechatCreatorPlatform,directory:string,expectedIdentity:string,controls:WechatBrowserControls={},onReport?:(report:WechatNativeDownload)=>Promise<void>):Promise<WechatNativeDownload[]>{
   if(!expectedIdentity.trim())return rejectBeforeOpen(controls,new WechatBrowserSourceError('IDENTITY_MISSING','原绑定缺少稳定身份'));
   // 视频号菜单最多五段替代原一次goto；同根观察并入原标签观察，另留一次失败probe余量。原持久deadline仍裁剪整链。
   return withProfile(platform,directory,true,controls,[STARTUP_BUDGET_MS,120000,...IDENTITY_READER_BUDGETS[platform],...kinds[platform].flatMap(()=>REPORT_STAGE_BUDGETS[platform]),120000],async(context,page,op,trace)=>{
    trace.stage='readIdentity';await identity(page,platform,op,expectedIdentity);if(!deps.reportWitness)return fail('REPORT_WITNESS_MISSING','尚未核实原生报表的页面选择与就绪观察');
    const reports:WechatNativeDownload[]=[];
    for(const kind of kinds[platform]){
     op.signal.throwIfAborted();
     try{
      trace.stage='prepare';trace.kind=kind;delete trace.entryObservation;const prepared=await deps.reportWitness.prepare(page,platform,kind,op);op.signal.throwIfAborted();
      trace.stage='download';const report=await receiveReport(context,page,platform,kind,prepared,op);op.signal.throwIfAborted();
      // 原service port可逐页提交；后续失败保留先前已提交证据，不在worker写库。
      trace.stage='submit';await onReport?.(report);reports.push(report);
     }catch(error){
      if(op.signal.aborted)throw error;if(error instanceof WechatBrowserSourceError&&error.code==='WRONG_PLATFORM_IDENTITY')throw error;
      let loggedOut:boolean|undefined;try{loggedOut=await deps.identityWitness!.isLoggedOut(page,platform,op);}catch{op.signal.throwIfAborted();}
      if(loggedOut)return fail('LOGIN_REQUIRED','微信后台需要本人重新登录');
      // 本次identity已核验；仅typed section缺失取顶层viewport，不改变报表选择、状态或业务提交。
      if(loggedOut===false&&deps.privateFailureImageDir&&platform==='wechatVideo'&&trace.stage==='prepare'&&error instanceof WechatBrowserSourceError&&error.code==='REPORT_SECTION_MISSING')await capturePrivateFailureImage(page,kind,deps.privateFailureImageDir,deps.identityWitness!,op);
      throw error;
     }
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
