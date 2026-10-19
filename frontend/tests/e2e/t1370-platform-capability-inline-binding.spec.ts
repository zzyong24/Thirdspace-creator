import {test as base,expect,type Page,type Route} from '@playwright/test';
import {writeFileSync} from 'node:fs';
import type {AccountGroupResource,PlatformAccountResource} from '@creatoros/contract';
import {recordExternalNetworkAttempt,formatExternalNetworkAttempts,type ExternalNetworkAttempt} from '../helpers/network-policy';

const test=base.extend({context:async({context},provide)=>{
 const attempts:ExternalNetworkAttempt[]=[];
 await context.route('**/*',async route=>{if(recordExternalNetworkAttempt(attempts,'http',route.request().url()))await route.abort('blockedbyclient');else await route.continue();});
 await context.routeWebSocket('**/*',async socket=>{if(recordExternalNetworkAttempt(attempts,'websocket',socket.url()))await socket.close({code:1008,reason:'External network requests are disabled.'});else socket.connectToServer();});
 await provide(context);expect(attempts,formatExternalNetworkAttempts(attempts)).toEqual([]);
}});
const wait={timeout:120_000};
type BindingRun={runId:string;groupId:string;platform:string;status:string;accountId:string|null};
type FixtureState={userId:string;currentGroupId:string;currentGroupName:string;runIds:string[];accountIds:string[];hostCalls:Array<{kind:string;runId?:string;contextLosses?:number}>;runs:BindingRun[];stageDetails:Array<{runId:string;pending:boolean}>;collectionSubmissions:number;aiTaskCount:number;scheduledJobCount:number;networkObservation:{scope:string;syntheticOfficialFulfilled:number;unexpectedOriginsBlocked:number}};
const host=()=>`http://127.0.0.1:${process.env.T1355_HOST_PORT??41359}`;
async function fixture<T>(path:string,body?:unknown):Promise<T>{const response=await fetch(host()+path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(120_000)});if(!response.ok)throw Error(`隔离宿主${path} HTTP${response.status}`);return await response.json() as T;}
const state=()=>fixture<FixtureState>('/state');
async function actual<T>(page:Page,id:string,input:unknown,groupId?:string):Promise<T>{const response=await page.request.post('/api/v1/dispatch',{...wait,headers:{'content-type':'application/json',...(groupId?{'x-group-id':groupId}:{})},data:{id,input}});expect(response.ok(),`${id}:HTTP${response.status()}`).toBe(true);return (await response.json()).data as T;}

