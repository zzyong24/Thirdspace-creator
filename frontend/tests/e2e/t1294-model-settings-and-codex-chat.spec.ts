import {randomUUID} from 'node:crypto';
import {test as base,expect,type Page,type TestInfo} from '@playwright/test';
import {ENDPOINTS,modelRoutingResourceSchema,type ModelRoutingChoices} from '@creatoros/contract';

const requestMs=120_000,settingsMs=900_000,taskMs=1_200_000;
const official:ModelRoutingChoices={text:'official',vision:'official',image:'official',video:'official',audio:'official',embed:'official'};
const slot=(page:Page,name:string)=>page.locator(`[data-slot="${name}"]`);
type Input={params?:unknown;query?:unknown;body?:unknown};
async function op<T>(page:Page,id:string,input:Input={},groupId?:string):Promise<T>{
 const response=await page.request.post('/api/v1/dispatch',{timeout:settingsMs,headers:groupId?{'x-group-id':groupId}:{},data:{id,input}});
 expect(response.ok(),`${id} HTTP ${response.status()}`).toBe(true);
 return (await response.json() as {data:T}).data;
}
function operationId(response:{url():string;request():{method():string;postDataJSON():unknown}}){
 if(!response.url().endsWith('/api/v1/dispatch')||response.request().method()!=='POST')return null;
 return (response.request().postDataJSON() as {id?:string})?.id??null;
}
async function routing(page:Page,groupId:string){return modelRoutingResourceSchema.parse(await op(page,ENDPOINTS.getModelRouting.id,{},groupId));}
async function saveChoices(page:Page,groupId:string,choices:ModelRoutingChoices){
 const current=await routing(page,groupId);
 return modelRoutingResourceSchema.parse(await op(page,ENDPOINTS.putModelRouting.id,{body:{schemaVersion:1,choices,expectedRevision:current.revision}},groupId));
}
async function models(page:Page){
 await page.goto('/settings?highlight=assistant-engine');
 await expect(slot(page,'settings-dialog')).toBeVisible();
 await expect(page.getByRole('tab',{name:'模型配置',exact:true})).toHaveAttribute('aria-selected','true');
 await expect(page.getByLabel('文本创作与结构化模型来源',{exact:true})).toBeEnabled();
}
async function capture(page:Page,info:TestInfo,name:string){
 const path=info.outputPath(`${name}.png`);await page.screenshot({path,fullPage:true,animations:'disabled',caret:'hide',timeout:requestMs});await info.attach(name,{path,contentType:'image/png'});
}
const test=base.extend<{groupId:string;denied:string[]}>({
 denied:async({context,baseURL},use)=>{
  const denied:string[]=[];const origin=new URL(baseURL!).origin;
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(['data:','blob:','about:'].includes(url.protocol)){await route.continue();return;}
   const id=req.method()==='POST'&&url.pathname==='/api/v1/dispatch'?(req.postDataJSON() as {id?:string})?.id:'';
   const funds=/bootstrap|credits.*(?:reserve|redeem|apply)|funding/i.test(id??'')||url.pathname.startsWith('/api/v1/local/ai-credits/')&&!['/api/v1/local/ai-credits/connect','/api/v1/local/ai-credits/status'].includes(url.pathname);
   if(url.origin!==origin||funds){denied.push(`${req.method()} ${url.origin}${url.pathname}${id?' '+id:''}`);await route.abort('blockedbyclient');return;}
   await route.continue();
  });
  await context.routeWebSocket('**/*',socket=>{if(new URL(socket.url()).origin.replace(/^ws/,'http')!==origin){denied.push('WS '+new URL(socket.url()).origin);void socket.close();}else socket.connectToServer();});
  await use(denied);expect(denied,'浏览器不可访问外部来源、其它本机服务或资金写入口').toEqual([]);
 },
 groupId:async({page,baseURL,denied},use)=>{
  void denied;page.setDefaultTimeout(requestMs);page.setDefaultNavigationTimeout(300_000);
  const group=await op<{id:string}>(page,'accountGroups.create',{body:{name:`T1294隔离验收-${randomUUID()}`,idempotencyKey:randomUUID()}});
  await page.context().addCookies([{name:'creatoros_current_group',value:encodeURIComponent(group.id),url:baseURL!}]);
  await page.addInitScript(id=>{localStorage.setItem('creatoros:current-group',id);localStorage.removeItem('creatoros:current-account');localStorage.setItem('creatoros:onboarding:hidden','1');},group.id);
  await use(group.id);
 },
});
test.skip(!process.env.T1294_BINDING,'仅在显式绑定的新隔离库执行；不随普通E2E发起真实Codex对话');
// 覆盖原公开准备/保存/提交的完整串行及有限观察；各请求与任务期限保持。
test.describe.configure({timeout:28_800_000,retries:0});

