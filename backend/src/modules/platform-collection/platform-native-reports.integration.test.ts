import {describe,it,expect} from 'vitest';
import {createRequire} from 'node:module';
import {createWechatNativeCollector,type WechatNativeBrowserOptions} from '../../application/collection/wechat-native-collector';
import {parseWechatNativeReport,type WechatNativeReportInput} from '@creatoros/ai-worker/platform/wechat-native-report-parser';
import {eq} from 'drizzle-orm';
import {createDb} from '../../db';
import {platformAccounts} from '../../schema/platform-account';
import {accountGroups,accountGroupMemberships} from '../../schema/account-groups';
import {platformCollectionBindings,platformCatalogs,platformNativeReports} from '../../schema/platform-collection';
import {createPlatformCollectionService} from './platform-collection.service';
import {lockWorkspaceMembership,assertFrozenWorkspaceMembership,createAccountGroupService} from '../platform-account';
import {createPlatformCollectionTransport} from './platform-collection.transport';
import {ENDPOINTS as platformCollectionOperations} from '@creatoros/contract';
const time='2026-10-09T02:00:00.000Z';
const report={platform:'wechatVideo' as const,kind:'channelsDaily' as const,scope:'accountDaily' as const,selection:{startDate:'2026-10-08',endDate:'2026-10-08',timeZone:'Asia/Shanghai' as const,meaning:'statisticsDates' as const},accumulation:'daily' as const,sourcePath:'/platform/statistic/post' as const,filename:'数据.csv',sha256:'b'.repeat(64),receivedBytes:100,tables:[{key:'daily',label:'每日',columns:[{key:'播放',label:'播放',unit:'count' as const}],rows:[[{raw:'0',value:0}]]}]};
async function fixture(options:{key?:string;ownerStatus?:string;platform?:'wechatOfficial'|'wechatVideo';claim?:boolean}={}){
 const {db,client}=await createDb();let n=0;const platform=options.platform??'wechatVideo';
 for(const [a,g] of [['a','g1'],['b','g2']] as const){
  await db.insert(platformAccounts).values({id:a,userId:'u',platform,accountHandle:a,externalAccountId:`id-${a}`,createdAt:time,updatedAt:time});
  await db.insert(accountGroups).values({id:g,userId:'u',name:g,version:1,createdAt:time,updatedAt:time});
  await db.insert(accountGroupMemberships).values({id:`m-${a}`,userId:'u',groupId:g,accountId:a,version:1,joinedAt:time});
  await db.insert(platformCollectionBindings).values({accountId:a,userId:'u',platform,platformIdentity:`id-${a}`,scopes:['nativeReports'],proofSource:'verified-native-page',verifiedAt:time});
 }
 const clock={value:time},ownerStates=new Map<string,{status:string}>();if(options.ownerStatus)ownerStates.set('owner-task',{status:options.ownerStatus});
 const ctx={userId:'u',accountId:'a',groupId:'g1',requestId:'r',source:'user' as const};
 const service=createPlatformCollectionService({db,now:()=>clock.value,readScheduledOwner:async(_c,taskId)=>ownerStates.get(taskId)??null,nextId:p=>`${p}-${++n}`,sourceAdapters:{[platform]:[{platform,capability:'nativeReports',supported:true,authState:'authorized',runtimeState:'ready',reasonCode:null,lastVerifiedAt:time}]},nativeReportOwnership:{freeze:async(tx,c,a)=>lockWorkspaceMembership(tx,{...c,accountId:a}),assert:assertFrozenWorkspaceMembership}});
 const transport=createPlatformCollectionTransport(()=>service);
 const request=async(endpoint:any,input:any,c=ctx)=>((await transport.request(endpoint,input,c)) as {data:unknown}).data;
 const run:any=await request(platformCollectionOperations.startCollection,{params:{accountId:'a'},body:{capability:'nativeReports',clientRequestId:options.key??'original-request'}});
 const lease=options.claim===false?null:await service.claim(run.attemptId,'worker');
 const page={...lease,leaseExpiresAt:undefined,capability:'nativeReports',sourceSnapshotKey:null,scanPass:1,platformReportedTotal:null,totalSource:null,totalObservedAt:null,terminalEvidence:{kind:'platformHasMoreFalse',source:'native-file',observedAt:time},pageIndex:0,requestCursor:null,nextCursor:null,pageDigest:'untrusted',hasMore:false,observedAt:time,works:[],accountMetrics:[],workMetrics:[],nativeReports:[report]};delete (page as any).leaseExpiresAt;
 return {db,client,ctx,service,request,run,page,clock,ownerStates};
}
describe('公开微信原生报表持久链',()=>{
 it('start→原租约commit→公开read，0值/范围保真且不更新目录',async()=>{const f=await fixture();try{await f.service.commitPage(f.page);const result:any=await f.request(platformCollectionOperations.listNativeReports,{params:{accountId:'a'},query:{pageSize:20,cursor:null}});expect(result.items).toHaveLength(1);expect(result.items[0]).toMatchObject({groupId:'g1',membershipVersion:1,...report});expect(await f.db.select().from(platformCatalogs)).toHaveLength(0);expect((await f.service.status(f.ctx,'a',f.run.attemptId)).status).toBe('complete');}finally{await f.client.close();}},180000);
 it('后续页失败保已写报告、同页重放幂等、内容变化冲突',async()=>{const f=await fixture();try{const page={...f.page,hasMore:true,nextCursor:'report-2',terminalEvidence:null};await f.service.commitPage(page);expect((await f.service.commitPage(page)).disposition).toBe('replayed');await expect(f.service.commitPage({...page,nativeReports:[{...report,filename:'changed.csv'}]})).rejects.toMatchObject({code:'PAGE_DIGEST_CONFLICT'});await f.service.failRun(f.run.attemptId,f.page.generation!,f.page.leaseToken!,'failed','REPORT_PARSE_FAILED');expect((await f.db.select().from(platformNativeReports))).toHaveLength(1);}finally{await f.client.close();}},180000);
 it('同用户其它组、错身份与已取消旧租约都拒绝',async()=>{const f=await fixture();try{await expect(f.request(platformCollectionOperations.listNativeReports,{params:{accountId:'b'},query:{pageSize:20,cursor:null}},{...f.ctx,accountId:'b'})).rejects.toThrow();await expect(f.service.commitPage({...f.page,expectedPlatformIdentity:'other'})).rejects.toMatchObject({code:'WRONG_PLATFORM_IDENTITY'});await f.service.cancel(f.ctx,'a',f.run.attemptId);await expect(f.service.commitPage(f.page)).rejects.toMatchObject({code:'GENERATION_STALE'});}finally{await f.client.close();}},180000);
 it('转组后晚提交拒绝，旧报告不删除或进入新组',async()=>{const f=await fixture();try{await f.service.commitPage({...f.page,hasMore:true,nextCursor:'r2',terminalEvidence:null});await f.db.update(accountGroupMemberships).set({groupId:'g2',version:2}).where(eq(accountGroupMemberships.accountId,'a'));await expect(f.service.commitPage({...f.page,pageIndex:1,requestCursor:'r2'})).rejects.toThrow();const result:any=await f.request(platformCollectionOperations.listNativeReports,{params:{accountId:'a'},query:{pageSize:20,cursor:null}},{...f.ctx,groupId:'g2'});expect(result.items).toHaveLength(0);expect((await f.db.select().from(platformNativeReports))[0]!.groupId).toBe('g1');}finally{await f.client.close();}},180000);
});

