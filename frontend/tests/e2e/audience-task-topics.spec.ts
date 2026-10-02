import { createServer } from 'node:http';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from '../helpers/test-environment';
const preset=JSON.parse(readFileSync(resolve(process.cwd(),'../docs/features/audience-task-topics/moonlit-v02.workspace.json'),'utf8'));
async function op<T>(page:Page,id:string,input:unknown,accountId?:string):Promise<T>{const r=await page.request.post('/api/v1/dispatch',{headers:accountId?{'x-account-id':accountId}:{},data:{id,input}});const p=await r.json();expect(r.ok(),`${id}: ${JSON.stringify(p.error)}`).toBe(true);return p.data;}
function localModel(){const server=createServer((req,res)=>{const chunks:Buffer[]=[];req.on('data',c=>chunks.push(Buffer.from(c)));req.on('end',()=>{const body=Buffer.concat(chunks).toString('utf8');const base={gridVersion:2,gridRelationReason:'录屏创作任务用视频能力完成教程',audience:'技术小白',audienceFit:'matched',audienceReason:'有授权录屏和浏览器即可试',input:'授权的乱录屏',entryUrl:'https://example.org/tutorial',steps:['上传','核对字幕','导出'],output:'字幕教程',acceptance:'逐项核对字幕和操作',costAndLimits:'中文与导出须测试',authorCanDo:'已有录屏剪辑材料',viewerCanUse:'浏览器操作',estimatedMinutes:120,route:'test',testPlan:{sample:'演示录屏',steps:['试剪','核对'],visibleResult:'教程文件',acceptance:'操作没有漏步',failureStory:'讲清字幕漏项'},cellIds:['audience:content_create','industry:produce'],problemIds:[],authorMaterialIds:['work:W-20260912-011']};const content=JSON.stringify(body.includes('只返回query与rationale')?{query:'screen recording tutorial captions Chinese',rationale:'公开录屏任务'}:{topics:[{title:'乱录屏变清楚教程',angle:'具体演示',audienceTask:{...base,propositionKey:'tutorial',job:'把乱录屏剪成教程'}},{title:'工程配置框架',angle:'反例',predictedScore:100,audienceTask:{...base,propositionKey:'engineering',job:'搭配置框架',audienceFit:'mismatched',audienceReason:'要求工程经验'}}]});if(JSON.parse(body).stream){res.writeHead(200,{'content-type':'text/event-stream'});const chunk={id:'local-t1019',object:'chat.completion.chunk',created:Math.floor(Date.now()/1000),model:'local-t1019',choices:[{index:0,delta:{role:'assistant',content},finish_reason:null}]};res.write('data: '+JSON.stringify(chunk)+'\n\n');res.write('data: '+JSON.stringify({...chunk,choices:[{index:0,delta:{},finish_reason:'stop'}],usage:{prompt_tokens:100,completion_tokens:100,total_tokens:200}})+'\n\n');res.end('data: [DONE]\n\n');return;}res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({id:'local-t1019',object:'chat.completion',created:Math.floor(Date.now()/1000),model:'local-t1019',choices:[{index:0,message:{role:'assistant',content},finish_reason:'stop'}],usage:{prompt_tokens:100,completion_tokens:100,total_tokens:200}}));});});return new Promise<{url:string;close:()=>Promise<void>}>(r=>server.listen(0,'127.0.0.1',()=>{const address=server.address() as {port:number};r({url:`http://127.0.0.1:${address.port}/v1`,close:()=>new Promise<void>((done,reject)=>server.close(e=>e?reject(e):done()))});}));}
for (const viewport of [{width:1440,height:900},{width:1024,height:768}]) test(`个性化导入→保存回读→持久生成→反馈→采纳→立项与版本重审 ${viewport.width}x${viewport.height}`,async({page,baseURL})=>{
 test.setTimeout(240000);await page.setViewportSize(viewport);const model=await localModel();
 const captures:Array<{checkpoint:string;check_ids:string[];viewport:typeof viewport;text:string}>=[];
 const capture=async(checkpoint:string,check_ids:string[])=>{const scope=page.getByTestId('audience-task-workspace');const fields=await scope.locator('input:visible:not([type=file]):not([type=checkbox]),textarea:visible').evaluateAll(nodes=>nodes.map(node=>`${node.getAttribute('aria-label')??'输入'}：${(node as HTMLInputElement).value}`).join('\n'));captures.push({checkpoint,check_ids,viewport,text:(await scope.innerText())+'\n'+fields});};
 try{
  const account=await op<{id:string}>(page,'accounts.create',{body:{platform:'douyin',accountHandle:`@t1019-${Date.now()}`}});
  await page.context().addCookies([{name:'creatoros_current_account',value:account.id,url:baseURL!}]);
  await page.addInitScript(id=>localStorage.setItem('creatoros:current-account',id),account.id);
  await op(page,'settings.models.put',{params:{capability:'topic.generate'},body:{provider:'openai-compatible',modelName:'local-t1019',baseUrl:model.url,apiFormat:'openai_chat',settings:{structuredOutputs:true},secret:'local-test-key',isDefault:false}},account.id);
  await op(page,'positioning.profile.upsert',{body:{persona:'月明隔离验证',field:'AI干活',audience:'技术小白',differentiation:'具体实操',capabilities:['录屏剪辑']}},account.id);
  await op(page,'positioning.statements.create',{body:{oneLiner:'帮技术小白把手头的事做成',keywords:['实操','干活','小白'],productAnchorIds:[],changeReason:'隔离验证'}},account.id);
  await page.goto('/topics');
  const workspace=page.getByTestId('audience-task-workspace');
  await workspace.getByText('观众任务与双九宫格（按需设置，可留空）').click();
  await expect(workspace.getByLabel('观众',{exact:true})).toBeVisible();
  await capture('当前账号空配置',['UI-AT-empty']);
  await workspace.getByLabel('导入双九宫格配置').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{invalid')});
  await expect(workspace.getByRole('alert')).toContainText('导入失败：文件须符合双九宫格配置格式。');
  await capture('损坏配置拒绝并保留当前配置',['UI-AT-invalid']);
  await workspace.getByLabel('导入双九宫格配置').setInputFiles({name:'moonlit-v02.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(preset))});
  await expect(workspace.getByLabel('观众中心')).toHaveValue(preset.audienceCenter);
  await expect(workspace.getByLabel('观众格8')).toHaveValue(/生活安排/);
  await capture('实际月明预设的本地导入预览',['UI-AT-import']);
  await workspace.scrollIntoViewIfNeeded();await page.screenshot({path:resolve(process.cwd(),`../docs/verification/t1019/configuration-${viewport.width}x${viewport.height}.png`)});
  const before=await op<{version:number}>(page,'topics.workspace.get',{},account.id);expect(before.version).toBe(0);
  await workspace.getByRole('button',{name:'保存观众任务设置'}).click();
  await expect(workspace.getByText(/配置版本 1/)).toBeVisible();
  const saved=await op<{config:typeof preset;version:number}>(page,'topics.workspace.get',{},account.id);expect(saved.config.authorMaterials).toHaveLength(16);expect(saved.config.semanticPairs).toHaveLength(8);
  await capture('当前账号保存回读',['UI-AT-save']);
  // 纯定位任务避开外网，真实Worker/持久调用/投影/确认链路全部执行；公开搜索另有流水线测试。
  const task=await op<{id:string}>(page,'ai.tasks.create',{body:{taskType:'topic.generate',inputData:{basis:'positioning'},idempotencyKey:`t1019-${Date.now()}`,attemptId:crypto.randomUUID()}},account.id);
  await expect.poll(async()=>{const t=await op<{status:string;errorMessage?:string}>(page,'ai.tasks.get',{params:{taskId:task.id}},account.id);if(t.status==='failed'||(t as {runtimeStatus?:string}).runtimeStatus==='unknown_result')throw new Error(t.errorMessage);return t.status;},{timeout:120000}).toBe('awaiting_confirmation');
  await page.reload();
  await expect(workspace.getByText('乱录屏变清楚教程',{exact:true})).toBeVisible({timeout:30000});
  await expect(workspace.getByText('不适合当前观众',{exact:false})).toBeVisible();
  await capture('持久任务重载与审读分流',['UI-AT-review','UI-AT-refresh']);
  await page.screenshot({path:resolve(process.cwd(),`../docs/verification/t1019/ui-${viewport.width}x${viewport.height}.png`),fullPage:true});
  const editors=workspace.getByLabel('反馈原因');await editors.nth(1).selectOption('audience_mismatch');
  await workspace.getByRole('button',{name:'记录反馈'}).nth(1).click();await expect(workspace.getByText('已记录，下次推荐会消费该反馈')).toBeVisible();
  await capture('原始提案反馈读回',['UI-AT-feedback']);
  const results=await op<Array<{resultData:{items:Array<Record<string,unknown>>}}>>(page,'ai.tasks.results.list',{params:{taskId:task.id}},account.id);
  const forged=results[0]!.resultData.items.map((item,i)=>i?item:{...item,audienceTask:{...(item.audienceTask as object),route:'record'}});
  const rejectedPatch=await page.request.post('/api/v1/dispatch',{headers:{'x-account-id':account.id},data:{id:'ai.tasks.results.patch',input:{params:{taskId:task.id},body:{items:forged}}}});expect(rejectedPatch.ok()).toBe(false);
  await workspace.getByRole('button',{name:/采纳选中/}).click();await expect(workspace.getByText('已采纳可用候选，可在候选池选择立项')).toBeVisible({timeout:30000});
  await capture('明确采纳完成',['UI-AT-adopt']);
  const candidates=await op<Array<{id:string;title:string;card:{audienceTask:{job:string}}}>>(page,'candidates.list',{query:{page:1,pageSize:50}},account.id);expect(candidates.map(c=>c.title)).toEqual(['乱录屏变清楚教程']);expect(candidates[0]!.card.audienceTask.job).toBe('把乱录屏剪成教程');
  const promoted=await op<{projectId:string}>(page,'candidates.promote',{params:{candidateId:candidates[0]!.id},body:{}},account.id);expect(promoted.projectId).toBeTruthy();
  const stale=await op<{id:string}>(page,'ai.tasks.create',{body:{taskType:'topic.generate',inputData:{basis:'positioning'},attemptId:crypto.randomUUID()}},account.id);
  await expect.poll(async()=>(await op<{status:string}>(page,'ai.tasks.get',{params:{taskId:stale.id}},account.id)).status,{timeout:60000}).toBe('awaiting_confirmation');
  await op(page,'topics.workspace.save',{body:{config:saved.config,expectedVersion:1,idempotencyKey:'next-version'}},account.id);
  const conflict=await page.request.post('/api/v1/dispatch',{headers:{'x-account-id':account.id},data:{id:'ai.tasks.confirm',input:{params:{taskId:stale.id},body:{}}}});expect(conflict.status()).toBe(409);
  const isolated=await op<{id:string}>(page,'accounts.create',{body:{platform:'douyin',accountHandle:`@t1019-other-${Date.now()}`}});expect((await op<{version:number}>(page,'topics.workspace.get',{},isolated.id)).version).toBe(0);
  mkdirSync(resolve(process.cwd(),'../docs/verification/t1019'),{recursive:true});
  writeFileSync(resolve(process.cwd(),`../docs/verification/t1019/ui-${viewport.width}x${viewport.height}.json`),JSON.stringify({schema:'frontend-visible-copy/v1',task_id:'T-1019',commit_sha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),observed_at:new Date().toISOString(),captures},null,2)+'\n');
  await page.screenshot({path:resolve(process.cwd(),'../docs/verification/t1019/topics-e2e.png'),fullPage:true});
 }finally{await model.close();}
});