test('T1294 fresh默认官方，设置无向量/独立图片理解与数据服务分类，充值常驻',async({page,groupId},info)=>{
 const current=await routing(page,groupId);expect(current.choices,'fresh DB不应被普通GET自动持久化').toBeNull();expect(current.effectiveChoices).toEqual(official);
 await models(page);
 for(const family of ['text','image','video','audio'])await expect(page.locator(`#model-source-${family}`)).toHaveValue('official');
 await expect(page.locator('#model-source-vision')).toHaveCount(0);await expect(page.locator('#model-source-embed')).toHaveCount(0);
 await expect(page.getByRole('tab',{name:'数据服务',exact:true})).toHaveCount(0);
 await expect(page.getByText('RedFox 数据服务',{exact:true})).toBeVisible();await expect(page.locator('#redfox-key')).toHaveAttribute('type','password');
 await expect(slot(page,'global-ai-credit-entry')).toHaveCount(1);
 await expect(slot(page,'ai-credit-center-card')).toHaveCount(1);
 expect((await routing(page,groupId)).choices).toBeNull();await capture(page,info,'official-default-model-settings');
});

test('T1294 已保存混合图片与自配选择重开保留，主动改图片同次CAS只统一vision/image',async({page,groupId},info)=>{
 const before={...official,text:'self' as const,vision:'self' as const};await saveChoices(page,groupId,before);
 await models(page);await expect(page.getByLabel('图片模型来源',{exact:true})).toHaveValue('mixed');await expect(page.getByLabel('文本创作与结构化模型来源',{exact:true})).toHaveValue('self');
 await page.reload();await expect(page.getByLabel('图片模型来源',{exact:true})).toHaveValue('mixed');expect((await routing(page,groupId)).choices).toEqual(before);
 await page.getByLabel('图片模型来源',{exact:true}).selectOption('self');
 const save=page.waitForResponse(r=>operationId(r)===ENDPOINTS.putModelRouting.id,{timeout:settingsMs});
 await page.getByRole('button',{name:'保存模型来源',exact:true}).click();expect((await save).status()).toBe(200);
 await expect(page.getByRole('status').filter({hasText:'已保存并读回当前设置'})).toBeVisible();expect((await routing(page,groupId)).choices).toEqual({...before,image:'self'});
 await page.reload();await expect(page.getByLabel('图片模型来源',{exact:true})).toHaveValue('self');await capture(page,info,'explicit-and-mixed-sources');
 await saveChoices(page,groupId,official);
});

test('T1294 实际CAS冲突不覆盖其它窗口保存，原草稿与失败提示保留',async({page,groupId},info)=>{
 await saveChoices(page,groupId,official);await models(page);await page.getByLabel('文本创作与结构化模型来源',{exact:true}).selectOption('self');
 const concurrent={...official,video:'self' as const};await saveChoices(page,groupId,concurrent);
 const failed=page.waitForResponse(r=>operationId(r)===ENDPOINTS.putModelRouting.id,{timeout:settingsMs});await page.getByRole('button',{name:'保存模型来源',exact:true}).click();expect((await failed).status()).toBe(409);
 await expect(page.getByRole('alert').filter({hasText:/其它窗口|重新读取/})).toBeVisible();await expect(page.getByLabel('文本创作与结构化模型来源',{exact:true})).toHaveValue('self');expect((await routing(page,groupId)).choices).toEqual(concurrent);
 await capture(page,info,'real-cas-conflict-preserved');await saveChoices(page,groupId,official);
});