it('T1110同原字节空作品的不同选择窗口分别保留，不误冲突也不重写旧窗口',async()=>{
 const f=await fixture();try{
  const empty={...report,kind:'channelsWorks' as const,scope:'workSelection' as const,accumulation:'sourceUnspecified' as const,selection:{...report.selection,meaning:'publishedDates' as const},tables:[{key:'works',label:'原生空作品',columns:[{key:'videoId',label:'视频ID',unit:'opaqueId' as const}],rows:[]}]};
  await f.service.commitPage({...f.page,nativeReports:[empty],hasMore:true,nextCursor:'next-window',terminalEvidence:null});
  const moved={...empty,selection:{...empty.selection,startDate:'2026-10-09',endDate:'2026-10-09'}};
  await f.service.commitPage({...f.page,pageIndex:1,requestCursor:'next-window',nativeReports:[moved]});
  const read:any=await f.request(platformCollectionOperations.listNativeReports,{params:{accountId:'a'},query:{pageSize:20,cursor:null}});
  expect(read.items).toHaveLength(2);expect(read.items.map((r:any)=>r.selection.startDate).sort()).toEqual(['2026-10-08','2026-10-09']);expect(new Set(read.items.map((r:any)=>r.sha256)).size).toBe(1);
 }finally{await f.client.close();}
},180000);
it('T1110微信原scheduled owner的needsAuth只在新证明后恢复同ID，错task和取消拒绝恢复',async()=>{
 const f=await fixture({key:'scheduled-owner-task-reports',ownerStatus:'running'});try{
  expect(await f.service.scheduledOwnerTaskId(f.ctx,'a',f.run.attemptId)).toBe('owner-task');
  await f.service.failRun(f.run.attemptId,f.page.generation!,f.page.leaseToken!,'needsAuth','LOGIN_REQUIRED');
  await f.service.resumeScheduledAuthorization(f.ctx,'a',f.run.attemptId,'owner-task');expect((await f.service.status(f.ctx,'a',f.run.attemptId)).status).toBe('needsAuth');
  await expect(f.service.resumeScheduledAuthorization(f.ctx,'a',f.run.attemptId,'another-task')).rejects.toThrow('原调度');
  f.clock.value='2026-10-09T02:01:00.000Z';await f.db.update(platformCollectionBindings).set({verifiedAt:f.clock.value}).where(eq(platformCollectionBindings.accountId,'a'));
  await f.service.resumeScheduledAuthorization(f.ctx,'a',f.run.attemptId,'owner-task');expect(await f.service.status(f.ctx,'a',f.run.attemptId)).toMatchObject({attemptId:f.run.attemptId,status:'partial',startedAt:time});
  await f.service.cancel(f.ctx,'a',f.run.attemptId);await f.service.resumeScheduledAuthorization(f.ctx,'a',f.run.attemptId,'owner-task');expect((await f.service.status(f.ctx,'a',f.run.attemptId)).status).toBe('cancelled');
 }finally{await f.client.close();}
},180000);
it('T1110微信取消/失败owner释放原run，paused/unknown真owner保原ID，伪造key不授权',async()=>{
 const f=await fixture({key:'scheduled-owner-task-reports',ownerStatus:'paused'});try{
  for(const state of ['paused','unknown']){f.ownerStates.set('owner-task',{status:state});expect(await f.service.scheduledOwnerTaskId(f.ctx,'a',f.run.attemptId)).toBe('owner-task');await f.service.releaseTerminatedScheduledRuns(f.ctx,'a');expect((await f.service.status(f.ctx,'a',f.run.attemptId)).status).toBe('running');}
  f.ownerStates.set('owner-task',{status:'failed'});await f.service.releaseTerminatedScheduledRuns(f.ctx,'a');expect((await f.service.status(f.ctx,'a',f.run.attemptId))).toMatchObject({status:'partial',reasonCode:'OWNER_FAILED'});
  f.ownerStates.set('owner-task',{status:'cancelled'});await f.service.releaseTerminatedScheduledRuns(f.ctx,'a');expect((await f.service.status(f.ctx,'a',f.run.attemptId)).status).toBe('cancelled');
  const manual=await f.service.start(f.ctx,{accountId:'a',capability:'nativeReports',clientRequestId:'scheduled-fake-task-reports'});expect(await f.service.scheduledOwnerTaskId(f.ctx,'a',manual.attemptId)).toBeNull();
 }finally{await f.client.close();}
},180000);

