import {randomUUID,createHash} from 'node:crypto';
import {writeFile,appendFile} from 'node:fs/promises';
import {ENDPOINTS} from '@creatoros/contract';
import {completionWaitMs} from '@creatoros/contract/timeout-policy';
import {test as base,expect as baseExpect,type Page,type TestInfo} from '@playwright/test';
// 独立证据仅使用testInfo.outputPath，不继承旧T1207全局写输出helper。
export const REQUEST=120_000, OBSERVE=1_980_000;
export const UI_OPERATION=REQUEST*2+60_000;
export const WORKSPACE_READY_OBSERVE=completionWaitMs([REQUEST,REQUEST]); // 原列表与RSC同步各120s，观察不续生产期限。
export const CASE_BUDGET=72_000_000; // consumer清单由driver/budget-consumers.json实核；不改变持久期限。
export const expect=baseExpect.configure({timeout:REQUEST});
export const widths=[{width:1366,height:900},{width:390,height:844}];
export const key=()=>`t1246-${randomUUID()}`;
export const TEXT='这是一份测试用户明确提供的普通知识资料：整理桌面时，先把物品分为正在使用、需要保留和暂时不需要三类。每周花十分钟检查，减少寻找物品的时间。本例不包含外部统计、报价或平台发布行为。';
export const test=base.extend({context:async({context,baseURL},use,info)=>{
 const origin=new URL(baseURL!).origin;const denied:Array<{type:string;url:string}>=[];
 const local=(u:string)=>{const url=new URL(u);return ['data:','blob:','about:'].includes(url.protocol)||url.origin===origin||['ws:','wss:'].includes(url.protocol)&&url.hostname===new URL(origin).hostname&&url.port===new URL(origin).port;};
 await context.route('**/*',async r=>{if(!local(r.request().url())){const u=new URL(r.request().url());denied.push({type:'http',url:u.origin+u.pathname});await r.abort('blockedbyclient');}else await r.continue();});
 await context.routeWebSocket('**/*',async s=>{if(!local(s.url())){const u=new URL(s.url());denied.push({type:'ws',url:u.origin+u.pathname});await s.close({code:1008,reason:'本轮浏览器禁止外网'});}else s.connectToServer();});
 await use(context);expect(denied,'浏览器外网请求不能默默忽略').toEqual([]);
 // 新增原完整body只换该helper。附加只读对账，不改原输入、断言或采纳事务。
 if(info.title.startsWith('T1097 公共文章编导：')){
  const attachment=info.attachments.find(a=>a.name==='t1097-original-source-and-adoption');
  if(!attachment){if(info.status==='passed')throw Error('T1097 原body缺真实source回执');return;}
  const bytes=attachment.body??await (await import('node:fs/promises')).readFile(attachment.path!);const original=JSON.parse(bytes.toString());
  const read=async(id:string,input:any)=>{const response=await context.request.post('/api/v1/dispatch',{timeout:REQUEST,headers:{'x-group-id':original.groupId},data:{id,input}});expect(response.ok(),`${id} readonly attachment ${response.status()}`).toBe(true);return (await response.json()).data;};
  const messages=await read('ai.conversations.messages.list',{params:{conversationId:original.conversationId}});const assistant=messages.find((m:any)=>m.role==='assistant'&&m.modelMetadata?.sourceMessageId===original.sourceMessageId);
  expect(assistant).toBeTruthy();expect(assistant.modelMetadata.actualEngine).toBe('codex');expect(assistant.modelMetadata.completeness).toBe('completed');const taskId=assistant.modelMetadata.chatTaskId;expect(taskId).toBeTruthy();
  const task=await read('ai.tasks.get',{params:{taskId}});expect(task.groupId).toBe(original.groupId);expect(task.inputData.sourceMessageId).toBe(original.sourceMessageId);expect(task.inputData.conversationId).toBe(original.conversationId);expect(task.executionTaskId).toBeTruthy();
  const execution=await read('execution.tasks.get',{params:{taskId:task.executionTaskId}});expect(execution.ownerId).toBe(task.id);
  const receipt={schemaVersion:1,testId:info.testId,title:info.title,browserStepStatus:info.status,caseId:'T1097-ARTICLE-ASSISTED-'+info.title.split(' ').at(-1),original,taskIds:[task.id],executionTaskId:execution.id,sourceMessageId:original.sourceMessageId,conversationId:original.conversationId,modelMetadata:assistant.modelMetadata,requireOriginalCodexLedger:true,notOfficialPassBeforeLedger:true};const target=info.outputPath('additional-ledger-source.json');await writeFile(target,JSON.stringify(receipt,null,2));await info.attach('T1097原task待只读ledger对账',{path:target,contentType:'application/json'});
 }
 if(info.title.startsWith('T1246 fresh直达设置')||info.title.startsWith('T1246 accounts站内来源')||info.title.startsWith('T1246 站内设置保完整来源')){const target=info.outputPath('settings-original-body.json');await writeFile(target,JSON.stringify({testId:info.testId,title:info.title,status:info.status,inventory:'settings7独立于59/49/38',modelClaim:false},null,2));await info.attach('设置独立原body',{path:target,contentType:'application/json'});}
}});
export class Blocked extends Error {constructor(public reason:string,public detail:unknown){super(`T1246_BLOCKED: ${reason}`);}}
const redact=(v:any):any=>Array.isArray(v)?v.map(redact):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).filter(([k])=>!['secret','token','apiKey','authorization','cookie','secretReference','http_headers','headers'].includes(k)).map(([k,x])=>[k,redact(x)])):v;
export async function observe<T>(read:()=>Promise<T>,done:(v:T)=>boolean,budget=OBSERVE):Promise<T>{
 const end=performance.now()+budget;let value:T;
 for(;;){value=await read();if(done(value))return value;if(performance.now()>=end)throw Error('有限结果观察耗尽，保原任务ID，不重发/续期');await new Promise(r=>setTimeout(r,Math.min(1000,Math.max(1,end-performance.now()))));}
}
export class Journey {
 readonly startedAt=new Date().toISOString();groupId='';accountId:string|undefined;articleOutput:any;graphicOutput:any;project:any;output:any;script:any;scriptVersion:any;
 receipts:any[]=[];tasks:any[]=[];captures:any[]=[];events:any[]=[];probes=0;publicMutations=0;
 constructor(public page:Page,public info:TestInfo,public caseId:string,public generationKey:string|null,public boundary:string){
  page.on('pageerror',e=>this.events.push({kind:'pageerror',text:e.message}));
  page.on('console',m=>{if(m.type()==='error')this.events.push({kind:'console',text:m.text()});});
  page.on('requestfailed',r=>{const u=new URL(r.url());this.events.push({kind:'requestfailed',url:u.origin+u.pathname,error:r.failure()?.errorText});});
  page.on('request',r=>{try{if(new URL(r.url()).pathname==='/api/v1/dispatch'&&r.postDataJSON()?.id==='settings.models.test')this.probes++;}catch{}});
 }
 async raw(id:string,input:any={},group=this.groupId){
  const def:any=Object.values(ENDPOINTS).find((e:any)=>e.id===id);if(!def)throw Error(`当前公共合同不存在操作 ${id}`);
  for(const p of ['params','query','body'])if(def[p])def[p].parse(input[p]);
  const response=await this.page.request.post('/api/v1/dispatch',{timeout:REQUEST,headers:{...(group?{'x-group-id':group}:{}),...(this.accountId?{'x-account-id':this.accountId}:{})},data:{id,input}});
  const envelope=await response.json();this.receipts.push({id,input:redact(input),groupId:group,status:response.status(),body:redact(envelope)});if(def.method!=='GET')this.publicMutations++;return {response,envelope};
 }
 async op(id:string,input:any={},group=this.groupId):Promise<any>{const {response,envelope}=await this.raw(id,input,group);expect(response.ok(),`${id}: ${JSON.stringify(envelope.error)}`).toBe(true);if((Object.values(ENDPOINTS).find((e:any)=>e.id===id) as any)?.response){const def:any=Object.values(ENDPOINTS).find((e:any)=>e.id===id);return def.isList?def.response.array().parse(envelope.data):def.response.parse(envelope.data);}return envelope.data;}
 async setup(codex=true){
  this.page.setDefaultTimeout(REQUEST);this.page.setDefaultNavigationTimeout(REQUEST);
  const g=await this.op('accountGroups.create',{body:{name:`整合验收-${this.caseId}-${key()}`,idempotencyKey:key()}},'');this.groupId=g.id;
  await this.page.context().addCookies([{name:'creatoros_current_group',value:g.id,url:this.info.project.use.baseURL as string}]);
  await this.page.addInitScript(id=>{if(localStorage.getItem('creatoros:current-group')!==id){localStorage.setItem('creatoros:current-group',id);localStorage.removeItem('creatoros:current-account');}localStorage.setItem('creatoros:onboarding:hidden','1');},g.id);
  await this.page.goto('/');if(codex)await this.op('settings.preferences.patch',{body:{assistantExecutionEngine:'codex'}});
  this.project=await this.op('projects.create',{body:{title:`整合真实项目-${this.caseId}`,brief:TEXT}});
  this.output=await this.op('projects.outputs.create',{params:{projectId:this.project.id},body:{title:'本轮原始视频稿',contentType:'video',clientRequestId:key()}});
  this.script=await this.op('artifacts.create',{params:{projectId:this.project.id},body:{title:'原始测试文稿',artifactType:'output_script',stage:'script',contentOutputId:this.output.id}});
  this.scriptVersion=await this.op('artifacts.versions.create',{params:{artifactId:this.script.id},body:{contentText:TEXT,changeSummary:'用户明确输入，不冒充模型产物',contentData:{sections:[{id:'section-main',heading:'桌面整理',body:TEXT}]}}});
 }
 async useAccount(accountId:string){this.accountId=accountId;await this.page.context().addCookies([{name:'creatoros_current_account',value:accountId,url:this.info.project.use.baseURL as string}]);await this.page.evaluate(id=>localStorage.setItem('creatoros:current-account',id),accountId);}
 async noIndependentModels(){
  const models=await this.op('settings.models.list');const capabilities=['research.analyze','planning.contract','planning.outline','script.rewrite','copy.generate','review.insights','copilot.assist'];
  expect(models).toHaveLength(7);expect(models.map((m:any)=>m.capability).sort()).toEqual([...capabilities].sort());
  expect(new Set(models.map((m:any)=>m.userId)).size).toBe(1);
  for(const m of models){expect(m.provider).toBe('');expect(m.modelName).toBe('');expect(m.secretReference).toBe('');expect(m.hasSecret).toBe(false);expect(m.baseUrl).toBeNull();}
  expect((await this.op('settings.preferences.get')).assistantExecutionEngine).toBe('codex');
  this.receipts.push({id:'no-independent-models',capabilities,exactEmptyFieldsVerified:true,engine:'codex'});
 }
 async nativeAvailable(image=false){const r=await this.page.request.get('/api/chat/engines',{timeout:REQUEST}),body=await r.json();this.receipts.push({id:'/api/chat/engines',status:r.status(),body:redact(body),notGeneration:true});expect(r.ok()).toBe(true);const e=body.engines?.find((x:any)=>x.engine==='codex');if(!e?.available)throw new Blocked('原官方能力读回显示Codex未就绪',e??body);if(image&&e.capabilities?.imageGeneration!==true)throw new Blocked('原官方能力读回显示生图尚未就绪',e);}
 async uiOp(id:string,trigger:()=>Promise<void>){
  // 响应观察先注册，完整预算覆盖action+HTTP+读包；trigger失败也消费pending，避免unhandled。
  const pending=this.page.waitForResponse(r=>{try{return new URL(r.url()).pathname==='/api/v1/dispatch'&&r.request().postDataJSON().id===id;}catch{return false;}},{timeout:UI_OPERATION});void pending.catch(()=>{});
  try{await trigger();}catch(e){this.events.push({kind:'ui-trigger-failed',operation:id,error:String(e)});throw e;}
  const response=await pending,request=response.request().postDataJSON(),envelope=await response.json();this.receipts.push({surface:'browser-ui-trigger',id,input:redact(request.input),status:response.status(),body:redact(envelope)});expect(response.ok(),JSON.stringify(envelope.error)).toBe(true);return envelope.data;
 }
 async readyPage(){const handle=await this.page.waitForFunction(()=>{const visible=(e:Element)=>e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden';const switchers=[...document.querySelectorAll('[data-testid="account-switcher"]')];return switchers.length===1&&switchers[0].getAttribute('data-state')==='ready'&&![...document.querySelectorAll('[data-testid="workspace-initialization-loading"],[data-testid="workspace-initialization-error"],[data-slot="route-loading"]')].some(visible);},undefined,{timeout:WORKSPACE_READY_OBSERVE});await handle.dispose();}
 async diagnosticShot(label:string){const path=this.info.outputPath(`${label}.png`);await this.page.screenshot({path,fullPage:true,timeout:REQUEST});await this.info.attach(label,{path,contentType:'image/png'});this.captures.push({label,path,url:this.page.url(),viewport:this.page.viewportSize(),at:new Date().toISOString()});}
 async shot(label:string){try{await this.readyPage();}catch(error){this.events.push({kind:'normal-capture-not-ready',label,text:String(error)});try{await this.diagnosticShot(label);}catch(captureError){this.events.push({kind:'diagnostic-capture-error',label,text:String(captureError)});}throw error;}await this.diagnosticShot(label);}
 async view(path:string,label:string){const r=await this.page.goto(path);expect(r?.status()).toBe(200);await expect(this.page.getByTestId('app-shell')).toBeVisible();await expect(this.page.locator('[data-slot="route-loading"]:visible')).toHaveCount(0);await expect(this.page.getByRole('navigation').first()).toBeVisible();expect(await this.page.locator('body').innerText()).not.toMatch(/Application error|Internal Server Error/);await this.shot(label);}
 async responsive(path:string,label:string){for(const v of widths){await this.page.setViewportSize(v);await this.view(path,`${label}-${v.width}`);expect(await this.page.evaluate(()=>document.body.scrollWidth<=innerWidth+2)).toBe(true);}}
 track(task:any){if(!this.tasks.some(t=>t.created.id===task.id))this.tasks.push({created:task});return task;}
 async task(taskType:string,inputData:any){const t=await this.op('ai.tasks.create',{body:{taskType,attemptId:key(),inputData}});this.track(t);expect(t.taskType).toBe(taskType);expect(t.groupId).toBe(this.groupId);return t;}
 async inspectExecution(id:string){const task=await this.op('execution.tasks.get',{params:{taskId:id}});expect(task.groupId).toBe(this.groupId);return task;}
 async waitExecution(task:any){const original=this.track(task);const value=await observe(()=>this.inspectExecution(task.id),t=>['succeeded','failed','cancelled','blocked','paused'].includes(t.status));this.tasks.find(t=>t.created.id===original.id).observed=value;if(value.status==='blocked')throw new Blocked('原公共持久任务确实blocked，模型是否调用由原账本另核',value);expect(value.status).toBe('succeeded');return value;}
 async waitTask(task:any,{resultsRequired=true,engine='codex'}={}){
  this.track(task);let observed:any;try{observed=await observe(()=>this.op('ai.tasks.get',{params:{taskId:task.id}}),t=>['awaiting_confirmation','succeeded','failed','cancelled'].includes(t.status)||['unknown_result','waiting_user'].includes(t.runtimeStatus));}finally{this.tasks.find(t=>t.created.id===task.id).observed=observed;}
  expect(observed.id).toBe(task.id);expect(observed.attemptId).toBe(task.attemptId);
  if(observed.runtimeStatus==='waiting_user')throw new Blocked('原任务实际等待外部资格；未代签后续生成',observed);
  expect(['awaiting_confirmation','succeeded'],JSON.stringify(observed)).toContain(observed.status);expect(observed.executionTaskId).toBeTruthy();if(task.taskType!=='copilot.assist')expect(observed.modelKey).toBe(engine);else this.receipts.push({id:'chat-route-must-be-ledger-proven',taskId:task.id,reportedModelKey:observed.modelKey,expectedEngine:engine});
  const execution=await this.inspectExecution(observed.executionTaskId);expect(execution.ownerId).toBe(task.id);
  const results=await this.op('ai.tasks.results.list',{params:{taskId:task.id}});if(resultsRequired&&task.taskType!=='copilot.assist')expect(results.length).toBeGreaterThan(0);this.tasks.find(t=>t.created.id===task.id).results=results;expect(this.probes).toBe(0);return {task:observed,results,execution};
 }
 async imageBytes(assetId:string,fileId:string,label:string){const a=await this.op('assets.get',{params:{assetId}});expect(a.currentFileId).toBe(fileId);const d=await this.op('assets.fileDownloadUrl',{params:{assetId,assetFileId:fileId}}),u=new URL(d.url,this.page.url());expect(u.origin).toBe(new URL(this.page.url()).origin);const b=await this.page.request.get(u.href,{timeout:REQUEST});expect(b.status()).toBe(200);const bytes=await b.body(),mime=b.headers()['content-type'].split(';')[0];expect(bytes.length).toBe(a.fileSize);expect(mime).toBe(a.mimeType);expect(mime).toMatch(/^image\//);const proof={id:label,assetId,fileId,status:200,bytes:bytes.length,mimeType:mime,sha256:createHash('sha256').update(bytes).digest('hex')};this.receipts.push(proof);return proof;}
 async verifyGeneratedAsset(outcome:any){const c=outcome.results.find((r:any)=>r.resultType==='generated_asset');expect(c).toBeTruthy();const assetId=c.assetId??c.resultData?.assetId;expect(assetId).toBeTruthy();const a=await this.op('assets.get',{params:{assetId}});expect(a.status).toBe('pending');expect(a.currentFileId).toBeTruthy();await this.imageBytes(a.id,a.currentFileId,'pending-original-generated-image');await this.op('ai.tasks.confirm',{params:{taskId:outcome.task.id}});const active=await this.op('assets.get',{params:{assetId}});expect(active.status).toBe('active');await this.imageBytes(a.id,a.currentFileId,'adopted-original-generated-image');await this.responsive('/assets','adopted-image');await expect(this.page.locator(`[data-asset-id="${a.id}"]`)).toBeVisible();await this.shot('same-asset-id-ui');}
 async generate(taskType:string,input:any,path:string){await this.noIndependentModels();await this.nativeAvailable(['asset.generate','cover.generate'].includes(taskType));await this.responsive(path,'before');const task=await this.task(taskType,input),o=await this.waitTask(task,{resultsRequired:!['reconstruct.project','asset.classify','material.extract'].includes(taskType)});this.receipts.push({id:'direct-generation-surface',surface:'public-backend-API',taskId:task.id,notUISuccess:true});if(['asset.generate','cover.generate'].includes(taskType))await this.verifyGeneratedAsset(o);await this.page.reload();await this.shot('after-original-id');return o;}
 async report(error?:unknown){const browserStepStatus=error instanceof Blocked?'blocked':error?'fail':'pass',status=!error&&(this.generationKey||this.tasks.length)?'pending_ledger':browserStepStatus;const value={schemaVersion:3,task:'T-1246',candidateCommit:process.env.CREATOROS_T1246_FROZEN_CANDIDATE,profile:process.env.CREATOROS_T1246_PROFILE,testId:this.info.testId,titlePath:this.info.titlePath,caseId:this.caseId,generationKey:this.generationKey,boundary:this.boundary,status,browserStepStatus,startedAt:this.startedAt,endedAt:new Date().toISOString(),groupId:this.groupId,projectId:this.project?.id,taskIds:this.tasks.map(t=>t.created.id),tasks:this.tasks,receipts:this.receipts,captures:this.captures,events:this.events,probes:this.probes,ledgerStatus:'未对账不能签pass',error:error instanceof Error?{name:error.name,message:error.message,...(error instanceof Blocked?{detail:error.detail}:{})}:error};const p=this.info.outputPath('journey.json');await writeFile(p,JSON.stringify(redact(value),null,2));await this.info.attach('真实旅程回执',{path:p,contentType:'application/json'});if(process.env.CREATOROS_T1246_LIVE_ISSUES)await appendFile(process.env.CREATOROS_T1246_LIVE_ISSUES,JSON.stringify({testId:this.info.testId,status,error:redact(value.error),receiptPath:p})+'\n');}
}
export async function runJourney(page:Page,info:TestInfo,id:string,generationKey:string|null,boundary:string,body:(j:Journey)=>Promise<void>){const j=new Journey(page,info,id,generationKey,boundary);let error:unknown;try{await j.setup();await body(j);}catch(e){error=e;throw e;}finally{try{if(error)await j.diagnosticShot('final-state');else await j.shot('final-state');}catch(e){j.events.push({kind:'capture-error',text:String(e)});if(!error)error=e;}await j.report(error);if(error&&!info.errors.length)throw error;}}
