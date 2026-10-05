import { expect,it,vi } from 'vitest';
import {createDb,platformAccounts,eq} from '@creatoros/backend';
import {accountGroups,accountGroupMemberships} from '../../schema/account-groups';
import { createClient,ENDPOINTS,type RequestContext } from '@creatoros/contract';
import {createIntelligenceService} from '../../modules/intelligence/intelligence.service';
import {createIntelligenceTransport} from '../../modules/intelligence/intelligence.transport';
import {createPersistentTaskService} from '../../modules/execution';
import {createIntelligenceApplicationTransport} from './transport';
const ctx:RequestContext={userId:'radar-user',groupId:'radar-empty',requestId:'req',source:'user'};
const now=()=> '2026-10-04T00:00:00Z';
async function fixture(){
 const {db,client}=await createDb();let seq=0;
 for(const id of ['radar-empty','radar-other'])await db.insert(accountGroups).values({id,userId:ctx.userId,name:id,status:'active',version:1,createdAt:now(),updatedAt:now()});
 await db.insert(platformAccounts).values({id:'collector-other',userId:ctx.userId,platform:'douyin',accountHandle:'另组账号',status:'active',createdAt:now(),updatedAt:now()});
 await db.insert(accountGroupMemberships).values({id:'member-other',userId:ctx.userId,groupId:'radar-other',accountId:'collector-other',version:1,joinedAt:now()});
 const row={accountId:'collector-other',accountHandle:'另组账号',platform:'douyin',status:'active' as const};
 const service=createIntelligenceService(db,{now,nextId:p=>`${p}-${++seq}`,tasks:createPersistentTaskService(db),collectorAccounts:{listCollectorAccounts:async()=>[row],getCollectorAccount:async()=>row}});
 const readWeb=vi.fn().mockResolvedValue({title:'真实公开正文',finalUrl:'https://example.com/public',text:'公开正文',extractor:'reader'});
 const previewProfile=vi.fn().mockResolvedValue({externalAccountId:'real',nickname:'真实作者',avatarUrl:null,canonicalUrl:'https://www.douyin.com/user/real',visibleWorkCount:0}),readFavoriteFolders=vi.fn().mockResolvedValue([]);
 const transport=createIntelligenceApplicationTransport({intelligenceBase:createIntelligenceTransport(()=>service),assertWorkspaceReadable:service.assertWorkspaceReadable,assertCollectorEligible:service.assertCollectorEligible,getCollectorAccount:async()=>({id:'collector-other',platform:'douyin',status:'active'}) as never,previewProfile,readFavoriteFolders,fetchIntelligenceFeed:async()=>{throw new Error('not feed');},isSyndicationFeed:()=>false,readWeb,isLoginRequiredError:()=>false,wake:()=>{},canWakeTranscript:()=>true,dispatchIntelligenceRun:()=>{}});
 return {db,client,service,transport,api:createClient(ENDPOINTS,transport,ctx),readWeb,previewProfile,readFavoriteFolders};
}
it('空组公开网页预检真实返回正文，跨用户组在副作用前拒绝',async()=>{
 const f=await fixture();try{
  const result=await f.api.previewIntelligenceWeb({params:undefined,query:undefined,body:{url:'https://example.com/public',instruction:''}});
  expect(result).toMatchObject({title:'真实公开正文',type:'web'});expect(f.readWeb).toHaveBeenCalledTimes(1);
  await expect(createClient(ENDPOINTS,f.transport,{...ctx,userId:'intruder'}).previewIntelligenceWeb({params:undefined,query:undefined,body:{url:'https://example.com/public',instruction:''}})).rejects.toThrow();
  expect(f.readWeb).toHaveBeenCalledTimes(1);
 }finally{await f.client.close();}
},30000);
it('同user其他组collector不显示且私有收藏/主页/来源不能使用，不发生外部读取',async()=>{
 const f=await fixture();try{
  expect(await f.service.listCollectorAccounts(ctx)).toEqual([]);
  await expect(f.api.listIntelligenceFavoriteFolders({params:undefined,body:undefined,query:{collectorAccountId:'collector-other'}})).rejects.toThrow();
  await expect(f.api.previewIntelligenceProfile({params:undefined,query:undefined,body:{collectorAccountId:'collector-other',url:'https://www.douyin.com/user/real'}})).rejects.toThrow();
  await expect(f.service.createSource(ctx,{collectionId:null,type:'favorites_folder',config:{type:'favorites_folder',collectorAccountId:'collector-other',folderId:'real-folder'},monitorEnabled:false,runInitial:false,idempotencyKey:'cross-group'})).rejects.toThrow();
  expect(f.previewProfile).not.toHaveBeenCalled();expect(f.readFavoriteFolders).not.toHaveBeenCalled();
 }finally{await f.client.close();}
},30000);

