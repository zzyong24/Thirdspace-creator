/** 仅供最终候选的私有空PGlite根；停止同根server后执行。全部为合成事实，绝不采集/调用模型。 */
import {mkdtemp,readdir,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,basename} from 'node:path';
import {createDb} from '../../../backend/src/db';
import {createIdentityRepository,createIdentityService,ensureLocalUser} from '../../../backend/src/modules/identity';
import {platformAccounts} from '../../../backend/src/schema/platform-account';
import {accountGroups,accountGroupMemberships} from '../../../backend/src/schema/account-groups';
import {platformNativeReports} from '../../../backend/src/schema/platform-collection';
import {projects,contentOutputs} from '../../../backend/src/schema/projects';
import {publications,publicationRevisions} from '../../../backend/src/schema/publishing';
import {metricSnapshots} from '../../../backend/src/schema/analytics';
import {createPlatformCollectionService} from '../../../backend/src/modules/platform-collection';
import {createAccountGroupService,lockWorkspaceMembership,assertFrozenWorkspaceMembership} from '../../../backend/src/modules/platform-account';
import {createGroupWorkspaceApplication} from '../../../backend/src/application/queries/group-workspace';
import {createQueryServicesTransport} from '../../../backend/src/modules/query-services/query-services.transport';
import {ENDPOINTS,type NativeReportPayload} from '../../../contract/src';
const supplied=process.argv[2];
const root=supplied?resolve(supplied):await mkdtemp(join(tmpdir(),'creatoros-t1347-native-'));
if(!basename(root).startsWith('creatoros-t1347-native-'))throw Error('只允许显式命名的私有T1347空根');
await mkdir(root,{recursive:true});if((await readdir(root)).length)throw Error('数据根必须为空；不覆盖或删除现有库');
const dataDir=join(root,'pglite'),f=await createDb({dataDir});
const stamp='2026-10-18T10:00:00.000Z',startDate='2026-10-01',endDate='2026-10-07';
const scenarios=[['daily','完整每日播放','wechatVideo'],['single','仅一天日数据','wechatVideo'],['sparse','稀疏日报与真实零','wechatVideo'],['empty','尚无日报','wechatVideo'],['official','公众号人数口径未知','wechatOfficial'],['fallback','近期作品累计表现','douyin'],['mixed','混合平台不共轴','douyin'],['multi','同平台多账号','wechatVideo']] as const;
let id=0;const nextId=(prefix:string)=>`t1347-${prefix}-${++id}`;
try{
 const deps={now:()=>stamp,nextId},identityRepo=createIdentityRepository(f.db,deps);
 const userId=(await ensureLocalUser(identityRepo,deps)).id;
 const localCtx=await createIdentityService(identityRepo,deps).resolveLocalContext();
 if(localCtx.userId!==userId)throw Error('合成事实必须属于真实runtime本机身份');
 for(const [scenario,name,platform] of scenarios){
  const groupId=`t1347-${scenario}`,accountId=`t1347-${scenario}-a`;
  await f.db.insert(accountGroups).values({id:groupId,userId,name:'验收·'+name,version:1,createdAt:stamp,updatedAt:stamp});
  for(const suffix of scenario==='mixed'||scenario==='multi'?['a','b']:['a']){
   const a=`t1347-${scenario}-${suffix}`,p=scenario==='mixed'&&suffix==='b'?'youtube':platform;
   await f.db.insert(platformAccounts).values({id:a,userId,platform:p,accountHandle:name+suffix,createdAt:stamp,updatedAt:stamp});
   await f.db.insert(accountGroupMemberships).values({id:`t1347-member-${scenario}-${suffix}`,userId,groupId,accountId:a,version:1,joinedAt:stamp});
   for(const [i,value] of [20570,0,null].entries()){
    const projectId=`t1347-project-${scenario}-${suffix}-${i}`,outputId=projectId+'-output',pubId=projectId+'-pub',revisionId=pubId+'-rev';
    const title=i===0?'需要完整显示的近期作品标题：中文换行与数值对齐':i===1?'真实零播放作品':'尚无指标作品';
    await f.db.insert(projects).values({id:projectId,userId,groupId,accountId:a,title,creationMode:'guided',status:'active',currentStage:'review',startedAt:stamp,createdAt:stamp,updatedAt:stamp});
    await f.db.insert(contentOutputs).values({id:outputId,groupId,projectId,title,contentType:p==='wechatOfficial'?'article':'video',status:'drafting',createdAt:stamp,updatedAt:stamp});
    await f.db.insert(publications).values({id:pubId,userId,groupId,groupVersion:1,membershipVersion:1,accountId:a,contentOutputId:outputId,platform:p,accountReference:name+suffix,status:'published',currentRevisionId:revisionId,publishedAt:`2026-10-0${7-i}T00:00:00Z`,createdAt:stamp,updatedAt:stamp});
    await f.db.insert(publicationRevisions).values({id:revisionId,userId,publicationId:pubId,revisionNumber:1,title,createdAt:stamp});
    if(value!==null)await f.db.insert(metricSnapshots).values({id:pubId+'-snapshot',userId,groupId,accountId:a,publicationId:pubId,nativePlatform:p,source:'synthetic-isolated-fixture',capturedAt:stamp,rawMetrics:{views:value,likes:0},createdAt:stamp});
   }
  }
  if(!['daily','single','sparse'].includes(scenario))continue;
  const values=scenario==='daily'?[120,400,900,750,1400,600,1100]:scenario==='single'?[null,null,0,null,null,null,null]:[120,null,400,null,null,0,150];
  const payload:NativeReportPayload={platform:'wechatVideo',kind:'channelsDaily',scope:'accountDaily',accumulation:'daily',selection:{startDate,endDate,timeZone:'Asia/Shanghai',meaning:'statisticsDates'},sourcePath:'/platform/statistic/post',filename:`synthetic-${scenario}.csv`,sha256:scenario==='daily'?'a'.repeat(64):scenario==='single'?'b'.repeat(64):'c'.repeat(64),receivedBytes:100,tables:[{key:'daily',label:'每日播放',columns:[{key:'时间',label:'时间',unit:'date'},{key:'播放',label:'播放',unit:'count'}],rows:values.map((value,index)=>[{raw:`2026-10-0${index+1}`,value:`2026-10-0${index+1}`},{raw:value===null?'-':String(value),value}])}]};
  await f.db.insert(platformNativeReports).values({id:`t1347-report-${scenario}`,userId,groupId,accountId,membershipVersion:1,platform:'wechatVideo',kind:'channelsDaily',sha256:payload.sha256,selectionKey:JSON.stringify(payload.selection),payload,observedAt:stamp,ingestedAt:stamp});
 }
 const groups=createAccountGroupService({db:f.db,now:()=>stamp,nextId});let nativeRequests=0;
 const native=createPlatformCollectionService({db:f.db,now:()=>stamp,nextId,nativeReportOwnership:{freeze:(tx,c,a)=>lockWorkspaceMembership(tx,{...c,accountId:a}),assert:assertFrozenWorkspaceMembership}});
 const app=createGroupWorkspaceApplication({groups,nativeReports:{listNativeReports:async(c,input)=>{nativeRequests++;return native.listNativeReports(c,input);}},now:()=>stamp} as any);
 const transport=createQueryServicesTransport({groupOverview:app} as any),observations=[];
 for(const [scenario] of scenarios){const groupId=`t1347-${scenario}`,ctx={userId,groupId,accountId:null,requestId:'t1347-seed-read',source:'user' as const},before=nativeRequests,started=performance.now();const wrapped:any=await transport.request(ENDPOINTS.getGroupTrend,{params:{groupId},query:{startDate,endDate},body:undefined},ctx);const read=ENDPOINTS.getGroupTrend.response.parse(wrapped.data);observations.push({scenario,groupId,durationMs:Number((performance.now()-started).toFixed(2)),nativeRequests:nativeRequests-before,mode:read.performanceTrend.mode,reason:read.performanceTrend.reason,values:read.trend.map(p=>p.value)});}
 const manifest={root,dataDir,userId,startDate,endDate,runtimeIdentityResolved:true,controlledSyntheticFacts:true,realPlatformCollection:false,serverMayStartAfterSeedClosed:true,observations};
 await writeFile(join(root,'T1347_FIXTURE.json'),JSON.stringify(manifest,null,2));console.log(JSON.stringify(manifest,null,2));
}finally{await f.client.close();}