test('T1370 平台能力行内扫码、真实写后读与原run恢复',async({page},info)=>{
 page.setDefaultTimeout(120_000);page.setDefaultNavigationTimeout(120_000);
 const initial=await state();const group=await actual<AccountGroupResource>(page,'accountGroups.create',{body:{name:`连续绑定验收${info.project.name==='t1370-normal'?'正常窗口':'最小窗口'}`,idempotencyKey:crypto.randomUUID()}});
 expect(group.userId).toBe(initial.userId);
 // 每例独立组，PG与Next共享真实数据；只代理绑定宿主，不代理账号/成员列表。
 const appOrigin=`http://127.0.0.1:${process.env.T1355_APP_PORT??41357}`;
 await page.context().addCookies([{name:'creatoros_current_group',value:group.id,url:appOrigin}]);
 await page.addInitScript(({groupId,expectedOrigin})=>{if(location.origin===expectedOrigin)localStorage.setItem('creatoros:current-group',groupId);},{groupId:group.id,expectedOrigin:appOrigin});
 const starts:Array<{key:string;runId:string|null;platform:string}>=[],proxyErrors:string[]=[],pageErrors:string[]=[],consoleErrors:string[]=[],points:unknown[]=[],accountPages:Array<{page:number;total:number;ids:string[]}>=[];
 let failDetailOnce=false,dropStartOnce=false;
 page.on('pageerror',error=>pageErrors.push(error.name+':'+error.message));
 page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
 const responseReads:Promise<void>[]=[];
 page.on('response',response=>{const request=response.request();if(!request.url().endsWith('/api/v1/dispatch')||!response.ok())return;let payload:{id?:string;input?:{query?:{page?:number}}};try{payload=request.postDataJSON();}catch{return;}
  if(payload.id==='accounts.list')responseReads.push(response.json().then((data:{data:Array<{id:string}>;meta:{page:number;total:number}})=>{accountPages.push({page:data.meta.page,total:data.meta.total,ids:data.data.map(row=>row.id)});},()=>{proxyErrors.push('账号分页响应未完整读回');}));
 });
 const proxy=async(route:Route)=>{
  let body:{id?:string;input?:unknown};try{body=route.request().postDataJSON();}catch{await route.continue();return;}
  if(failDetailOnce&&body.id==='accounts.get'){failDetailOnce=false;await route.abort('failed');return;}
  if(body.id!=='accounts.bind.start'&&body.id!=='accounts.bind.cancel'){await route.continue();return;}
  try{
   const headers=route.request().headers();const result=await fetch(host()+'/rpc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...body,scope:{groupId:headers['x-group-id']??null,accountId:headers['x-account-id']??null}}),signal:AbortSignal.timeout(120_000)});
   const text=await result.text();
   if(body.id==='accounts.bind.start'){
    const input=body.input as {body:{idempotencyKey:string;platform:string}};const envelope=JSON.parse(text) as {data?:{runId:string}};
    starts.push({key:input.body.idempotencyKey,platform:input.body.platform,runId:envelope.data?.runId??null});
    if(dropStartOnce){dropStartOnce=false;await route.abort('failed');return;}
   }
   await route.fulfill({status:result.status,contentType:'application/json',body:text});
  }catch(error){proxyErrors.push(error instanceof Error?error.name:'代理失败');await route.abort('failed');}
 };
 await page.route('**/api/v1/dispatch',proxy);
 async function capture(name:string,check_ids:string[],conditions:string[]=[]){await page.screenshot({path:info.outputPath(name+'.png'),animations:'disabled'});points.push({checkpoint:name,check_ids,conditions,viewport:page.viewportSize(),copy:await page.locator('body').innerText()});}
 async function begin(label:string,keyboard=false){const before=(await state()).runIds.length,trigger=page.getByRole('button',{name:`扫码绑定${label}账号`,exact:true});await expect(trigger).toBeEnabled(wait);if(keyboard){await trigger.focus();await page.keyboard.press('Enter');}else await trigger.click(wait);const dialog=page.getByRole('dialog',{name:`扫码绑定${label}账号`,exact:true});await expect(dialog).toBeVisible(wait);await expect(dialog.getByRole('heading',{name:`扫码绑定${label}账号`,exact:true})).toHaveCount(1);await expect.poll(async()=>(await state()).runIds.length,wait).toBe(before+1);const runId=(await state()).runIds.at(-1)!;await expect.poll(async()=>(await state()).stageDetails.some(row=>row.runId===runId&&row.pending),wait).toBe(true);return {runId,trigger,dialog};}
 async function release(runId:string,accountHandle:string,navigationRace=false,outcome:'success'|'failed'='success'){await fixture('/control/release',{runId,outcome,accountHandle,navigationRace});}
 async function verify(runId:string,label:string){await expect(page.getByRole('dialog')).toHaveCount(0,wait);const saved=(await state()).runs.find(row=>row.runId===runId)!;expect(saved.status).toBe('succeeded');expect(saved.accountId).toBeTruthy();const account=await actual<PlatformAccountResource>(page,'accounts.get',{params:{accountId:saved.accountId}},group.id);const fresh=await actual<AccountGroupResource>(page,'accountGroups.get',{params:{groupId:group.id}},group.id);expect(account.id).toBe(saved.accountId);expect(fresh.members.some(member=>member.accountId===account.id&&member.leftAt===null)).toBe(true);await expect(page.getByText(label,{exact:true})).toBeVisible(wait);return account;}
 const expected:Array<{id:string;accountHandle:string}>=[];
 try{
  await page.goto(appOrigin+'/accounts',wait);await expect(page.getByRole('region',{name:group.name,exact:true})).toContainText('当前工作区',wait);await expect(page.getByTestId('account-empty-state')).toBeVisible(wait);await capture('empty-platform-choice',['single_surface_and_focus','responsive_states'],['empty']);
  const capabilityTable=page.locator('table[aria-label="各平台能力"]');
  await expect(capabilityTable).toBeVisible(wait);await expect(page.getByText('查看平台能力',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'选择平台，扫码绑定',exact:true})).toHaveCount(0);
  for(const label of ['抖音','快手','视频号','公众号','小红书'])await expect(capabilityTable.getByRole('row').filter({has:page.getByRole('rowheader',{name:label,exact:true})}).getByRole('button',{name:`扫码绑定${label}账号`,exact:true})).toBeEnabled(wait);
  await expect(capabilityTable.getByRole('columnheader',{name:'自动发布',exact:true})).toHaveCount(0);await expect(capabilityTable.getByRole('columnheader',{name:'平台草稿',exact:true})).toHaveCount(0);
  const top=await capabilityTable.boundingBox(),members=await page.getByTestId('account-empty-state').boundingBox();expect(top).not.toBeNull();expect(members).not.toBeNull();expect(top!.y).toBeLessThan(members!.y);
  const geometry=await capabilityTable.locator('th, button').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return {label:node.textContent?.trim(),x:r.x,right:r.right,width:r.width,viewportWidth:innerWidth};}));
  expect(geometry.every(row=>row.x>=0&&row.right<=row.viewportWidth&&row.width>0),'平台表所有列和扫码入口应在当前水平视口内').toBe(true);points.push({checkpoint:'capability-table-geometry',geometry});
  await capture('expanded-original-capability-table',['inline_binding_and_removed_entries','responsive_states'],['empty']);
  const first=await begin('小红书',true);await capture('waiting-single-title',['single_surface_and_focus','unverified_retains_original','responsive_states'],['keyboard','loading']);
  failDetailOnce=true;await release(first.runId,'小红书本次真实核验的长账号名称用于确认单行操作与成功轻反馈');
  await expect(first.dialog.getByRole('alert')).toBeVisible(wait);await expect(first.dialog.getByText('绑定已完成',{exact:true})).toHaveCount(0);expect(starts.filter(row=>row.runId===first.runId)).toHaveLength(1);await capture('read-failure-retains-run',['unverified_retains_original','responsive_states'],['error']);
  await first.dialog.getByRole('button',{name:'刷新绑定状态',exact:true}).click(wait);const firstAccount=await verify(first.runId,'小红书本次真实核验的长账号名称用于确认单行操作与成功轻反馈');expected.push(firstAccount);await expect(first.trigger).toBeFocused(wait);await expect(page.getByRole('status').filter({hasText:'已绑定'})).toBeVisible(wait);await expect(page.getByRole('link',{name:/查看.*数据/})).toHaveCount(0);await expect(page.getByText(/状态见账号数据/)).toHaveCount(0);await capture('verified-auto-closed',['verified_auto_close','single_surface_and_focus']);
  for(const [label,name]of [['小红书','同平台第二个账号'],['抖音','跨平台抖音账号']] as const){const current=await begin(label);await release(current.runId,name);expected.push(await verify(current.runId,name));expect(starts.filter(row=>row.runId===current.runId)).toHaveLength(1);}
  const official=await begin('公众号');await release(official.runId,'导航后核对保存的公众号',true);expected.push(await verify(official.runId,'导航后核对保存的公众号'));
  const oaState=await state(),identity=oaState.hostCalls.find(row=>row.kind==='official-identity'&&row.runId===official.runId);expect(identity?.contextLosses).toBe(1);expect(oaState.hostCalls.filter(row=>row.kind==='official-profile-open'&&row.runId===official.runId)).toHaveLength(1);expect(oaState.hostCalls.filter(row=>row.kind==='profile-stopped'&&row.runId===official.runId)).toHaveLength(1);await capture('official-navigation-commit-and-close',['verified_auto_close','intent_and_repeated_binding']);
  // 丢失开始回执只核对同key；重开平台入口不能自动重发原unknown。
  dropStartOnce=true;const unknown=await begin('抖音');await expect(unknown.dialog.getByRole('alert')).toBeVisible(wait);await page.keyboard.press('Escape');await expect(unknown.dialog).toBeHidden(wait);const before=starts.length;await unknown.trigger.click(wait);const restored=page.getByRole('dialog',{name:'扫码绑定抖音账号'});await expect(restored.getByRole('button',{name:'核对上次绑定请求',exact:true})).toBeVisible(wait);expect(starts).toHaveLength(before);await capture('unknown-reopen-no-resubmit',['unverified_retains_original','intent_and_repeated_binding'],['repeat','error']);
  await restored.getByRole('button',{name:'核对上次绑定请求',exact:true}).click(wait);await expect.poll(()=>starts.length,wait).toBe(before+1);const requests=starts.filter(row=>row.runId===unknown.runId);expect(requests).toHaveLength(2);expect(new Set(requests.map(row=>row.key)).size).toBe(1);await release(unknown.runId,'原未知请求核对后保存的账号');expected.push(await verify(unknown.runId,'原未知请求核对后保存的账号'));
  const failed=await begin('快手');await release(failed.runId,'未完成的合成身份',false,'failed');await expect(failed.dialog.getByText('本次绑定未完成',{exact:true})).toBeVisible(wait);expect((await state()).runs.find(row=>row.runId===failed.runId)?.accountId).toBeNull();await capture('failed-original-run-visible',['unverified_retains_original','responsive_states'],['error']);await page.keyboard.press('Escape');await expect(failed.dialog).toBeHidden(wait);
  // 正式Next数据/RSC与浏览器状态同ID；列表读取不经受控代理。
  await page.reload(wait);for(const account of expected)await expect(page.getByText(account.accountHandle,{exact:true})).toBeVisible(wait);await page.goto(appOrigin+'/projects',wait);await page.goBack(wait);await expect(page.getByRole('region',{name:group.name,exact:true})).toBeVisible(wait);for(const account of expected)await expect(page.getByText(account.accountHandle,{exact:true})).toBeVisible(wait);await capture('real-back-refresh-members',['verified_auto_close','intent_and_repeated_binding','responsive_states'],['back','refresh']);
  await page.emulateMedia({colorScheme:'dark'});await expect(page.locator('html')).toHaveClass(/dark/);await capture('dark-members-platform-choice',['responsive_states'],[]);await page.emulateMedia({colorScheme:'light'});
  await Promise.all(responseReads);expect(accountPages.some(row=>row.page===2&&expected.every(account=>row.ids.includes(account.id)))).toBe(true);expect((await state()).collectionSubmissions).toBe(0);expect((await state()).aiTaskCount).toBe(0);expect((await state()).networkObservation.unexpectedOriginsBlocked).toBe(0);expect(proxyErrors).toEqual([]);expect(pageErrors).toEqual([]);expect(consoleErrors.filter(text=>text!=='Failed to load resource: net::ERR_FAILED'&&!text.startsWith('[describeUserError] TypeError: Failed to fetch'))).toEqual([]);expect(consoleErrors).toHaveLength(4);
  writeFileSync(info.outputPath('witness.json'),JSON.stringify({completed:true,fixtureBoundary:'受控平台宿主/真实private PG commit；账号成员列表/详情/RSC全部实际Next handler，非真人扫码',groupId:group.id,userId:initial.userId,expected,starts,accountPages,points,officialRunId:official.runId,officialIdentity:identity,backgroundReadback:await state(),pageErrors,consoleErrors,consoleBoundary:'两次明确断网注入各产生资源错误与开发humanizer日志；未展开Next开发徽标，不推断徽标详情',proxyErrors},null,2)+'\n',{mode:0o600});
 }finally{await page.unroute('**/api/v1/dispatch',proxy);}
});
