// @vitest-environment node
import {it,expect,vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {ENDPOINTS,type Endpoint,type RequestContext} from '@creatoros/contract';
import {aiTasks,aiTaskResults,executionTasks,executionCalls,artifacts,eq,asc,type Db} from '@creatoros/backend';
const owned=vi.hoisted(()=>({root:'',db:null as Db|null,chat:null as any,model:null as any,errors:[] as any[],ports:[] as any[],getCurrentScriptRef:null as null|((...args:any[])=>Promise<any>),dailyPublications:[] as any[],seedReads:[] as string[]}));
vi.mock('@creatoros/backend',async original=>{const actual=await original<typeof import('@creatoros/backend')>();return {...actual,createConfiguredDb:async(...args:Parameters<typeof actual.createConfiguredDb>)=>{const value=await actual.createConfiguredDb(...args);owned.db=value.db;return value;}};});
vi.mock('@creatoros/backend/modules/assets',async original=>{const actual=await original<typeof import('@creatoros/backend/modules/assets')>();return {...actual,migrateStorageRoot:async()=>{throw Error('T1331_MEDIA_MIGRATION_FORBIDDEN');},createLocalFsObjectStorage:(...args:Parameters<typeof actual.createLocalFsObjectStorage>)=>actual.createLocalFsObjectStorage({...args[0],rootPath:path.join(owned.root,'media')},args[1])};});
vi.mock('@/server/activation/client-config.server',async original=>({...await original<typeof import('@/server/activation/client-config.server')>(),readChannelModelAuthority:async()=>({authority:'local'})}));
vi.mock('@creatoros/backend/modules/ai-runtime',async original=>{const actual=await original<typeof import('@creatoros/backend/modules/ai-runtime')>();const status={engine:'codex' as const,installed:true,available:true,version:'0.159.3',defaultModelId:'t1331-fixture-model',availableModels:[{id:'t1331-fixture-model',inputModalities:['text']}],loginStatus:'authenticated' as const,capabilities:{text:true,imageUnderstanding:false,imageGeneration:false,imageEditing:'unavailable' as const}};return {...actual,createLocalCodexStatusService:()=>({read:async()=>structuredClone(status),peek:()=>structuredClone(status),stop:async()=>{}})};});
vi.mock('@/server/execution-worker-path',async original=>({...await original<typeof import('@/server/execution-worker-path')>(),resolveExecutionWorkerPath:()=>path.resolve('../docs/verification/t1331/runtime/regression/closing/main-green-v2/worker-entry.fixture.cjs')}));
vi.mock('@creatoros/backend/modules/execution',async original=>{const actual=await original<typeof import('@creatoros/backend/modules/execution')>();return {...actual,createModelWorkerDispatcher:(...args:Parameters<typeof actual.createModelWorkerDispatcher>)=>{owned.model=actual.createModelWorkerDispatcher(...args);return {...owned.model,start:()=>{}};}};});
vi.mock('../../../../backend/src/modules/execution/model-worker-dispatcher',async original=>{const actual=await original<typeof import('../../../../backend/src/modules/execution/model-worker-dispatcher')>();return {...actual,createChatWorkerDispatcher:(...args:Parameters<typeof actual.createChatWorkerDispatcher>)=>{owned.chat=actual.createChatWorkerDispatcher(...args);return {...owned.chat,start:()=>{}};}};});
// 只透传并记录真实host端口；业务准备、父回执、worker及采纳服务没有stub。
vi.mock('../../../../backend/src/modules/execution/worker-supervisor',async original=>{const actual=await original<typeof import('../../../../backend/src/modules/execution/worker-supervisor')>();return {...actual,createWorkerSupervisor:(options:Parameters<typeof actual.createWorkerSupervisor>[0])=>actual.createWorkerSupervisor({...options,extraEnv:{...options.extraEnv,T1331_FIXTURE_ROOT:owned.root,T1331_RUN_ID:process.env.T1331_RUN_ID!,CODEX_HOME:path.join(owned.root,'empty-codex-home'),TMPDIR:path.join(owned.root,'tmp'),TMP:path.join(owned.root,'tmp'),TEMP:path.join(owned.root,'tmp')},ports:{...options.ports,async invoke(ref,port,input){owned.ports.push({phase:'invoke',port,executionTaskId:ref.executionTaskId,callId:(input as any)?.callId??null});try{return await options.ports.invoke(ref,port,input);}catch(error){const e=error as Error;owned.errors.push({port,executionTaskId:ref.executionTaskId,name:e.name,message:e.message});throw error;}}}})};});
// 透明捕获生产注入闭包，不替换正文/版本reader。日报仅合成外部publication来源端口，不落已发布记录。
vi.mock('@creatoros/backend/modules/review',async original=>{const actual=await original<typeof import('@creatoros/backend/modules/review')>();return {...actual,createReviewGateService:(...args:Parameters<typeof actual.createReviewGateService>)=>{owned.getCurrentScriptRef=args[0].script.getCurrentScriptRef;return actual.createReviewGateService(...args);}};});
vi.mock('@creatoros/backend/application/queries/daily-report',async original=>{const actual=await original<typeof import('@creatoros/backend/application/queries/daily-report')>();return {...actual,createDailyReportApplication:(ports:Parameters<typeof actual.createDailyReportApplication>[0])=>actual.createDailyReportApplication({...ports,publishingService:{...ports.publishingService,listPublishedInWindow:async()=>owned.dailyPublications}})};});
// 仅透明计数真实seed闭包，原结果不替换，错误/正式空不能调用它。
vi.mock('@creatoros/backend/application/context/review-subject',async original=>{const actual=await original<typeof import('@creatoros/backend/application/context/review-subject')>();return {...actual,createReviewSubjectContext:(ports:Parameters<typeof actual.createReviewSubjectContext>[0])=>actual.createReviewSubjectContext({...ports,readProjectRadarDraftSeed:async(...args)=>{owned.seedReads.push(args[1]);return ports.readProjectRadarDraftSeed(...args);}})};});
import {compositeTransport,getChatRuntime,getIdentityService,__resetPersistenceForTests} from '@/server/persistence-client';
import {resolveScriptArtifactIdFromDb,loadScriptEditorData} from '@/features/script/script-editor-data';
import {selectReadableProjectScriptArtifact} from '@/server/project-script-truth';
const runtime=path.resolve('../docs/verification/t1331/runtime/regression/closing/main-green-v2');
const sha=(value:unknown)=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const save=(name:string,value:unknown)=>fs.writeFileSync(path.join(owned.root,name+'.json'),JSON.stringify(value,null,2)+'\n');
it('预留稿目标的三个真实服务端读取与候选采纳完整公共链',async()=>{
 const phase=process.env.T1331_PHASE;expect(['red','green'].includes(phase??'')).toBe(true);expect(process.env.T1331_APPROVED).toBe('1');
 const label=process.env.T1331_RUN_LABEL??phase!;expect(/^(red|green)(-[a-zA-Z0-9]+)*$/.test(label)).toBe(true);
 owned.root=path.join(runtime,'cases',label);expect(fs.existsSync(path.join(owned.root,'START.json'))).toBe(false);
 for(const dir of ['','tmp','media','empty-codex-home'])fs.mkdirSync(path.join(owned.root,dir),{recursive:true});
 save('START',{phase,startedAt:new Date().toISOString(),externalModels:0,protocol:'synthetic external Codex child only',sourceTaskIdsReused:false});
 owned.db=null;owned.chat=null;owned.model=null;owned.errors=[];owned.ports=[];owned.getCurrentScriptRef=null;owned.dailyPublications=[];owned.seedReads=[];
 const pieces=['先把杯子放稳。','把合上的笔记本移到一旁。','给桌面留出一小块空白。','有想法时先写下一句，再慢慢补齐。'];
 const newText=pieces.join(''),instruction='根据这个项目写一版完整中性口播候选，描述整理桌面、杯子和合上的笔记本，保留实际事实，不虚构效果数字，不自动采纳。';
 save('scenario',{instruction,newText,shots:pieces.map((text,index)=>({role:index===0?'hook':index===pieces.length-1?'cta':'body',口播:text,画面:'杯子、合上的笔记本与桌面留白',字幕:text,时长:`${index*4}-${index*4+4}s`}))});
 for(const [key,value] of Object.entries({DATABASE_URL:'',PGLITE_DATA_DIR:path.join(owned.root,'db'),CREATOROS_MASTER_KEY_FD:'',CREATOROS_MASTER_KEY_FILE:'',CREATOROS_MASTER_KEY:randomBytes(32).toString('base64'),CREATOROS_STORAGE:'local',CREATOROS_MEDIA_ROOT:path.join(owned.root,'media'),CREATOROS_DISABLE_BACKGROUND_DRIVERS:'1',CREATOROS_DISABLE_SCHEDULER:'1',CREATOROS_CLIENT_CONFIG_PULL_ENABLED:'0',CREATOROS_WIN_VIDEO_TUTOR_SKILL_PATH:path.join(owned.root,'missing-seed')}))vi.stubEnv(key,value);
 __resetPersistenceForTests();let ctx:RequestContext={userId:'uninitialized',accountId:null,requestId:'t1331-owned',source:'user'};let rootTaskId='',childTaskId='',projectId='',masterId='',articleId='',graphicId='';
 const call=async(endpoint:Endpoint,input:any={})=>(await compositeTransport.request(endpoint,input,ctx) as {data:any}).data;
 const editorClient={listArtifacts:async(input:any)=>call(ENDPOINTS.listArtifacts,input),listArtifactVersions:async(input:any)=>call(ENDPOINTS.listArtifactVersions,input),getArtifact:async(input:any)=>call(ENDPOINTS.getArtifact,input)};
 const snapshot=async(label:string)=>{
  if(!owned.db||!rootTaskId)return null;
  const [business]=await owned.db.select().from(aiTasks).where(eq(aiTasks.id,rootTaskId));
  const [execution]=business?.executionTaskId?await owned.db.select().from(executionTasks).where(eq(executionTasks.id,business.executionTaskId)):[];
  const calls=execution?await owned.db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,execution.id)).orderBy(asc(executionCalls.sequence)):[];
  const children=await call(ENDPOINTS.listAITasks,{query:{taskType:'script.draft',page:1,pageSize:100}});
  const value={business,execution:execution?{...execution,fenceToken:execution.fenceToken?sha(execution.fenceToken):null}:null,calls,children,errors:owned.errors,ports:owned.ports};save(label,value);return value;
 };
 const readConsumers=async(label:string)=>{
  const listed:Array<typeof ENDPOINTS.listArtifacts.response._output>=await call(ENDPOINTS.listArtifacts,{params:{projectId},query:{page:1,pageSize:200}});
  const uiId=await resolveScriptArtifactIdFromDb(projectId,editorClient);
  const serverTarget=selectReadableProjectScriptArtifact(listed);
  const versions=serverTarget?await call(ENDPOINTS.listArtifactVersions,{params:{artifactId:serverTarget.id}}):[];
  const current=versions.find((v:any)=>v.id===serverTarget?.currentVersionId)??null;
  const article=await call(ENDPOINTS.getArticle,{params:{outputId:articleId}}),graphic=await call(ENDPOINTS.getGraphicPost,{params:{outputId:graphicId}});
  const editor=await loadScriptEditorData(uiId,editorClient);
  expect(owned.getCurrentScriptRef,'production reviewGate注入必须实际装配').toBeTypeOf('function');
  const reviewScript=await (await getChatRuntime()).context.reviewSubject!.getScript(ctx,projectId);
  const reviewRef=await owned.getCurrentScriptRef!(ctx,projectId);
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const daily=await call(ENDPOINTS.getDailyReport,{query:{date}});expect(daily.works).toHaveLength(1);expect(daily.works[0].projectId).toBe(projectId);
  const data=current?.contentData as Record<string,unknown>|null|undefined;
  const rawReview=data&&typeof data.transcript==='string'?data.transcript:current?.contentText;
  const expectedReview=current?(rawReview?.trim()?rawReview:''):null;
  if(current){expect(reviewScript,'同一精确current的原review投影').toBe(expectedReview);expect(reviewRef).toEqual({artifactId:serverTarget!.id,artifactVersion:current.versionNumber});expect(article.scriptContext.scriptRef).toMatchObject({id:serverTarget!.id,versionId:current.id});expect(graphic.scriptContext.scriptRef).toMatchObject({id:serverTarget!.id,versionId:current.id});expect(daily.works[0].script,'两个真实canonical consumer').toBe(article.scriptContext.scriptText);}
  const value={listed,uiId,editor,serverTarget,current,reviewScript,expectedReview,reviewRef,daily,articleScriptContext:article.scriptContext,graphicScriptContext:graphic.scriptContext};save(label,value);return value;
 };
 try{
  const binding=JSON.parse(fs.readFileSync(path.join(runtime,'WORKER_BINDING.json'),'utf8'));expect(sha(fs.readFileSync(binding.executionWorkerPath))).toBe(binding.sha256);
  const actual=await getChatRuntime();ctx={...await (await getIdentityService()).resolveLocalContext(),accountId:null};
  const group=await call(ENDPOINTS.createAccountGroup,{body:{name:'纯组整稿隔离测试',idempotencyKey:'t1331-owned-group'}});ctx={...ctx,groupId:group.id,groupVersion:group.version};
  const routing=await call(ENDPOINTS.getModelRouting);await call(ENDPOINTS.putModelRouting,{body:{schemaVersion:1,expectedRevision:routing.revision,choices:{text:'codex',vision:'official',image:'official',video:'official',audio:'official',embed:'official'}}});
  const project=await call(ENDPOINTS.createProject,{body:{title:'桌面上的记录空间',brief:'中性测试：桌面上有一只杯子和一本合上的笔记本，整理后留一块空白。'}});projectId=project.id;
  const master=await call(ENDPOINTS.createArtifact,{params:{projectId},body:{title:'既有已确认母稿',artifactType:'master_script',stage:'script'}});masterId=master.id;
  const oldText='旧母稿：把桌面上的杯子放稳，合上笔记本，先记一句想法。';
  const oldVersion=await call(ENDPOINTS.createArtifactVersion,{params:{artifactId:masterId},body:{contentText:oldText,contentData:{sections:[{id:'original-master-section',heading:'原稿',body:oldText}]},changeSummary:'隔离用户原稿'}});
  const article=await call(ENDPOINTS.createOutput,{params:{projectId},body:{title:'另一平台文章原稿',contentType:'article',targetPlatform:'wechatOfficialAccount',clientRequestId:'t1331-article'}});articleId=article.id;
  const graphic=await call(ENDPOINTS.createGraphicPost,{params:{projectId},body:{title:'另一平台图文原稿',targetPlatform:'xiaohongshu',clientRequestId:'t1331-graphic'}});graphicId=graphic.id;
  const video=await call(ENDPOINTS.createOutput,{params:{projectId},body:{title:'受控日报挂点',contentType:'video',clientRequestId:'t1331-daily-video'}});
  owned.dailyPublications=[{id:'synthetic-publication-t1331',contentOutputId:video.id,accountId:null,platform:'douyin',status:'published',hiddenAt:null,removedAt:null,publishedAt:new Date().toISOString()}];
  save('publication-source-fixture',{meaning:'仅隔离日报来源port的合成事实，不写publication表，不代表真实发布或指标',rows:owned.dailyPublications});
  save('owned-binding',{ctx,group,project,master,oldVersion,article,graphic,routing:await call(ENDPOINTS.getModelRouting)});
  const before=await readConsumers('consumers-before');expect(before.uiId).toBe(masterId);expect(before.serverTarget?.id).toBe(masterId);expect(before.articleScriptContext.scriptRef.id).toBe(masterId);expect(before.graphicScriptContext.scriptRef.id).toBe(masterId);expect(before.reviewRef.artifactId).toBe(masterId);expect(before.reviewScript).toContain(oldText);expect(before.daily.works[0].script).toContain(oldText);
  const originalMaster=await call(ENDPOINTS.getArtifact,{params:{artifactId:masterId}}),originalVersions=await call(ENDPOINTS.listArtifactVersions,{params:{artifactId:masterId}}),originalArticle=await call(ENDPOINTS.getArticle,{params:{outputId:articleId}}),originalGraphic=await call(ENDPOINTS.getGraphicPost,{params:{outputId:graphicId}});
  const conversation=await call(ENDPOINTS.createConversation,{body:{title:'当前项目整稿',scope:'project',projectId}});
  const message=await call(ENDPOINTS.createMessage,{params:{conversationId:conversation.id},body:{content:instruction,executionEngine:'codex'}});rootTaskId=message.modelMetadata.chatTaskId;save('public-submission',{conversation,message,rootTaskId});expect(rootTaskId).toBeTruthy();expect(owned.chat).toBeTruthy();
  await owned.chat.drainOnce();const afterParent=await snapshot('after-parent');expect(afterParent?.execution?.status).toBe('succeeded');
  const tool=afterParent!.calls.find((row:any)=>row.kind==='tool'&&row.resultText?.includes('script.draft'));expect(tool).toBeTruthy();
  const receipt=JSON.parse(tool!.resultText!).output;save('official-tool-receipt',receipt);
  // 原生产错误必须自然使合法成功断言失败；不将AccountRequiredError当预期通过。
  expect(receipt.data.taskId,JSON.stringify(receipt)).toBeTruthy();expect(receipt.status).toBe('ok');expect(afterParent!.children).toHaveLength(1);childTaskId=receipt.data.taskId;
  const prepared=await call(ENDPOINTS.getTask,{params:{taskId:childTaskId}}),targetId=prepared.inputData.artifactId;save('child-prepared',prepared);
  const [rawChild]=await owned.db!.select().from(aiTasks).where(eq(aiTasks.id,childTaskId));expect(rawChild).toMatchObject({groupId:ctx.groupId,accountId:null});expect(targetId).not.toBe(masterId);
  const target=await call(ENDPOINTS.getArtifact,{params:{artifactId:targetId}});expect(target).toMatchObject({projectId,artifactType:'output_script',contentOutputId:null,currentVersionIsReserved:true});expect(target).not.toHaveProperty('scriptDraftReservationVersionId');
  const beforeCandidate=await readConsumers('consumers-before-candidate');
  const beforeCandidateChecks={ui:beforeCandidate.uiId===masterId,server:beforeCandidate.serverTarget?.id===masterId,article:beforeCandidate.articleScriptContext?.scriptRef?.id===masterId,graphic:beforeCandidate.graphicScriptContext?.scriptRef?.id===masterId,reviewSubject:beforeCandidate.reviewScript.includes(oldText),reviewRef:beforeCandidate.reviewRef.artifactId===masterId,dailyReport:beforeCandidate.daily.works[0].script?.includes(oldText)===true};save('PRE_ADOPTION_CONSUMER_CHECKS',beforeCandidateChecks);
  expect.soft(beforeCandidate.uiId).toBe(masterId);
  expect.soft(beforeCandidate.serverTarget?.id,'候选未采纳时空初始版本不能遮住既有母稿').toBe(masterId);
  expect.soft(beforeCandidate.reviewScript,'真实reviewSubject候选前仍原稿').toContain(oldText);expect.soft(beforeCandidate.reviewRef.artifactId,'真实getCurrentScriptRef候选前仍原稿').toBe(masterId);expect.soft(beforeCandidate.daily.works[0].script,'公开日报实际详情读候选前仍原稿').toContain(oldText);expect.soft(beforeCandidate.articleScriptContext?.scriptRef?.id).toBe(masterId);expect.soft(beforeCandidate.graphicScriptContext?.scriptRef?.id).toBe(masterId);
  expect(await call(ENDPOINTS.getArtifact,{params:{artifactId:masterId}})).toEqual(originalMaster);expect(await call(ENDPOINTS.listArtifactVersions,{params:{artifactId:masterId}})).toEqual(originalVersions);
  expect(owned.model).toBeTruthy();await owned.model.drainOnce();
  const child=await call(ENDPOINTS.getTask,{params:{taskId:childTaskId}});save('child-after-worker',child);expect(child.status).toBe('awaiting_confirmation');expect((await call(ENDPOINTS.getArtifact,{params:{artifactId:targetId}})).currentVersionIsReserved).toBe(true);
  const results=await call(ENDPOINTS.listTaskResults,{params:{taskId:childTaskId}});save('candidate',results);expect(results).toHaveLength(1);expect(results[0].resultData.sections.length).toBeGreaterThan(0);
  const awaiting=await readConsumers('consumers-awaiting-confirmation');expect.soft(awaiting.reviewScript).toContain(oldText);expect.soft(awaiting.reviewRef.artifactId).toBe(masterId);expect.soft(awaiting.daily.works[0].script).toContain(oldText);expect.soft(awaiting.uiId).toBe(masterId);expect.soft(awaiting.serverTarget?.id).toBe(masterId);expect.soft(awaiting.articleScriptContext?.scriptRef?.id).toBe(masterId);expect.soft(awaiting.graphicScriptContext?.scriptRef?.id).toBe(masterId);
  expect((await call(ENDPOINTS.getArticle,{params:{outputId:articleId}})).current).toEqual(originalArticle.current);expect((await call(ENDPOINTS.getGraphicPost,{params:{outputId:graphicId}})).current).toEqual(originalGraphic.current);
  await call(ENDPOINTS.confirmTask,{params:{taskId:childTaskId}});const adopted=await readConsumers('consumers-after-adopt');expect(adopted.reviewRef.artifactId).toBe(targetId);expect(adopted.reviewScript).toContain(pieces[0]);expect(adopted.daily.works[0].script).toContain(pieces[0]);expect(adopted.uiId).toBe(targetId);expect(adopted.serverTarget?.id).toBe(targetId);expect(adopted.current.contentText).toContain(pieces[0]);expect(adopted.editor?.editorHtml).toContain(pieces[0]);expect(adopted.articleScriptContext.scriptRef.id).toBe(targetId);expect(adopted.graphicScriptContext.scriptRef.id).toBe(targetId);
  expect((await call(ENDPOINTS.getArtifact,{params:{artifactId:targetId}})).currentVersionIsReserved).toBe(false);
  const adoptedVersions=await call(ENDPOINTS.listArtifactVersions,{params:{artifactId:targetId}});await call(ENDPOINTS.confirmTask,{params:{taskId:childTaskId}});expect(await call(ENDPOINTS.listArtifactVersions,{params:{artifactId:targetId}})).toEqual(adoptedVersions);
  const refreshed=await readConsumers('consumers-after-refresh');expect(refreshed.reviewRef).toEqual(adopted.reviewRef);expect(refreshed.reviewScript).toEqual(adopted.reviewScript);expect(refreshed.daily.works[0].script).toEqual(adopted.daily.works[0].script);expect(refreshed.uiId).toBe(targetId);expect(refreshed.current).toEqual(adopted.current);
  expect(await call(ENDPOINTS.getArtifact,{params:{artifactId:masterId}})).toEqual(originalMaster);expect(await call(ENDPOINTS.listArtifactVersions,{params:{artifactId:masterId}})).toEqual(originalVersions);expect((await call(ENDPOINTS.getArticle,{params:{outputId:articleId}})).current).toEqual(originalArticle.current);expect((await call(ENDPOINTS.getGraphicPost,{params:{outputId:graphicId}})).current).toEqual(originalGraphic.current);
  // 新公共边界继续用同一原候选/目标；不再调用模型。
  const outline=await call(ENDPOINTS.createArtifact,{params:{projectId},body:{title:'无主稿时的独立大纲',artifactType:'content_outline',stage:'script'}});
  await call(ENDPOINTS.createArtifactVersion,{params:{artifactId:outline.id},body:{contentText:'此大纲不得覆盖正式空稿'}});
  const later=await call(ENDPOINTS.createArtifactVersion,{params:{artifactId:targetId},body:{expectedCurrentVersionId:adopted.current.id,contentText:'之后的人工第三版'}});
  const versionsBeforeRestore=await call(ENDPOINTS.listArtifactVersions,{params:{artifactId:targetId}});
  await call(ENDPOINTS.restoreArtifact,{params:{artifactId:targetId},body:{versionId:adopted.current.id,expectedCurrentVersionId:later.id}});
  const restored=await readConsumers('consumers-restored-non-highest');expect(restored.current.id).toBe(adopted.current.id);expect(restored.reviewRef).toEqual(adopted.reviewRef);expect(restored.reviewScript).toEqual(adopted.reviewScript);expect(restored.daily.works[0].script).toEqual(adopted.daily.works[0].script);
  expect(await call(ENDPOINTS.listArtifactVersions,{params:{artifactId:targetId}})).toEqual(versionsBeforeRestore);
  await call(ENDPOINTS.restoreArtifact,{params:{artifactId:targetId},body:{versionId:target.currentVersionId,expectedCurrentVersionId:adopted.current.id}});
  const initialEmpty=await readConsumers('consumers-restored-initial-empty');expect(initialEmpty.uiId).toBe(targetId);expect(initialEmpty.current.id).toBe(target.currentVersionId);expect(initialEmpty.reviewRef).toEqual({artifactId:targetId,artifactVersion:1});expect(initialEmpty.reviewScript).toBe('');expect(initialEmpty.daily.works[0].script).toBe('');expect(initialEmpty.articleScriptContext).toMatchObject({state:'ready',scriptRef:{id:targetId,versionId:target.currentVersionId},scriptText:''});expect(initialEmpty.graphicScriptContext).toMatchObject({state:'ready',scriptText:''});expect(initialEmpty.editor?.versions.some((v:any)=>v.id===target.currentVersionId&&v.isCurrent)).toBe(true);
  const cleared=await call(ENDPOINTS.createArtifactVersion,{params:{artifactId:targetId},body:{expectedCurrentVersionId:target.currentVersionId,contentText:'',contentData:{}}});
  const clearRead=await readConsumers('consumers-explicit-empty-save');expect(clearRead.current.id).toBe(cleared.id);expect(clearRead.reviewRef.artifactVersion).toBe(cleared.versionNumber);expect(clearRead.reviewScript).toBe('');expect(clearRead.daily.works[0].script).toBe('');expect(clearRead.articleScriptContext.scriptRef.id).toBe(targetId);expect(owned.seedReads).toEqual([]);
  // 自有库注入损坏current仅用于负项；不改任何不可变版本或共享库。
  await owned.db!.update(artifacts).set({currentVersionId:'t1331-missing-current'}).where(eq(artifacts.id,targetId));
  const errors:Array<{consumer:string;name:string;message:string}>=[];
  const rejected=async(consumer:string,work:()=>Promise<unknown>)=>{try{await work();throw Error('EXPECTED_CONSUMER_REJECTION');}catch(error){const e=error as Error;expect(e.message).not.toBe('EXPECTED_CONSUMER_REJECTION');errors.push({consumer,name:e.name,message:e.message});}};
  try{
   await rejected('reviewSubject',()=>actual.context.reviewSubject!.getScript(ctx,projectId));await rejected('getCurrentScriptRef',()=>owned.getCurrentScriptRef!(ctx,projectId));await rejected('UI combined current',()=>loadScriptEditorData(targetId,editorClient));
   const brokenDaily=await call(ENDPOINTS.getDailyReport,{query:{date:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}});expect(brokenDaily.works[0].script).toBeNull();expect(brokenDaily.warnings).toContain('部分作品稿件读取失败');expect(owned.seedReads).toEqual([]);save('actual-error-consumers',{errors,daily:brokenDaily,reviewSeedReads:owned.seedReads});
  }finally{await owned.db!.update(artifacts).set({currentVersionId:cleared.id}).where(eq(artifacts.id,targetId));}
  // 第二个真实owned项目：公开创建的未标记空v1不得被猜成预留。
  const emptyProject=await call(ENDPOINTS.createProject,{body:{title:'公开正式空初版'}});projectId=emptyProject.id;
  const old=await call(ENDPOINTS.createArtifact,{params:{projectId},body:{title:'旧母稿对照',artifactType:'master_script',stage:'script'}});await call(ENDPOINTS.createArtifactVersion,{params:{artifactId:old.id},body:{contentText:'不应回灌的旧母稿'}});
  const emptyArtifact=await call(ENDPOINTS.createArtifact,{params:{projectId},body:{title:'用户公开创建空稿',artifactType:'output_script',stage:'script'}});expect(emptyArtifact.currentVersionIsReserved).toBe(false);
  articleId=(await call(ENDPOINTS.createOutput,{params:{projectId},body:{title:'空稿文章挂点',contentType:'article',targetPlatform:'wechatOfficialAccount',clientRequestId:'t1331-empty-article'}})).id;
  graphicId=(await call(ENDPOINTS.createGraphicPost,{params:{projectId},body:{title:'空稿图文挂点',targetPlatform:'xiaohongshu',clientRequestId:'t1331-empty-graphic'}})).id;
  const emptyVideo=await call(ENDPOINTS.createOutput,{params:{projectId},body:{title:'空稿受控日报挂点',contentType:'video',clientRequestId:'t1331-empty-video'}});owned.dailyPublications=[{...owned.dailyPublications[0],contentOutputId:emptyVideo.id}];
  const publicEmpty=await readConsumers('consumers-public-empty-v1');expect(publicEmpty.uiId).toBe(emptyArtifact.id);expect(publicEmpty.reviewRef).toEqual({artifactId:emptyArtifact.id,artifactVersion:1});expect(publicEmpty.reviewScript).toBe('');expect(publicEmpty.daily.works[0].script).toBe('');expect(publicEmpty.articleScriptContext.scriptRef.id).toBe(emptyArtifact.id);expect(publicEmpty.graphicScriptContext.scriptRef.id).toBe(emptyArtifact.id);expect(owned.seedReads).toEqual([]);
  const rpc=fs.readFileSync(path.join(owned.root,'native-rpc.ndjson'),'utf8').trim().split('\n').map(x=>JSON.parse(x));save('RESULT',{status:Object.values(beforeCandidateChecks).every(Boolean)?'CONTROLLED_PUBLIC_CHAIN_COMPLETED_PENDING_TEST_VERDICT':'CHAIN_COMPLETED_WITH_PRE_ADOPTION_CONSUMER_FAILURE',rootTaskId,childTaskId,targetId,masterId,modelTurns:rpc.filter(x=>x.method==='turn/start').length,externalModels:0,originalMasterUntouched:true,otherPlatformDocumentsUntouched:true,preAdoptionConsumerChecks:beforeCandidateChecks,meaning:'以最终Vitest原始结果为准；soft失败不改为PASS'});
 }catch(error){const e=error as Error;save('FAILURE',{name:e.name,message:e.message,rootTaskId,childTaskId,projectId});throw error;}
 finally{
  try{await snapshot('before-cleanup');}catch(error){save('CLEANUP_READ_ERROR',{name:(error as Error).name});}
  finally{
   const cleanup:Array<{action:string;status:'COMPLETED'|'REJECTED'|'NOT_AVAILABLE';error?:{name:string;message:string}}>=[];
   const attempt=async(action:string,work:(()=>unknown)|undefined)=>{if(!work){cleanup.push({action,status:'NOT_AVAILABLE'});return;}try{await work();cleanup.push({action,status:'COMPLETED'});}catch(error){const e=error as Error;cleanup.push({action,status:'REJECTED',error:{name:e.name,message:e.message}});}};
   await attempt('chat.stop',owned.chat?()=>owned.chat.stop():undefined);
   await attempt('model.stop',owned.model?()=>owned.model.stop():undefined);
   const dispose=(globalThis as {__creatorosDisposePersistence?:()=>Promise<void>}).__creatorosDisposePersistence;
   await attempt('persistence.dispose',typeof dispose==='function'?()=>dispose():undefined);
   await attempt('persistence.reset',()=>__resetPersistenceForTests());
   await attempt('environment.unstub',()=>vi.unstubAllEnvs());
   save('CLEANUP',{actions:cleanup,sharedCandidateTouched:false,masterKeyPersisted:false});
   expect.soft(cleanup.filter(row=>row.status==='REJECTED'),'每项清理均独立执行，拒绝不能标完成').toEqual([]);
  }
 }
},28800000);
