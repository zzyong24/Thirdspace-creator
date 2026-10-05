import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createDb,aiTasks,aiTaskResults,executionTasks,executionCalls,eq} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/backend/src/index.ts';
import {ENDPOINTS} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/contract/src/index.ts';
import {createIdentityRepository,createIdentityService} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/backend/src/modules/identity/index.ts';
import {createPlatformAccountService} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/backend/src/modules/platform-account/index.ts';
import {createProjectRepository,createProjectsService} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/backend/src/modules/projects/index.ts';
import {createArtifactsService} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/backend/src/modules/artifacts/index.ts';
import {createArticlesService} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/backend/src/modules/articles/articles.service.ts';
import {createArticlesTransport} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/backend/src/modules/articles/articles.transport.ts';
import {createGraphicPostsService} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/backend/src/modules/graphic-posts/graphic-posts.service.ts';
import {createGraphicPostsTransport} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/backend/src/modules/graphic-posts/graphic-posts.transport.ts';
import {createAiService} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/backend/src/modules/ai/ai.service.ts';
import {createSettingsRepository} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/backend/src/modules/settings/settings.repository.ts';
import {createSettingsService} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/backend/src/modules/settings/settings.service.ts';
import {createEffectiveSkillSnapshotResolver,requiredSkillIdsForTask} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/backend/src/modules/ai-runtime/effective-skill-snapshot.ts';
import {resolveLlmConfig} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/backend/src/modules/ai-runtime/llm/resolve.ts';
import {createStructuredBusinessExecutionService} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/backend/src/modules/ai-runtime/structured-business-execution.service.ts';
import {createModelWorkerDispatcher} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/backend/src/modules/execution/model-worker-dispatcher.ts';
import {createWritingBusinessAdapters} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/backend/src/application/generation/writing.ts';
import {createGraphicPostBusinessAdapters} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/backend/src/application/generation/creative-post.ts';
import {createProjectScriptSource} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/backend/src/application/project-script-source.ts';
import {getOfficialSkillBase,listOfficialSkillBases,registerAllTemplates} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/ai-worker/src/index.ts';
import {pinModelAuthority,matchesPinnedModelAuthority} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/frontend/src/server/task-model-authority.ts';