it('公开URL真实排队归空组且account为空，同组私有来源使用真实collector；转出后显示需重选且拒绝读取',async()=>{
 const f=await fixture();try{
  const collection=await f.api.createIntelligenceCollection({params:undefined,query:undefined,body:{name:'公开链接',idempotencyKey:'collection'}});
  const result=await f.api.importDouyinShareItem({params:undefined,query:undefined,body:{collectionId:collection.id,shareInput:'https://www.douyin.com/video/1234567890',idempotencyKey:'public-import'}});
  expect(result).toMatchObject({task:{groupId:'radar-empty',accountId:null,kind:'share_import'}});
  await f.db.update(accountGroupMemberships).set({groupId:ctx.groupId!}).where(eq(accountGroupMemberships.accountId,'collector-other'));
  expect(await f.service.listCollectorAccounts(ctx)).toEqual([expect.objectContaining({accountId:'collector-other'})]);
  await f.api.listIntelligenceFavoriteFolders({params:undefined,body:undefined,query:{collectorAccountId:'collector-other'}});
  expect(f.readFavoriteFolders).toHaveBeenCalledWith(ctx,'collector-other');
  const source=await f.service.createSource(ctx,{collectionId:null,type:'favorites_folder',config:{type:'favorites_folder',collectorAccountId:'collector-other',folderId:'real-folder'},monitorEnabled:false,runInitial:false,idempotencyKey:'own-source'});
  expect(source.source.collector?.accountId).toBe('collector-other');
  await f.db.update(accountGroupMemberships).set({groupId:'radar-other'}).where(eq(accountGroupMemberships.accountId,'collector-other'));
  expect((await f.service.getWorkspace(ctx)).sources.find(row=>row.id===source.source.id)?.collector?.availability).toBe('missing');
  await expect(f.service.getSourceExecutionInput(ctx,source.source.id)).rejects.toThrow();
 }finally{await f.client.close();}
},30000);
it('真实旧账号入口不能借同user collector预检读取另一个组，提示升级',async()=>{
 const f=await fixture();try{
  await f.db.insert(accountGroups).values({id:'grp_legacy_legacy-owner',userId:ctx.userId,name:'旧工作区',status:'active',version:1,createdAt:now(),updatedAt:now()});
  await f.db.insert(platformAccounts).values({id:'legacy-owner',userId:ctx.userId,platform:'douyin',accountHandle:'旧账号',status:'active',createdAt:now(),updatedAt:now()});
  await f.db.insert(accountGroupMemberships).values({id:'legacy-member',userId:ctx.userId,groupId:'grp_legacy_legacy-owner',accountId:'legacy-owner',version:1,joinedAt:now()});
  const legacy={...ctx,groupId:undefined,accountId:'legacy-owner'};
  expect(await f.service.listCollectorAccounts(legacy)).toEqual([]);
  await expect(createClient(ENDPOINTS,f.transport,legacy).previewIntelligenceProfile({params:undefined,query:undefined,body:{accountId:'legacy-owner',collectorAccountId:'collector-other',url:'https://www.douyin.com/user/real'}})).rejects.toThrow(/升级|当前/);
  expect(f.previewProfile).not.toHaveBeenCalled();
 }finally{await f.client.close();}
},30000);
