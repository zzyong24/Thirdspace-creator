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
 const request=(endpoint:typeof ENDPOINTS.getOutputProduction|typeof ENDPOINTS.getProductionEditor|typeof ENDPOINTS.saveProductionEditor,scope:RequestContext,body:unknown=undefined)=>{
  const params={outputId:'owned-video'},query=undefined;
  switch(endpoint.id){
   case 'outputs.production.get':return transport.request(ENDPOINTS.getOutputProduction,{params,query,body:undefined},scope);
   case 'outputs.production.editor.get':return transport.request(ENDPOINTS.getProductionEditor,{params,query,body:undefined},scope);
   case 'outputs.production.editor.save':return transport.request(ENDPOINTS.saveProductionEditor,{params,query,body:ENDPOINTS.saveProductionEditor.body.parse(body)},scope);
  }
 };
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

// T-1062 安装回归：真正public transport + capture owner；媒体探针及render端口是明确夹具，非真机/模型/MP4证据。
import {assets,assetFiles} from '@creatoros/backend';
import {accountGroups} from '../../schema/account-groups';
import {productionPlanV2,type ExecutionTaskResource} from '@creatoros/contract';
import {createAssetsService,createAssetRepository} from '../assets/index';
import {createProductionOverlayCapture,type ProductionOverlayBinding} from './production-overlay-capture';
import {productionFileBindingRequests,productionFileBindings} from '../../schema/production-file-bindings';
async function overlayPublicFixture(parentGroup:string|null,parentAccount:string|null,scope:RequestContext){
 const opened=await createDb();parentStores.push(opened);const db=opened.db,now=()=> '2026-10-06T00:00:00.000Z';let seq=0;const nextId=(p:string)=>`${p}-overlay-public-${++seq}`;
 if(parentGroup)await db.insert(accountGroups).values({id:parentGroup,userId:scope.userId,name:'真实空组',createdAt:now(),updatedAt:now()});
 await db.insert(projects).values({id:'overlay-project',userId:scope.userId,groupId:parentGroup,accountId:parentAccount,title:'公开叠层验收',creationMode:'guided',status:'active',currentStage:'production',startedAt:now(),createdAt:now(),updatedAt:now()});
 await db.insert(contentOutputs).values({id:'overlay-output',projectId:'overlay-project',groupId:parentGroup,title:'真实视频父项',contentType:'video',status:'drafting',createdAt:now(),updatedAt:now()});
 for(const [id,type,mime,digest] of [['overlay-source','video','video/mp4','a'],['overlay-image','image','image/png','d']] as const){
  await db.insert(assets).values({id,userId:scope.userId,groupId:parentGroup,accountId:parentAccount,assetType:type,name:id,status:'active',currentFileId:`${id}-file`,createdAt:now(),updatedAt:now()});
  await db.insert(assetFiles).values({id:`${id}-file`,assetId:id,versionNumber:1,storageKey:`${id}.fixture`,mimeType:mime,fileSize:100,checksum:digest.repeat(64),createdAt:now()});
 }
 const unavailable=async():Promise<never>=>{throw Error('本测试不访问对象存储/模型');};
 const assetOwner=(tx:Db=db)=>createAssetsService(createAssetRepository(tx,{now,nextId}),unavailable,{now,nextId});
 const tasks=new Map<string,ExecutionTaskResource>(),renderCalls:Array<{scope:RequestContext;body:unknown}>=[],captureErrors:unknown[]=[];
 let approved:ProductionOverlayBinding[]=[];let capture:ReturnType<typeof createProductionOverlayCapture>;
 const owner=(tx:Db=db):ReturnType<typeof createProductionService>=>createProductionService({db:tx,now,nextId,
  assertEditorAsset:async(c,input,t=tx)=>{if(input.projectId!=='overlay-project')throw Error('原父项目不符');await assetOwner(t).assertAssetFileOwned(c,input.assetId,input.assetFileId??`${input.assetId}-file`,false);},
  onVersionSaved:async(c,event,t)=>{try{await t.transaction(async inner=>{await capture.captureSavedVersion(c,event,inner as unknown as Db,approved);});}catch(error){captureErrors.push(error);}},
  readEditorOverlayBindings:async(c,input,t=tx)=>capture.readBindings(c,input,t),
  resolveEditorMedia:async(c,input)=>{await assetOwner(tx).assertAssetFileOwned(c,input.assetId,input.assetFileId??`${input.assetId}-file`,false);return{url:`/fixture/${input.assetId}`,mimeType:input.assetId==='overlay-source'?'video/mp4':'image/png'};},
  createEditorRender:async(c,body)=>{renderCalls.push({scope:c,body});return{id:nextId('explicit-render-port-fixture')};},
  sourcePorts:{assertTaskSettled:async()=>{},readMediaFile:async(c,input,t=tx)=>{await assetOwner(t).assertAssetFileOwned(c,input.assetId,input.assetFileId,false);return{fileDigest:'a'.repeat(64),mimeType:'video/mp4'};},createTask:async(c,body)=>{const id=nextId('explicit-probe-fixture');tasks.set(id,{id,userId:c.userId,projectId:'overlay-project',taskType:'exec.media.probe',execType:'media.probe',status:'awaiting_confirmation',spec:body.spec,manifest:{taskType:'media.probe',artifacts:[],summary:'明确探针端口夹具',meta:{probe:{fileDigest:'a'.repeat(64),probeDigest:'b'.repeat(64),timebase:{num:1,den:1000},durationTicks:2000,hasAudio:true}}},adoptedAssetIds:[],requestedAt:now(),startedAt:now(),completedAt:now(),errorMessage:null});return{id};},readTask:async(_c,id)=>{const task=tasks.get(id);if(!task)throw Error('原探针不存在');return task;}}
 });
 capture=createProductionOverlayCapture({db,now,nextId,ports:{production:tx=>owner(tx),readExactFile:async(c,projectId,file,tx)=>{if(projectId!=='overlay-project')throw Error('原父项目不符');await assetOwner(tx).assertAssetFileOwned(c,file.assetId,file.assetFileId,false);const [row]=await assetOwner(tx).listFilesByIds(c,[file.assetFileId]);if(!row||row.assetId!==file.assetId||!row.checksum)throw Error('真实精确文件缺失');return{fileDigest:row.checksum,mimeType:row.mimeType};}}});
 const transport=createProductionTransport(()=>owner());
 type PublicOverlayEndpoint=typeof ENDPOINTS.getProductionEditor|typeof ENDPOINTS.saveProductionEditor|typeof ENDPOINTS.previewProductionEditor|typeof ENDPOINTS.renderProductionEditor|typeof ENDPOINTS.prepareProductionEditorSource|typeof ENDPOINTS.adoptProductionEditorSource;
 const call=async(endpoint:PublicOverlayEndpoint,body:unknown=undefined,c=scope)=>{
  const params={outputId:'overlay-output'};
  switch(endpoint.id){
   case 'outputs.production.editor.get':return await transport.request(ENDPOINTS.getProductionEditor,{params,body:undefined,query:undefined},c);
   case 'outputs.production.editor.save':return await transport.request(ENDPOINTS.saveProductionEditor,{params,body:ENDPOINTS.saveProductionEditor.body.parse(body),query:undefined},c);
   case 'outputs.production.editor.preview':return await transport.request(ENDPOINTS.previewProductionEditor,{params,body:ENDPOINTS.previewProductionEditor.body.parse(body),query:undefined},c);
   case 'outputs.production.editor.render':return await transport.request(ENDPOINTS.renderProductionEditor,{params,body:ENDPOINTS.renderProductionEditor.body.parse(body),query:undefined},c);
   case 'outputs.production.editor.sources.prepare':return await transport.request(ENDPOINTS.prepareProductionEditorSource,{params,body:ENDPOINTS.prepareProductionEditorSource.body.parse(body),query:undefined},c);
   case 'outputs.production.editor.sources.adopt':return await transport.request(ENDPOINTS.adoptProductionEditorSource,{params,body:ENDPOINTS.adoptProductionEditorSource.body.parse(body),query:undefined},c);
  }
 };
 const prepare=async()=>{await call(ENDPOINTS.prepareProductionEditorSource,{assetId:'overlay-source',assetFileId:'overlay-source-file',requestId:'overlay-public-probe-prepare'});await call(ENDPOINTS.adoptProductionEditorSource,{sourceRequestId:'overlay-public-probe-prepare',expectedRevision:0,requestId:'overlay-public-source-adopt',addWholeClip:true});};
 const read=async(c=scope)=>successEnvelope(ENDPOINTS.getProductionEditor.response).parse(await call(ENDPOINTS.getProductionEditor,undefined,c)).data;
 const save=async(requestId='overlay-public-manual-save',c=scope)=>{const editor=await read(c);return successEnvelope(ENDPOINTS.saveProductionEditor.response).parse(await call(ENDPOINTS.saveProductionEditor,{expectedRevision:editor.revision,requestId,plan:editor.plan,source:'manual'},c)).data;};
 const preview=async(c=scope)=>{const editor=await read(c);return successEnvelope(ENDPOINTS.previewProductionEditor.response).parse(await call(ENDPOINTS.previewProductionEditor,{expectedRevision:editor.revision,requestId:'overlay-public-preview',plan:editor.plan},c)).data;};
 const render=async(requestId='overlay-public-render',c=scope)=>{const editor=await read(c);return successEnvelope(ENDPOINTS.renderProductionEditor.response).parse(await call(ENDPOINTS.renderProductionEditor,{revision:editor.revision,requestId},c)).data;};
 const addImage=async()=>{const editor=await read(),plan=productionPlanV2.parse(editor.plan),clip=plan.mainTrack.clips[0]!;const reference=`overlay-${'e'.repeat(64)}.image`;plan.overlayDraft.scenes=[{id:'overlay-scene',title:'实际图卡',startSec:0,endSec:2,cards:[{id:'overlay-card',kind:'image',file:reference,label:'明确图片',big:false,at:0,anchor:{kind:'clip',clipId:clip.clipId,sourceInTicks:0,sourceOutTicks:2000}}]}];approved=[{location:'overlayDraft.scenes/overlay-scene/cards/overlay-card/file',itemId:'overlay-card',role:'image-card',reference,assetId:'overlay-image',assetFileId:'overlay-image-file',fileDigest:'d'.repeat(64)}];const result=successEnvelope(ENDPOINTS.saveProductionEditor.response).parse(await call(ENDPOINTS.saveProductionEditor,{expectedRevision:editor.revision,requestId:'overlay-public-add-image',plan,source:'manual'})).data;approved=[];return result;};
 return{db,scope,call,prepare,read,save,preview,render,addImage,capture,renderCalls,captureErrors};
}
const overlayScope=(groupId:string|undefined,accountId:string|null):RequestContext=>({userId:'overlay-user',groupId,accountId,source:'user',requestId:'overlay-public-http',groupVersion:999,membershipVersion:999});
describe('T-1062 纯组原生前粗剪公开保存/捕获/预览/渲染',()=>{
 it.each([
  ['纯组','overlay-pure',null,'overlay-pure',null],
  ['同组筛选','overlay-filter','original-account','overlay-filter',null],
  ['legacy nullable',null,'legacy-account',undefined,'legacy-account'],
  ['legacy initial','grp_legacy_legacy-account','legacy-account',undefined,'legacy-account'],
 ] as const)('%s：公开原片采用→保存→同源preview/render与幂等，冻结真实父group且不抄epoch',async(_label,group,account,groupId,accountId)=>{
  const f=await overlayPublicFixture(group,account,overlayScope(groupId,accountId));await f.prepare();const saved=await f.save();expect(saved.revision).toBe(2);const preview=await f.preview();expect(preview.durationSec).toBe(2);expect(preview.html).toContain('/fixture/overlay-source');const first=await f.render();expect(await f.render()).toEqual(first);expect(f.renderCalls).toHaveLength(1);expect(first.spec.inputs).toMatchObject([{assetId:'overlay-source',assetFileId:'overlay-source-file',fileDigest:'a'.repeat(64)}]);
  const requests=await f.db.select().from(productionFileBindingRequests);expect(requests).toHaveLength(2);for(const r of requests)expect(r).toMatchObject({groupId:group,accountId,groupVersion:null,membershipVersion:null,status:'committed'});expect(f.captureErrors).toEqual([]);
  if(groupId){const filtered={...f.scope,accountId:'another-platform-filter'};expect(await f.preview(filtered)).toEqual(preview);expect(await f.render('overlay-public-render',filtered)).toEqual(first);}
 },120000);
 it('同一请求保存回放、旧CAS和外来scope零写；归档只读preview仍可用但新增保存/render拒绝',async()=>{
  const f=await overlayPublicFixture('overlay-owned',null,overlayScope('overlay-owned',null));await f.prepare();const current=await f.read(),body={expectedRevision:current.revision,requestId:'overlay-public-cas-save',plan:current.plan,source:'manual'};const first=await f.call(ENDPOINTS.saveProductionEditor,body);expect(await f.call(ENDPOINTS.saveProductionEditor,body)).toEqual(first);await expect(f.call(ENDPOINTS.saveProductionEditor,{...body,requestId:'overlay-public-stale-save'})).rejects.toThrow('版本');await expect(f.call(ENDPOINTS.previewProductionEditor,{expectedRevision:current.revision,requestId:'overlay-public-stale-preview',plan:current.plan})).rejects.toThrow('版本');const before=await f.db.select().from(productionFileBindingRequests);
  for(const other of [{...f.scope,userId:'foreign-user'},{...f.scope,groupId:'foreign-group'}]){await expect(f.preview(other)).rejects.toThrow();await expect(f.render('overlay-foreign-render',other)).rejects.toThrow();}
  expect(await f.db.select().from(productionFileBindingRequests)).toEqual(before);expect(f.renderCalls).toEqual([]);
  await f.db.update(accountGroups).set({status:'archived'}).where(eq(accountGroups.id,'overlay-owned'));expect((await f.preview()).durationSec).toBe(2);await expect(f.save('overlay-archived-save')).rejects.toThrow();await expect(f.render('overlay-archived-render')).rejects.toThrow();expect(await f.db.select().from(productionFileBindingRequests)).toEqual(before);
 },120000);
 it('真实legacy旧NULL捕获仅原legacy账号可读，显式初始组不获NULL别名；外来账号零读写',async()=>{
  const f=await overlayPublicFixture('grp_legacy_legacy-account','legacy-account',overlayScope(undefined,'legacy-account'));await f.prepare();const saved=await f.addImage();await f.db.update(productionFileBindingRequests).set({groupId:null});await f.db.update(productionFileBindings).set({groupId:null});await f.db.update(productionEditVersions).set({groupId:null});expect((await f.preview()).durationSec).toBe(2);expect((await f.render()).spec.inputs).toHaveLength(2);
  const before=await f.db.select().from(productionFileBindingRequests);for(const other of [{...f.scope,accountId:'foreign-account'},{...f.scope,groupId:'grp_legacy_legacy-account'}]){await expect(f.preview(other)).rejects.toThrow();await expect(f.render('overlay-explicit-group-no-alias',other)).rejects.toThrow();}expect(await f.db.select().from(productionFileBindingRequests)).toEqual(before);expect(f.renderCalls).toHaveLength(1);expect(saved.revision).toBe(2);
 },120000);
 it('同组旧账号出处由真实父证明，当前另一平台筛选仍共享exact图卡；新写不据筛选捏造出处',async()=>{
  const f=await overlayPublicFixture('overlay-provenance','original-account',overlayScope('overlay-provenance',null));await f.prepare();const saved=await f.addImage();await f.db.update(productionFileBindingRequests).set({accountId:'original-account'});await f.db.update(productionFileBindings).set({accountId:'original-account'});const filtered={...f.scope,accountId:'different-platform-filter'},preview=await f.preview(filtered);expect(preview.html).toContain('/fixture/overlay-image');await f.save('overlay-shared-provenance-save',filtered);expect((await f.preview(filtered)).html).toContain('/fixture/overlay-image');expect((await f.render('overlay-shared-provenance-render',filtered)).spec.inputs).toHaveLength(2);const rows=(await f.db.select().from(productionFileBindingRequests)).filter(r=>r.revision===saved.revision+1);expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({groupId:'overlay-provenance',accountId:null,groupVersion:null,membershipVersion:null});
 },120000);
 it('空bindings捕获仍核version归属；project归档preview只读、新render拒绝且零任务',async()=>{
  const f=await overlayPublicFixture('overlay-empty',null,overlayScope('overlay-empty',null));await f.prepare();const current=await f.read();expect((await f.db.select().from(productionFileBindingRequests))[0]!.frozenInput).toMatchObject({bindings:[]});await f.db.update(projects).set({status:'archived'}).where(eq(projects.id,'overlay-project'));expect((await f.preview()).durationSec).toBe(2);await expect(f.render('overlay-project-archived-render')).rejects.toThrow();await f.db.update(productionEditVersions).set({groupId:null}).where(eq(productionEditVersions.revision,current.revision));await expect(f.preview()).rejects.toThrow();expect(f.renderCalls).toEqual([]);
 },120000);
 it('合法未捕获仍[]且主轨preview/render可用；version归属损坏即使[]也拒绝',async()=>{
  const f=await overlayPublicFixture('overlay-no-proof',null,overlayScope('overlay-no-proof',null));await f.prepare();await f.db.delete(productionFileBindingRequests);const current=await f.read(),query={outputId:'overlay-output',revision:current.revision,planDigest:itemDigest(current.plan)};expect(await f.capture.readBindings(f.scope,query,f.db)).toEqual([]);expect((await f.preview()).durationSec).toBe(2);await f.render();await f.db.update(productionEditVersions).set({groupId:null}).where(eq(productionEditVersions.revision,current.revision));await expect(f.preview()).rejects.toThrow();await expect(f.render('overlay-bad-version-render')).rejects.toThrow();expect(f.renderCalls).toHaveLength(1);
 },120000);
 it.each(['production-group','version-group','request-group','request-account','request-digest','binding-group','binding-account'] as const)('已授权父内腐坏%s不能因scope筛选伪装成未捕获；preview/render零执行',async(kind)=>{
  const f=await overlayPublicFixture('overlay-corrupt',null,overlayScope('overlay-corrupt',null));await f.prepare();const saved=await f.addImage();expect(f.captureErrors).toEqual([]);const [request]=(await f.db.select().from(productionFileBindingRequests)).filter(r=>r.revision===saved.revision);expect(request).toBeDefined();expect((await f.db.select().from(productionFileBindings)).filter(r=>r.revision===saved.revision)).toHaveLength(1);
  if(kind==='production-group')await f.db.update(productions).set({groupId:null});
  if(kind==='version-group')await f.db.update(productionEditVersions).set({groupId:null}).where(eq(productionEditVersions.revision,saved.revision));
  if(kind==='request-group')await f.db.update(productionFileBindingRequests).set({groupId:'foreign-group'}).where(eq(productionFileBindingRequests.id,request!.id));
  if(kind==='request-account')await f.db.update(productionFileBindingRequests).set({accountId:'foreign-account'}).where(eq(productionFileBindingRequests.id,request!.id));
  if(kind==='request-digest')await f.db.update(productionFileBindingRequests).set({requestDigest:'f'.repeat(64)}).where(eq(productionFileBindingRequests.id,request!.id));
  if(kind==='binding-group')await f.db.update(productionFileBindings).set({groupId:'foreign-group'}).where(eq(productionFileBindings.bindingRequestId,request!.id));
  if(kind==='binding-account')await f.db.update(productionFileBindings).set({accountId:'foreign-account'}).where(eq(productionFileBindings.bindingRequestId,request!.id));
  await expect(f.preview()).rejects.toThrow();await expect(f.render(`overlay-corrupt-${kind}`)).rejects.toThrow();expect(f.renderCalls).toEqual([]);
 },120000);
});
