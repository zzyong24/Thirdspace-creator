import {it,expect} from 'vitest';
import {createDb,projects,contentOutputs,type Db} from '@creatoros/backend';
import type {RequestContext} from '@creatoros/contract';
import {createProductionService} from './production.service';
import {createProductionEditorRepository} from './production-editor.repository';
import {itemDigest} from './production-editor-plan';
const ctx:RequestContext={userId:'user',accountId:'account',requestId:'public-http',source:'user'};
const source={sourceId:'s',assetId:'a',assetFileId:'f',fileDigest:'a'.repeat(64),probeDigest:'b'.repeat(64),timebase:{num:1,den:1000},durationTicks:10000,hasAudio:true};
const native=()=>({editorVersion:3,referenceEditor:{editor:'opencut-classic',revision:'c'.repeat(40),mediaRefs:[{mediaId:'m',assetId:'a',assetFileId:'f'}],nativeDocument:{version:31,metadata:{id:'video'},currentSceneId:'scene',settings:{fps:{numerator:30,denominator:1}},scenes:[{id:'scene',tracks:{main:{id:'main',type:'video',elements:[{id:'first',type:'video',mediaId:'m',startTime:0,duration:120000,trimStart:0,trimEnd:0,params:{}}]},overlay:[],audio:[]}}]}}});
it('公共native save不能伪造/删改probe-ASR证明，合法手工轨道改动CAS保持原证明',async()=>{const opened=await createDb(),db=opened.db;let seq=0;const now=()=>new Date().toISOString(),nextId=(p:string)=>`${p}-${++seq}`;
 try{await db.insert(projects).values({id:'p',userId:ctx.userId,accountId:ctx.accountId!,title:'fixture',creationMode:'guided',status:'active',currentStage:'production',startedAt:now(),createdAt:now(),updatedAt:now()});await db.insert(contentOutputs).values({id:'video',projectId:'p',contentType:'video',title:'fixture',status:'drafting',createdAt:now(),updatedAt:now()});const service=createProductionService({db,now,nextId,assertEditorAsset:async()=>{}}),p=native();const forged={...p,nativeSources:[{mediaId:'m',source}]};await expect(service.saveEditor(ctx,'video',{expectedRevision:0,requestId:'native-fake-probe-request',plan:forged,source:'manual'})).rejects.toThrow('来源');expect((await service.getEditor(ctx,'video')).revision).toBe(0);await service.saveEditor(ctx,'video',{expectedRevision:0,requestId:'native-first-save-request',plan:p,source:'manual'});const repo=createProductionEditorRepository(db,{now,nextId,userId:ctx.userId,accountId:ctx.accountId??null});await repo.commit('video',{expectedRevision:1,requestId:'native-test-owner-proof',requestDigest:itemDigest(forged),source:'manual'},async()=>forged);await expect(service.saveEditor(ctx,'video',{expectedRevision:2,requestId:'native-remove-proof-request',plan:p,source:'manual'})).rejects.toThrow('来源');const saved=await service.saveEditor(ctx,'video',{expectedRevision:2,requestId:'native-legit-manual-request',plan:{...forged,referenceEditor:{...p.referenceEditor,nativeDocument:{...p.referenceEditor.nativeDocument,manualExtension:{value:'保留'}}}},source:'manual'});expect(saved.plan.nativeSources).toEqual(forged.nativeSources);expect((saved.plan.referenceEditor as any).nativeDocument.manualExtension).toEqual({value:'保留'});
 }finally{await opened.client.close();}});

