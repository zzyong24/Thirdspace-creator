// @vitest-environment node
import {it,expect,vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {createServer,type Server} from 'node:http';
import {ENDPOINTS,type Endpoint,type RequestContext} from '@creatoros/contract';
import {aiTasks,aiTaskResults,executionTasks,executionCalls,scriptReviewReports,eq,asc,type Db} from '@creatoros/backend';

const owned=vi.hoisted(()=>({root:'',db:null as Db|null,dispatcher:null as any,prepares:[] as any[],ports:[] as any[],errors:[] as any[]}));
// 外部资源仅自有目录/loopback模型；所有reader、prepare、worker、ledger、报告服务原样执行。
vi.mock('@creatoros/backend',async original=>{const actual=await original<typeof import('@creatoros/backend')>();return {...actual,createConfiguredDb:async(...args:Parameters<typeof actual.createConfiguredDb>)=>{const value=await actual.createConfiguredDb(...args);owned.db=value.db;return value;}};});
vi.mock('@creatoros/backend/modules/assets',async original=>{const actual=await original<typeof import('@creatoros/backend/modules/assets')>();return {...actual,migrateStorageRoot:async()=>{throw Error('T1331_REVIEW_MEDIA_MIGRATION_FORBIDDEN');},createLocalFsObjectStorage:(...args:Parameters<typeof actual.createLocalFsObjectStorage>)=>actual.createLocalFsObjectStorage({...args[0],rootPath:path.join(owned.root,'media')},args[1])};});
vi.mock('@/server/activation/client-config.server',async original=>({...await original<typeof import('@/server/activation/client-config.server')>(),readChannelModelAuthority:async()=>({authority:'local'})}));
vi.mock('@creatoros/backend/modules/ai-runtime',async original=>{const actual=await original<typeof import('@creatoros/backend/modules/ai-runtime')>();return {...actual,
 composeChatProduction:(...args:Parameters<typeof actual.composeChatProduction>)=>({...actual.composeChatProduction(...args),start:()=>{}}),
 createStructuredBusinessExecutionService:(...args:Parameters<typeof actual.createStructuredBusinessExecutionService>)=>{const service=actual.createStructuredBusinessExecutionService(...args);return {...service,async prepare(...input:Parameters<typeof service.prepare>){const row:any={taskId:input[1],startedAt:new Date().toISOString()};owned.prepares.push(row);try{const value=await service.prepare(...input);row.result=value;return value;}catch(error){row.error=error instanceof Error?{name:error.name,message:error.message}:String(error);throw error;}finally{row.finishedAt=new Date().toISOString();}}};}};});
vi.mock('@/server/execution-worker-path',async original=>({...await original<typeof import('@/server/execution-worker-path')>(),resolveExecutionWorkerPath:()=>path.resolve('../docs/verification/t1331/runtime/review-consumer/worker-entry.fixture.cjs')}));
vi.mock('@creatoros/backend/modules/execution',async original=>{const actual=await original<typeof import('@creatoros/backend/modules/execution')>();return {...actual,createModelWorkerDispatcher:(...args:Parameters<typeof actual.createModelWorkerDispatcher>)=>{owned.dispatcher=actual.createModelWorkerDispatcher(...args);return {...owned.dispatcher,start:()=>{}};}};});
vi.mock('../../../../backend/src/modules/execution/worker-supervisor',async original=>{const actual=await original<typeof import('../../../../backend/src/modules/execution/worker-supervisor')>();return {...actual,createWorkerSupervisor:(options:Parameters<typeof actual.createWorkerSupervisor>[0])=>actual.createWorkerSupervisor({...options,extraEnv:{...options.extraEnv,T1331_REVIEW_ROOT:owned.root,T1331_REVIEW_RUN_ID:process.env.T1331_REVIEW_RUN_ID??'',TMPDIR:path.join(owned.root,'tmp'),TMP:path.join(owned.root,'tmp'),TEMP:path.join(owned.root,'tmp')},ports:{...options.ports,async invoke(ref,port,input){owned.ports.push({ref,port,input});try{return await options.ports.invoke(ref,port,input);}catch(error){owned.errors.push({ref,port,error:error instanceof Error?{name:error.name,message:error.message}:String(error)});throw error;}}}})};});
import {compositeTransport,getIdentityService,__resetPersistenceForTests} from '@/server/persistence-client';

const runtime=path.resolve('../docs/verification/t1331/runtime/review-consumer');
const sha=(bytes:string|Buffer)=>createHash('sha256').update(bytes).digest('hex');
const save=(name:string,value:unknown)=>fs.writeFileSync(path.join(owned.root,name+'.json'),JSON.stringify(value,null,2)+'\n');
const pieces=['先把杯子放稳。','把合上的笔记本移到一旁。','给桌面留出一小块空白。','有想法时先写下一句，再慢慢补齐。'];
const voiceover=pieces.join('');
const reportSummary='受控供应商返回完整审核报告，实际原稿与版本由真实宿主冻结。';
const errorJson=(error:unknown)=>error instanceof Error?{name:error.name,message:error.message,code:(error as Error&{code?:string}).code??null}:String(error);

it.each(['restore','reserved'] as const)('正式script.review确认当前版本/%s',async(kind)=>{
 const label=process.env.T1331_REVIEW_LABEL,selected=process.env.T1331_REVIEW_CASE;
 expect(process.env.T1331_REVIEW_APPROVED,'T1331_REVIEW_APPROVAL_REQUIRED').toBe('1');expect(selected).toBe(kind);expect(/^(red|green)(-[A-Za-z0-9]+)+$/.test(label??'')).toBe(true);
 owned.root=path.join(runtime,'cases',label!,kind);expect(fs.existsSync(path.join(owned.root,'START.json'))).toBe(false);
 for(const dir of ['','tmp','media'])fs.mkdirSync(path.join(owned.root,dir),{recursive:true});
 save('START',{label,kind,runId:process.env.T1331_REVIEW_RUN_ID,startedAt:new Date().toISOString(),externalPaidModels:0,source:'正式公开端点；仅外部模型HTTP响应合成'});
 owned.db=null;owned.dispatcher=null;owned.prepares=[];owned.ports=[];owned.errors=[];
 for(const [key,value] of Object.entries({DATABASE_URL:'',PGLITE_DATA_DIR:path.join(owned.root,'db'),CREATOROS_MASTER_KEY_FD:'',CREATOROS_MASTER_KEY_FILE:'',CREATOROS_MASTER_KEY:randomBytes(32).toString('base64'),CREATOROS_STORAGE:'local',CREATOROS_MEDIA_ROOT:path.join(owned.root,'media'),CREATOROS_DISABLE_BACKGROUND_DRIVERS:'1',CREATOROS_DISABLE_SCHEDULER:'1',CREATOROS_CLIENT_CONFIG_PULL_ENABLED:'0',CREATOROS_WIN_VIDEO_TUTOR_SKILL_PATH:path.join(owned.root,'missing-seed')}))vi.stubEnv(key,value);
 __resetPersistenceForTests();
 let server:Server|null=null,firstError:unknown,ctx:RequestContext={userId:'uninitialized',accountId:null,requestId:'t1331-formal-review-'+kind,source:'user'};
 const requests:any[]=[],fixtureErrors:any[]=[],cleanup:any[]=[],publicCalls:any[]=[];
 const call=async(endpoint:Endpoint,input:any={})=>{const row:any={operation:endpoint.id,input};publicCalls.push(row);try{const reply=await compositeTransport.request(endpoint,input,ctx) as {data:any};row.reply=reply;return reply.data;}catch(error){row.error=errorJson(error);throw error;}};
 const snapshot=async(name:string)=>{
  const db=owned.db;if(!db)return;
  save(name,{tasks:await db.select().from(aiTasks),executions:(await db.select().from(executionTasks)).map(task=>({...task,fenceToken:task.fenceToken?sha(task.fenceToken):null})),calls:await db.select().from(executionCalls).orderBy(asc(executionCalls.sequence)),results:await db.select().from(aiTaskResults),reports:await db.select().from(scriptReviewReports),prepares:owned.prepares,ports:owned.ports,errors:owned.errors,requests,fixtureErrors,publicCalls});
 };
 // 先观察本task真实准备：绑定或真实terminal均结束，null deadline不会被Date.parse成NaN。
 const prepared=async(taskId:string)=>{
  let task:any;let deadline=Date.now()+120000;
  for(;;){task=await call(ENDPOINTS.getTask,{params:{taskId}});if(task.executionTaskId||['failed','cancelled','partial','waiting_user','unknown_result'].includes(task.status))return task;
   if(typeof task.deadlineAt==='string'){const n=Date.parse(task.deadlineAt);if(!Number.isFinite(n))throw Error('INVALID_ORIGINAL_TASK_DEADLINE');deadline=Math.min(deadline,n);}
   if(Date.now()>=deadline){save('PREPARE_OBSERVATION_EXHAUSTED',{taskId,task,deadline,prepares:owned.prepares});throw Error('ORIGINAL_PREPARE_OBSERVATION_EXHAUSTED_NO_RESEND');}
   await new Promise(resolve=>setTimeout(resolve,50));
  }
 };
 try{
  const binding=JSON.parse(fs.readFileSync(path.join(runtime,'WORKER_BINDING.json'),'utf8'));const bytes=fs.readFileSync(binding.executionWorkerPath);
  expect(bytes.length).toBe(binding.bytes);expect(sha(bytes)).toBe(binding.sha256);
  server=createServer(async(req,res)=>{try{const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));const body=JSON.parse(Buffer.concat(chunks).toString());const properties=body.response_format?.json_schema?.schema?.properties;
   // 只按真实声明的输出字段选择协议响应，不读词义、不替产品选稿。
   let object:unknown,operation:string;
   if(properties?.voiceover&&properties?.centralClaim&&properties?.audienceOldBelief){operation='script.voiceover.compose';object={centralClaim:'给桌面留出记录空间',audienceOldBelief:'希望有一个可开始记录的位置',voiceover};}
   else if(properties?.shots){operation='script.storyboard.segment';object={shots:pieces.map((text,index)=>({role:index===0?'hook':index===pieces.length-1?'cta':'body',口播:text,画面:'杯子、合上的笔记本与桌面留白',字幕:text,时长:`${index*4}-${index*4+4}s`}))};}
   else if(properties?.verdict&&properties?.summary&&properties?.findings){operation='script.review';object={verdict:'risk',summary:reportSummary,findings:[]};}
   else throw Error('UNEXPECTED_REAL_MODEL_OUTPUT_SCHEMA');
   requests.push({url:req.url,operation,body,response:object});save('HTTP_REQUESTS',requests);
   const common={id:'t1331-controlled-'+requests.length,created:1,model:'t1331-review-controlled'};
   if(body.stream){res.writeHead(200,{'content-type':'text/event-stream'});res.end(`data: ${JSON.stringify({...common,object:'chat.completion.chunk',choices:[{index:0,delta:{role:'assistant',content:JSON.stringify(object)},finish_reason:null}]})}\n\ndata: ${JSON.stringify({...common,object:'chat.completion.chunk',choices:[{index:0,delta:{},finish_reason:'stop'}],usage:{prompt_tokens:7,completion_tokens:5,total_tokens:12}})}\n\ndata: [DONE]\n\n`);}
   else{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({...common,object:'chat.completion',choices:[{index:0,message:{role:'assistant',content:JSON.stringify(object)},finish_reason:'stop'}],usage:{prompt_tokens:7,completion_tokens:5,total_tokens:12}}));}
  }catch(error){fixtureErrors.push(errorJson(error));res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:{message:'OWNED_SUPPLIER_FIXTURE_PROTOCOL_FAILURE'}}));}});
  await new Promise<void>((resolve,reject)=>{server!.once('error',reject);server!.listen(0,'127.0.0.1',resolve);});
  const identity=await getIdentityService();ctx={...await identity.resolveLocalContext(),accountId:null,requestId:ctx.requestId,source:'user'};
  const group=await call(ENDPOINTS.createAccountGroup,{body:{name:'正式审核当前稿受控组-'+kind,idempotencyKey:'t1331-review-'+kind+'-'+label}});ctx={...ctx,groupId:group.id,accountId:null};
  await call(ENDPOINTS.putModel,{params:{capability:'default'},body:{provider:'openai',modelName:'t1331-review-controlled',apiFormat:'openai_chat',baseUrl:`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`,secret:'owned-loopback-not-authentication',settings:{structuredOutputs:true}}});
  const routing=await call(ENDPOINTS.getModelRouting);await call(ENDPOINTS.putModelRouting,{body:{schemaVersion:1,choices:{text:'self',vision:'official',image:'official',video:'official',audio:'local',embed:'official'},expectedRevision:routing.revision}});
  const project=await call(ENDPOINTS.createProject,{body:{title:'正式审核精确当前稿-'+kind}});
  const master=await call(ENDPOINTS.createArtifact,{params:{projectId:project.id},body:{title:'用户已确认母稿',artifactType:'master_script',stage:'script'}});
  const expectedText='这是用户实际保存的第二版中性原稿。先把杯子放稳，再把合上的笔记本移到旁边，给桌面留出写下一句话的位置。只描述眼前操作，不保证效果，也不虚构数字。';
  const v2=await call(ENDPOINTS.createArtifactVersion,{params:{artifactId:master.id},body:{contentText:expectedText,changeSummary:'用户保存第二版'}});expect(v2.versionNumber).toBe(2);
  if(kind==='restore'){
   const v3=await call(ENDPOINTS.createArtifactVersion,{params:{artifactId:master.id},body:{expectedCurrentVersionId:v2.id,contentText:'这是第三版另一份实际正文；本轮已恢复第二版，第三版不得冒充当前稿。',changeSummary:'第三版仍保留'}});expect(v3.versionNumber).toBe(3);
   await call(ENDPOINTS.restoreArtifact,{params:{artifactId:master.id},body:{versionId:v2.id,expectedCurrentVersionId:v3.id}});
  }else{
   const output=await call(ENDPOINTS.createOutput,{params:{projectId:project.id},body:{title:'中性候选目标',contentType:'video',clientRequestId:'t1331-owned-output-'+label}});
   const generated=await call(ENDPOINTS.generateResult,{params:{outputId:output.id},body:{kind:'script',clientRequestId:'t1331-owned-generation-'+label}});expect(generated.taskId).toBeTruthy();
   const generationTask=await prepared(generated.taskId);expect(generationTask.executionTaskId,JSON.stringify(generationTask)).toBeTruthy();
   await owned.dispatcher.drainOnce();
   const candidateTask=await call(ENDPOINTS.getTask,{params:{taskId:generated.taskId}});expect(candidateTask.status,JSON.stringify(candidateTask)).toBe('awaiting_confirmation');
   const results=await call(ENDPOINTS.listTaskResults,{params:{taskId:generated.taskId}});expect(results.some((result:any)=>result.resultType==='artifact_version')).toBe(true);
   const artifacts=await call(ENDPOINTS.listArtifacts,{params:{projectId:project.id},query:{page:1,pageSize:100}});const reserved=artifacts.filter((artifact:any)=>artifact.artifactType==='output_script'&&artifact.currentVersionIsReserved===true);expect(reserved).toHaveLength(1);
   expect(requests.map(row=>row.operation)).toEqual(['script.voiceover.compose','script.storyboard.segment']);expect(fixtureErrors).toEqual([]);
   save('GENERATION_PRECONDITION',{generated,generationTask:candidateTask,results,reserved,requests:structuredClone(requests)});
  }
  const current=await call(ENDPOINTS.getArtifact,{params:{artifactId:master.id}});expect(current.currentVersionId).toBe(v2.id);
  const versions=await call(ENDPOINTS.listArtifactVersions,{params:{artifactId:master.id},query:{page:1,pageSize:100}});expect(versions.find((version:any)=>version.id===v2.id)).toEqual(v2);
  const tasksBefore=await owned.db!.select().from(aiTasks);save('REVIEW_BEFORE',{ctx,project,current,versions,expected:{artifactId:master.id,versionId:v2.id,artifactVersion:2,text:expectedText},tasks:tasksBefore});
  let trigger:any,triggerError:unknown;
  try{trigger=await call(ENDPOINTS.triggerScriptReview,{params:{projectId:project.id}});}catch(error){triggerError=errorJson(error);}
  save('TRIGGER',{reply:trigger??null,error:triggerError??null,tasksBefore,tasksAfter:await owned.db!.select().from(aiTasks)});
  expect.soft(triggerError,'正常正式入口不得拒绝合法当前稿').toBeUndefined();
  if(!trigger?.id){await snapshot('REVIEW_OUTCOME');return;}
  expect(trigger.taskType).toBe('script.review');
  const task=await prepared(trigger.id);const [frozenTask]=await owned.db!.select().from(aiTasks).where(eq(aiTasks.id,trigger.id));
  expect(frozenTask?.inputData).toMatchObject({projectId:project.id,artifactId:master.id,artifactVersion:2});
  save('PREPARE_OUTCOME',{originalTaskId:trigger.id,task,frozenTask,prepares:owned.prepares});
  // RED应在这两个正式成功预期自然失败；没有执行ID时绝不重发或伪造worker输入。
  expect.soft(task.status,JSON.stringify({task,prepares:owned.prepares})).not.toBe('failed');
  expect.soft(task.executionTaskId,'合法当前稿必须经真实prepare获得执行绑定').toBeTruthy();
  if(!task.executionTaskId){await snapshot('REVIEW_OUTCOME');return;}
  const [execution]=await owned.db!.select().from(executionTasks).where(eq(executionTasks.id,task.executionTaskId));
  const modelInput=(execution?.payload as any)?.modelInput;const frozen=JSON.parse(modelInput?.facets?.__reviewSnapshot??'null');
  expect(frozen).toMatchObject({projectId:project.id,artifactId:master.id,artifactVersion:2,script:expectedText});
  save('FROZEN_REVIEW_INPUT',{taskId:trigger.id,executionTaskId:task.executionTaskId,originalDeadlineAt:execution?.deadlineAt,frozen});
  const callsBefore=requests.length;await owned.dispatcher.drainOnce();
  const completed=await call(ENDPOINTS.getTask,{params:{taskId:trigger.id}});const calls=await owned.db!.select().from(executionCalls).where(eq(executionCalls.executionTaskId,task.executionTaskId));
  expect(completed.status,JSON.stringify(completed)).toBe('succeeded');expect(calls.filter(call=>call.kind==='model'&&call.status==='settled')).toHaveLength(1);expect(requests.length-callsBefore).toBe(1);expect(requests.at(-1).operation).toBe('script.review');expect(JSON.stringify(requests.at(-1).body)).toContain(expectedText);
  const report=await call(ENDPOINTS.getLatestScriptReview,{params:{projectId:project.id}});expect(report).toMatchObject({projectId:project.id,artifactVersion:2,verdict:'risk',summary:reportSummary});expect(calls.find(call=>call.kind==='model')?.resultRef).toBe(report.id);
  expect(await call(ENDPOINTS.getLatestScriptReview,{params:{projectId:project.id}})).toEqual(report);expect(await call(ENDPOINTS.getArtifact,{params:{artifactId:master.id}})).toEqual(current);expect(await call(ENDPOINTS.listArtifactVersions,{params:{artifactId:master.id},query:{page:1,pageSize:100}})).toEqual(versions);
  expect(fixtureErrors).toEqual([]);save('FORMAL_REPORT',{originalTaskId:trigger.id,completed,report,calls,request:requests.at(-1),frozen});await snapshot('REVIEW_OUTCOME');
 }catch(error){firstError=error;try{await snapshot('FIRST_FAILURE');}catch(snapshotError){save('FAILURE_SNAPSHOT_ERROR',errorJson(snapshotError));}}
 finally{
  const attempt=async(name:string,operation:(()=>Promise<unknown>)|undefined)=>{if(!operation){cleanup.push({name,status:'NOT_CREATED'});return;}try{await operation();cleanup.push({name,status:'COMPLETED'});}catch(error){cleanup.push({name,status:'REJECTED',error:errorJson(error)});}};
  await attempt('final-evidence',()=>snapshot('FINAL_EVIDENCE'));
  await attempt('model-dispatcher-stop',owned.dispatcher?()=>owned.dispatcher.stop():undefined);
  const dispose=(globalThis as {__creatorosDisposePersistence?:()=>Promise<void>}).__creatorosDisposePersistence;
  await attempt('persistence-dispose',dispose?()=>dispose():undefined);
  await attempt('loopback-server-close',server?async()=>{server!.closeAllConnections();if(server!.listening)await new Promise<void>((resolve,reject)=>server!.close(error=>error?reject(error):resolve()));}:undefined);
  await attempt('persistence-reset',async()=>{__resetPersistenceForTests();});
  save('CLEANUP',{items:cleanup,firstError:firstError?errorJson(firstError):null,applicationKeyPersisted:false,externalPaidModels:0});owned.db=null;owned.dispatcher=null;vi.unstubAllEnvs();
 }
 if(firstError)throw firstError;
 expect(cleanup.filter(row=>row.status==='REJECTED')).toEqual([]);
},28800000);
