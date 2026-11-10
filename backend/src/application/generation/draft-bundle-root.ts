import {createHash} from 'node:crypto';
import {
 draftBundleRequest,draftBundleResult,knowledgeSources,nextDraftBundleStage,draftBundlePublicationStale,
 DRAFT_BUNDLE_SCHEMA_VERSION,DRAFT_BUNDLE_STAGES,
 type DraftBundleRequest,type DraftBundleResult,type DraftBundleStage,type DraftBundleScope,type KnowledgeSourceRef,type RequestContext,
} from '@creatoros/contract';
import {ChatToolUserError} from '../../modules/ai-runtime/chat-tool-errors';

/**
 * 第三批步骤4：「一句话出成稿包」编排根。
 * - 只通过端口调用各属主现有写入口（建项目、写稿、成稿、封面、发布物料），不改属主、不直写别人的表。
 * - 按所选账号/组写入：请求 scope 必须与当前请求上下文一致；读回的包也要再核一次。
 * - 幂等键 = sha256(userId, groupId, accountId, 规范化想法, 成稿类型)；同一想法重复提交得到同一包。
 * - 分段落地、断点续跑：每段开始和结束都写存储；失败只标该段，已完成段不回滚，再次 resume 从失败段继续。
 * - 最后只到 READY：端口里没有发布能力，markReady 只改决定状态。
 */
type TitleCandidate={text:string;angle?:string};
type WithSources={sources?:ReadonlyArray<KnowledgeSourceRef>};
export interface DraftBundlePorts{
 now():string;
 nextId(prefix:string):string;
 /** 分段持久化：按 userId + 幂等键存取；实现层负责账号组隔离。 */
 store:{load(ctx:RequestContext,idempotencyKey:string):Promise<unknown|null>;save(ctx:RequestContext,result:DraftBundleResult):Promise<void>};
 projects:{create(ctx:RequestContext,input:{title:string;idea:string;clientRequestId:string}):Promise<{projectId:string}>};
 titles:{generate(ctx:RequestContext,input:{projectId:string;idea:string}):Promise<{titles:TitleCandidate[]}&WithSources>};
 script:{draft(ctx:RequestContext,input:{projectId:string;title:string;idea:string}):Promise<{outputId:string;versionId:string}&WithSources>};
 work:{create(ctx:RequestContext,input:{projectId:string;kind:'article'|'image';script:{outputId:string;versionId:string}}):Promise<{outputId:string;versionId:string}>};
 cover:{brief(ctx:RequestContext,input:{projectId:string;title:string;script:{outputId:string;versionId:string}}):Promise<{headline:string;composition:string;assetId?:string|null}&WithSources>};
 publication:{generate(ctx:RequestContext,input:{projectId:string;title:string;workKind:'article'|'image';work:{outputId:string;versionId:string}}):Promise<{title:string;description:string;tags:string[]}>};
}

export function draftBundleIdempotencyKey(userId:string,request:Pick<DraftBundleRequest,'scope'|'idea'|'workKind'>):string{
 const idea=request.idea.normalize('NFKC').replace(/\s+/g,' ').trim();
 return createHash('sha256').update(JSON.stringify([userId,request.scope.groupId,request.scope.accountId,idea,request.workKind])).digest('hex');
}

function assertScope(ctx:RequestContext,scope:DraftBundleScope){
 const ok=scope.groupId?(ctx.groupId??null)===scope.groupId:(!ctx.groupId&&(ctx.accountId??null)===scope.accountId);
 if(!ok)throw new ChatToolUserError('成稿包所选账号与当前工作区不一致，请切到该账号后再试。');
}
const errorText=(error:unknown)=>(error instanceof Error?error.message:'这一段没有完成').slice(0,500);
const workingTitle=(result:DraftBundleResult)=>result.titles?.[result.selectedTitleIndex??0]?.text??result.idea.slice(0,80);