const worktree='/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator';
const evidenceDir='/tmp/t1060-ai-business/continue-derived';
const root=await mkdtemp(join(evidenceDir,'isolated-'));
const now=()=>new Date().toISOString(),deps={now,nextId:(p:string)=>`${p}-t1060-${randomUUID()}`};
const report:any={observedAt:now(),isolatedRoot:root,scope:'原文章/图文 transport→领域服务→AI任务→结构化准备→正式Worker→原凭据解析→持久错误读回',originalUserDatabaseRead:false,modelSettingsModified:false,adopted:false,published:false,actualModelRequests:0,credentialResolutions:[],unusedPortsCalled:[],workerReports:[]};
// Only explicitly approved API env keys; never read files or discover other credentials.
const safeKeys=['CREATOROS_LLM_SECRET_REF','CREATOROS_LLM_MODEL','CREATOROS_LLM_BASE_URL','CREATOROS_LLM_API_FORMAT','CREATOROS_LLM_AUTH_STYLE','MINIMAX_AUTH_TOKEN','ANTHROPIC_API_KEY','OPENAI_API_KEY'];
const safeEnv:Record<string,string|undefined>={};for(const key of safeKeys)safeEnv[key]=process.env[key];
report.safeEnvironmentPresence=Object.fromEntries(safeKeys.map(key=>[key,Boolean(safeEnv[key]?.trim())]));
const ref=safeEnv.CREATOROS_LLM_SECRET_REF?.trim().match(/^env:(.+)$/)?.[1];
report.referencedTokenPresent=Boolean(ref&&safeKeys.includes(ref)&&safeEnv[ref]?.trim());
if(ref&&!safeKeys.includes(ref))safeEnv.CREATOROS_LLM_SECRET_REF=undefined;
const opened=await createDb({dataDir:join(root,'db')});
let worker:any;
const unused=async()=>{report.unusedPortsCalled.push('UNUSED_PORT_CALLED');throw Error('UNUSED_PORT_NOT_INSTALLED');};
try{
 registerAllTemplates();
 const identity=createIdentityService(createIdentityRepository(opened.db,deps),deps);
 const user=await identity.register({email:`${randomUUID()}@t1060.invalid`,password:randomUUID(),displayName:'T1060 衍生生成真实阻断验证'});
 const base=await identity.resolveContextFromToken(user.rawToken);
 const account=await createPlatformAccountService({db:opened.db,...deps}).createAccount(base,{platform:'xiaohongshu',accountHandle:'T1060 临时衍生验证'});
 const ctx={...base,accountId:account.id};
 const projects=(store:any)=>createProjectsService(createProjectRepository(store),deps);
 const artifacts=(store:any)=>createArtifactsService({db:store,...deps,assertProjectOwned:(c,id)=>projects(store).getProject(c,id),resolveOutputProjectId:(c,id)=>projects(store).getProjectIdByOutput(c,id)});
 const p=projects(opened.db),a=artifacts(opened.db);
 const project=await p.createProject(ctx,{title:'隔离验证：灯塔守望',brief:'已确认脚本后，扩写文章与图文候选。'});
 const script=await a.createArtifact(ctx,{projectId:project.id,artifactType:'master_script',stage:'script',title:'灯塔守望主脚本'});
 const scriptVersion=await a.createVersion(ctx,script.id,{contentText:'夜晚，灯塔守望着蓝色海面。一束橙色的光引导小船接近港湾。真正的帮助，是让人看清下一步，不替人决定目的地。',createdByType:'user'});
 const scriptSource=createProjectScriptSource({projects:p,artifacts:a});
 const scriptPorts={readProjectScript:scriptSource.read,assertProjectScriptSource:scriptSource.assert,readProjectScriptContext:scriptSource.readContext,assertScriptMetadataSource:scriptSource.assertMetadata};
 const settingsRepo=createSettingsRepository(opened.db,deps);
 const settings=createSettingsService(()=>settingsRepo,{getAccount:unused} as any,{updateAccount:unused} as any);
 const snapshot=createEffectiveSkillSnapshotResolver({officialSkills:{get:getOfficialSkillBase,list:listOfficialSkillBases,platformPolicy:()=>({version:'creatoros-platform-policy-v1',text:['AI 只能产生候选；真实数据写入必须经过用户确认和后端服务端口。','不得编造指标、来源、执行结果或已保存状态；缺失数据必须如实标空。','工具只允许使用 effective Skill 白名单与当前账号授权范围的交集。'].join('\n')})},accountOverlays:{listBySkillIds:(c,ids)=>settingsRepo.listAccountSkillOverlays(c,ids)},now});
 const authority=pinModelAuthority({authority:'local',payload:null,scopeId:null} as any);
 const ai=createAiService({db:opened.db,...deps,artifacts:{createVersion:(c,id,input)=>a.createVersion(c,id,input)},knowledge:{createKnowledge:unused},candidate:{createFromAIResult:unused,enrichCard:unused},learnings:{createLearning:unused},publishing:{createPublicationFromDraft:unused},materialLinks:{link:unused},positioning:{upsertProfile:unused,createStatementVersion:unused},calibration:{} as any,resolveTaskRuntimeData:async(c,type,input)=>({skillSnapshot:await snapshot(c,requiredSkillIdsForTask(type,input)),modelAuthority:authority.authority,modelAuthorityDigest:authority.digest})} as any);
 const readGeneration=async(c:any,id:string)=>{const task=await ai.getTask(c,id);return {taskType:task.taskType,status:task.status,inputData:task.inputData,executionTaskId:task.executionTaskId,results:(await ai.listResults(c,id)).map(r=>({resultType:r.resultType,resultData:r.resultData}))};};
 const article=createArticlesService(opened.db,{...deps,...scriptPorts,projects,artifacts,assertAssetFile:unused,resolveDocumentSource:unused,resolveSelectedBrand:unused,submitGeneration:(c,input)=>ai.createTask(c,{taskType:'wechat.article-draft',attemptId:input.attemptId,inputData:input.inputData}),readGeneration});
 const graphic=createGraphicPostsService(opened.db,{now,...scriptPorts,projects,artifacts,assertAssetFile:unused,submitTextGeneration:(c,input)=>ai.createTask(c,{taskType:'graphic.post-text',attemptId:input.attemptId,inputData:input.inputData}),readTextGeneration:readGeneration});
 const articleOutput=await article.createOutput(ctx,project.id,{title:'灯塔文章',clientRequestId:`article-create-${randomUUID()}`});
 const graphicOutput=await graphic.createOutput(ctx,project.id,{title:'灯塔图文',targetPlatform:'xiaohongshu',clientRequestId:`graphic-create-${randomUUID()}`});
 const beforeArticle=await article.getArticle(ctx,articleOutput.id),beforeGraphic=await graphic.getGraphicPost(ctx,graphicOutput.id);
 const articleTransport=createArticlesTransport(()=>article),graphicTransport=createGraphicPostsTransport(()=>graphic);
 const articleSubmitted=(await articleTransport.request(ENDPOINTS.generateArticleCandidate,{params:{outputId:articleOutput.id},query:undefined,body:{clientRequestId:`article-generate-${randomUUID()}`,sourceAssets:[]}},ctx)).data as any;
 const graphicSubmitted=(await graphicTransport.request(ENDPOINTS.generateGraphicPostTextCandidate,{params:{outputId:graphicOutput.id},query:undefined,body:{kind:'body',clientRequestId:`graphic-generate-${randomUUID()}`}},ctx)).data as any;
 const writing=createWritingBusinessAdapters({projectsService:p,artifactsService:a,db:opened.db,articlesService:article,generationContext:{positioning:{getPositioningCenter:unused},learnings:{getSuggestions:unused}},makeGenerationReaders:()=>({contextReaderRegistry:{}}),makeBriefReader:unused,makeReviewSubjectReader:unused} as any);
 const business=createStructuredBusinessExecutionService(opened.db,{budget:{maxCalls:4,maxTokens:100000,deadlineMs:60000},maxOutputTokens:4096,adapters:{'wechat.article-draft':writing['wechat.article-draft'],...createGraphicPostBusinessAdapters({graphicPostsService:graphic})}});
 report.inputs=[];
 for(const submitted of [articleSubmitted,graphicSubmitted]){
  const prepared=await business.prepare(ctx,submitted.taskId);
  const [row]=await opened.db.select().from(aiTasks).where(eq(aiTasks.id,submitted.taskId));
  const [execution]=await opened.db.select().from(executionTasks).where(eq(executionTasks.id,row.executionTaskId!));
  const modelInput=(execution.payload as any).modelInput;
  assert.equal(modelInput.kind,'model.structured');assert.equal(modelInput.capability,'copy.generate');
  assert.ok((row.inputData as any).sourceMaterials.some((s:any)=>s.ref.kind==='project_script'&&s.ref.id===script.id&&s.ref.versionId===scriptVersion.id));
  report.inputs.push({taskId:row.id,taskType:row.taskType,outputId:row.contentOutputId,executionTaskId:row.executionTaskId,prepared,modelKind:modelInput.kind,capability:modelInput.capability,skillId:modelInput.skillId,externalAgentBindingPresent:Boolean(modelInput.externalAgentBinding),scriptSourceActual:true,scriptArtifactId:script.id,scriptVersionId:scriptVersion.id,baseVersionId:(row.inputData as any).baseVersionId});
 }
 const entryPath=join(worktree,'ai-worker/dist/execution-worker.cjs');
 report.workerSha256=createHash('sha256').update(await readFile(entryPath)).digest('hex');
 worker=createModelWorkerDispatcher(opened.db,{entryPath,workerId:'t1060-derived-config-real',budget:{maxCalls:4,maxTokens:100000,deadlineMs:60000},pollMs:100,modelConcurrency:1,onError:code=>report.workerReports.push(code),projectCandidate:(_ctx,input)=>business.projectCandidate(input),async resolveModelCredential(c,capability,owner){
  const runtime=await ai.getTaskRuntimeData(c,owner.aiTaskId);
  if(!matchesPinnedModelAuthority(runtime,authority))throw Object.assign(Error('MODEL_AUTHORITY_CHANGED'),{code:'MODEL_AUTHORITY_CHANGED'});
  try{
   const cfg=await resolveLlmConfig(c,capability,{getModelConfig:(context,cap)=>settings.getModelConfig(context,cap),env:safeEnv});
   report.credentialResolutions.push({aiTaskId:owner.aiTaskId,executionTaskId:owner.executionTaskId,capability,outcome:'available'});
   return {apiFormat:cfg.apiFormat,authStyle:cfg.authStyle,baseUrl:cfg.baseUrl,model:cfg.model,token:cfg.token,...(typeof cfg.settings.structuredOutputs==='boolean'?{structuredOutputs:cfg.settings.structuredOutputs}:{})};
  }catch(error){report.credentialResolutions.push({aiTaskId:owner.aiTaskId,executionTaskId:owner.executionTaskId,capability,outcome:'unavailable',resolverErrorName:(error as Error).name,resolverErrorMessage:(error as Error).message});throw Object.assign(Error('MODEL_CREDENTIAL_UNAVAILABLE'),{code:'MODEL_CREDENTIAL_UNAVAILABLE'});}
 }});
 report.drained=await worker.drainOnce();await worker.stop();worker=undefined;
 report.readback=[];
 for(const input of report.inputs){
  const task=await ai.getTask(ctx,input.taskId);
  const [execution]=await opened.db.select().from(executionTasks).where(eq(executionTasks.id,input.executionTaskId));
  const calls=await opened.db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,input.executionTaskId));
  const results=await ai.listResults(ctx,input.taskId);
  let domainState:any,publicCandidate:any;
  if(input.taskType==='wechat.article-draft'){
   try{domainState=await article.readCandidateState(ctx,input.taskId);}catch(error){domainState={errorName:(error as Error).name,message:(error as Error).message};}
   try{publicCandidate=(await articleTransport.request(ENDPOINTS.getArticleCandidate,{params:{candidateId:input.taskId},query:undefined,body:undefined},ctx)).data;}catch(error){publicCandidate={errorName:(error as Error).name,code:(error as any).code,message:(error as Error).message};}
  }else{publicCandidate=(await graphicTransport.request(ENDPOINTS.getGraphicPostTextCandidate,{params:{candidateId:input.taskId},query:undefined,body:undefined},ctx)).data;}
  report.readback.push({taskId:input.taskId,taskType:input.taskType,publicTaskStatus:task.status,publicTaskError:task.errorMessage,executionStatus:execution.status,executionErrorCode:execution.lastErrorCode,executionErrorMessage:execution.lastErrorMessage,callCount:calls.length,calls:calls.map(c=>({id:c.id,kind:c.kind,status:c.status,rejectionCode:c.rejectionCode})),candidateResultCount:results.length,domainState,publicCandidate});
  report.actualModelRequests+=calls.filter(c=>c.kind==='model'&&['started','settled','unknown'].includes(c.status)).length;
 }
 const afterArticle=await article.getArticle(ctx,articleOutput.id),afterGraphic=await graphic.getGraphicPost(ctx,graphicOutput.id);
 assert.equal(afterArticle.currentVersionId,beforeArticle.currentVersionId);assert.equal(afterGraphic.currentVersionId,beforeGraphic.currentVersionId);
 report.currentVersionsUnchanged=true;report.successfulAiGeneration=report.readback.some((r:any)=>r.candidateResultCount>0);
 report.outcome=report.credentialResolutions.every((r:any)=>r.outcome==='unavailable')?'blocked_by_real_configuration':'observed';
 assert.equal(report.unusedPortsCalled.length,0);
}catch(error){report.outcome='harness_error';report.error={name:(error as Error).name,message:(error as Error).message,stack:(error as Error).stack};process.exitCode=1;}
finally{if(worker)await worker.stop();await opened.client.close();await writeFile(join(evidenceDir,'evidence.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
