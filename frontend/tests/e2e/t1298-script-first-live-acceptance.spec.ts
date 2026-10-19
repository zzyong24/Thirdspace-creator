import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
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
async function copilotInput(page:Page){
 const input=page.getByRole('textbox',{name:'我能帮你做什么',exact:true});
 if(!await input.isVisible()){
  const open=page.getByRole('button',{name:'打开编导',exact:true});
  if(await open.isVisible())await open.click();
  else await page.getByRole('button',{name:'展开编导栏',exact:true}).click();
 }
 await expect(input).toBeVisible();await expect(input).toBeEnabled();return input;
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
  const group=await op<{id:string}>(page,'accountGroups.create',{body:{name:`T1298隔离验收-${randomUUID()}`,idempotencyKey:randomUUID()}});
  await page.context().addCookies([{name:'creatoros_current_group',value:encodeURIComponent(group.id),url:baseURL!}]);
  await page.addInitScript(id=>{localStorage.setItem('creatoros:current-group',id);localStorage.removeItem('creatoros:current-account');localStorage.setItem('creatoros:onboarding:hidden','1');},group.id);
  await use(group.id);
 },
});
test.skip(!process.env.T1298_BINDING,'仅在显式绑定的新隔离库执行；不随普通E2E发起真实Codex对话');
// 覆盖原公开准备/保存/提交的完整串行及有限观察；各请求与任务期限保持。
test.describe.configure({timeout:28_800_000,retries:0});

