import { randomUUID, createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { ENDPOINTS } from '@creatoros/contract';
import type { Page, TestInfo } from '@playwright/test';
import { expect as baseExpect } from '../../tests-t1246-generated/helpers/test-environment';
export const expect = baseExpect.configure({timeout:120000});
export const REQUEST=120000;
// 原普通持久任务默认30分钟，观察额外覆盖一个120秒请求及60秒结算；绝不写入/延长原任务deadline。
export const OBSERVE=1980000;
export const widths=[{width:1366,height:900},{width:390,height:844}];
export const key=()=>`t1246-${randomUUID()}`;
export const TEXT='这是一份测试用户明确提供的普通知识资料：整理桌面时，先把物品分为正在使用、需要保留和暂时不需要三类。每周花十分钟检查，减少寻找物品的时间。本例不包含外部统计、报价或平台发布行为。';
export class Blocked extends Error { constructor(public reason:string,public detail:unknown){super(`T1246_BLOCKED: ${reason}`);} }
const sanitize=(value:any):any=>Array.isArray(value)?value.map(sanitize):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([k])=>!['secret','token','apiKey','authorization','cookie','secretReference'].includes(k)).map(([k,v])=>[k,sanitize(v)])):value;
export class Journey {
  readonly startedAt=new Date().toISOString();
  groupId=''; articleOutput:any;graphicOutput:any; project:any; output:any; script:any; scriptVersion:any;
  receipts:any[]=[]; tasks:any[]=[]; captures:any[]=[]; events:any[]=[]; probes=0;
  constructor(public page:Page, public info:TestInfo,public caseId:string,public generationKey:string|null,public boundary:string) {
    page.on('console',m=>{if(m.type()==='error')this.events.push({kind:'console',text:m.text()});});
    page.on('pageerror',e=>this.events.push({kind:'pageerror',text:e.message}));
    page.on('requestfailed',r=>this.events.push({kind:'requestfailed',url:r.url(),error:r.failure()?.errorText}));
    page.on('request',r=>{if(new URL(r.url()).pathname!='/api/v1/dispatch')return;try{const p=r.postDataJSON();if(p?.id==='settings.models.test')this.probes++;}catch{}});
  }
  async raw(id:string,input:any={},group=this.groupId) {
    const definition:any=Object.values(ENDPOINTS).find((e:any)=>e.id===id);
    if(!definition)throw Error(`冻结合同中不存在操作 ${id}`);
    // 本轮写测试数据也走真实公共合同。禁止将 fixture 响应替换成业务成功。
    for(const part of ['params','query','body'])if(definition[part])definition[part].parse(input[part]);
    const response=await this.page.request.post('/api/v1/dispatch',{timeout:REQUEST,headers:group?{'x-group-id':group}:{},data:{id,input}});
    const envelope=await response.json();
    this.receipts.push({time:new Date().toISOString(),id,input:sanitize(input),groupId:group,status:response.status(),body:sanitize(envelope)});
    return {response,envelope};
  }
  async op(id:string,input:any={},group=this.groupId):Promise<any> {const {response,envelope}=await this.raw(id,input,group);expect(response.ok(),`${id}: ${JSON.stringify(envelope.error)}`).toBe(true);return envelope.data;}
  async setup(codex=true) {
    this.page.setDefaultTimeout(REQUEST);this.page.setDefaultNavigationTimeout(REQUEST);
    const group=await this.op('accountGroups.create',{body:{name:`整合验收-${this.caseId}-${key()}`,idempotencyKey:key()}},''); this.groupId=group.id;
    const url=this.info.project.use.baseURL as string;
    await this.page.context().addCookies([{name:'creatoros_current_group',value:group.id,url}]);
    await this.page.addInitScript(id=>{localStorage.setItem('creatoros:current-group',id);localStorage.removeItem('creatoros:current-account');localStorage.setItem('creatoros:onboarding:hidden','1');},group.id);
    await this.page.goto('/');
    if(codex)await this.op('settings.preferences.patch',{body:{assistantExecutionEngine:'codex'}});
    this.project=await this.op('projects.create',{body:{title:`整合真实项目-${this.caseId}`,brief:TEXT}});
    this.output=await this.op('projects.outputs.create',{params:{projectId:this.project.id},body:{title:'本轮原始视频稿',contentType:'video',clientRequestId:key()}});
    this.script=await this.op('artifacts.create',{params:{projectId:this.project.id},body:{title:'原始测试文稿',artifactType:'output_script',stage:'script',contentOutputId:this.output.id}});
    this.scriptVersion=await this.op('artifacts.versions.create',{params:{artifactId:this.script.id},body:{contentText:TEXT,changeSummary:'用户明确输入的验收稿，不冒充模型产物',contentData:{sections:[{id:'section-main',heading:'桌面整理',body:TEXT}]}}});
  }
  async noIndependentModels() {
    const models=await this.op('settings.models.list');expect(models, '新增原生批次须使用全新私有数据根；原套件的 API 模型配置不能污染本例').toEqual([]);
    const pref=await this.op('settings.preferences.get');expect(pref.assistantExecutionEngine).toBe('codex');
  }
  async nativeAvailable(image=false) {
    const r=await this.page.request.get('/api/chat/engines',{timeout:REQUEST});const body=await r.json();this.receipts.push({id:'/api/chat/engines',status:r.status(),body:sanitize(body)});
    expect(r.ok()).toBe(true);const engine=body.engines?.find((e:any)=>e.engine==='codex');
    if(!engine?.available)throw new Blocked('官方本地 Codex 未就绪',engine??body);
    if(image&&engine.capabilities?.imageGeneration!==true)throw new Blocked('官方账户生图能力未就绪',engine);
  }
  async uiOp(id:string,trigger:()=>Promise<void>) {
    const pending=this.page.waitForResponse(r=>{if(new URL(r.url()).pathname!=='/api/v1/dispatch')return false;try{return r.request().postDataJSON().id===id;}catch{return false;}},{timeout:REQUEST});
    await trigger();const response=await pending;const request=response.request().postDataJSON(),envelope=await response.json();this.receipts.push({surface:'browser-ui-trigger',id,input:sanitize(request.input),status:response.status(),body:sanitize(envelope)});expect(response.ok(),JSON.stringify(envelope)).toBe(true);return envelope.data;
  }
  async shot(label:string) { const path=this.info.outputPath(`${label}.png`);await this.page.screenshot({path,fullPage:true,timeout:REQUEST});await this.info.attach(label,{path,contentType:'image/png'});this.captures.push({label,path,url:this.page.url(),viewport:this.page.viewportSize(),at:new Date().toISOString()}); }
  async view(path:string,label:string) {const response=await this.page.goto(path);expect(response?.status(),`真实入口 ${path} 不能把404页面当成功`).toBe(200);await expect(this.page.locator('main').first()).toBeVisible();await this.shot(label);}
  async responsive(path:string,label:string) {for(const viewport of widths){await this.page.setViewportSize(viewport);await this.view(path,`${label}-${viewport.width}`);const box=await this.page.evaluate(()=>({width:innerWidth,body:document.body.scrollWidth}));expect(box.body,`${label} 全页横向溢出`).toBeLessThanOrEqual(box.width+2);} }
  async task(taskType:string,inputData:any) {const task=await this.op('ai.tasks.create',{body:{taskType,attemptId:key(),inputData}});this.tasks.push({created:task});expect(task.taskType).toBe(taskType);expect(task.groupId).toBe(this.groupId);return task;}
  async waitTask(task:any) {
    let observed:any=task;
    try {await expect.poll(async()=>{observed=await this.op('ai.tasks.get',{params:{taskId:task.id}});return ['awaiting_confirmation','succeeded','failed','cancelled'].includes(observed.status)||['unknown_result','waiting_user'].includes(observed.runtimeStatus);},{timeout:OBSERVE,intervals:[500,1000,2000,4000],message:`只观察原任务 ${task.id}，不重发/续期`}).toBe(true);}
    finally {this.tasks.find(t=>t.created.id===task.id).observed=observed;}
    expect(observed.id).toBe(task.id);expect(observed.attemptId).toBe(task.attemptId);
    if(observed.runtimeStatus==='waiting_user' && ['CODEX_LOGIN_REQUIRED','CODEX_IMAGE_CAPABILITY_UNAVAILABLE','FLYWHEEL_LOGIN_REQUIRED'].includes(observed.errorCode))throw new Blocked('原任务明确等待外部能力，保原 ID',observed);
    expect(['awaiting_confirmation','succeeded'],JSON.stringify({taskId:task.id,status:observed.status,runtimeStatus:observed.runtimeStatus,error:observed.errorMessage})).toContain(observed.status);
    expect(observed.executionTaskId,'真实生成须绑定原执行任务').toBeTruthy();
    const execution=await this.op('execution.tasks.get',{params:{taskId:observed.executionTaskId}});expect(execution.ownerId).toBe(task.id);expect(execution.groupId).toBe(this.groupId);
    const results=await this.op('ai.tasks.results.list',{params:{taskId:task.id}});if(task.taskType!=='copilot.assist')expect(results.length,'成功生成任务必须有真实候选/结果').toBeGreaterThan(0);this.tasks.find(t=>t.created.id===task.id).results=results;
    expect(this.probes,'本浏览器不得触发独立模型探针').toBe(0);
    // modelKey 是公开投影证据；Worker 是否 API=0 另由停止后的原 call ledger 对账，不能由浏览器猜测。
    expect(observed.modelKey).toBe('codex');return {task:observed,results,execution};
  }
  async verifyGeneratedAsset(outcome:any) {
    const candidate=outcome.results.find((r:any)=>r.resultType==='generated_asset');expect(candidate,'需原生成候选回执').toBeTruthy();const assetId=candidate.assetId??candidate.resultData?.assetId;expect(assetId).toBeTruthy();
    const before=await this.op('assets.get',{params:{assetId}});expect(before.status).toBe('pending');
    await this.op('ai.tasks.confirm',{params:{taskId:outcome.task.id}});const confirmed=await this.op('ai.tasks.get',{params:{taskId:outcome.task.id}});expect(confirmed.status).toBe('succeeded');expect(confirmed.id).toBe(outcome.task.id);
    const asset=await this.op('assets.get',{params:{assetId}});expect(asset.status).toBe('active');expect(asset.currentFileId).toBe(before.currentFileId);
    const download=await this.op('assets.fileDownloadUrl',{params:{assetId,assetFileId:asset.currentFileId}});const url=new URL(download.url,this.page.url());expect(['127.0.0.1','localhost']).toContain(url.hostname);
    const blob=await this.page.request.get(url.toString(),{timeout:REQUEST});expect(blob.status()).toBe(200);expect(blob.headers()['content-type']).toMatch(/^image\//);const bytes=await blob.body();expect(bytes.length).toBeGreaterThan(0);expect(bytes.length).toBe(asset.fileSize);expect(blob.headers()['content-type'].split(';')[0]).toBe(asset.mimeType);this.receipts.push({id:'original-generated-asset-byte-readback',assetId,fileId:asset.currentFileId,status:blob.status(),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),contentType:blob.headers()['content-type']});
    await this.responsive('/assets','adopted-image');
  }
  async generate(taskType:string,input:any,path:string) {await this.noIndependentModels();await this.nativeAvailable(taskType==='asset.generate'||taskType==='cover.generate');await this.responsive(path,'before');const task=await this.task(taskType,input);const outcome=await this.waitTask(task);if(['asset.generate','cover.generate'].includes(taskType))await this.verifyGeneratedAsset(outcome);await this.page.reload();await this.shot('after-original-id');return outcome;}
  async report(error?:unknown) {
    const browserStepStatus=error instanceof Blocked?'blocked':error?'fail':'pass';const status=(this.generationKey||this.tasks.length)&&!error?'pending_ledger':browserStepStatus;
    const value={task:'T-1246',candidateCommit:process.env.CREATOROS_T1246_FROZEN_CANDIDATE,testId:this.info.testId,titlePath:this.info.titlePath,caseId:this.caseId,generationKey:this.generationKey,boundary:this.boundary,status,browserStepStatus,acceptanceRequiresOriginalLedger:!!this.generationKey||this.tasks.length>0,startedAt:this.startedAt,endedAt:new Date().toISOString(),groupId:this.groupId,projectId:this.project?.id,taskIds:this.tasks.map(t=>t.created.id),tasks:this.tasks,receipts:this.receipts,captures:this.captures,events:this.events,independentBrowserModelProbes:this.probes,workerApiZero:'须独立对账原持久 ledger；此回执不代签',error:error instanceof Error?{name:error.name,message:error.message,...(error instanceof Blocked?{detail:error.detail}:{})}:error};
    const path=this.info.outputPath('journey.json');await writeFile(path,JSON.stringify(sanitize(value),null,2));await this.info.attach('真实旅程回执',{path,contentType:'application/json'});
  }
}
export async function runJourney(page:Page,info:TestInfo,id:string,generationKey:string|null,boundary:string,body:(j:Journey)=>Promise<void>) {const j=new Journey(page,info,id,generationKey,boundary);let error:unknown;try{await j.setup();await body(j);}catch(e){error=e;throw e;}finally{try{await j.shot('final-state');}catch(e){j.events.push({kind:'capture-error',text:String(e)});if(!error)error=e;}await j.report(error);if(error&&!info.errors.length&&error instanceof Error)throw error;}}