// T-1062: 公共旧首载 get-or-create → native editor 的真实父归组闭环；仅隔离内存 PGlite。
import {afterEach,describe} from 'vitest';
import {productions,productionEditVersions,eq} from '@creatoros/backend';
import {ENDPOINTS,successEnvelope} from '@creatoros/contract';
import {createProductionTransport} from './production.transport';
import {createProjectRepository,createProjectsService} from '../projects/index';
const parentStores:Array<Awaited<ReturnType<typeof createDb>>>=[];
afterEach(async()=>{for(const opened of parentStores.splice(0))await opened.client.close();});
async function parentFixture(groupId:string|null,accountId:string|null){
 const opened=await createDb();parentStores.push(opened);const {db}=opened;let n=0;
 const now=()=> '2026-10-05T00:00:00.000Z',nextId=(prefix:string)=>`${prefix}-owner-chain-${++n}`;
 if(groupId)await opened.client.exec(`INSERT INTO account_groups(id,user_id,name,created_at,updated_at) VALUES('${groupId}','owner','fixture',now(),now());`);
 await db.insert(projects).values({id:'owned-project',userId:'owner',groupId,accountId,title:'真实父项目',creationMode:'guided',status:'active',currentStage:'production',startedAt:now(),createdAt:now(),updatedAt:now()});
 await db.insert(contentOutputs).values({id:'owned-video',projectId:'owned-project',groupId,title:'真实父视频',contentType:'video',status:'drafting',createdAt:now(),updatedAt:now()});
 const projectsService=createProjectsService(createProjectRepository(db),{now,nextId});
 const service=()=>createProductionService({db,now,nextId,assertOutputOwned:(scope,id)=>projectsService.getOutput(scope,id)});
 const transport=createProductionTransport(service);
 const request=(endpoint:typeof ENDPOINTS.getOutputProduction|typeof ENDPOINTS.getProductionEditor|typeof ENDPOINTS.saveProductionEditor,scope:RequestContext,body:unknown=undefined)=>transport.request(endpoint,{params:{outputId:'owned-video'},query:undefined,body},scope);
 const raw={editorVersion:3,referenceEditor:{editor:'opencut-classic',revision:'c'.repeat(40),mediaRefs:[],nativeDocument:{version:31,metadata:{id:'owned-video'},currentSceneId:'scene',settings:{fps:{numerator:30,denominator:1}},scenes:[{id:'scene',tracks:{main:{id:'main',type:'video',elements:[]},overlay:[],audio:[]}}]}}};
 return {db,request,raw,opened};
}
describe('T-1062 公共production首载保存真实父groupId',()=>{
 it.each([
  ['纯组无账号','group-pure',null,'group-pure',null],
  ['同组带账号及平台筛选','group-account','account-source','group-account','account-filter'],
  ['迁移前旧账号nullable组',null,'account-legacy-null',undefined,'account-legacy-null'],
  ['旧账号真实legacy父组','grp_legacy_account-legacy','account-legacy',undefined,'account-legacy'],
 ] as const)('%s：旧get→native读/save→回执重入只保存同一父组',async(_label,parentGroup,parentAccount,groupId,accountId)=>{
  const f=await parentFixture(parentGroup,parentAccount),scope:RequestContext={userId:'owner',groupId,accountId,requestId:'actual-public-owner',source:'user'};
  const first=successEnvelope(ENDPOINTS.getOutputProduction.response).parse(await f.request(ENDPOINTS.getOutputProduction,scope)).data;
  expect(first).not.toHaveProperty('groupId'); // 不新增wire归属字段。
  expect(successEnvelope(ENDPOINTS.getProductionEditor.response).parse(await f.request(ENDPOINTS.getProductionEditor,scope)).data.state).toBe('empty');
  const body={expectedRevision:0,requestId:'native-parent-owner-save',source:'manual' as const,plan:f.raw};
  const saved=successEnvelope(ENDPOINTS.saveProductionEditor.response).parse(await f.request(ENDPOINTS.saveProductionEditor,scope,body)).data;
  expect(saved.revision).toBe(1);
  const read=successEnvelope(ENDPOINTS.getProductionEditor.response).parse(await f.request(ENDPOINTS.getProductionEditor,scope)).data;expect(read.plan).toEqual(saved.plan);
  expect(successEnvelope(ENDPOINTS.saveProductionEditor.response).parse(await f.request(ENDPOINTS.saveProductionEditor,scope,body)).data).toEqual(saved);
  expect(successEnvelope(ENDPOINTS.getOutputProduction.response).parse(await f.request(ENDPOINTS.getOutputProduction,scope)).data.id).toBe(first.id);
  expect((await f.db.select().from(productions)).map(row=>({id:row.id,groupId:row.groupId,contentOutputId:row.contentOutputId}))).toEqual([{id:first.id,groupId:parentGroup,contentOutputId:'owned-video'}]);
  expect((await f.db.select().from(productionEditVersions)).map(row=>({groupId:row.groupId,revision:row.revision}))).toEqual([{groupId:parentGroup,revision:1}]);
 });
 it('foreign用户/foreign组/错误legacy账号拒绝，初次零production及版本写',async()=>{
  for(const [parentGroup,parentAccount,scope] of [
   ['group-owner',null,{userId:'foreign-user',groupId:'group-owner',accountId:null}],
   ['group-owner',null,{userId:'owner',groupId:'group-foreign',accountId:null}],
   [null,'account-owner',{userId:'owner',groupId:undefined,accountId:'account-foreign'}],
  ] as const){
   const f=await parentFixture(parentGroup,parentAccount),ctx:RequestContext={...scope,source:'user',requestId:'forbidden-owner'};
   await expect(f.request(ENDPOINTS.getOutputProduction,ctx)).rejects.toMatchObject({name:'OwnershipError'});
   await expect(f.request(ENDPOINTS.getProductionEditor,ctx)).rejects.toMatchObject({name:'OwnershipError'});
   expect(await f.db.select().from(productions)).toEqual([]);expect(await f.db.select().from(productionEditVersions)).toEqual([]);
  }
 });
 it('已有错误production归组仍由原editor守卫拒绝，不自动漂白历史',async()=>{
  const f=await parentFixture('group-owned',null),scope:RequestContext={userId:'owner',groupId:'group-owned',accountId:null,requestId:'corrupted-fixture',source:'user'};
  await f.request(ENDPOINTS.getOutputProduction,scope);
  await f.db.update(productions).set({groupId:null}); // 明确受控腐坏负例，不作生产补救。
  await expect(f.request(ENDPOINTS.getProductionEditor,scope)).rejects.toThrow('制作工程与原父归组不一致');
  expect((await f.db.select().from(productions))[0]?.groupId).toBeNull();expect(await f.db.select().from(productionEditVersions)).toEqual([]);
 });
});
