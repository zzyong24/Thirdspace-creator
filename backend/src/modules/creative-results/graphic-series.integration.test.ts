import {describe,it,expect,vi} from 'vitest';
// 新增真实隔离Db迁移与父锁IO需容纳初始化；不改产品请求deadline/取消或任何业务断言。
vi.setConfig({testTimeout:30_000});
import {ENDPOINTS} from '@creatoros/contract';
import {createHash} from 'node:crypto';
import {createDb,type Db} from '@creatoros/backend';
import {createProjectRepository,createProjectsService} from '../projects';
import {createArtifactsService} from '../artifacts';
import {createGraphicPostsService} from '../graphic-posts';
import {createGraphicPostMediaAdapter,type GraphicPostMediaPorts} from './graphic-post-media.adapter';
import {createCreativeResultsService} from './creative-results.service';
const ctx={userId:'series-user',accountId:'series-account',requestId:'series-request',source:'user'} as const;
const bytes=new Uint8Array([1,2,3]),checksum=createHash('sha256').update(bytes).digest('hex');
async function fixture(){
 const opened=await createDb();let seq=0;const deps={now:()=>new Date().toISOString(),nextId:(prefix:string)=>`${prefix}-${++seq}`};
 const projects=(db:Db)=>createProjectsService(createProjectRepository(db),deps);
 const artifacts=(db:Db)=>createArtifactsService({db,...deps,assertProjectOwned:(c,id)=>projects(db).getProject(c,id),resolveOutputProjectId:(c,id)=>projects(db).getProjectIdByOutput(c,id)});
 const files=new Map([['legacy','legacy-file'],['ref','ref-original']]);
 const assetStatus=new Map<string,string>([['legacy','active'],['ref','active']]);
 const assertAssetFile=vi.fn(async(c:any,id:string,file:string,active:boolean)=>{if(c.accountId!==ctx.accountId||(!files.has(id))||(files.get(id)!==file && !(id==='ref'&&file==='ref-original'))||active&&assetStatus.get(id)!=='active')throw new Error('asset not owned or active');});
 const posts=createGraphicPostsService(opened.db,{...deps,projects,artifacts,assertAssetFile});
 const project=await projects(opened.db).createProject(ctx,{title:'三页内容'});
 const output=await posts.createOutput(ctx,project.id,{title:'组图',targetPlatform:'xiaohongshu',clientRequestId:'series-output-create'});
 const initial=await posts.getGraphicPost(ctx,output.id);
 const cards=['one','two','three'].map((cardId,i)=>({cardId,title:`第${i+1}页`,body:`真实内容${i+1}`,visualBrief:'同一铅笔人物',sourceRefs:[]}));
 const saved=await posts.createVersion(ctx,output.id,{expectedCurrentVersionId:initial.currentVersionId,clientRequestId:'series-document-prepare',document:{...initial.current,title:'已确认的内容',body:'完整内容',cardBriefs:cards,imageUses:[{assetId:'legacy',assetFileId:'legacy-file',role:'card',order:0}],seriesProfile:{visualDirection:'统一铅笔画',aspectRatio:'3:4',referenceImage:{assetId:'ref',assetFileId:'ref-original'}}}});
 const tasks=new Map<string,any>(),attempts=new Map<string,string>();let loseAck=false;
 const submit=vi.fn(async(_c:any,input:any)=>{
   if(attempts.has(input.attemptId)){return tasks.get(attempts.get(input.attemptId)!);}
   const id=`task-${++seq}`,assetId=`image-${seq}`,fileId=`file-${seq}`;
   const task={id,status:input.inputData.targetSectionId==='two'&&!input.attemptId.includes('retry')?'failed':'awaiting_confirmation',taskType:'graphic.card.generate',projectId:project.id,contentOutputId:output.id,inputData:structuredClone(input.inputData),assetId,fileId};
   tasks.set(id,task);attempts.set(input.attemptId,id);files.set(assetId,fileId);assetStatus.set(assetId,'pending');
   if(loseAck){loseAck=false;throw new Error('submission ACK lost');}return task;
 });
 const findTaskByAttempt=vi.fn(async(_c:any,_type:any,attempt:string)=>tasks.get(attempts.get(attempt)??'')??null);
 const confirmTask=vi.fn(async(_c:any,id:string)=>{const task=tasks.get(id);task.status='succeeded';assetStatus.set(task.assetId,'active');});
 const freezeCoverContext=vi.fn(async(_c:any,input:any)=>({positioningBrief:'',projectBriefHard:'',reviewScript:input.fullText,userMaterialHardBrief:'',userMaterialRefBrief:'',knowledgeBrief:'',orientationHint:'',topic:{title:input.topic,angle:''}}));
 const media=createGraphicPostMediaAdapter({db:opened.db,graphicPosts:posts,projects:projects(opened.db),assets:{getAsset:async(_c:any,id:string)=>({currentFileId:files.get(id),status:assetStatus.get(id),assetType:'image'}),assertAssetFileOwned:assertAssetFile,getAssetFileDownloadUrl:async()=>({url:'fixture://image',fileName:'image.png'}),readImageReference:async(c:any,id:string,file?:string)=>{await assertAssetFile(c,id,file!,true);return {fileId:file!,checksum,mimeType:'image/png',bytes};}},submitCard:submit,submitCover:submit,findTaskByAttempt,readTask:async(_c:any,id:string)=>tasks.get(id),listResults:async(_c:any,id:string)=>{const task=tasks.get(id);return [{resultType:'generated_asset',assetId:task.assetId,resultData:{assetId:task.assetId,assetFileId:task.fileId,assetType:'image'}}];},confirmTask,probeCard:async()=>({ready:true}),probeCover:async()=>({ready:true}),freezeCoverContext,now:deps.now,nextId:()=>`media-binding-${++seq}`} as unknown as GraphicPostMediaPorts);
 const results=createCreativeResultsService(opened.db,{projects:projects(opened.db),adapters:{graphic_post:media},now:deps.now,nextId:()=>`result-${++seq}`});
 return {opened,posts,output,results,cards,saved,tasks,files,submit,findTaskByAttempt,freezeCoverContext,confirmTask,loseNextAck:()=>loseAck=true};
}
// Real PGlite domain/task/bundle receipts; model/Asset byte ports are explicitly injected fixtures.
describe('多页公共bundle到GraphicPosts原owner版本',()=>{
 it('失败页局部恢复、同批顺序采用、同页重做和回执重放，旧照片不丢',async()=>{
  const f=await fixture();try{
   const bundle=await f.results.createBundle(ctx,{outputId:f.output.id,clientRequestId:'series-three-bundle',items:f.cards.map(c=>({kind:'image_card',targetSectionId:c.cardId}))});
   expect(bundle.items.map(i=>i.targetSectionId)).toEqual(['one','two','three']);expect(f.submit).toHaveBeenCalledTimes(3);
   for(const task of f.tasks.values())expect(task.inputData.seriesSnapshot).toMatchObject({cardBriefs:f.cards,referenceProof:{assetId:'ref',assetFileId:'ref-original',checksum}});
   const adopt=async(resultId:string,key:string)=>{const current=await f.posts.getGraphicPost(ctx,f.output.id),result=await f.results.get(ctx,resultId);const body=ENDPOINTS.adoptResult.body.parse({expected:{owner:'graphic_post',versionId:current.currentVersionId},editedValue:result.value,clientRequestId:key});const input={resultId,...body};return {input,receipt:await f.results.adopt(ctx,input)};};
   const first=await adopt(bundle.items[0]!.resultId,'adopt-series-one');
   const afterFirst=await f.posts.getGraphicPost(ctx,f.output.id);
   expect(await f.results.adopt(ctx,first.input)).toEqual(first.receipt);expect((await f.posts.getGraphicPost(ctx,f.output.id)).versions).toHaveLength(afterFirst.versions.length);
   expect((await f.results.getBundle(ctx,bundle.bundleId)).status).toBe('partial_completed');
   await adopt(bundle.items[2]!.resultId,'adopt-series-three');
   // Replacing the current pointer must not rewrite the failed page's immutable reference input.
   f.files.set('ref','ref-new-current');
   const retry=await f.results.retry(ctx,bundle.items[1]!.resultId,'retry-only-page-two');expect(retry.targetSectionId).toBe('two');
   expect(f.tasks.get(retry.taskId!)!.inputData.seriesSnapshot.referenceProof.assetFileId).toBe('ref-original');
   await adopt(retry.resultId,'adopt-series-two');
   const all=await f.posts.getGraphicPost(ctx,f.output.id);expect(all.current.imageUses.map(i=>i.cardId)).toEqual([undefined,'one','two','three']);
   expect(all.current.imageUses[0]!.assetId).toBe('legacy');expect(all.current.cardBriefs).toEqual(f.cards);
   expect((await f.results.getBundle(ctx,bundle.bundleId)).status).toBe('complete');
   const oldOne=all.current.imageUses.find(i=>i.cardId==='one')!;
   const remake=await f.results.generate(ctx,{outputId:f.output.id,kind:'image_card',targetSectionId:'one',clientRequestId:'remake-first-only'});
   await adopt(remake.resultId,'adopt-remake-one');const remade=await f.posts.getGraphicPost(ctx,f.output.id);
   expect(remade.current.imageUses.filter(i=>i.cardId!=='one')).toEqual(all.current.imageUses.filter(i=>i.cardId!=='one'));
   expect(remade.current.imageUses.find(i=>i.cardId==='one')!.assetId).not.toBe(oldOne.assetId);expect(f.files.has(oldOne.assetId)).toBe(true);
   await expect(f.results.get({...ctx,accountId:'another'},remake.resultId)).rejects.toThrow();
  }finally{await f.opened.client.close();}
 });
 it('丢失submitACK后用原request回读原任务，编辑新稿不会再收费或重冻上下文',async()=>{
  const f=await fixture();try{
   const input={outputId:f.output.id,kind:'image_card' as const,targetSectionId:'one',clientRequestId:'series-submit-unknown'};f.loseNextAck();
   await expect(f.results.generate(ctx,input)).rejects.toThrow('ACK lost');
   expect(f.tasks.size).toBe(1);expect((await f.results.list(ctx,{outputId:f.output.id})).items[0]).toMatchObject({status:'queued',errorCode:'GENERATION_SUBMISSION_UNKNOWN'});
   const current=await f.posts.getGraphicPost(ctx,f.output.id);await f.posts.createVersion(ctx,f.output.id,{expectedCurrentVersionId:current.currentVersionId,document:{...current.current,body:'后来用户编辑'},clientRequestId:'series-user-edits-unknown'});
   const recovered=await f.results.generate(ctx,input);expect(recovered.taskId).toBe([...f.tasks.keys()][0]);expect(f.submit).toHaveBeenCalledOnce();expect(f.freezeCoverContext).toHaveBeenCalledOnce();
   await expect(f.results.adopt(ctx,{resultId:recovered.resultId,editedValue:recovered.value as never,expected:{owner:'graphic_post',versionId:(await f.posts.getGraphicPost(ctx,f.output.id)).currentVersionId},clientRequestId:'reject-stale-input'})).rejects.toMatchObject({code:'VERSION_CONFLICT'});
   expect(f.confirmTask).not.toHaveBeenCalled();
  }finally{await f.opened.client.close();}
 });
});
it('失败页retry丢ACK沿原frozen及attempt恢复，不新增付费任务或再次读当前参考',async()=>{
 const f=await fixture();try{
  const failed=await f.results.generate(ctx,{outputId:f.output.id,kind:'image_card',targetSectionId:'two',clientRequestId:'failed-page-two'});
  expect(failed.status).toBe('failed');const frozen=structuredClone(f.tasks.get(failed.taskId!)!.inputData);
  f.files.set('ref','ref-current-later');f.loseNextAck();
  await expect(f.results.retry(ctx,failed.resultId,'retry-page-two-ack')).rejects.toThrow('ACK lost');
  expect(f.tasks.size).toBe(2);
  const pending=(await f.results.list(ctx,{outputId:f.output.id})).items.find(item=>item.retryOf===failed.resultId)!;
  expect(pending).toMatchObject({status:'queued',errorCode:'RETRY_SUBMISSION_UNKNOWN',retryRequestId:'retry-page-two-ack'});
  const retry=await f.results.retry(ctx,failed.resultId,'retry-page-two-ack');expect(retry.resultId).toBe(pending.resultId);expect(f.tasks.size).toBe(2);
  expect(f.tasks.get(retry.taskId!)!.inputData).toEqual(frozen);expect(f.freezeCoverContext).toHaveBeenCalledOnce();
 }finally{await f.opened.client.close();}
});