// 仅合成协议文件；浏览器/profile端口明确为隔离fixture，不冒充真人扫码或原导出文件。
function sourceFiles(platform:'wechatOfficial'|'wechatVideo'):WechatNativeReportInput[]{
 const selection={startDate:'2026-10-08',endDate:'2026-10-08',timeZone:'Asia/Shanghai' as const,meaning:'statisticsDates' as const};
 const encode=(s:string)=>new TextEncoder().encode(s);
 const make=(kind:WechatNativeReportInput['kind'],bytes:Uint8Array):WechatNativeReportInput=>({platform,kind,bytes,filename:`synthetic-${kind}.xls`,selection:kind==='channelsWorks'?{...selection,meaning:'publishedDates'}:selection,sourcePath:kind==='officialContent'?'/misc/appmsganalysis':kind==='officialFollowers'?'/misc/useranalysis':kind==='channelsFollowers'?'/platform/statistic/follower':'/platform/statistic/post'});
 if(platform==='wechatVideo')return [
  make('channelsDaily',encode('合成说明\r\n合成范围\r\n时间,播放,推荐,喜欢,评论,分享,关注\r\n2026/10/08,0,2,3,0,-,0')),
  make('channelsFollowers',encode('合成说明\r\n合成范围\r\n时间,净增关注,新增关注,取消关注,关注者总数\r\n2026/10/08,-2,0,2,10')),
  make('channelsWorks',encode('视频描述,视频ID,发布时间,完播率,平均播放时长,播放量,推荐,喜欢,评论量,分享量,关注量,转发聊天和朋友圈,设为铃声,设为状态,设为朋友圈封面,企微链接点击次数,企微链接点击人数,添加到通讯录次数,添加到通讯录人数\r\n"合成标题,带引号\"\"和换行\r\n第二行",synthetic_opaque_001,2026/10/08 12:34:56,25%,1.25秒,0,2,3,4,5,6,7,8,9,10,11,12,13,14')),
 ];
 // 解析器的既有worker依赖生成真实BIFF协议字节，backend生产仍不依赖SheetJS。
 const xlsx=createRequire(import.meta.resolve('@creatoros/ai-worker/platform/wechat-native-report-parser'))('xlsx');
 const grid:(string|number)[][]=Array.from({length:4},()=>Array<string|number>(16).fill(''));
 grid[0]![1]='合成内容分析';
 for(const [offset,labels] of [[1,['日期','渠道','阅读人数']],[5,['日期','分享人数','跳转阅读原文人数','微信收藏人数','发表篇数']],[11,['传播渠道','发表日期','内容标题','阅读人数','阅读人数占比']]] as const)labels.forEach((label,c)=>{grid[2]![offset+c]=label;});
 [['2026-10-08','合成渠道',0],['2026-10-08',0,1,2,3],['合成渠道','2026-09-01','合成旧文',2,0.25]].forEach((row,i)=>row.forEach((value,c)=>{grid[3]![[1,5,11][i]!+c]=value;}));
 const sheet=xlsx.utils.aoa_to_sheet(grid);sheet.P4.z='0.0%';const book=xlsx.utils.book_new();xlsx.utils.book_append_sheet(book,sheet,'合成');
 return [make('officialContent',new Uint8Array(xlsx.write(book,{type:'array',bookType:'biff8'}))),make('officialFollowers',encode('<html><body><table><tr><th>时间</th><th>新关注人数</th><th>取消关注人数</th><th>净增关注人数</th><th>累积关注人数</th></tr><tr><td>2026-10-08</td><td>0</td><td>2</td><td>-2</td><td>10</td></tr></table></body></html>'))];
}
function nativeExecutor(f:Awaited<ReturnType<typeof fixture>>,collectReports:(o:WechatNativeBrowserOptions)=>Promise<void>,lostTerminalAck=false){
 let held=false,stopped=false,downloads=0;
 const execute=createWechatNativeCollector({workerId:'synthetic-browser-worker',now:()=>Date.parse(f.clock.value),claimLease:f.service.claim,renewLease:f.service.renewLease,failRun:f.service.failRun,
  commitPage:async page=>{const result=await f.service.commitPage(page);if(lostTerminalAck&&!page.hasMore)throw Error('合成响应丢失');return result;},
  authorizeProfile:async()=>({authDir:'/synthetic-profile-fixture'}),acquireProfile:async authDir=>{held=true;return {authDir,onStopped:async()=>{held=false;stopped=true;}};},
  parseReport:parseWechatNativeReport,collectReports:async o=>{downloads++;expect(held).toBe(true);try{await collectReports(o);}finally{await o.onStopped();}},onStopUnconfirmed:()=>{throw Error('unexpected fixture stop');},
 });
 return {execute,physical:()=>({held,stopped,downloads})};
}
it.each(['wechatOfficial','wechatVideo'] as const)('T1110 %s公开start→执行器→真实解析器→DB提交→公开read，全部必需报告后才complete',async platform=>{
 const f=await fixture({platform,claim:false});try{
  const files=sourceFiles(platform),execution=nativeExecutor(f,async o=>{expect(o.expectedPlatformIdentity).toBe('id-a');expect(o.deadlineAt).toBe(Date.parse(time)+30*60000);for(const input of files)await o.onReport(input);});
  const result=await execution.execute(f.ctx,f.run);expect(result).toMatchObject({attemptId:f.run.attemptId,status:'complete',committedReports:files.length});expect(execution.physical()).toEqual({held:false,stopped:true,downloads:1});
  const read:any=await f.request(platformCollectionOperations.listNativeReports,{params:{accountId:'a'},query:{pageSize:20,cursor:null}});
  expect(read.items.map((r:any)=>r.kind).sort()).toEqual(files.map(i=>i.kind).sort());expect(read.items.every((r:any)=>r.groupId==='g1'&&!('selectionKey' in r))).toBe(true);
  expect(read.items.flatMap((r:any)=>r.tables.flatMap((t:any)=>t.rows.flat())).some((c:any)=>c.raw==='0'&&c.value===0)).toBe(true);
  const status:any=await f.request(platformCollectionOperations.getCollection,{params:{accountId:'a',attemptId:f.run.attemptId}});expect(status).toMatchObject({status:'complete',committedPages:files.length+1});expect(await f.db.select().from(platformCatalogs)).toHaveLength(0);
 }finally{await f.client.close();}
},180000);
it('T1110第三报表坏格式经真实解析器失败，已提交两份可公开回读且不误报登录',async()=>{
 const f=await fixture({claim:false});try{
  const files=sourceFiles('wechatVideo'),execution=nativeExecutor(f,async o=>{for(const [i,input] of files.entries())await o.onReport(i===2?{...input,bytes:new TextEncoder().encode('格式漂移')}:input);});
  expect(await execution.execute(f.ctx,f.run)).toMatchObject({status:'partial',committedReports:2,reasonCode:'REPORT_PARSE_FAILED'});
  expect(await f.service.status(f.ctx,'a',f.run.attemptId)).toMatchObject({status:'partial',reasonCode:'REPORT_PARSE_FAILED'});
  const read:any=await f.request(platformCollectionOperations.listNativeReports,{params:{accountId:'a'},query:{pageSize:20,cursor:null}});expect(read.items).toHaveLength(2);expect(await f.db.select().from(platformCatalogs)).toHaveLength(0);
 }finally{await f.client.close();}
},180000);
it('T1110第三报表页面总数13而CSV仅第一页10条，真实解析后拒绝并保原两份报告',async()=>{
 const f=await fixture({claim:false});try{
  const files=sourceFiles('wechatVideo'),work=files[2]!,table=parseWechatNativeReport(work).tables[0]!;
  const field=(value:string)=>/[",\r\n]/.test(value)?'"'+value.replaceAll('"','""')+'"':value;
  const rows=[table.columns.map(c=>c.label),...Array.from({length:10},(_,i)=>table.rows[0]!.map((cell,c)=>c===1?'synthetic_truncated_'+i:cell.raw))];
  const truncated={...work,expectedRows:13,bytes:new TextEncoder().encode(rows.map(row=>row.map(field).join(',')).join('\r\n'))};
  const execution=nativeExecutor(f,async o=>{for(const input of [files[0]!,files[1]!,truncated])await o.onReport(input);});
  expect(await execution.execute(f.ctx,f.run)).toMatchObject({status:'partial',committedReports:2,reasonCode:'REPORT_PARSE_FAILED'});
  expect(await f.service.status(f.ctx,'a',f.run.attemptId)).toMatchObject({status:'partial',reasonCode:'REPORT_PARSE_FAILED'});
  const read:any=await f.request(platformCollectionOperations.listNativeReports,{params:{accountId:'a'},query:{pageSize:20,cursor:null}});
  expect(read.items).toHaveLength(2);expect(read.items.map((r:any)=>r.kind)).not.toContain('channelsWorks');
 }finally{await f.client.close();}
},180000);
it('T1110终页已接受但响应丢失，公开核对原ID/key显示complete，不再下载或开新任务',async()=>{
 const f=await fixture({claim:false});try{
  const execution=nativeExecutor(f,async o=>{for(const input of sourceFiles('wechatVideo'))await o.onReport(input);},true);
  expect(await execution.execute(f.ctx,f.run)).toMatchObject({attemptId:f.run.attemptId,status:'partial'});
  const status:any=await f.request(platformCollectionOperations.getCollection,{params:{accountId:'a',attemptId:f.run.attemptId}});expect(status.status).toBe('complete');
  const original:any=await f.request(platformCollectionOperations.startCollection,{params:{accountId:'a'},body:{capability:'nativeReports',clientRequestId:'original-request'}});expect(original).toMatchObject({attemptId:f.run.attemptId,status:'complete'});
  expect(execution.physical().downloads).toBe(1);expect(await f.db.select().from(platformNativeReports)).toHaveLength(3);
 }finally{await f.client.close();}
},180000);
it('T1110公开取消后的晚报告拒绝，原执行期限耗尽晚报告也不写入，已得报告均保留',async()=>{
 for(const mode of ['cancel','deadline'] as const){const f=await fixture({claim:false});try{
  const controller=new AbortController(),files=sourceFiles('wechatVideo');let late:unknown;
  const execution=nativeExecutor(f,async o=>{await o.onReport(files[0]!);if(mode==='cancel'){await f.request(platformCollectionOperations.cancelCollection,{params:{accountId:'a',attemptId:f.run.attemptId}});controller.abort();}else f.clock.value='2026-10-09T02:31:00.000Z';try{await o.onReport(files[1]!);}catch(e){late=e;throw e;}});
  expect(await execution.execute(f.ctx,f.run,controller.signal)).toMatchObject({status:mode==='cancel'?'cancelled':'partial',committedReports:1,reasonCode:mode==='cancel'?'CANCELLED':'TASK_TIMEOUT'});expect(late).toBeDefined();
  expect(await f.service.status(f.ctx,'a',f.run.attemptId)).toMatchObject({status:mode==='cancel'?'cancelled':'partial'});expect(await f.db.select().from(platformNativeReports)).toHaveLength(1);
 }finally{await f.client.close();}}
},180000);

it.each([true,false])('T1110公开转组在微信queued/running=%s时拒绝，取消原run后可按真实新预览转组',async claim=>{
 const f=await fixture({claim});try{
  let id=0;const groups=createAccountGroupService({db:f.db,now:()=>f.clock.value,nextId:p=>`transfer-${p}-${++id}`});
  const preview=await groups.previewTransfer(f.ctx,{accountId:'a',toGroupId:'g2'});expect(preview.activeTaskCount).toBe(1);
  await expect(groups.transfer(f.ctx,{...preview,idempotencyKey:'move-native-active'})).rejects.toMatchObject({code:'ConflictError'});expect((await groups.forAccount(f.ctx,'a')).groupId).toBe('g1');
  await f.request(platformCollectionOperations.cancelCollection,{params:{accountId:'a',attemptId:f.run.attemptId}});
  const ready=await groups.previewTransfer(f.ctx,{accountId:'a',toGroupId:'g2'});expect(ready.activeTaskCount).toBe(0);
  expect(await groups.transfer(f.ctx,{...ready,idempotencyKey:'move-native-cancelled'})).toMatchObject({groupId:'g2',version:2});
 }finally{await f.client.close();}
},180000);
