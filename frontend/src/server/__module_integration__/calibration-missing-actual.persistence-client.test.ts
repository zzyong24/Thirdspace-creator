// @vitest-environment node
import {expect,it,vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {ENDPOINTS,type Endpoint,type RequestContext} from '@creatoros/contract';
import {aiTasks,executionTasks,executionCalls,rubrics,rubricVersions,predictions,calibrationResults,ingestionRuns,type Db} from '@creatoros/backend';
const owned=vi.hoisted(()=>({db:null as Db|null,feedback:[] as unknown[],children:[] as {pid:number|null}[],network:[] as string[]}));
vi.mock('@creatoros/backend',async original=>{const actual=await original<typeof import('@creatoros/backend')>();return {...actual,createConfiguredDb:async(...args:Parameters<typeof actual.createConfiguredDb>)=>{const value=await actual.createConfiguredDb(...args);owned.db=value.db;return value;}};});
// 只透明观察正式反馈port；委托原no-op/返回/异常，不接通T1336。
vi.mock('@creatoros/backend/modules/calibration',async original=>{const actual=await original<typeof import('@creatoros/backend/modules/calibration')>();return {...actual,createCalibrationService:(...args:Parameters<typeof actual.createCalibrationService>)=>{const deps=args[0],port=deps.learnings;if(!port)return actual.createCalibrationService(...args);return actual.createCalibrationService({...deps,learnings:{...port,async adjustConfidence(...input:Parameters<typeof port.adjustConfidence>){owned.feedback.push({ctx:input[0],input:input[1]});return port.adjustConfidence(...input);}}});}};});
vi.mock('node:child_process',async original=>{const actual=await original<typeof import('node:child_process')>();return {...actual,fork:(...args:Parameters<typeof actual.fork>)=>{const child=actual.fork(...args);owned.children.push({pid:child.pid??null});if(child.pid){const fields=actual.execFileSync('/bin/ps',['-p',String(child.pid),'-o','pgid=,lstart=,comm='],{encoding:'utf8'}).trim().split(/\s+/);fs.appendFileSync(path.join(process.env.T1339_PHASE_ROOT!,'CHILDREN.ndjson'),JSON.stringify({pid:child.pid,pgid:Number(fields.shift()),identity:fields.join(' '),runId:process.env.T1339_RUN_ID})+'\n');}return child;}};});
import {compositeTransport,getIdentityService,getStorageRootForRequest,__resetPersistenceForTests} from '@/server/persistence-client';
const base='/Volumes/T7-MacData/CodexBuilds/t1339-missing-actual-20261017-42fe69d6';
const phase=process.env.T1339_PHASE??'red-v1';
const phaseRoot=path.join(base,phase);
if(process.env.T1339_PHASE_ROOT&&path.resolve(process.env.T1339_PHASE_ROOT)!==phaseRoot)throw Error('OWNED_PHASE_BINDING_MISMATCH');
const sha=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const save=(name:string,value:unknown)=>fs.writeFileSync(path.join(phaseRoot,name+'.json'),JSON.stringify(value,null,2)+'\n');
type Family={name:string;ctx:RequestContext;project:any;output:any;rubric:any;prediction:any;result:any;expected:Record<string,number>;feedbackBefore:number;feedbackAfter:number};
async function snapshot(){if(!owned.db)throw Error('DB_NOT_CREATED');return {rubrics:await owned.db.select().from(rubrics),versions:await owned.db.select().from(rubricVersions),predictions:await owned.db.select().from(predictions),results:await owned.db.select().from(calibrationResults),ingestion:await owned.db.select().from(ingestionRuns)};}
async function lifecycle(dbPhase:string,body:(call:(e:Endpoint,input?:any,ctx?:RequestContext)=>Promise<any>,user:RequestContext)=>Promise<void>){
 expect(['red-v1','green-v1']).toContain(phase);expect(fs.realpathSync(base)).toBe(base);fs.mkdirSync(phaseRoot,{recursive:true,mode:0o700});
 const dbRoot=path.join(base,dbPhase);for(const dir of ['tmp','media','workspaces'])fs.mkdirSync(path.join(dbRoot,dir),{recursive:true,mode:0o700});
 const keyFile=path.join(base,'fixture-application-key');if(!fs.existsSync(keyFile)){if(phase!=='red-v1')throw Error('ORIGINAL_FIXTURE_KEY_REQUIRED');fs.writeFileSync(keyFile,randomBytes(32).toString('base64'),{mode:0o600,flag:'wx'});}expect(fs.statSync(keyFile).mode&0o777).toBe(0o600);
 if(dbPhase==='red-v1'&&phase==='green-v1'&&(!fs.existsSync(path.join(dbRoot,'FIXTURE.json'))||JSON.parse(fs.readFileSync(path.join(dbRoot,'CLEANUP.json'),'utf8')).persistence!=='DISPOSED'))throw Error('COMPLETED_ORIGINAL_RED_REQUIRED');
 owned.db=null;owned.feedback=[];owned.children=[];owned.network=[];
 for(const[k,v]of Object.entries({DATABASE_URL:'',PGLITE_DATA_DIR:path.join(dbRoot,'db'),CREATOROS_MASTER_KEY:fs.readFileSync(keyFile,'utf8'),CREATOROS_MASTER_KEY_FILE:'',CREATOROS_MASTER_KEY_FD:'',CREATOROS_STORAGE:'local',CREATOROS_MEDIA_ROOT:path.join(dbRoot,'media'),CREATOROS_WORKSPACES_ROOT:path.join(dbRoot,'workspaces'),CREATOROS_DISABLE_BACKGROUND_DRIVERS:'1',CREATOROS_DISABLE_SCHEDULER:'1',CREATOROS_CLIENT_CONFIG_PULL_ENABLED:'0',CREATOROS_WIN_VIDEO_TUTOR_SKILL_PATH:path.join(dbRoot,'no-fixture-skill'),TMPDIR:path.join(dbRoot,'tmp'),TMP:path.join(dbRoot,'tmp'),TEMP:path.join(dbRoot,'tmp')}))vi.stubEnv(k,v);
 __resetPersistenceForTests();vi.stubGlobal('fetch',async(input:unknown)=>{owned.network.push(typeof input==='string'?new URL(input).origin:'non-string');throw Error('ZERO_MODEL_NETWORK_FORBIDDEN');});
 const deadline=Date.now()+1800000,cleanup:any={persistence:'NOT_CREATED',dbPhase,fixtureKey:{exists:true,mode:'0600',persistedForOriginalDb:true}};
 const requests:any[]=[];
 try{
  const user={...await(await getIdentityService()).resolveLocalContext(),accountId:null};cleanup.persistence='CREATED';
  const call=async(e:Endpoint,input:any={},ctx:RequestContext=user)=>{
   const remaining=deadline-Date.now();if(!Number.isFinite(remaining)||remaining<120000)throw Error('ORIGINAL_PUBLIC_DEADLINE_NO_RETRY');
   const parsed={...input,...(e.body?{body:e.body.parse(input.body)}:{}),...(e.params?{params:e.params.parse(input.params)}:{}),...(e.query?{query:e.query.parse(input.query)}:{})};
   let timer:ReturnType<typeof setTimeout>|undefined;const requestMs=Math.min(900000,remaining);
   try{
    const result=await Promise.race([compositeTransport.request(e,parsed,ctx),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('ORIGINAL_PUBLIC_REQUEST_OBSERVATION_EXPIRED_NO_RETRY')),requestMs);})]);
    const data=(result as {data:any}).data;if(e.isList){for(const row of data)e.response.parse(row);}else e.response.parse(data);
    requests.push({id:e.id,ctx,params:parsed.params??null,body:parsed.body??null,result:data,requestMs,originalDeadlineAt:new Date(deadline).toISOString()});return data;
   }catch(error){requests.push({id:e.id,ctx,params:parsed.params??null,error:{name:error instanceof Error?error.name:'Other',message:error instanceof Error?error.message:String(error)},requestMs});throw error;}
   finally{if(timer)clearTimeout(timer);}
  };
  await body(call,user);
 }finally{
  try{const actualDb=owned.db as Db|null;if(actualDb){save(dbPhase===phase?'DOMAIN_FINAL':'HISTORY_DOMAIN_FINAL',await snapshot());save(dbPhase===phase?'ZERO_MODEL':'HISTORY_ZERO_MODEL',{aiTasks:await actualDb.select().from(aiTasks),executionTasks:await actualDb.select().from(executionTasks),calls:await actualDb.select().from(executionCalls),children:owned.children,network:owned.network,feedback:owned.feedback});}save(dbPhase===phase?'PUBLIC_REQUESTS':'HISTORY_PUBLIC_REQUESTS',requests);}
  finally{try{const dispose=(globalThis as {__creatorosDisposePersistence?:()=>Promise<void>}).__creatorosDisposePersistence;if(typeof dispose==='function'){await dispose();cleanup.persistence='DISPOSED';}else if(cleanup.persistence==='CREATED')cleanup.persistence='DISPOSE_NOT_AVAILABLE';}finally{owned.db=null;__resetPersistenceForTests();vi.unstubAllGlobals();vi.unstubAllEnvs();save(dbPhase===phase?'CLEANUP':'HISTORY_CLEANUP',cleanup);}}
 }
}
function assertOverview(overview:any,f:Family){
 expect.soft(overview.kpis.completedReflows,f.name).toBe(1);
 expect.soft(overview.kpis.avgDeviationBand,f.name).toBe(f.name==='zero'?'high':f.name==='empty'?'none':'low');
 const row=overview.reflowRows.find((r:any)=>r.predictionId===f.prediction.id);expect.soft(row,f.name).toBeTruthy();if(!row)return;
 for(const key of ['hook','cta']){const dim=row.dimensions.find((d:any)=>d.key===key);expect.soft(dim?.actual,f.name+key).toBe((f.result.actualMetrics as any)[key]??null);expect.soft(dim?.deviation,f.name+key).toBe(f.expected[key]??null);}
 if(f.name==='empty'){expect.soft(overview.kpis.latestFinding).toBe('');expect.soft(row.reason).toBe('');expect.soft(row.deviationBand).toBe('none');}
 if(f.name==='partial'){expect.soft(row.reason).not.toContain('开头');expect.soft(overview.kpis.latestFinding).not.toContain('hook');}
}
it('真实公开人工partial/zero/empty→锁定→manual结果→概览/重放，无模型',async()=>{
 await lifecycle(phase,async(call,user)=>{
  const families:Family[]=[];
  for(const name of ['partial','zero','empty']){
   const group=await call(ENDPOINTS.createAccountGroup,{body:{name:'T1339人工隔离-'+name,idempotencyKey:'t1339-'+phase+'-'+name}});
   const ctx={...user,groupId:group.id,groupVersion:group.version,accountId:null};
   const actualMediaRoot=await getStorageRootForRequest(ctx);save(name+'-MEDIA_ROOT',{actualMediaRoot,expected:path.join(base,phase,'media')});expect(actualMediaRoot).toBe(path.join(base,phase,'media'));
   const project=await call(ENDPOINTS.createProject,{body:{title:'人工指标边界测试-'+name}},ctx),output=await call(ENDPOINTS.createOutput,{params:{projectId:project.id},body:{title:'中性作品-'+name}},ctx);
   const rubric=await call(ENDPOINTS.createRubric,{body:{name:'人工公开校准量表',dimensions:[{key:'hook',label:'开头',weight:0.5},{key:'cta',label:'行动',weight:0.5}]}},ctx);
   const prediction=await call(ENDPOINTS.createPrediction,{body:{subjectType:'content_output',subjectId:output.id,rubricVersionId:rubric.currentVersion.id,predictedMetrics:{hook:3,cta:4},predictedConversion:{dimensions:[{key:'hook',score:3},{key:'cta',score:4}]},confidence:'med'}},ctx);
   await call(ENDPOINTS.lockPrediction,{params:{predictionId:prediction.id}},ctx);
   const feedbackBefore=owned.feedback.length;
   const actualMetrics=name==='partial'?{cta:4}:name==='zero'?{hook:0,cta:0}:{};
   const result=await call(ENDPOINTS.createResult,{params:{predictionId:prediction.id},body:{actualMetrics}},ctx);
   families.push({name,ctx,project,output,rubric,prediction,result,expected:name==='partial'?{cta:0}:name==='zero'?{hook:-3,cta:-4}:{},feedbackBefore,feedbackAfter:owned.feedback.length});
  }
  // 所有族先真实完成并保存，RED首个断言不能阻断其余自然旧行的创建。
  save('FIXTURE',{phase,families,manualFixture:true,modelGenerated:false,domain:await snapshot()});
  for(const f of families){
   const before=await snapshot(),overview=await call(ENDPOINTS.overview,{},f.ctx),feedback=owned.feedback.length;
   const again=await call(ENDPOINTS.createResult,{params:{predictionId:f.prediction.id},body:{ingestionRunId:f.result.ingestionRunId,actualMetrics:{hook:9999,cta:9999}}},f.ctx);
   const after=await snapshot();save(f.name+'-proof',{overview,again,before,after,beforeSha:sha(before),afterSha:sha(after),feedbackBefore:feedback,feedbackAfter:owned.feedback.length});
   expect.soft(f.result.deviation,f.name+'原公共DTO').toEqual(f.expected);expect.soft(again.deviation,f.name+'幂等DTO').toEqual(f.expected);expect.soft(again.id).toBe(f.result.id);expect.soft(again.actualMetrics).toEqual(f.result.actualMetrics);expect.soft(after).toEqual(before);expect.soft(owned.feedback.length).toBe(feedback);expect.soft(f.feedbackAfter-f.feedbackBefore,f.name+'首次反馈').toBe(f.name==='empty'?0:1);assertOverview(overview,f);
  }
  const db=owned.db!;expect(await db.select().from(aiTasks)).toEqual([]);expect(await db.select().from(executionTasks)).toEqual([]);expect(await db.select().from(executionCalls)).toEqual([]);expect(owned.network).toEqual([]);expect(owned.children).toEqual([]);
  const foreign=await call(ENDPOINTS.createAccountGroup,{body:{name:'独立归属',idempotencyKey:'t1339-'+phase+'-foreign'}}),ctx={...user,groupId:foreign.id,groupVersion:foreign.version,accountId:null};
  await expect(call(ENDPOINTS.getPrediction,{params:{predictionId:families[0]!.prediction.id}},ctx)).rejects.toThrow();await expect(call(ENDPOINTS.createResult,{params:{predictionId:families[0]!.prediction.id},body:{actualMetrics:{cta:4}}},ctx)).rejects.toThrow();
 });
},3600000);
if(phase==='green-v1')it('同已完成RED owned DB/原IDs：旧坏偏差只读投影及同key重放不回写',async()=>{
 const original=JSON.parse(fs.readFileSync(path.join(base,'red-v1','FIXTURE.json'),'utf8'));
 await lifecycle('red-v1',async(call,user)=>{
  const before=await snapshot();expect(before).toEqual(original.domain);const feedback=owned.feedback.length;
  for(const f of original.families as Family[]){expect(f.ctx.userId).toBe(user.userId);const overview=await call(ENDPOINTS.overview,{},f.ctx),again=await call(ENDPOINTS.createResult,{params:{predictionId:f.prediction.id},body:{ingestionRunId:f.result.ingestionRunId,actualMetrics:{hook:9999,cta:9999}}},f.ctx);save('history-'+f.name,{original:f,overview,again});expect.soft(again.id).toBe(f.result.id);expect.soft(again.ingestionRunId).toBe(f.result.ingestionRunId);expect.soft(again.actualMetrics).toEqual(f.result.actualMetrics);expect.soft(again.deviation).toEqual(f.expected);assertOverview(overview,f);}
  const after=await snapshot();save('HISTORY_IMMUTABILITY',{before,after,beforeSha:sha(before),afterSha:sha(after),feedbackBefore:feedback,feedbackAfter:owned.feedback.length});expect(after).toEqual(before);expect(owned.feedback.length).toBe(feedback);expect(owned.children).toEqual([]);expect(owned.network).toEqual([]);expect(await owned.db!.select().from(aiTasks)).toEqual([]);expect(await owned.db!.select().from(executionTasks)).toEqual([]);expect(await owned.db!.select().from(executionCalls)).toEqual([]);
 });
},3600000);
