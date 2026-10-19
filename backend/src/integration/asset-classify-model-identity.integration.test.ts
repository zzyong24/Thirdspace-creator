import {afterAll,beforeAll,expect,it} from 'vitest';
import {createHash} from 'node:crypto';
import {createDb,assetFiles,assets,aiTasks,eq,executionTasks} from '@creatoros/backend';
import {executionRouteV2Schema,modelRouteCatalog,structuredGenerationInputSchema} from '@creatoros/contract/execution-worker';
import {listOfficialSkillBases} from '@creatoros/ai-worker';
import {createAccountGroupService} from '../modules/platform-account/account-group.service';
import {createAssetsService,createAssetRepository,type ObjectStoragePort} from '../modules/assets';
import {createTaxonomyService,createTaxonomyRepository} from '../modules/taxonomy';
import {createAiService,type ServiceDeps} from '../modules/ai/ai.service';
import {createEffectiveSkillSnapshotResolver} from '../modules/ai-runtime/effective-skill-snapshot';
import {createAssetProcessingBusinessAdapter} from '../modules/ai-runtime/asset-processing-business-adapter';
import {createStructuredBusinessExecutionService} from '../modules/ai-runtime/structured-business-execution.service';
import {createPersistentTaskService} from '../modules/execution/persistent-task.service';
import {createExecutionModelIdentityService} from '../modules/execution/execution-model-identity.service';
import {createExecutionAssetProcessingService} from '../modules/execution/execution-asset-processing.service';
import {createExecutionGenerationPorts} from '../modules/execution/execution-generation-ports.service';
import {createExecutionCallLedgerService} from '../modules/execution/execution-call-ledger.service';
import {createExecutionCodexCallService} from '../modules/execution/execution-codex-call.service';
let store:Awaited<ReturnType<typeof createDb>>,seq=0;
const now=()=>new Date().toISOString(),nextId=(p:string)=>`${p}-t1301-${++seq}`;
const budget={maxCalls:8,maxTokens:200000,deadlineMs:600000};
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aewoAAAAASUVORK5CYII=','base64');
beforeAll(async()=>{store=await createDb();},180000);
afterAll(async()=>{await store?.client.close();},180000);
function classifyRoute(source:'self'|'codex'){
 const route=executionRouteV2Schema.parse({schemaVersion:2,orchestrator:{engine:'codex',source:'preference',protocolKind:'codex-app-server',runtimeVersion:'0.159.3'},selectionRevision:3,catalogVersion:1,rootRouteDigest:'sha256:'+'a'.repeat(64),routes:Object.fromEntries(modelRouteCatalog.map(({family,...entry})=>[entry.routeKey,{...entry,source:['video','audio','embed'].includes(family)?'official':'codex',readiness:'unavailable',reasonCode:'TEST_UNCONFIGURED'}]))});
 const vision={routeKey:'vision:asset.classify',mode:'vision' as const,capability:'asset.classify',readiness:'configured' as const,...(source==='codex'?{source:'codex' as const,identity:{protocolKind:'codex-app-server' as const,runtimeVersion:'0.159.3' as const,requestedModel:'vision-only'}}:{source:'self' as const,identity:{provider:'openai',apiFormat:'openai_chat',authStyle:'bearer' as const,model:'vision-only',endpoint:'https://vision.invalid/v1',settings:{},configuration:{kind:'row' as const,id:'vision-row',capability:'asset.classify'},configIdentityDigest:'sha256:'+'b'.repeat(64)}})};
 route.routes[vision.routeKey]=vision;
 route.routes['text:copilot.assist']={routeKey:'text:copilot.assist',mode:'text',capability:'copilot.assist',source:'codex',readiness:'configured',identity:{protocolKind:'codex-app-server',runtimeVersion:'0.159.3',requestedModel:'different-text'}};
 return executionRouteV2Schema.parse(route);
}

