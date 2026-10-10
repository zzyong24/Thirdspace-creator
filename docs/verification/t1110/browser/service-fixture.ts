// 仅由prepare-next.mjs注入/tmp影子Next composition；不可装入正式产品composition。
// 报告数据来自调用者提供的脱敏实文件witness，执行状态是独立UI fixture。
// 不写platformCollectionBindings、不提供verified identity、不打开profile/browser，不调用真实采集。
import {appendFileSync,readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {platformNativeReportPayload,platformNativeReportsListQuery,collectionStartRequest,type NativeReportPayload,type CollectionRunResource,type RequestContext} from '@creatoros/contract';
import type {createPlatformCollectionService} from '@creatoros/backend/modules/platform-collection';
import type {createAccountGroupService,createPlatformAccountService} from '@creatoros/backend/modules/platform-account';
type Real=ReturnType<typeof createPlatformCollectionService>;
type Groups=ReturnType<typeof createAccountGroupService>;
type Accounts=ReturnType<typeof createPlatformAccountService>;
type Mode='running'|'complete'|'partial'|'needsAuth'|'timeout'|'empty';
type FixtureRun={value:CollectionRunResource;owner:{userId:string;groupId:string;accountId:string};key:string};
export function createT1110PageServiceFixture({real,groups,accounts}:{real:Real;groups:Groups;accounts:Accounts}):Real{
 const witnessPath=process.env.CREATOROS_T1110_REPORT_WITNESS,controlPath=process.env.CREATOROS_T1110_FIXTURE_CONTROL,logPath=process.env.CREATOROS_T1110_FIXTURE_LOG;
 if(!witnessPath||!controlPath||!logPath||process.env.CREATOROS_T1110_PAGE_FIXTURE!=='isolated-shadow-v1'||!process.env.PGLITE_DATA_DIR?.includes('creatoros-t1110-shadow-'))throw Error('隔离影子页面fixture的启动条件不完整');
 const raw=JSON.parse(readFileSync(witnessPath,'utf8'));
 if(raw.schema!=='t1110-report-witness/v1'||!Array.isArray(raw.witnesses)||!raw.witnesses.length)throw Error('缺少脱敏实文件/代表投影witness，不采用任意合成数据冒充真实');
 const reports:NativeReportPayload[]=raw.payloads.map((value:unknown)=>platformNativeReportPayload.parse(value));
 for(const kind of ['officialContent','officialFollowers','channelsDaily','channelsFollowers','channelsWorks'])if(!reports.some(r=>r.kind===kind))throw Error('五种原生报表witness尚未齐全');
 const runs=new Map<string,FixtureRun>(),keys=new Map<string,string>(),lostTokens=new Set<string>();
 const control=(accountId:string)=>{const c=JSON.parse(readFileSync(controlPath!,'utf8'));return {...c,...c.accounts?.[accountId]};};
 const mode=(accountId:string):Mode=>{const value=control(accountId).mode??control(accountId).defaultMode??'running';if(!['running','complete','partial','needsAuth','timeout','empty'].includes(value))throw Error('页面fixture状态不正确');return value;};
 const log=(action:string,ctx:RequestContext,input:unknown,value:unknown)=>appendFileSync(logPath!,JSON.stringify({at:new Date().toISOString(),action,userId:ctx.userId,groupId:ctx.groupId,accountId:ctx.accountId,input,value,evidenceScope:'isolated UI execution/read fixture; not platform binding or live collection'})+'\n');
 async function scope(ctx:RequestContext,accountId:string){
  // 真正backend公开读端口的账号/组/frozen membership guard，不能由fixture绕过。
  await real.listNativeReports(ctx,{accountId,pageSize:1,cursor:null});
  const account=await accounts.getAccount(ctx,accountId);
  if(account.platform!=='wechatOfficial'&&account.platform!=='wechatVideo')throw Error('这个账号不属于微信报表测试范围');
  const member=await groups.forAccount(ctx,accountId);
  if(member.groupId!==ctx.groupId)throw Error('这个账号不属于当前账号组');
  return {account,member};
 }
 function owner(ctx:RequestContext,accountId:string){return {userId:ctx.userId,groupId:ctx.groupId!,accountId};}
 function scopedRun(ctx:RequestContext,accountId:string,attemptId:string){const row=runs.get(attemptId);if(!row||JSON.stringify(row.owner)!==JSON.stringify(owner(ctx,accountId)))throw Error('同步记录与当前账号不一致');return row;}
 function observe(row:FixtureRun){
  if(row.value.status==='cancelled')return row.value;
  const current=mode(row.owner.accountId);const status:CollectionRunResource['status']=current==='timeout'?'partial':current==='empty'?'complete':current;
  row.value={...row.value,status,reasonCode:current==='timeout'?'TASK_TIMEOUT':current==='needsAuth'?'LOGIN_REQUIRED':current==='partial'?'REPORT_PARSE_FAILED':null,updatedAt:new Date().toISOString()};return row.value;
 }
 return {...real,
  listCapabilities(ctx){const result=real.listCapabilities(ctx),enabled=!ctx.accountId||control(ctx.accountId).canCollect!==false;return {items:result.items.map(item=>item.capability==='nativeReports'&&(item.platform==='wechatOfficial'||item.platform==='wechatVideo')?{...item,supported:true,runtimeState:enabled?'ready' as const:'unavailable' as const,authState:'pending' as const,reasonCode:enabled?null:'SOURCE_NOT_CONFIGURED'}:item)};},
  async listNativeReports(ctx,rawQuery){
   const query=platformNativeReportsListQuery.parse(rawQuery);const {account,member}=await scope(ctx,query.accountId);const selected=mode(query.accountId)==='empty'?[]:reports.filter(r=>r.platform===account.platform);const offset=query.cursor===null?0:Number(query.cursor);
   if(!Number.isSafeInteger(offset)||offset<0)throw Error('分页位置不正确');
   const items=selected.slice(offset,offset+query.pageSize).map((payload,index)=>({...payload,id:`ui-report-${query.accountId}-${payload.kind}-${offset+index}`,userId:ctx.userId,groupId:ctx.groupId!,accountId:query.accountId,membershipVersion:member.version,observedAt:raw.observedAt,ingestedAt:raw.observedAt}));
   const value={items,total:selected.length,nextCursor:offset+items.length<selected.length?String(offset+items.length):null};log('reports.list',ctx,query,{count:items.length,kinds:items.map(r=>r.kind)});return value;
  },
  async start(ctx,rawInput){
   const input=collectionStartRequest.parse(rawInput);if(input.capability!=='nativeReports')return real.start(ctx,input);await scope(ctx,input.accountId);const gate=control(input.accountId).startGate;if(typeof gate==='string'){log('collections.start.waiting',ctx,{...input,gate},null);const end=Date.now()+120000;while(control(input.accountId).startGate===gate){if(Date.now()>=end)throw Object.assign(new Error('提交等待结束'),{code:'ExternalDependencyError'});await new Promise(done=>setTimeout(done,100));}}
   const requestKey=JSON.stringify([ctx.userId,ctx.groupId,input.accountId,input.clientRequestId]);const existing=keys.get(requestKey);
   if(existing){const row=scopedRun(ctx,input.accountId,existing);const value=observe(row);log('collections.start',ctx,input,{...value,replayed:true});return value;}
   const active=[...runs.values()].find(r=>JSON.stringify(r.owner)===JSON.stringify(owner(ctx,input.accountId))&&(r.value.status==='running'||r.value.status==='queued'));
   if(active)throw Error('此账号已有同步任务，请先核对任务状态');
   const stamp=new Date().toISOString(),attemptId=`ui-attempt-${randomUUID()}`;const row:FixtureRun={owner:owner(ctx,input.accountId),key:input.clientRequestId,value:{attemptId,accountId:input.accountId,capability:'nativeReports',status:'running',generation:1,committedPages:0,completeCatalogGeneration:null,reasonCode:null,startedAt:stamp,updatedAt:stamp}};runs.set(attemptId,row);keys.set(requestKey,attemptId);const value=observe(row);log('collections.start',ctx,input,{...value,replayed:false});const lossToken=control(input.accountId).startResponseLossToken;if(typeof lossToken==='string'&&!lostTokens.has(lossToken)){lostTokens.add(lossToken);log('collections.start.responseLost',ctx,input,{attemptId});throw Object.assign(new Error('服务暂时无响应'),{code:'ExternalDependencyError'});}return value;
  },
  async status(ctx,accountId,attemptId){await scope(ctx,accountId);const row=scopedRun(ctx,accountId,attemptId);const gate=control(accountId).getGate;if(typeof gate==='string'){log('collections.get.waiting',ctx,{accountId,attemptId,gate},null);const end=Date.now()+120000;while(control(accountId).getGate===gate){if(Date.now()>=end)throw Object.assign(new Error('状态读取等待结束'),{code:'ExternalDependencyError'});await new Promise(done=>setTimeout(done,100));}}const value=observe(row);log('collections.get',ctx,{accountId,attemptId},value);return value;},
  async cancel(ctx,accountId,attemptId){await scope(ctx,accountId);const row=scopedRun(ctx,accountId,attemptId);row.value={...row.value,status:'cancelled',reasonCode:'CANCELLED',updatedAt:new Date().toISOString()};log('collections.cancel',ctx,{accountId,attemptId},row.value);return row.value;},
 };
}