export function createDraftBundleRoot(ports:DraftBundlePorts){
 const running=new Map<string,Promise<DraftBundleResult>>();
 const save=async(ctx:RequestContext,next:DraftBundleResult)=>{const parsed=draftBundleResult.parse({...next,updatedAt:ports.now()});await ports.store.save(ctx,parsed);return parsed;};
 const load=async(ctx:RequestContext,key:string)=>{
  const raw=await ports.store.load(ctx,key);if(!raw)return null;
  const parsed=draftBundleResult.parse(raw);assertScope(ctx,parsed.scope);return parsed;
 };
 const mergeSources=(result:DraftBundleResult,more:WithSources['sources'])=>knowledgeSources.parse([...result.knowledgeSources,...(more??[])]);

 async function runStage(ctx:RequestContext,result:DraftBundleResult,stage:DraftBundleStage):Promise<DraftBundleResult>{
  const projectId=result.projectId;
  const needProject=()=>{if(!projectId)throw new Error('成稿包缺少项目');return projectId;};
  switch(stage){
   case 'project':{const {projectId:id}=await ports.projects.create(ctx,{title:result.idea.slice(0,60),idea:result.idea,clientRequestId:`bundle:${result.idempotencyKey}`});return {...result,projectId:id};}
   case 'titles':{const out=await ports.titles.generate(ctx,{projectId:needProject(),idea:result.idea});return {...result,titles:out.titles.map(t=>({text:t.text,angle:t.angle??''})) as DraftBundleResult['titles'],knowledgeSources:mergeSources(result,out.sources)};}
   case 'script':{const out=await ports.script.draft(ctx,{projectId:needProject(),title:workingTitle(result),idea:result.idea});return {...result,script:{outputId:out.outputId,versionId:out.versionId},knowledgeSources:mergeSources(result,out.sources)};}
   case 'work':{if(!result.script)throw new Error('口播稿未就绪');const out=await ports.work.create(ctx,{projectId:needProject(),kind:result.workKind,script:result.script});return {...result,work:{kind:result.workKind,outputId:out.outputId,versionId:out.versionId}};}
   case 'cover':{if(!result.script)throw new Error('口播稿未就绪');const out=await ports.cover.brief(ctx,{projectId:needProject(),title:workingTitle(result),script:result.script});return {...result,cover:{headline:out.headline.slice(0,40),composition:out.composition.slice(0,500),assetId:out.assetId??null},knowledgeSources:mergeSources(result,out.sources)};}
   case 'publication':return {...result,publication:await generatePublication(ctx,result)};
  }
 }
 async function generatePublication(ctx:RequestContext,result:DraftBundleResult){
  if(!result.work||!result.projectId)throw new Error('成稿未就绪');
  const title=workingTitle(result);
  const out=await ports.publication.generate(ctx,{projectId:result.projectId,title,workKind:result.workKind,work:result.work});
  return {title:out.title.slice(0,80)||title,description:out.description.slice(0,1000),tags:out.tags.slice(0,10),basedOnTitle:title};
 }

 async function drive(ctx:RequestContext,start:DraftBundleResult):Promise<DraftBundleResult>{
  let result=start;
  for(let stage=nextDraftBundleStage(result.stages);stage;stage=nextDraftBundleStage(result.stages)){
   const state=result.stages[stage];
   result=await save(ctx,{...result,status:'running',stages:{...result.stages,[stage]:{...state,status:'running',attempts:state.attempts+1,error:null}}});
   try{
    const next=await runStage(ctx,result,stage);
    result=await save(ctx,{...next,stages:{...next.stages,[stage]:{...next.stages[stage],status:'done',error:null}}});
   }catch(error){
    return save(ctx,{...result,status:'failed',stages:{...result.stages,[stage]:{...result.stages[stage],status:'failed',error:errorText(error)}}});
   }
  }
  return save(ctx,{...result,status:result.decisions.release==='ready'?'ready':'awaiting_decision'});
 }
 function exclusive(key:string,work:()=>Promise<DraftBundleResult>){
  const current=running.get(key);if(current)return current;
  const promise=work().finally(()=>running.delete(key));running.set(key,promise);return promise;
 }

 return {
  /** 新建或续跑：同账号同想法返回同一包，未完成的段从断点继续。 */
  async start(ctx:RequestContext,raw:DraftBundleRequest){
   const request=draftBundleRequest.parse(raw);assertScope(ctx,request.scope);
   const key=draftBundleIdempotencyKey(ctx.userId,request);
   return exclusive(key,async()=>{
    const existing=await load(ctx,key);
    if(existing)return existing.status==='ready'?existing:drive(ctx,existing);
    const stages=Object.fromEntries(DRAFT_BUNDLE_STAGES.map(stage=>[stage,{status:'pending',taskId:null,attempts:0,error:null}]));
    const initial=draftBundleResult.parse({kind:'bundle.draft',schemaVersion:DRAFT_BUNDLE_SCHEMA_VERSION,bundleId:ports.nextId('bundle'),idempotencyKey:key,scope:request.scope,idea:request.idea,workKind:request.workKind,stages,decisions:{},status:'running',updatedAt:ports.now()});
    return drive(ctx,await save(ctx,initial));
   });
  },
  async resume(ctx:RequestContext,key:string){
   return exclusive(key,async()=>{const existing=await load(ctx,key);if(!existing)throw new ChatToolUserError('找不到这个成稿包。');return existing.status==='ready'?existing:drive(ctx,existing);});
  },
  async read(ctx:RequestContext,key:string){return load(ctx,key);},
  /** 决定1：选标题。只联动重写发布物料（月明 2026-11-10 拍板），口播和图文不动。 */
  async selectTitle(ctx:RequestContext,key:string,index:number){
   return exclusive(key,async()=>{
    const existing=await load(ctx,key);if(!existing?.titles)throw new ChatToolUserError('标题还没生成好。');
    if(!Number.isInteger(index)||index<0||index>2)throw new ChatToolUserError('只能在三个标题里选一个。');
    let next:DraftBundleResult={...existing,selectedTitleIndex:index,decisions:{...existing.decisions,title:'decided',release:'pending'},status:existing.status==='ready'?'awaiting_decision':existing.status};
    if(next.stages.publication.status==='done'&&draftBundlePublicationStale(next)){
     try{next={...next,publication:await generatePublication(ctx,next)};}
     catch(error){next={...next,status:'failed',stages:{...next.stages,publication:{...next.stages.publication,status:'failed',error:errorText(error)}}};}
    }
    return save(ctx,next);
   });
  },
  /** 决定2：口播与成稿整体采纳或改写（改写走现有「改写整稿」入口，这里只记决定）。 */
  async decideContent(ctx:RequestContext,key:string,decision:'adopted'|'rewrite'){
   return exclusive(key,async()=>{const existing=await load(ctx,key);if(!existing)throw new ChatToolUserError('找不到这个成稿包。');
    return save(ctx,{...existing,decisions:{...existing.decisions,content:decision,release:'pending'},status:existing.status==='ready'?'awaiting_decision':existing.status});});
  },
  /** 决定3：确认封面和发布物料 → READY。不发布。 */
  async markReady(ctx:RequestContext,key:string){
   return exclusive(key,async()=>{
    const existing=await load(ctx,key);if(!existing)throw new ChatToolUserError('找不到这个成稿包。');
    if(nextDraftBundleStage(existing.stages))throw new ChatToolUserError('成稿包还有段落没完成。');
    if(existing.decisions.title!=='decided'||existing.decisions.content==='pending')throw new ChatToolUserError('请先选标题并确认口播与成稿。');
    if(draftBundlePublicationStale(existing))throw new ChatToolUserError('发布物料与所选标题不一致，请先重新生成发布物料。');
    return save(ctx,{...existing,decisions:{...existing.decisions,release:'ready'},status:'ready'});
   });
  },
 };
}
export type DraftBundleRoot=ReturnType<typeof createDraftBundleRoot>;