// 仅对象存储/模型上游为受控替身；上传、业务、快照、adapter、DB/lease、调用账本和完成服务均用原实现。
async function fixture(source:'self'|'codex',skipModel=false){
 const base={userId:nextId('user'),requestId:'t1301-public-services',source:'user' as const},deps={db:store.db,now,nextId};
 const groups=createAccountGroupService(deps),groupId=(await groups.create(base,{name:'分类原组',idempotencyKey:nextId('group-key')})).id,otherGroup=(await groups.create(base,{name:'隔离组',idempotencyKey:nextId('group-key')})).id;
 const ctx={...base,groupId,accountId:null},files=new Map<string,Uint8Array>();
 const storage:ObjectStoragePort={kind:'mock',createPresignedUpload:async()=>{const storageKey=nextId('blob');return{storageKey,uploadUrl:`mock://${storageKey}`};},putObject:async v=>{files.set(v.storageKey,new Uint8Array(v.bytes));},getObject:async k=>{const v=files.get(k);if(!v)throw Error('missing fixture bytes');return v;},headObject:async k=>{const bytes=files.get(k)!;return{mimeType:'image/png',fileSize:bytes.length,checksum:createHash('sha256').update(bytes).digest('hex'),width:1,height:1,durationMs:null,mediaMetadata:{}};},getSignedUrl:async k=>`mock://${k}`};
 const assetsService=createAssetsService(createAssetRepository(store.db,{now,nextId}),async()=>storage,{now,nextId});
 const upload=await assetsService.createUpload(ctx,{assetType:'image',mimeType:'image/png',fileSize:png.length,fileName:'neutral.png'});
 await storage.putObject({storageKey:upload.storageKey,bytes:png,mimeType:'image/png',assetType:'image'});
 const asset=await assetsService.completeUpload(ctx,upload.uploadId,{name:'中性原图'}),route=classifyRoute(source);
 const snapshot=await createEffectiveSkillSnapshotResolver({officialSkills:{get:id=>listOfficialSkillBases().find(x=>x.skillId===id)??null,list:listOfficialSkillBases,platformPolicy:()=>({version:'fixture',text:'仅受控分类测试'})},accountOverlays:{listBySkillIds:async()=>[]},now})(ctx,['asset.classify']);
 const ai=createAiService({...deps,resolveTaskRuntimeData:async()=>({executionRoute:route,skillSnapshot:snapshot})} as unknown as ServiceDeps);
 const task=await ai.createTask(ctx,{taskType:'asset.classify',attemptId:nextId('original-classify-attempt'),inputData:{assetId:asset.id}});
 const structured=createStructuredBusinessExecutionService(store.db,{adapters:{'asset.classify':createAssetProcessingBusinessAdapter('asset.classify',{assets:assetsService,isModelConfigured:async()=>!skipModel})},budget,maxOutputTokens:1024});
 const prepared=await structured.prepare(ctx,task.id),tasks=createPersistentTaskService(store.db,{now}),claim=(await tasks.claimTask({taskId:prepared.executionTaskId,workerId:'original-classify-worker'}))!;
 const ref={executionTaskId:prepared.executionTaskId,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken},processing=createExecutionAssetProcessingService(store.db,{assets:assetsService,now});
 const credential=source==='codex'?{engine:'codex' as const,protocolKind:'codex-app-server' as const,runtimeVersion:'0.159.3' as const,requestedModel:'vision-only'}:{apiFormat:'openai_chat' as const,authStyle:'bearer' as const,baseUrl:'https://vision.invalid/v1',model:'vision-only',token:'controlled-private'};
 const [execution]=await store.db.select().from(executionTasks).where(eq(executionTasks.id,ref.executionTaskId));
 return{ctx,otherGroup,asset,upload,assetsService,ai,task,ref,processing,files,storage,credential,route,execution:execution!,tasks};
}
it.each(['self','codex'] as const)('T1301 %s 公开上传→AI业务→adapter/lease→正常pin→原call回执→素材完成',async source=>{
 const f=await fixture(source),identity=createExecutionModelIdentityService(store.db,{now});
 const original=await f.processing.read(f.ref);expect(original.mimeType).toBe('image/png');expect(Buffer.from(original.bytes!)).toEqual(png);
 expect(f.execution.payload).not.toHaveProperty('modelIdentity');
 await expect(identity.pin(f.ref,'asset.classify',f.credential)).resolves.toEqual(f.credential);
 expect(await identity.read(f.ref)).toMatchObject({capability:'asset.classify',...(source==='codex'?{engine:'codex',requestedModel:'vision-only'}:{model:'vision-only'})});
 const ports=createExecutionGenerationPorts(store.db,{now,budget}),request={maxOutputTokens:1024,prompt:[{role:'user',content:[{type:'image',image:png.toString('base64')}]}]},raw={operationKey:'asset.classify/model/1',request};
 const call=await ports.reserveGenerationCall(f.ref,raw),ledger=createExecutionCallLedgerService(store.db,{now,budget});await ledger.start(f.ref,call.callId);
 await expect(ports.reserveGenerationCall(f.ref,{...raw,request:{...request,maxOutputTokens:12}})).rejects.toThrow('输出预算');
 if(source==='codex'){
  const codex=createExecutionCodexCallService(store.db,{now});await codex.invoke(f.ref,'bindCodexCall',{callId:call.callId,threadId:'original-controlled-thread',turnId:'original-controlled-turn'});
  await expect(codex.invoke({...f.ref,fenceToken:'foreign'},'readCodexCall',{callId:call.callId})).rejects.toThrow();
  await expect(codex.invoke(f.ref,'bindCodexCall',{callId:call.callId,threadId:'foreign-thread'})).rejects.toThrow();
 }
 const usage={inputTokens:11,outputTokens:3,totalTokens:14},providerResult={content:[{type:'text',text:'受控分类结果'}],finishReason:{unified:'stop'},usage:{inputTokens:{total:11},outputTokens:{total:3}},warnings:[]};
 await ports.settleGenerationCall(f.ref,{callId:call.callId,status:'settled',usage,providerResult});
 const text=JSON.stringify({object:{tags:['几何图形'],description:'中性一像素图片'},generation:{finishReason:'stop',usage:{inputTokens:11,outputTokens:3,cachedTokens:null,totalTokens:14},attempts:[]}});
 await ports.saveGenerationResult(f.ref,{callId:call.callId,text});
 await expect(f.processing.complete(f.ref,{callId:call.callId,text:text+' '})).rejects.toThrow('真实模型回执');
 await expect(f.processing.complete({...f.ref,fenceToken:'foreign'},{callId:call.callId,text})).rejects.toThrow();
 const result=await f.processing.complete(f.ref,{callId:call.callId,text});expect(await f.processing.complete(f.ref,{callId:call.callId,text})).toEqual(result);
 const [file]=await store.db.select().from(assetFiles).where(eq(assetFiles.id,f.asset.currentFileId!));expect(file!.mediaMetadata).toMatchObject({aiDescription:'中性一像素图片'});
 const saved=await f.assetsService.getAsset(f.ctx,f.asset.id);expect(saved.currentFileId).toBe(f.asset.currentFileId);const tags=await createTaxonomyService(createTaxonomyRepository(store.db,{now,nextId}),{assertEntityReadable:(ctx,_type,id)=>f.assetsService.getAsset(ctx,id),assertEntityWritable:(ctx,_type,id)=>f.assetsService.getAsset(ctx,id)}).listTagsForEntity(f.ctx,{entityType:'asset',entityId:f.asset.id});expect(tags.map(t=>t.name)).toContain('几何图形');
 expect(Buffer.from((await f.assetsService.getAssetBytes(f.ctx,f.asset.id))!.bytes)).toEqual(png);
 await expect(f.assetsService.getAsset({...f.ctx,groupId:f.otherGroup},f.asset.id)).rejects.toThrow();
 const [business]=await store.db.select().from(aiTasks).where(eq(aiTasks.id,f.task.id)),[execution]=await store.db.select().from(executionTasks).where(eq(executionTasks.id,f.ref.executionTaskId));expect(business!.status).toBe('succeeded');expect(execution!.status).toBe('succeeded');expect(execution!.deadlineAt).toBe(f.execution.deadlineAt);expect(execution!.attempt).toBe(1);
 expect((await ledger.inspect(f.ref)).calls).toHaveLength(1);
},180000);
it('T1301 skipModel原短路仍完成，不能借修复发起模型',async()=>{
 const f=await fixture('codex',true),ports=createExecutionGenerationPorts(store.db,{now,budget});
 await expect(ports.reserveGenerationCall(f.ref,{operationKey:'asset.classify/model/1',request:{maxOutputTokens:1024}})).rejects.toThrow('不允许模型调用');
 await f.processing.complete(f.ref,{});const [row]=await store.db.select().from(executionTasks).where(eq(executionTasks.id,f.ref.executionTaskId));expect(row!.payload).not.toHaveProperty('modelIdentity');expect(row!.status).toBe('succeeded');
},180000);
it.each(['file','checksum','group'] as const)('T1301 原素材真实消费者拒绝%s变化，不归选择器授权',async variant=>{
 const f=await fixture('codex');
 if(variant==='file')await store.db.update(assets).set({currentFileId:'foreign-file'}).where(eq(assets.id,f.asset.id));
 if(variant==='checksum')f.files.set(f.upload.storageKey,new Uint8Array([8,9]));
 if(variant==='group')await store.db.update(aiTasks).set({groupId:f.otherGroup}).where(eq(aiTasks.id,f.task.id));
 await expect(f.processing.read(f.ref)).rejects.toThrow();
 const [row]=await store.db.select().from(executionTasks).where(eq(executionTasks.id,f.ref.executionTaskId));expect(row!.status).toBe('running');expect(row!.payload).not.toHaveProperty('modelIdentity');
},180000);
