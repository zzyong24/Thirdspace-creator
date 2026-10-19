# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: config.spec.cjs >> 父CFG公共保存刷新跨窗切组CAS和真实能力投影
- Location: ../docs/verification/t1300/acceptance/public/final-dc46cfa/b-config/config.spec.cjs:27:1

# Error details

```
Error: 跨组核验需当前owned库另一真实组

expect(received).toBeTruthy()

Received: undefined
```

# Test source

```ts
  1  | 'use strict';
  2  | const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{createRequire}=require('node:module');
  3  | const {test:base,expect,session,binding}=require('../driver/public-fixture.cjs');
  4  | const requireFrontend=createRequire(path.join(binding.sourceRoot,'frontend/package.json'));
  5  | const business=JSON.parse(fs.readFileSync(path.join(binding.sourceRoot,'docs/verification/t1307/acceptance/runs/final-t1307-t1308/b/HANDOFF.json'),'utf8'));
  6  | const root=path.join(binding.sourceRoot,'docs/verification/t1300/acceptance/runs/final-dc46cfa/b-config');
  7  | fs.mkdirSync(root,{recursive:true,mode:0o700});
  8  | const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
  9  | function save(name,value){const bytes=Buffer.from(JSON.stringify(value,null,2)+'\n');if(bytes.includes(Buffer.from(session.handshake)))throw Error('PRIVATE_SECRET_NOT_PERSISTED');fs.writeFileSync(path.join(root,name+'.json'),bytes,{mode:0o600});}
  10 | const safeCode=value=>typeof value==='string'&&/^[A-Za-z0-9_.:-]{1,120}$/.test(value)?value:'UNAVAILABLE';
  11 | async function reply(page,id,input={},groupId=business.groupId){
  12 |  let response;try{response=await page.request.post('/api/v1/dispatch',{timeout:900000,headers:{'x-group-id':groupId},data:{id,input}});}catch{throw Error('PUBLIC_RPC_TRANSPORT_FAILURE operation='+safeCode(id));}
  13 |  let body;try{body=await response.json();}catch{throw Error('PUBLIC_RPC_INVALID_JSON operation='+safeCode(id)+' status='+response.status());}
  14 |  return {status:response.status(),success:response.ok()&&body.success!==false,body};
  15 | }
  16 | async function rpc(page,id,input={},groupId){const r=await reply(page,id,input,groupId);if(!r.success)throw Error('PUBLIC_RPC_REJECTED operation='+safeCode(id)+' status='+r.status+' code='+safeCode(r.body.error?.code??r.body.code));return r.body.data;}
  17 | function op(request){try{return new URL(request.url()).pathname==='/api/v1/dispatch'?request.postDataJSON()?.id:null;}catch{return null;}}
  18 | const test=base.extend({context:async({},use)=>{const {chromium}=requireFrontend('@playwright/test');const context=await chromium.launchPersistentContext('',{channel:'chromium',headless:true,timeout:180000,baseURL:session.baseURL,viewport:{width:1366,height:900},extraHTTPHeaders:{'x-creatoros-handshake':session.handshake}});context.setDefaultTimeout(120000);context.setDefaultNavigationTimeout(300000);try{await use(context);}finally{await context.close();}}});
  19 | async function state(page){
  20 |  const versions=[];let p=1,total;do{const r=await reply(page,'artifacts.versions.list',{params:{artifactId:business.scriptId},query:{page:p,pageSize:100}});expect(r.success).toBe(true);total=r.body.meta?.total;expect(Number.isSafeInteger(total)&&total>=0).toBe(true);versions.push(...r.body.data);if(versions.length<total)expect(r.body.data.length).toBeGreaterThan(0);p++;}while(versions.length<total);expect(versions).toHaveLength(total);
  21 |  const tasks={};for(const [name,turn] of Object.entries(business.turns)){tasks[name]={ai:await rpc(page,'ai.tasks.get',{params:{taskId:turn.ids.aiTaskId}}),execution:await rpc(page,'execution.tasks.get',{params:{taskId:turn.ids.executionTaskId}})};}
  22 |  return {script:await rpc(page,'artifacts.get',{params:{artifactId:business.scriptId}}),versions,article:await rpc(page,'articles.get',{params:{outputId:business.turns.joint1.articleId}}),graphic:await rpc(page,'graphicPosts.get',{params:{outputId:business.turns.joint1.graphicId}}),tasks};
  23 | }
  24 | async function open(page){await page.goto('/settings?highlight=assistant-engine');await expect(page.locator('[data-slot="settings-dialog"]')).toBeVisible();await expect(page.getByLabel('文本创作与结构化模型来源',{exact:true})).toBeEnabled();}
  25 | async function witness(page,label){await page.screenshot({path:path.join(root,label+'.png'),fullPage:true,animations:'disabled',caret:'hide',timeout:120000});save(label,{at:new Date().toISOString(),url:page.url(),controls:await page.locator('[data-slot="model-capability-source"] select').evaluateAll(nodes=>nodes.map(n=>({label:n.getAttribute('aria-label'),value:n.value,disabled:n.disabled,options:Array.from(n.options).map(o=>({value:o.value,disabled:o.disabled}))}))),status:await page.locator('[data-slot^="model-source-status-"]').allTextContents(),aria:await page.locator('[data-slot="settings-dialog"]').ariaSnapshot()});}
  26 | async function uiSave(page,label){const wait=page.waitForResponse(r=>op(r.request())==='settings.modelRouting.put',{timeout:900000});await page.getByRole('button',{name:'保存模型来源',exact:true}).click();const response=await wait;let body;try{body=await response.json();}catch{throw Error('PUBLIC_UI_SAVE_INVALID_JSON');}save(label+'-put',{status:response.status(),input:response.request().postDataJSON().input,body});expect(response.status()).toBe(200);expect(body.success).not.toBe(false);await expect(page.getByRole('status').filter({hasText:'已保存并读回当前设置'})).toBeVisible();const read=await rpc(page,'settings.modelRouting.get');save(label+'-get',read);return read;}
  27 | test('父CFG公共保存刷新跨窗切组CAS和真实能力投影',async({page,context})=>{
  28 |  test.setTimeout(1800000);const network=[],forbidden=[];let initial,before,final,phase='setup';
  29 |  context.on('request',r=>{const id=op(r);if(id)network.push({phase,id,input:id==='settings.modelRouting.put'?r.postDataJSON()?.input:undefined,at:new Date().toISOString()});});
  30 |  await context.route('**/api/chat',route=>{forbidden.push('CHAT_REQUEST');return route.abort('blockedbyclient');});
  31 |  await context.route('**/api/v1/dispatch',route=>{const id=op(route.request());if(id&&/\.(create|put|save|adopt|apply|update|patch|delete|bind|attach|confirm|transition|promote|runNow|setEnabled|trigger|register|research|reset|restore)$/.test(id)&&id!=='settings.modelRouting.put'){forbidden.push(id);return route.abort('blockedbyclient');}return route.continue();});
  32 |  await context.addCookies([{name:'creatoros_current_group',value:encodeURIComponent(business.groupId),url:session.baseURL}]);
  33 |  await context.addInitScript(id=>{if(!localStorage.getItem('creatoros:current-group'))localStorage.setItem('creatoros:current-group',id);localStorage.removeItem('creatoros:current-account');localStorage.setItem('creatoros:onboarding:hidden','1');},business.groupId);
  34 |  try{
  35 |   initial=await rpc(page,'settings.modelRouting.get');save('CFG-initial',initial);before=await state(page);save('BUSINESS-before',before);
> 36 |   const groups=await rpc(page,'accountGroups.list');save('owned-groups',groups);const active=groups.filter(g=>g.status==='active'),other=active.find(g=>g.id!==business.groupId);expect(other,'跨组核验需当前owned库另一真实组').toBeTruthy();
     |                                                                                                                                                                                                                     ^ Error: 跨组核验需当前owned库另一真实组
  37 |   await open(page);await witness(page,'CFG-initial-ui');
  38 |   expect(await page.getByLabel('图片理解模型来源',{exact:true}).count()).toBe(0);expect(await page.getByLabel('检索向量模型来源',{exact:true}).count()).toBe(0);
  39 |   const second=await context.newPage();await open(second);await witness(second,'CFG-second-window-before');
  40 |   phase='combination-save';await page.getByLabel('文本创作与结构化模型来源',{exact:true}).selectOption('official');await page.getByLabel('图片模型来源',{exact:true}).selectOption('self');
  41 |   const changed=await uiSave(page,'CFG-combination');expect(changed.revision).toBe(initial.revision+1);expect(changed.choices).toEqual({...initial.choices,text:'official',vision:'self',image:'self'});await witness(page,'CFG-combination-ui');
  42 |   phase='CAS';const stale=await reply(page,'settings.modelRouting.put',{body:{schemaVersion:1,choices:initial.choices,expectedRevision:initial.revision}});save('CFG-stale-CAS-rejection',stale);expect(stale.success).toBe(false);expect(stale.status).toBe(409);expect(await rpc(page,'settings.modelRouting.get')).toEqual(changed);
  43 |   phase='cross-window';await second.getByRole('button',{name:'重新读取当前设置',exact:true}).click();await expect(second.getByLabel('文本创作与结构化模型来源',{exact:true})).toHaveValue('official');await expect(second.getByLabel('图片模型来源',{exact:true})).toHaveValue('self');await witness(second,'CFG-second-window-readback');
  44 |   await page.reload();await expect(page.getByLabel('文本创作与结构化模型来源',{exact:true})).toHaveValue('official');await expect(page.getByLabel('图片模型来源',{exact:true})).toHaveValue('self');await witness(page,'CFG-combination-reload');
  45 |   phase='unsupported';const unsupported=await reply(page,'settings.modelRouting.put',{body:{schemaVersion:1,choices:{...changed.choices,video:'codex'},expectedRevision:changed.revision}});save('AVAIL-unsupported-video-rejection',unsupported);expect(unsupported.success).toBe(false);expect(await rpc(page,'settings.modelRouting.get')).toEqual(changed);
  46 |   phase='restore-codex';await page.getByLabel('文本创作与结构化模型来源',{exact:true}).selectOption('codex');await page.getByLabel('图片模型来源',{exact:true}).selectOption('codex');final=await uiSave(page,'CFG-final-codex');expect(final.choices).toEqual({...initial.choices,text:'codex',vision:'codex',image:'codex'});expect(final.revision).toBe(changed.revision+1);await witness(page,'CFG-final-ui');
  47 |   phase='switch-group';await page.keyboard.press('Escape');await expect(page.locator('[data-slot="settings-dialog"]')).toHaveCount(0);await page.getByTestId('account-switcher-trigger').click();await page.locator('[data-testid="account-switcher-item"][data-group-id="'+other.id+'"]').click();
  48 |   await expect.poll(()=>page.evaluate(()=>localStorage.getItem('creatoros:current-group')),{timeout:120000}).toBe(other.id);await open(page);expect(await rpc(page,'settings.modelRouting.get',{},other.id)).toEqual(final);await expect(page.getByLabel('文本创作与结构化模型来源',{exact:true})).toHaveValue('codex');await expect(page.getByLabel('图片模型来源',{exact:true})).toHaveValue('codex');await witness(page,'CFG-other-group');
  49 |   await page.keyboard.press('Escape');await page.getByTestId('account-switcher-trigger').click();await page.locator('[data-testid="account-switcher-item"][data-group-id="'+business.groupId+'"]').click();await expect.poll(()=>page.evaluate(()=>localStorage.getItem('creatoros:current-group')),{timeout:120000}).toBe(business.groupId);await open(page);await page.reload();await expect(page.getByLabel('文本创作与结构化模型来源',{exact:true})).toHaveValue('codex');await witness(page,'CFG-final-reload-original-group');
  50 |   const caps=final.capabilities;expect(caps).toHaveLength(56);expect(new Set(caps.map(c=>c.mode+':'+c.capability)).size).toBe(56);save('AVAIL-actual-capabilities',{rows:caps,counts:caps.reduce((v,c)=>(v[c.status]=(v[c.status]??0)+1,v),{}),note:'真实GET元数据投影；不是56真实模型功能调用。认证错误只在受控组验，不登出当前认证。'});
  51 |   save('CFG-public-result',{status:'PASS',sourceHead:binding.sourceHead,candidateBinding:session.candidateBinding,baseURL:session.baseURL,groupId:business.groupId,otherGroupId:other.id,initialRevision:initial.revision,finalRevision:final.revision,publicUICombinationSave:true,publicUICodexRestore:true,refresh:true,secondWindowExplicitRead:true,actualGroupSwitch:true,staleCASStatus:stale.status,unsupportedStatus:unsupported.status,realModels:0,contentSaves:0});
  52 |  }finally{
  53 |   phase='final-readback';if(initial){const current=await rpc(page,'settings.modelRouting.get');save('CFG-final-actual',current);const desired={...initial.choices,text:'codex',vision:'codex',image:'codex'};if(JSON.stringify(current.choices)!==JSON.stringify(desired)){save('CFG-explicit-recovery-required',{current:current.choices,desired,reason:'未自动重提未知保存；交Root核定后沿当前revision恢复'});}}
  54 |   if(before){const after=await state(page);save('BUSINESS-after',after);save('BUSINESS-isolation',{unchanged:JSON.stringify(before)===JSON.stringify(after),beforeSha256:sha(JSON.stringify(before)),afterSha256:sha(JSON.stringify(after)),scriptVersionCount:before.versions.length,taskIds:Object.values(business.turns).map(t=>t.ids),realModels:0,contentSaves:0});expect(after).toEqual(before);}
  55 |   save('NETWORK',{events:network,forbidden,realModelRequests:forbidden.filter(x=>x==='CHAT_REQUEST').length});expect(forbidden).toEqual([]);
  56 |  }
  57 | });
  58 | 
```