// GREEN-only recovery evidence: the existing owner receipt path was already correct; this is not a fabricated RED bug.
it('owner保存成功但adoptACK丢失，完整原请求重放原版本回执而不新增版本',async()=>{
 const f=await fixture();try{
  const candidate=await f.results.generate(ctx,{outputId:f.output.id,kind:'image_card',targetSectionId:'one',clientRequestId:'owner-ack-page-one-generate'});
  const before=await f.posts.getGraphicPost(ctx,f.output.id);
  const input={resultId:candidate.resultId,expected:{owner:'graphic_post',versionId:before.currentVersionId},editedValue:structuredClone(candidate.value) as never,clientRequestId:'owner-ack-adopt-complete-request'};
  const originalCreate=f.posts.createVersion.bind(f.posts);
  let ownerVersionId:string|null=null;
  const saveSpy=vi.spyOn(f.posts,'createVersion');
  saveSpy.mockImplementationOnce(async(...args)=>{
   const receipt=await originalCreate(...args);ownerVersionId=receipt.versionId;
   throw new Error('owner ACK lost');
  });
  await expect(f.results.adopt(ctx,input)).rejects.toThrow('owner ACK lost');
  const committed=await f.posts.getGraphicPost(ctx,f.output.id);
  expect(committed.currentVersionId).toBe(ownerVersionId);
  expect(committed.versions).toHaveLength(before.versions.length+1);
  expect((await f.results.get(ctx,candidate.resultId)).status).toBe('awaiting_confirmation');
  expect(f.confirmTask).toHaveBeenCalledOnce();
  saveSpy.mockImplementation(originalCreate);
  // Simulates the restored full request: retain the pre-save expected version, exact files and original idempotency key.
  const restored=structuredClone(input);
  const replay=await f.results.adopt(ctx,restored);
  expect(replay).toMatchObject({status:'adopted',versionId:ownerVersionId});
  const readBack=await f.posts.getGraphicPost(ctx,f.output.id);
  expect(readBack.currentVersionId).toBe(committed.currentVersionId);
  expect(readBack.versions).toHaveLength(committed.versions.length);
  expect(readBack.current).toEqual(committed.current);
  expect(saveSpy).toHaveBeenCalledTimes(2);
  expect(f.confirmTask).toHaveBeenCalledOnce();
  expect(await f.results.adopt(ctx,restored)).toEqual(replay);
  expect((await f.posts.getGraphicPost(ctx,f.output.id)).versions).toHaveLength(committed.versions.length);
  expect(saveSpy).toHaveBeenCalledTimes(2);
 }finally{await f.opened.client.close();}
});