test('T1294 RedFox在模型页实际保存/掩码/重开/删除，旧深链仍可达且零查询费用',async({page,groupId},info)=>{
 const fake=`t1294-fake-${randomUUID()}`;await page.goto('/settings?highlight=redfox');await expect(page.getByRole('tab',{name:'模型配置',exact:true})).toHaveAttribute('aria-selected','true');
 const key=page.locator('#redfox-key');await expect(key).toHaveAttribute('type','password');await key.fill(fake);
 const save=page.waitForResponse(r=>operationId(r)==='settings.redfox.put',{timeout:requestMs});await page.getByRole('button',{name:'保存密钥',exact:true}).click();
 const response=await save;expect(response.status()).toBe(200);expect(await response.text()).not.toContain(fake);await expect(key).toHaveValue('');
 await page.reload();await expect(page.getByText(/已保存密钥/)).toBeVisible();expect(JSON.stringify(await op(page,'settings.redfox.get',{},groupId))).not.toContain(fake);
 await capture(page,info,'redfox-saved-masked');const remove=page.waitForResponse(r=>operationId(r)==='settings.redfox.delete',{timeout:requestMs});await page.getByRole('button',{name:'移除密钥',exact:true}).click();expect((await remove).status()).toBe(200);
 expect(await op(page,'settings.redfox.get',{},groupId)).toMatchObject({configured:false});
});

test('T1294 旧向量测试明确停用，真实资料创建/修订/搜索保原文与组隔离',async({page,groupId},info)=>{
 const other=await op<{id:string}>(page,'accountGroups.create',{body:{name:'T1294另一隔离组',idempotencyKey:randomUUID()}});
 const item=await op<{id:string}>(page,'knowledge.create',{body:{title:'T1294关键词资料',knowledgeType:'note',content:'原资料：独占关键词柚子。'}},groupId);
 await op(page,'knowledge.revisions.create',{params:{knowledgeId:item.id},body:{content:'修订保留资料：独占关键词柚子。'}},groupId);
 const result=await page.request.post('/api/knowledge/search',{timeout:requestMs,headers:{'x-group-id':groupId},data:{q:'柚子'}});
 expect(result.ok()).toBe(true);const data=await result.json();expect(data).toMatchObject({semanticEnabled:false,semanticError:null});expect(JSON.stringify(data)).toContain(item.id);
 const disabled=await op(page,ENDPOINTS.testModelConnection.id,{params:{capability:'knowledge.search.embed'}},groupId);expect(disabled).toMatchObject({ok:false,status:'fail',provider:'',model:''});
 const foreign=await page.request.post('/api/knowledge/search',{timeout:requestMs,headers:{'x-group-id':other.id},data:{q:'柚子'}});expect(foreign.ok()).toBe(true);expect(JSON.stringify(await foreign.json())).not.toContain(item.id);
 await page.goto(`/knowledge?item=${encodeURIComponent(item.id)}`);await expect(page.getByRole('region',{name:'资料原文'})).toContainText('修订保留资料：独占关键词柚子');await capture(page,info,'keyword-only-real-knowledge');
});

test('T1294 常驻充值按钮走原空body受控POST，缺官方配置诚实失败且零资金新操作',async({page,groupId},info)=>{
 await saveChoices(page,groupId,{...official,text:'self'});await page.goto('/accounts');const entry=slot(page,'global-ai-credit-entry');await expect(entry.getByRole('button',{name:'充值',exact:true})).toBeVisible();
 const request=page.waitForRequest(r=>new URL(r.url()).pathname==='/api/v1/local/ai-credits/connect',{timeout:requestMs});
 const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/local/ai-credits/connect',{timeout:settingsMs});
 await entry.getByRole('button',{name:'充值',exact:true}).click();const sent=await request;expect(sent.method()).toBe('POST');expect(sent.postData()??'').toBe('');
 expect((await response).ok(),'fresh隔离库无真实官方连接，不应伪造openUrl').toBe(false);
 await expect(entry.getByRole('alert')).toBeVisible();await expect(entry.getByRole('link',{name:'前往模型设置',exact:true})).toBeVisible();
 await capture(page,info,'credits-honest-unconfigured');await saveChoices(page,groupId,official);
});

