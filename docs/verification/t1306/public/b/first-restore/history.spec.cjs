'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{performance}=require('node:perf_hooks');
const {test,expect,session,binding}=require('../../../../t1304/acceptance/candidate/driver/public-fixture.cjs');
const root=path.join(binding.sourceRoot,'docs/verification/t1306/runs/first-restore/b');
const handoff=JSON.parse(fs.readFileSync(path.join(binding.sourceRoot,'docs/verification/t1303/acceptance/runs/final-t1304-t1305/b/HANDOFF.json'),'utf8'));
const A=handoff.turns.editor.ids.conversationId,B=handoff.turns.joint1.ids.conversationId;
const convKey='copilot:conv:group:'+handoff.groupId+':project:'+handoff.projectId;
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const safeCode=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,120}$/.test(x)?x:'UNAVAILABLE';
const readOps=new Set(['articles.get','graphicPosts.get','artifacts.get','artifacts.versions.list']);
const forbidden=new Set(['articles.versions.create','graphicPosts.versions.create','artifacts.versions.create','artifacts.scriptPatches.apply','ai.conversations.messages.create']);
const ids={A,B};
const stamp=()=>({at:new Date().toISOString(),monotonicMs:performance.now()});
function noSecret(bytes){if(bytes.includes(Buffer.from(session.handshake)))throw Error('PRIVATE_SECRET_NOT_PERSISTED');}
function write(file,value){const bytes=Buffer.from(typeof value==='string'?value:JSON.stringify(value,null,2)+'\n');noSecret(bytes);fs.writeFileSync(file,bytes,{mode:0o600});}
async function rpcReply(page,id,input={}){
 if(!readOps.has(id))throw Error('READ_OPERATION_NOT_ALLOWED');let response;
 try{response=await page.request.post('/api/v1/dispatch',{timeout:900000,headers:{'x-group-id':handoff.groupId},data:{id,input}});}catch{throw Error('READ_RPC_TRANSPORT_FAILURE operation='+safeCode(id));}
 let reply;try{reply=await response.json();}catch{throw Error('READ_RPC_INVALID_JSON operation='+safeCode(id)+' status='+response.status());}
 if(!response.ok()||reply.success===false)throw Error('READ_RPC_REJECTED operation='+safeCode(id)+' status='+response.status()+' code='+safeCode(reply.error?.code??reply.code));return reply;
}
const rpc=async(page,id,input={})=>(await rpcReply(page,id,input)).data;
async function business(page){const versions=[];let pageIndex=1,total;do{const reply=await rpcReply(page,'artifacts.versions.list',{params:{artifactId:handoff.scriptId},query:{page:pageIndex,pageSize:100}});total=reply.meta?.total;expect(Number.isSafeInteger(total)&&total>=0).toBe(true);expect(Array.isArray(reply.data)).toBe(true);for(const row of reply.data){expect(versions.some(v=>v.id===row.id)).toBe(false);versions.push(row);}expect(versions.length).toBeLessThanOrEqual(total);if(versions.length<total)expect(reply.data.length).toBeGreaterThan(0);pageIndex++;}while(versions.length<total);return {article:await rpc(page,'articles.get',{params:{outputId:handoff.turns.joint1.articleId}}),graphic:await rpc(page,'graphicPosts.get',{params:{outputId:handoff.turns.joint1.graphicId}}),script:await rpc(page,'artifacts.get',{params:{artifactId:handoff.scriptId}}),scriptVersions:versions};}
function dispatchInfo(request){try{if(new URL(request.url()).origin!==new URL(session.baseURL).origin||new URL(request.url()).pathname!=='/api/v1/dispatch')return null;return request.postDataJSON();}catch{return null;}}
async function ensureRail(page){const mobile=page.getByRole('button',{name:'打开编导',exact:true}),expand=page.getByRole('button',{name:'展开编导栏',exact:true});if(await mobile.isVisible())await mobile.click();else if(await expand.isVisible())await expand.click();await expect(page.locator('aside[data-slot="stage-chat-rail"]')).toBeVisible();}
async function openHistory(page){const button=page.getByRole('button',{name:'历史记录',exact:true});await button.click();await expect(page.locator('[data-slot="copilot-history-item"]').first()).toBeVisible();}
async function clickHistory(page,id){await openHistory(page);const button=page.locator('[data-slot="copilot-history-item"][data-conversation-id="'+id+'"]');await expect(button).toHaveCount(1);await button.click();}
async function visibleState(page){const a=await page.getByRole('region',{name:'编导编辑候选',exact:true}).isVisible(),b=await page.getByRole('region',{name:'文章和图文联合候选',exact:true}).isVisible();const pointer=await page.evaluate(key=>localStorage.getItem(key),convKey);return {visibleA:a,visibleB:b,visibleConversationId:a&&!b?A:b&&!a?B:null,naturalPointer:pointer,userTexts:await page.locator('[data-slot="copilot-messages"] [data-slot="copilot-message"][data-role="user"]').allTextContents()};}
async function visibleIdWithMenu(page){const state=await visibleState(page);await openHistory(page);const active=page.locator('[data-slot="copilot-history-item"][data-active="true"]');state.menuActiveIds=await active.evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-conversation-id')));await page.getByRole('button',{name:'历史记录',exact:true}).click();return state;}
async function waitVisible(page,id){const region=page.getByRole('region',{name:id===A?'编导编辑候选':'文章和图文联合候选',exact:true});await expect(region).toBeVisible();await expect.poll(async()=>await page.evaluate(key=>localStorage.getItem(key),convKey),{timeout:120000}).toBe(id);}
for(const [name,order] of [['01-a-then-b','A-B'],['02-b-then-a','B-A'],['03-hydrate-then-b','A-complete-B']]){
 test('T1306 '+name+' latest explicit history B remains selected',async({page,context},info)=>{
  const dir=path.join(root,name);fs.mkdirSync(dir,{recursive:true,mode:0o700});const save=(name,v)=>write(path.join(dir,name+'.json'),v);
  const events=[],reads=[],attemptedWrites=[],sourceReads=[];const requestRefs=new WeakMap();let phase='seed',hold=false;let before,finalState,outcome='INCONCLUSIVE',safeFailure=null;
  const record=()=>save('timeline',{case:name,order,events,reads:reads.map(({release,promise,...safe})=>safe),attemptedWrites,sourceReads});
  const event=(kind,detail={})=>{events.push({kind,...detail,...stamp()});record();};
  const snap=async label=>{await page.screenshot({path:path.join(dir,label+'.png'),fullPage:true,animations:'disabled',caret:'hide',timeout:120000});write(path.join(dir,label+'.html'),await page.content());write(path.join(dir,label+'.aria.txt'),await page.locator('body').ariaSnapshot());save(label+'-state',{...stamp(),url:page.url(),...await visibleState(page)});};
  context.on('request',request=>{const d=dispatchInfo(request);if(d?.id==='ai.workCandidates.source'){sourceReads.push({id:d.id,input:d.input,...stamp()});record();}});
  await context.route('**/api/v1/dispatch',route=>{const d=dispatchInfo(route.request());if(forbidden.has(d?.id)){attemptedWrites.push({id:d.id,...stamp()});record();return route.abort('blockedbyclient');}return route.fallback();});
  await context.route('**/api/chat',route=>{attemptedWrites.push({id:'/api/chat',...stamp()});record();return route.abort('blockedbyclient');});
  page.on('response',async response=>{const entry=requestRefs.get(response.request());if(!entry)return;entry.browserResponseAt=stamp();entry.browserStatus=response.status();record();try{const bytes=await response.body();noSecret(bytes);entry.browserBodySha256=sha(bytes);entry.browserBodyBytes=bytes.length;entry.browserBodyCompleteAt=stamp();record();}catch{entry.browserReadError='BROWSER_RESPONSE_BODY_UNAVAILABLE';record();}});
  page.on('requestfinished',request=>{const entry=requestRefs.get(request);if(entry){entry.requestFinishedAt=stamp();record();}});
  page.on('requestfailed',request=>{const entry=requestRefs.get(request);if(entry){entry.requestFailedAt=stamp();entry.failure='BROWSER_REQUEST_FAILED';record();}});
  const handler=async route=>{
   const request=route.request(),d=dispatchInfo(request),id=d?.input?.params?.conversationId;
   if(d?.id!=='ai.conversations.messages.list'||![A,B].includes(id))return route.fallback();
   let release;const promise=new Promise(resolve=>{release=resolve;});const entry={sequence:reads.length+1,phase,conversationId:id,label:id===A?'A':'B',requestInput:d.input,requestBodySha256:sha(Buffer.from(request.postData()??'')),requestStartedAt:stamp(),held:hold,release,promise};reads.push(entry);requestRefs.set(request,entry);record();
   try{
    let response;try{response=await route.fetch({timeout:900000});}catch{entry.transportError='MESSAGES_ROUTE_FETCH_FAILURE';record();await route.abort('connectionfailed').catch(()=>{});return;}
    entry.serverResponseAt=stamp();const bytes=await response.body();noSecret(bytes);entry.serverStatus=response.status();entry.serverBodySha256=sha(bytes);entry.serverBodyBytes=bytes.length;entry.serverBodyAt=stamp();
    write(path.join(dir,'read-'+String(entry.sequence).padStart(2,'0')+'-real-body.json'),bytes.toString('utf8'));
    let body;try{body=JSON.parse(bytes);}catch{entry.protocolError='INVALID_MESSAGES_JSON';}
    entry.responseMessageIds=Array.isArray(body?.data)?body.data.map(row=>({id:row.id,role:row.role,conversationId:row.conversationId})):[];
    if(response.status()!==200||body?.success===false){entry.protocolError='REAL_MESSAGES_NOT_200_SUCCESS';record();await route.fulfill({response});return;}
    record();if(entry.held)await promise;entry.releaseStartedAt=stamp();entry.releaseBodySha256=sha(bytes);record();
    await route.fulfill({response});entry.releaseReturnedAt=stamp();record();
   }catch{entry.safeHandlerError='MESSAGES_RESPONSE_CONTROL_FAILURE';record();await route.abort('connectionfailed').catch(()=>{});}
  };
  await page.route('**/api/v1/dispatch',handler);
  const latest=(label,readPhase)=>reads.filter(x=>x.label===label&&x.phase===readPhase).at(-1);
  const realReady=async(label,readPhase)=>{await expect.poll(()=>latest(label,readPhase)?.serverStatus,{timeout:120000}).toBe(200);const entry=latest(label,readPhase);expect(entry.protocolError).toBeUndefined();expect(entry.responseMessageIds.some(row=>row.id===(label==='A'?handoff.turns.editor.ids.sourceMessageId:handoff.turns.joint1.ids.sourceMessageId)),'真实响应必须含对应原source user消息ID').toBe(true);return entry;};
  const received=async entry=>{await expect.poll(()=>Boolean(entry.browserBodySha256&&entry.requestFinishedAt),{timeout:120000}).toBe(true);expect(entry.browserBodySha256).toBe(entry.serverBodySha256);expect(entry.browserStatus).toBe(200);};
  const release=async entry=>{event('explicit-release',{sequence:entry.sequence,label:entry.label});entry.release();await received(entry);};
  try{
   await context.addCookies([{name:'creatoros_current_group',value:encodeURIComponent(handoff.groupId),url:session.baseURL}]);await context.addInitScript(id=>{localStorage.setItem('creatoros:current-group',id);localStorage.removeItem('creatoros:current-account');localStorage.setItem('creatoros:onboarding:hidden','1');},handoff.groupId);
   save('binding',{sourceHead:binding.sourceHead,controlHead:'e5d18d2c7d2fc8126319268a9633b2921f25d5a6',candidateBindingSha256:sha(fs.readFileSync(session.candidateBinding)),packetSha256:sha(fs.readFileSync(path.join(__dirname,'TASK_PACKET.md'))),ids,convKey,temporaryFreshContext:true,businessStorageInjected:false});
   before=await business(page);save('business-before',before);await page.goto(handoff.ownerURLs.article);await expect(page.locator('[data-page="article-workbench"]')).toBeVisible();await ensureRail(page);
   await realReady('A','seed');await received(latest('A','seed'));await waitVisible(page,A);event('initial-default-A-ready',await visibleState(page));
   phase='explicit-seed-A';event('click-history-A');await clickHistory(page,A);const seedA=await realReady('A',phase);await received(seedA);await waitVisible(page,A);const seeded=await visibleIdWithMenu(page);expect(seeded.menuActiveIds).toEqual([A]);save('natural-seed-A',seeded);await snap('seed-A-before-reload');
   phase='reload';hold=true;event('natural-reload');await page.reload();await expect(page.locator('[data-page="article-workbench"]')).toBeVisible();await ensureRail(page);const restoreA=await realReady('A','reload');expect(restoreA.held).toBe(true);event('restore-A-real200-held',{sequence:restoreA.sequence});
   if(order==='A-complete-B'){
    await release(restoreA);await waitVisible(page,A);event('restore-A-visible-before-B',await visibleState(page));await snap('A-complete-before-B');hold=false;
   }
   phase='explicit-B';event('click-history-B');await clickHistory(page,B);const requestedB=await realReady('B','explicit-B');event('explicit-B-real200',{sequence:requestedB.sequence,held:requestedB.held});
   if(order==='A-B'){
    expect(requestedB.held).toBe(true);await release(restoreA);await waitVisible(page,A);event('A-visible-before-B-release',await visibleState(page));await snap('A-first-visible');await release(requestedB);
   }else if(order==='B-A'){
    expect(requestedB.held).toBe(true);await release(requestedB);await waitVisible(page,B);event('B-visible-before-A-release',await visibleState(page));await snap('B-first-visible');await release(restoreA);
   }else await received(requestedB);
   let visibleError;try{await waitVisible(page,B);}catch(error){visibleError=error;}
   finalState=await visibleIdWithMenu(page);save('final-visible',{...stamp(),...finalState});await snap('final');
   const userB=JSON.parse(fs.readFileSync(path.join(dir,'read-'+String(requestedB.sequence).padStart(2,'0')+'-real-body.json'),'utf8')).data.find(row=>row.role==='user');
   const userA=JSON.parse(fs.readFileSync(path.join(dir,'read-'+String(restoreA.sequence).padStart(2,'0')+'-real-body.json'),'utf8')).data.find(row=>row.role==='user');
   save('visible-identity-witness',{A:{conversationId:A,messageId:userA?.id,userContent:userA?.content},B:{conversationId:B,messageId:userB?.id,userContent:userB?.content},actualUserTexts:finalState.userTexts,menuActiveIds:finalState.menuActiveIds,actualVisibleConversationId:finalState.visibleConversationId,naturalPointer:finalState.naturalPointer});
   outcome=finalState.visibleConversationId===B&&finalState.naturalPointer===B&&JSON.stringify(finalState.menuActiveIds)===JSON.stringify([B])?'PASS':'FAIL';
   save('case-result',{case:name,order,status:outcome,expectedFinalConversationId:B,actual:finalState,allTargetReal200:true,originalBodiesUnchanged:[restoreA,requestedB].every(x=>x.serverBodySha256===x.browserBodySha256),note:'诊断观察；FAIL为用户选择未落实，不称复现成功即产品PASS'});
   expect(visibleError,'明确选择B后应显示B；先落实际原件，再保自然FAIL').toBeUndefined();expect(finalState.menuActiveIds).toEqual([B]);expect(finalState.visibleConversationId).toBe(B);
  }catch(error){safeFailure={name:safeCode(error?.name),message:String(error?.message??'DIAGNOSIS_ERROR').split(session.handshake).join('[REDACTED]')};save('safe-failure',safeFailure);if(outcome==='INCONCLUSIVE')save('case-result',{case:name,order,status:outcome,reason:safeFailure,actual:await visibleState(page).catch(()=>null)});await snap('failure').catch(()=>{});throw new Error(safeFailure.message);}
  finally{
   for(const entry of reads)entry.release();await page.unroute('**/api/v1/dispatch',handler);if(before){const after=await business(page);save('business-after',after);save('isolation-result',{completeDTOAndScriptEqual:JSON.stringify(after)===JSON.stringify(before),attemptedWrites});expect(after).toEqual(before);}expect(attemptedWrites).toEqual([]);record();
  }
 });
}