test('T1298 真实模型重组与对话校正均可采纳，刷新后平台独立且原稿不变',async({page,groupId},info)=>{
 test.setTimeout(28_800_000);
 const binding=JSON.parse(readFileSync(process.env.T1298_BINDING!,'utf8'));
 const save=(name:string,value:unknown)=>writeFileSync(join(binding.evidenceRoot,name+'.json'),JSON.stringify(value,null,2)+'\n');
 const project=await op<{id:string}>(page,'projects.create',{body:{title:'先记录问题，再复盘方法',brief:'只依据原稿表达，不增加案例数据或个人经历。',contentType:'article',targetPlatforms:['wechatOfficialAccount','xiaohongshu']}},groupId);
 const script=await op<{id:string}>(page,'artifacts.create',{params:{projectId:project.id},body:{title:'验证原稿',artifactType:'output_script',stage:'script'}},groupId);
 const original='我整理笔记时，先写清楚要解决的问题，再记下实际做过的步骤，最后检查结果。\n\n例如整理一份阅读笔记，我会先问：这次阅读解决了什么疑问？然后写下我试过的方法，以及还没有想明白的地方。这里没有统计数据，也不承诺效率一定提高。\n\n我想保留一个习惯：每次结束工作，记下一个仍然值得追问的问题。先把问题写清楚，再决定下一步。';
 await op(page,'artifacts.versions.create',{params:{artifactId:script.id},body:{contentText:original,changeSummary:'真实模型验收原稿'}},groupId);
 const article=await op<{id:string}>(page,'projects.outputs.create',{params:{projectId:project.id},body:{title:'公众号测试稿',contentType:'article',clientRequestId:randomUUID()}},groupId);
 const graphic=await op<{id:string}>(page,'projects.outputs.create',{params:{projectId:project.id},body:{title:'图文测试稿',contentType:'image',clientRequestId:randomUUID()}},groupId);
 save('owned-witness',{groupId,projectId:project.id,scriptId:script.id,articleId:article.id,graphicId:graphic.id,original});
 await saveChoices(page,groupId,official);await models(page);
 await page.getByLabel('文本创作与结构化模型来源',{exact:true}).selectOption('codex');
 const setting=page.waitForResponse(r=>operationId(r)===ENDPOINTS.putModelRouting.id,{timeout:settingsMs});
 await page.getByRole('button',{name:'保存模型来源',exact:true}).click();expect((await setting).status()).toBe(200);
 await expect(page.getByRole('status').filter({hasText:'已保存并读回当前设置'})).toBeVisible();expect((await routing(page,groupId)).choices?.text).toBe('codex');
 const targets=[{kind:'article',id:article.id,operation:'articles.get',path:`/projects/${project.id}/article?outputId=${article.id}`},{kind:'graphic',id:graphic.id,operation:'graphicPosts.get',path:`/projects/${project.id}/outputs/${graphic.id}/image`}];
 const read=(t:typeof targets[number])=>op<any>(page,t.operation,{params:{outputId:t.id}},groupId);
 const scripts=()=>op<any[]>(page,'artifacts.versions.list',{params:{artifactId:script.id},query:{page:1,pageSize:20}},groupId);
 const initialScript=await scripts();save('script-before',initialScript);
 // 初稿由真实页面承接，并通过实际交付动作保存；不注入候选或模型响应。
 for(const t of targets){
  await page.goto(t.path);const main=page.locator(`[data-page="${t.kind==='article'?'article':'graphic-post'}-workbench"]`);
  await expect(main.getByRole('button',{name:t.kind==='article'?'复制公众号文章':'导出分页 ZIP',exact:true})).toBeEnabled();
  await main.getByText('更多导出',{exact:true}).click();const dl=page.waitForEvent('download',{timeout:180_000});
  await main.getByRole('button',{name:t.kind==='article'?'导出 HTML':'导出原图与配文',exact:true}).click();await(await dl).saveAs(info.outputPath(t.kind==='article'?'initial.html':'initial.zip'));
  const saved=await read(t);expect(t.kind==='article'?saved.current.sections[0].body:saved.current.body).toBe(original);save(t.kind+'-initial',saved);
 }
 let submissions=0;
 for(const t of targets){
  const other=targets.find(x=>x!==t)!;const otherBefore=await read(other);
  await page.setViewportSize(t.kind==='article'?{width:1536,height:1024}:{width:1280,height:800});await page.goto(t.path);
  for(const turn of ['reorganize','correct'] as const){
   const label=t.kind+'-'+turn;
   const before=await read(t);save(label+'-before',before);
   const responsePromise=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/chat'&&r.request().method()==='POST',{timeout:settingsMs});
   if(turn==='reorganize')await page.getByRole('button',{name:'重新组织内容',exact:true}).click();
   else{
    const input=await copilotInput(page);
    await input.fill('请先读取当前已采纳成稿，把正文的最后一句改为“下一步，先记录一个值得追问的问题。”，其他正文保留。请生成可预览采纳的完整候选，只修改当前平台作品，不修改脚本和其他平台。');
    await expect(page.getByRole('button',{name:'提交提示给 Copilot',exact:true})).toBeEnabled();
    await page.getByRole('button',{name:'提交提示给 Copilot',exact:true}).click();
   }
   submissions++;
   const response=await responsePromise,h=response.headers();
   const ids={groupId,conversationId:h['x-conversation-id'],sourceMessageId:h['x-source-message-id'],aiTaskId:h['x-ai-task-id'],executionTaskId:h['x-execution-task-id']};
   save(label+'-ids',{...ids,httpStatus:response.status()});expect(response.status()).toBe(200);for(const id of Object.values(ids))expect(id).toBeTruthy();
   let last:any;
   await expect.poll(async()=>{
    last=await op<any>(page,'execution.tasks.get',{params:{taskId:ids.executionTaskId}},groupId);save(label+'-task',{...ids,task:last});
    expect(last.id).toBe(ids.executionTaskId);expect(last.ownerId).toBe(ids.aiTaskId);expect(last.groupId).toBe(groupId);
    return ['succeeded','blocked','waiting_user','failed','cancelled','unknown_result','paused','partial'].includes(last.runtimeStatus??last.status);
   },{timeout:taskMs,intervals:[2000,5000]}).toBe(true);
   const messages=await op<any[]>(page,ENDPOINTS.listMessages.id,{params:{conversationId:ids.conversationId}},groupId);save(label+'-messages',messages);
   expect(last.runtimeStatus??last.status,'原任务失败即保留ID并停止，不重发').toBe('succeeded');
   const assistant=messages.find(m=>m.role==='assistant'&&m.modelMetadata?.sourceMessageId===ids.sourceMessageId);expect(assistant).toBeDefined();expect(assistant.modelMetadata.actualEngine).toBe('codex');
   // 读取和候选必须出自这次真实模型的工具结果。
   expect(JSON.stringify(assistant)).toContain('work.editor.context');expect(JSON.stringify(assistant)).toContain('work.editor.candidate');
   const toolPart=assistant.parts.map((part:any)=>({...part,output:part.output?.data??part.output})).find((part:any)=>part.output?.kind==='work.editor.candidate'&&part.output.candidate);expect(toolPart).toBeDefined();save(label+'-candidate',toolPart);
   const candidates=page.getByRole('region',{name:'编导编辑候选',exact:true});const candidate=candidates.filter({hasText:toolPart.output.summary}).last();
   await expect(candidate.getByRole('button',{name:'预览改动',exact:true})).toBeEnabled();
   await candidate.getByRole('button',{name:'预览改动',exact:true}).click();
   const preview=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:t.kind==='article'?'文章改动预览':'图文改动预览',exact:true})});
   await expect(preview).toBeVisible();await expect(preview.getByRole('button',{name:t.kind==='article'?'复制公众号文章':'导出分页 ZIP',exact:true})).toBeEnabled();await expect(preview.getByText('排版设置',{exact:true})).toHaveCount(0);await capture(page,info,label+'-preview');
   await preview.getByRole('button',{name:'关闭',exact:true}).click();
   await expect(candidate.getByRole('button',{name:'采纳到当前作品',exact:true})).toBeEnabled();
   // 候选阶段不得提前写库。
   expect((await read(t)).currentVersionId).toBe(before.currentVersionId);
   await candidate.getByRole('button',{name:'采纳到当前作品',exact:true}).click();
   await expect(candidate.getByRole('status')).toBeVisible();
   const after=await read(t);save(label+'-after',after);await expect(candidate.getByRole('status')).toContainText('已保存并采用');expect(after.currentVersionId).not.toBe(before.currentVersionId);expect(after.current).not.toEqual(before.current);expect(t.kind==='article'?after.current.sections:after.current.body).toEqual(t.kind==='article'?toolPart.output.candidate.document.sections:toolPart.output.candidate.document.body);
   if(turn==='correct'){const body=t.kind==='article'?after.current.sections.at(-1).body:after.current.body;expect(body.trim()).toMatch(/下一步，先记录一个值得追问的问题。[\s*_]*$/);}
   const exact=await op<any>(page,t.kind==='article'?'articles.versions.get':'graphicPosts.versions.get',{params:{outputId:t.id,versionId:after.currentVersionId}},groupId);save(label+'-exact',exact);expect(exact.document).toEqual(after.current);
   expect(await scripts()).toEqual(initialScript);const otherAfter=await read(other);expect(otherAfter.currentVersionId).toBe(otherBefore.currentVersionId);expect(otherAfter.current).toEqual(otherBefore.current);
   await capture(page,info,label+'-adopted');
   await page.reload();await expect(page.getByRole('button',{name:'重新组织内容',exact:true})).toBeEnabled();
   const refreshed=await read(t);expect(refreshed.currentVersionId).toBe(after.currentVersionId);expect(refreshed.current).toEqual(after.current);save(label+'-refreshed',refreshed);await expect(page.getByRole('button',{name:t.kind==='article'?'复制公众号文章':'导出分页 ZIP',exact:true})).toBeEnabled();await capture(page,info,label+'-refreshed');
   if(turn==='reorganize')await copilotInput(page);
  }
 }
 save('result',{submissions,realModel:'codex',fourTurnsAdopted:true,sourceScriptUnchanged:true,platformsIndependent:true,refreshedReadback:true});expect(submissions).toBe(4);
});