for(const viewport of [{name:'desktop',width:1536,height:1024,dsf:1},{name:'narrow',width:390,height:844,dsf:1},{name:'CSS640x450/DSF2等效200%',width:640,height:450,dsf:2}]){
 test.describe(`视口 ${viewport.name}`,()=>{
 test.use({viewport:{width:viewport.width,height:viewport.height},deviceScaleFactor:viewport.dsf});
 test(`T1294 设置与助手 ${viewport.name} 可读可操作且无画布/检查横条`,async({page,groupId},info)=>{
  await saveChoices(page,groupId,official);await models(page);
  await expect(page.getByLabel('图片模型来源',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'保存模型来源',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await capture(page,info,`settings-${viewport.name}`);
  await page.goto('/accounts?copilot=open');
  const dialog=slot(page,'ai-copilot-dialog');await expect(dialog).toBeVisible();await expect(dialog.getByRole('textbox',{name:'我能帮你做什么',exact:true})).toBeEnabled();
  await expect(dialog.getByRole('link',{name:'在画布中打开',exact:true})).toHaveCount(0);await expect(dialog.getByRole('button',{name:'在画布中打开',exact:true})).toHaveCount(0);
  await expect(dialog).not.toContainText('正在检查本地 Codex');await expect(dialog).not.toContainText('设置编导引擎');
  // 真实短高视口允许原内部滚动；CSS html zoom会缩放fixed坐标，不作为页面200%替身。
  await dialog.getByRole('button',{name:'提交提示给 Copilot',exact:true}).scrollIntoViewIfNeeded();
  for(const target of [page.locator('#ai-copilot-title'),dialog.getByRole('textbox',{name:'我能帮你做什么',exact:true}),dialog.getByRole('button',{name:'提交提示给 Copilot',exact:true}),dialog.getByRole('button',{name:'关闭 AI 助手',exact:true})])await expect(target).toBeInViewport({ratio:1});
  const geometry=await page.evaluate(()=>({width:innerWidth,height:innerHeight,dsf:devicePixelRatio,zoom:getComputedStyle(document.documentElement).zoom,scrollWidth:document.documentElement.scrollWidth}));
  expect(geometry.width).toBe(viewport.width);expect(geometry.height).toBe(viewport.height);expect(geometry.zoom).toBe('1');expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.width);if(viewport.dsf===2)expect(geometry.dsf).toBe(2);
  await info.attach('actual-css-viewport-and-dsf',{body:Buffer.from(JSON.stringify(geometry,null,2)),contentType:'application/json'});
  const screenshot=info.outputPath(viewport.dsf===2?'assistant-equivalent200-after-original-scroll.png':`assistant-${viewport.name}.png`);await page.screenshot({path:screenshot,fullPage:false,animations:'disabled',caret:'hide',timeout:requestMs});await info.attach('assistant-all-controls-in-viewport',{path:screenshot,contentType:'image/png'});
 });
 });
}

test('T1294 唯一新本地Codex对话：设置检查一次→直接发送→四ID同任务完成并可读，unknown不重发',async({page,groupId},info)=>{
 // 外层覆盖全部公开准备/保存/提交、有限观察和导航/清理余量。
 test.setTimeout(28_800_000);await saveChoices(page,groupId,official);await models(page);
 await page.getByLabel('文本创作与结构化模型来源',{exact:true}).selectOption('codex');
 const saved=page.waitForResponse(r=>operationId(r)===ENDPOINTS.putModelRouting.id,{timeout:settingsMs});await page.getByRole('button',{name:'保存模型来源',exact:true}).click();expect((await saved).status()).toBe(200);
 await expect(page.getByRole('status').filter({hasText:'已保存并读回当前设置'})).toBeVisible();expect((await routing(page,groupId)).choices?.text).toBe('codex');
 await capture(page,info,'codex-setting-checked');
 const engineGets:string[]=[],posts:string[]=[];page.on('request',request=>{const url=new URL(request.url());if(url.pathname==='/api/chat/engines')engineGets.push(url.pathname);if(url.pathname==='/api/chat'&&request.method()==='POST')posts.push(url.pathname);});
 const receipts:Array<{conversationId?:string;sourceMessageId?:string;aiTaskId?:string;executionTaskId?:string}>=[];
 page.on('response',response=>{if(new URL(response.url()).pathname==='/api/chat'&&response.request().method()==='POST'&&response.status()===200){const h=response.headers();receipts.push({conversationId:h['x-conversation-id'],sourceMessageId:h['x-source-message-id'],aiTaskId:h['x-ai-task-id'],executionTaskId:h['x-execution-task-id']});}});
 await page.goto('/accounts?copilot=open');const dialog=slot(page,'ai-copilot-dialog');await expect(dialog).toBeVisible();await expect(dialog).not.toContainText('正在检查本地 Codex');await expect(dialog).not.toContainText('设置编导引擎');
 const input=dialog.getByRole('textbox',{name:'我能帮你做什么',exact:true});await expect(input).toBeEnabled();
 const reply=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/chat'&&r.request().method()==='POST',{timeout:settingsMs});
 await input.fill('这是一条独立的本地连接验收对话。请只用纯文本回复“连接正常”，不要调用工具、搜索、读文件、创建或修改任何业务对象。');await dialog.getByRole('button',{name:'提交提示给 Copilot',exact:true}).click();
 const response=await reply;const h=response.headers(),ids={groupId,conversationId:h['x-conversation-id'],sourceMessageId:h['x-source-message-id'],aiTaskId:h['x-ai-task-id'],executionTaskId:h['x-execution-task-id']};
 await info.attach('original-task-ids',{body:Buffer.from(JSON.stringify(ids,null,2)),contentType:'application/json'});
 expect(response.status()).toBe(200);for(const id of Object.values(ids))expect(id).toBeTruthy();
 let last:Record<string,unknown>|null=null;
 try{
  await expect.poll(async()=>{const read=await op<{id:string;ownerId:string;groupId:string;accountId:null;status:string;runtimeStatus?:string;errorCode?:string}>(page,'execution.tasks.get',{params:{taskId:ids.executionTaskId}},groupId);last={...ids,status:read.status,runtimeStatus:read.runtimeStatus,errorCode:read.errorCode};expect(read.id).toBe(ids.executionTaskId);expect(read.ownerId).toBe(ids.aiTaskId);expect(read.groupId).toBe(groupId);expect(read.accountId).toBeNull();const status=read.runtimeStatus??read.status;return ['succeeded','blocked','waiting_user','failed','cancelled','unknown_result','paused'].includes(status);},{timeout:taskMs,intervals:[1000,2000,5000]}).toBe(true);
  const observed=last as Record<string,unknown>|null;expect(observed?.runtimeStatus??observed?.status,'原任务已停则立即FAIL并保ID，不自动重发或继续等待').toBe('succeeded');
  const messages=await op<Array<{id:string;role:string;content:string;parts:unknown[];modelMetadata:Record<string,unknown>}>>(page,ENDPOINTS.listMessages.id,{params:{conversationId:ids.conversationId}},groupId);
  const assistant=messages.find(message=>message.role==='assistant'&&message.modelMetadata.sourceMessageId===ids.sourceMessageId);expect(assistant).toBeDefined();
  const text=assistant!.content.trim()||assistant!.parts.filter((part):part is {type:string;text:string}=>Boolean(part&&typeof part==='object'&&(part as {type?:unknown}).type==='text'&&typeof(part as {text?:unknown}).text==='string')).map(part=>part.text).join('').trim();
  expect(text.length).toBeGreaterThan(0);await expect(dialog.locator('[data-slot="copilot-message"][data-role="assistant"]')).toContainText(text);
  // 当前是合法的组级聊天（accountId=null）；工作台摘要要求平台账号，不能借其它账号绕过428。
  // SSE重连可以增加HTTP请求，但必须仍关联同一源消息和同一执行任务，不能重发成新任务。
  expect(engineGets).toEqual([]);expect(posts.length).toBeGreaterThanOrEqual(1);expect(receipts.length).toBeGreaterThanOrEqual(1);
  for(const receipt of receipts)expect(receipt).toEqual({conversationId:ids.conversationId,sourceMessageId:ids.sourceMessageId,aiTaskId:ids.aiTaskId,executionTaskId:ids.executionTaskId});
  expect(assistant!.id).toBe(`chat:${ids.sourceMessageId}`);
  await capture(page,info,'codex-original-task-readable-complete');
 }finally{
  await info.attach('original-task-final-observation',{body:Buffer.from(JSON.stringify({ids,last,chatPosts:posts.length,receipts,uiSubmits:1,workbenchSummary:'account-null-requires-platform-account-not-claimed',legacyStatusGets:engineGets.length,retryInvoked:false,resumeInvoked:false,readableCompletion:'see_actual_assertions'},null,2)),contentType:'application/json'});
 }
});
