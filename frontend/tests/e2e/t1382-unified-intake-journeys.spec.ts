import {test as base,expect,request as requestFactory,type Page,type TestInfo} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {ENDPOINTS,type ProjectPreparationResource,type AccountGroupResource} from '@creatoros/contract';

type Project={id:string;title:string;source:string;brief:string};
type RadarRow={item:{id:string;title:string;projectId?:string;platform:string}};
type Candidate={id:string;title:string;status:string};
type Ensure={project:Project;preparationTaskId:string|null;sourceReferences:Array<{itemId?:string}>;reused:boolean};
type Input={params?:unknown;query?:unknown;body?:unknown};
type Evidence={id:string;role:string;evidence_ref:string};
type Copy={checkpoint:string;check_ids:string[];viewport:{width:number;height:number}|null;text:string;screenshot_ref:string};
const CASES=[
 ['J01-home-navigation','AC-1382-HOME'],['J02-project-list-detail','AC-1382-PROJECT'],
 ['J03-manual-create','AC-1382-MANUAL'],['J04-quick-source','AC-1382-QUICK-SOURCE'],
 ['J05-quick-empty','AC-1382-QUICK-EMPTY'],['J06-radar-idempotency','AC-1382-RADAR'],
 ['J07-topic-upgrade','AC-1382-TOPIC'],['J08-preparation-controls','AC-1382-CONTROLS'],
 ['J09-transcript-ready','AC-1382-TRANSCRIPT'],['J10-settings-assistant-reference','AC-1382-SETTINGS-REF'],
] as const;
const requestMs=120_000;
const slot=(page:Page,name:string)=>page.locator(`[data-slot="${name}"]`);
function operationId(request:{url():string;method():string;postDataJSON():unknown}){
 if(new URL(request.url()).pathname!=='/api/v1/dispatch'||request.method()!=='POST')return null;
 try{return (request.postDataJSON() as {id?:string}).id??null;}catch{return null;}
}
class Journey {
 readonly operations:unknown[]=[];readonly readbacks:unknown[]=[];readonly witnesses:Evidence[]=[];readonly visible:Copy[]=[];
 readonly conditions:Array<{condition:string;result:string;evidence_refs:string[]}>=[];
 readonly directory:string;group!:AccountGroupResource;completed=false;
 constructor(readonly page:Page,readonly info:TestInfo,readonly id:string,readonly check:string,readonly runDir:string){
  this.directory=resolve(runDir,'cases',info.project.name,id);mkdirSync(this.directory,{recursive:true});
 }
 witnessEntity(id:string,role:string){this.witnesses.push({id:createHash('sha256').update(id).digest('hex').slice(0,20),role,evidence_ref:this.ref('readback.json')});}
 ref(name:string){return relative(this.runDir,resolve(this.directory,name)).split('\\').join('/');}
 async call<T>(id:string,input:Input={},scope:{groupId?:string;accountId?:string}={groupId:this.group?.id}):Promise<T>{
  const state=scope.accountId&&!scope.groupId?await this.page.context().storageState():null;
  const isolated=state?await requestFactory.newContext({baseURL:process.env.T1382_JOURNEY_BASE_URL,storageState:{...state,cookies:state.cookies.filter(c=>!['creatoros_current_group','creatoros_current_account'].includes(c.name))}}):null;
  try{
  const response=await (isolated??this.page.request).post('/api/v1/dispatch',{timeout:requestMs,headers:{...(scope.groupId?{'x-group-id':scope.groupId}:{}),...(scope.accountId?{'x-account-id':scope.accountId}:{})},data:{id,input}});
  const data=await response.json();this.operations.push({at:new Date().toISOString(),kind:'dispatch',id,input,scope,workspaceCookiesRemoved:Boolean(isolated),status:response.status()});
  this.readbacks.push({id,status:response.status(),data});
  expect(response.ok(),`${id} HTTP ${response.status()}: ${JSON.stringify(data.error??null)}`).toBe(true);
  return data.data as T;
  }finally{await isolated?.dispose();}
 }
 async capture(name:string){
  const file=`capture-${String(this.visible.length+1).padStart(2,'0')}-${name}.png`;
  await this.page.screenshot({path:resolve(this.directory,file),fullPage:false,animations:'disabled',timeout:requestMs});
  const text=await this.page.locator('body').innerText({timeout:requestMs});
  this.visible.push({checkpoint:name,check_ids:[this.check],viewport:this.page.viewportSize(),text,screenshot_ref:this.ref(file)});
  return this.ref(file);
 }
 async refresh(){await this.page.reload();await expect(slot(this.page,'project-pipeline')).toBeVisible();this.conditions.push({condition:'refresh',result:'pass',evidence_refs:[await this.capture('refreshed')]});}
 async project(id:string){const p=await this.call<Project>('projects.get',{params:{projectId:id}});await expect(slot(this.page,'header-project-identity')).toContainText(p.title);await expect(slot(this.page,'project-pipeline')).toBeVisible();return p;}
 prep(id:string){return this.call<ProjectPreparationResource>('projects.preparation.get',{params:{projectId:id}});}
 async currentProject(){await expect(this.page).toHaveURL(/\/projects\/project-[^/?#]+$/);return decodeURIComponent(new URL(this.page.url()).pathname.split('/').at(-1)!);}
 async create(mode:'manual'|'quick_create',suffix:string,source?:RadarRow){
  const title=`${suffix}｜${this.info.project.name==='t1382-normal'?'常规窗口':'最小窗口'}走查 ${new Date().toLocaleTimeString('zh-CN')}`;
  await this.page.goto(mode==='manual'?'/projects/new':`/projects/create${source?`?sourceItemId=${encodeURIComponent(source.item.id)}`:''}`);
  const form=slot(this.page,'new-project-form');await expect(form).toBeVisible();
  await form.locator('#new-project-name-input').fill(title);
  if(process.env.T1382_JOURNEY_MODE==='red'&&this.id==='J03-manual-create'){
   await form.locator('[data-slot="new-project-submit"]').click();
   // 真正的公开创建被阻断后，下面正常产品断言自然失败；无手动 throw 或假响应。
   await expect(this.page).toHaveURL(/\/projects\/project-[^/?#]+$/);return {id:'',title};
  }
  const response=this.page.waitForResponse(r=>operationId(r.request())==='projects.ensure',{timeout:requestMs});
  await form.locator('[data-slot="new-project-submit"]').click();
  const result=await response;this.operations.push({kind:'ui-create',source:mode,status:result.status()});
  expect(result.ok()).toBe(true);const id=await this.currentProject();const persisted=await this.project(id);
  expect(persisted).toMatchObject({id,title,source:mode});this.witnessEntity(id,'本轮副本中经用户界面保存的项目');return {id,title};
 }
 async source(needsTranscript=false){
  const rows=await this.call<RadarRow[]>('intelligence.items.list',{query:{page:1,pageSize:100,sort:'published_desc',...(needsTranscript?{transcriptState:'not_extracted'}:{})}});
  expect(rows.length,'复制库必须有真实雷达素材；缺失属于前置失败，不能造假seed').toBeGreaterThan(0);
  const row=rows.find(r=>!r.item.projectId)??rows[0]!;
  const detail=await this.call<{snapshots:Array<{id:string}>;item:RadarRow['item']}>('intelligence.items.get',{params:{itemId:row.item.id}});
  expect(detail.snapshots.length,'来源必须有真实snapshot').toBeGreaterThan(0);this.witnessEntity(row.item.id,'已装账号副本的真实来源作品');return row;
 }
 async setup(){
  const groups=await this.call<AccountGroupResource[]>('accountGroups.list',{query:{page:1,pageSize:100}},{});
  // 只读公开列表找真实有素材的账号组；不使用写死的已装账号/作品 ID。
  let selected:AccountGroupResource|undefined;
  for(const group of groups.filter(g=>g.status==='active')){
   const rows=await this.call<RadarRow[]>('intelligence.items.list',{query:{page:1,pageSize:1,sort:'published_desc'}},{groupId:group.id});
   if(rows.length){selected=group;break;}
  }
  expect(selected,'复制库需有可见的真实账号组与素材').toBeTruthy();this.group=selected!;this.witnessEntity(this.group.id,'已装账号副本的真实账号组');
  await this.page.context().addCookies([{name:'creatoros_current_group',value:encodeURIComponent(this.group.id),url:process.env.T1382_JOURNEY_BASE_URL!}]);
  await this.page.addInitScript(id=>{localStorage.setItem('creatoros:current-group',id);localStorage.removeItem('creatoros:current-account');localStorage.setItem('creatoros:onboarding:hidden','1');},this.group.id);
  // 只改本轮副本内的模型选择。所有新文本任务固定到空 CODEX_HOME 的 Codex，不能落到已装密钥。
  const routing=ENDPOINTS.getModelRouting.response.parse(await this.call('settings.modelRouting.get'));
  const choices={...(routing.choices??routing.effectiveChoices),text:'codex' as const};
  if((routing.choices??routing.effectiveChoices).text!=='codex'){this.operations.push({kind:'isolation-config-write',copyOnly:true,setting:'text-model-source',value:'codex',originalDatabaseOpened:false});await this.call('settings.modelRouting.put',{body:{schemaVersion:1,choices,expectedRevision:routing.revision}});}
 }
 async finish(){
  const failed=this.info.errors.length>0||!this.completed;
  if(failed)await this.capture('failure').catch(error=>this.operations.push({kind:'failure-capture-error',message:String(error)}));
  writeFileSync(resolve(this.directory,'operations.json'),JSON.stringify(this.operations,null,2)+'\n');
  writeFileSync(resolve(this.directory,'readback.json'),JSON.stringify(this.readbacks,null,2)+'\n');
  const refs=[this.ref('operations.json'),this.ref('readback.json'),...this.visible.map(c=>c.screenshot_ref)];
  const witness={schema:'t1382-journey-witness/v1',task_id:'T-1382',run_id:process.env.T1382_JOURNEY_RUN_ID,commit_sha:process.env.T1382_JOURNEY_COMMIT_SHA,contract_sha:process.env.T1382_JOURNEY_CONTRACT_SHA,
   mode:process.env.T1382_JOURNEY_MODE,test_id:this.id,playwright_test_id:this.info.testId,journey_id:this.id,viewport:this.page.viewportSize(),status:failed?'failed':'passed',
   checks:[{id:this.check,result:failed?'fail':'pass',evidence_refs:refs}],conditions:this.conditions,
   witnesses:this.witnesses,
   visible_copy:this.visible,assertions_completed:!failed,failure:failed?this.info.errors.map(e=>({message:e.message,stack:e.stack})):null};
  const file=resolve(this.directory,'witness.json');writeFileSync(file,JSON.stringify(witness,null,2)+'\n');
  await this.info.attach('journey-witness',{path:file,contentType:'application/json'});
 }
}
const test=base.extend<{journey:Journey}>({journey:async({page,context,baseURL},runJourney,info)=>{
 // --list 导入不会执行；真实运行必须由隔离 runner 提供完整 provenance。
 for(const name of ['T1382_JOURNEY_RUN_DIR','T1382_JOURNEY_RUN_ID','T1382_JOURNEY_COMMIT_SHA','T1382_JOURNEY_CONTRACT_SHA'])expect(process.env[name],`缺 ${name}，请经专用 runner 执行`).toBeTruthy();
 const definition=CASES.find(([id])=>info.title.startsWith(id));expect(definition).toBeTruthy();
 const j=new Journey(page,info,definition![0],definition![1],process.env.T1382_JOURNEY_RUN_DIR!);
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(['data:','blob:','about:'].includes(url.protocol)){await route.continue();return;}
  if(url.origin!==new URL(baseURL!).origin){j.operations.push({kind:'external-request-blocked',method:request.method(),url:url.origin+url.pathname});await route.abort('blockedbyclient');return;}
  if(process.env.T1382_JOURNEY_MODE==='red'&&j.id==='J03-manual-create'&&operationId(request)==='projects.ensure'){
   j.operations.push({kind:'red-fault',fault:'abort-projects.ensure',method:request.method(),url:url.pathname});await route.abort('failed');writeFileSync(resolve(j.runDir,'red-sentinel.json'),JSON.stringify({run_id:process.env.T1382_JOURNEY_RUN_ID,test_id:j.id,check_id:j.check,request_blocked:true},null,2)+'\n');return;
  }
  await route.continue();
 });
 try{await j.setup();await runJourney(j);}finally{await j.finish();}
}});

test('J01-home-navigation 首页到真实创作入口并返回',async({page,journey:j})=>{
 await page.goto('/');await expect(slot(page,'dashboard-projects-link')).toBeVisible();await j.capture('home');
 const nav=slot(page,'studio-journey');await nav.getByRole('link',{name:'观察信源',exact:true}).click();await expect(page.getByTestId('intelligence-workbench')).toBeVisible();
 await page.goBack();await expect(slot(page,'dashboard-projects-link')).toBeVisible();j.conditions.push({condition:'back',result:'pass',evidence_refs:[await j.capture('home-return')]});j.completed=true;
});
test('J02-project-list-detail 项目列表打开详情刷新保留',async({page,journey:j})=>{
 await page.goto('/projects');const row=slot(page,'project-row').first();await expect(row).toBeVisible();const id=await row.getAttribute('data-project-id');expect(id).toBeTruthy();
 const open=row.locator('[data-slot="project-open-action"]'),href=await open.getAttribute('href');expect(href).toMatch(/^\/projects\//);
 const project=await j.call<Project>('projects.get',{params:{projectId:id}});await open.click();await expect.poll(()=>new URL(page.url()).pathname,{timeout:requestMs}).toBe(href);
 // 列表的“打开”按真实阶段进入稿面、制作或复盘；已发布项目不能硬断言成稿面。
 await expect(page.locator('main').first()).toBeVisible();await expect(page.locator('body')).toContainText(project.title);await j.capture('project-detail');
 await page.reload();await expect(page.locator('main').first()).toBeVisible();await expect(page.locator('body')).toContainText(project.title);expect((await j.call<Project>('projects.get',{params:{projectId:id}})).id).toBe(id);
 j.conditions.push({condition:'refresh',result:'pass',evidence_refs:[await j.capture('project-detail-refreshed')]});j.completed=true;
});
test('J03-manual-create 手动新建空描述真实保存',async({journey:j})=>{
 const p=await j.create('manual','手动空描述');const state=await j.prep(p.id);expect(state).toMatchObject({origin:'manual',registration:'not_registered',sourceReferences:[]});
 await expect(slot(j.page,'project-pipeline')).toContainText('未登记准备流程');j.conditions.push({condition:'empty',result:'pass',evidence_refs:[await j.capture('manual-empty')]});await j.refresh();await j.project(p.id);j.completed=true;
});
test('J04-quick-source 快速创作保留真实来源与作品',async({journey:j})=>{
 const source=await j.source(),p=await j.create('quick_create','带来源',source),prep=await j.prep(p.id);
 expect(prep.origin).toBe('quick_create');expect(prep.sourceReferences.some(r=>r.sourceKind==='intelligence_item'&&r.itemId===source.item.id)).toBe(true);
 const outputs=await j.call<Array<{id:string;title:string}>>('projects.outputs.list',{params:{projectId:p.id}});expect(outputs.length).toBeGreaterThan(0);
 await expect(slot(j.page,'pipeline-source')).toContainText('来源素材');await j.capture('quick-source');await j.refresh();expect((await j.prep(p.id)).sourceReferences.map(r=>r.id)).toEqual(prep.sourceReferences.map(r=>r.id));j.completed=true;
});
test('J05-quick-empty 无来源快速创作不虚构工程',async({journey:j})=>{
 const p=await j.create('quick_create','无来源'),prep=await j.prep(p.id);expect(prep).toMatchObject({origin:'quick_create',registration:'not_registered',sourceReferences:[]});
 await expect(slot(j.page,'project-pipeline')).toContainText('未记录外部来源');j.conditions.push({condition:'empty',result:'pass',evidence_refs:[await j.capture('quick-empty')]});await j.refresh();j.completed=true;
});
test('J06-radar-idempotency 雷达多次与另一作用域入口返回同项目',async({page,journey:j})=>{
 const source=await j.source();await page.goto('/intelligence');
 const rowButton=page.locator('main button').filter({hasText:source.item.title}).first();await expect(rowButton).toBeVisible();await rowButton.click();
 const detail=page.getByTestId('intelligence-detail');await expect(detail.getByRole('heading',{name:source.item.title,exact:true})).toBeVisible();
 const upgrade=detail.locator('[data-slot="radar-upgrade-button"]');
 if(await upgrade.count()){const ack=page.waitForResponse(r=>operationId(r.request())==='projects.ensure',{timeout:requestMs});await upgrade.click();expect((await ack).ok()).toBe(true);}
 const open=detail.locator('[data-slot="radar-upgrade-open-project"]');await expect(open).toBeVisible();const href=await open.getAttribute('href');expect(href).toBeTruthy();
 await open.click();const projectId=await j.currentProject();expect(href).toBe(`/projects/${projectId}`);await j.project(projectId);
 const a=await j.call<Ensure>('projects.ensure',{body:{source:'radar',itemId:source.item.id,idempotencyKey:randomUUID()}});
 const b=await j.call<Ensure>('projects.ensure',{body:{source:'radar',itemId:source.item.id,idempotencyKey:randomUUID()}});expect(a.project.id).toBe(projectId);expect(b.project.id).toBe(projectId);expect(a.reused&&b.reused).toBe(true);
 const account=j.group.members.find(m=>m.status==='active');expect(account,'需真实初始组账号验证 account-only 与 group 幂等').toBeTruthy();
 const legacy=await j.call<Ensure>('projects.ensure',{body:{source:'radar',itemId:source.item.id,idempotencyKey:randomUUID()}},{accountId:account!.accountId});expect(legacy.project.id).toBe(projectId);
 // 雷达再次打开作品、点击真实“查看项目”，应继续回到原项目。API 重放只是补充落库核对。
 await page.goto('/intelligence');await expect(rowButton).toBeVisible();await rowButton.click();await expect(open).toHaveAttribute('href',`/projects/${projectId}`);await open.click();expect(await j.currentProject()).toBe(projectId);await j.project(projectId);
 j.conditions.push({condition:'repeat',result:'pass',evidence_refs:[j.ref('readback.json'),await j.capture('radar-idempotent')]});await j.refresh();j.completed=true;
});
test('J07-topic-upgrade 选题升级直接打开真实项目',async({page,journey:j})=>{
 const candidates=await j.call<Candidate[]>('candidates.list',{query:{page:1,pageSize:100,sort:'createdAt'}});expect(candidates.length).toBeGreaterThan(0);const candidate=candidates.find(c=>c.status==='pool')??candidates[0]!;
 await page.goto('/topics');const card=page.locator(`[data-candidate-id="${candidate.id}"]`);await expect(card).toBeVisible();await card.click();
 const actions=page.locator('#topics-create');const response=page.waitForResponse(r=>operationId(r.request())==='projects.ensure',{timeout:requestMs});await actions.getByRole('button',{name:/升级为项目|查看项目/}).click();expect((await response).ok()).toBe(true);
 const id=await j.currentProject();expect(page.url()).not.toContain('from=topic');expect((await j.project(id)).source).toBe('topic');
 const replay=await j.call<Ensure>('projects.ensure',{body:{source:'topic',candidateId:candidate.id,idempotencyKey:randomUUID()}});expect(replay.project.id).toBe(id);
 j.conditions.push({condition:'repeat',result:'pass',evidence_refs:[j.ref('readback.json'),await j.capture('topic-upgraded')]});await j.refresh();j.completed=true;
});
test('J08-preparation-controls 准备原任务暂停恢复取消及Codex未登录有限观察',async({page,journey:j})=>{
 const p=await j.create('manual','准备控制');const panel=slot(page,'project-pipeline');await panel.getByRole('button',{name:'启动项目准备',exact:true}).click();
 await expect.poll(async()=> (await j.prep(p.id)).registration,{timeout:requestMs}).toBe('registered');const original=await j.prep(p.id);expect(original.preparationTaskId).toBeTruthy();
 // 先记录真实未登录与有限观察；缺少后续控制不能抹掉已取得的核心证据。
 await expect.poll(async()=>{const s=await j.prep(p.id);return s.steps.some(step=>step.lastError?.message.includes('Codex')&&['waiting_user','failed','blocked'].includes(step.status));},{timeout:requestMs}).toBe(true);
 await expect(panel).toContainText(/Codex.*登录|登录.*Codex/);
 const taskSnapshot=async()=>{
  const state=await j.prep(p.id);expect(state.preparationTaskId).toBe(original.preparationTaskId);
  const ids=[...new Set([state.preparationTaskId,...state.steps.map(step=>step.childTaskId)].filter((id):id is string=>Boolean(id)))].sort();
  expect(ids.length,'必须实际观察原准备任务，不能把旧任务列表的空数组当成无重试').toBeGreaterThan(0);
  const tasks=await Promise.all(ids.map(id=>j.call<{id:string;attempt:number;status:string;runtimeStatus?:string}>('execution.tasks.get',{params:{taskId:id}})));
  return tasks.map((task,index)=>{expect(task.id).toBe(ids[index]);expect(Number.isInteger(task.attempt)).toBe(true);return {id:task.id,attempt:task.attempt,status:task.status,runtimeStatus:task.runtimeStatus};});
 };
 const before=await taskSnapshot(),started=Date.now();
 while(Date.now()-started<requestMs){await page.waitForTimeout(10_000);expect(await taskSnapshot()).toEqual(before);}
 j.conditions.push({condition:'error',result:'pass',evidence_refs:[j.ref('readback.json'),await j.capture('codex-login-required-no-retry')]});
 await j.refresh();await page.goto('/projects');await page.goBack();await j.project(p.id);expect((await j.prep(p.id)).preparationTaskId).toBe(original.preparationTaskId);j.conditions.push({condition:'back',result:'pass',evidence_refs:[await j.capture('preparation-return')]});
 // 当前源码未提供父准备任务的 UI 控制。保留真实断言，不能用 dispatch 命令冒充按钮。
 const pause=panel.getByRole('button',{name:/^暂停(项目准备|任务)?$/});await expect(pause,'项目准备必须提供真实暂停控制；缺失时保留失败').toBeVisible();await pause.click();
 await expect.poll(async()=> (await j.prep(p.id)).steps.some(s=>s.status==='paused'),{timeout:requestMs}).toBe(true);await j.capture('preparation-paused');
 const resume=panel.getByRole('button',{name:/^(恢复|继续)(项目准备|任务)?$/});await expect(resume).toBeVisible();await resume.click();expect((await j.prep(p.id)).preparationTaskId).toBe(original.preparationTaskId);
 await panel.getByRole('button',{name:/^取消(项目准备|任务)$/}).click();await expect.poll(async()=> (await j.prep(p.id)).steps.some(s=>s.status==='cancelled'),{timeout:requestMs}).toBe(true);await j.refresh();j.completed=true;
});
test('J09-transcript-ready 项目补逐字稿持久就绪不冒充采纳',async({page,journey:j})=>{
 const source=await j.source(true),p=await j.create('quick_create','手工补逐字稿',source),panel=slot(page,'project-pipeline');
 const provide=panel.getByRole('button',{name:'手工补逐字稿',exact:true});await expect(provide).toBeVisible();await provide.click();
 const text='这是一段由用户主动补充的来源逐字稿，用于核对保存后能否继续使用。这里记录的是原始素材内容，准备完成后仍由用户决定是否采纳候选。';
 await panel.getByRole('textbox',{name:'逐字稿',exact:true}).fill(text);const response=page.waitForResponse(r=>operationId(r.request())==='projects.preparation.transcript.provide',{timeout:requestMs});await panel.getByRole('button',{name:'提交逐字稿',exact:true}).click();expect((await response).ok()).toBe(true);
 await expect.poll(async()=> (await j.prep(p.id)).steps.find(s=>s.name==='transcript')?.status,{timeout:requestMs}).toBe('done');
 const step=panel.locator('[data-step="transcript"]');await expect(step).toContainText('逐字稿就绪');await expect(step).not.toContainText('不需要');
 const prep=await j.prep(p.id);expect(prep.candidates.every(c=>c.acceptanceReceipt===null)).toBe(true);await j.capture('transcript-ready');await j.refresh();expect((await j.prep(p.id)).steps.find(s=>s.name==='transcript')?.status).toBe('done');j.completed=true;
});
test('J10-settings-assistant-reference 模型未登录提示与助手真实项目引用',async({page,journey:j})=>{
 const p=await j.create('manual','助手引用');await page.goto('/settings?highlight=assistant-engine');await expect(slot(page,'settings-dialog')).toBeVisible();
 await expect(page.getByLabel('文本创作与结构化模型来源',{exact:true})).toHaveValue('codex');await page.getByRole('button',{name:'重新读取当前设置',exact:true}).click();
 await expect(slot(page,'model-source-status-text')).toContainText('Codex 尚未登录');await j.capture('codex-not-logged-in');
 j.conditions.push({condition:'error',result:'pass',evidence_refs:[j.ref('readback.json'),j.visible.at(-1)!.screenshot_ref]});
 await page.goto('/?copilot=open');const dialog=slot(page,'ai-copilot-dialog');await expect(dialog).toBeVisible();const input=dialog.getByRole('textbox',{name:'我能帮你做什么',exact:true});await input.fill(`帮我看看 @${p.title}`);
 const option=page.locator(`[data-slot="project-mention-option"][data-project-id="${p.id}"]`);await expect(option).toBeVisible();await option.click();
 const chip=dialog.locator(`[data-slot="context-chip"][data-kind="project"][data-project-id="${p.id}"]`);await expect(chip).toHaveCount(1);await expect(chip).toContainText(p.title);await expect(input).toHaveValue('帮我看看 ');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect((await j.call<Project>('projects.get',{params:{projectId:p.id}})).id).toBe(p.id);await j.capture('assistant-real-reference');j.completed=true;
});
