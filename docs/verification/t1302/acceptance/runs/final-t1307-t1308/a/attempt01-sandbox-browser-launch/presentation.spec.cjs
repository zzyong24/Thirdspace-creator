'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{createRequire}=require('node:module');
const {test:base,expect,session,binding}=require('../../../../../t1307/acceptance/candidate/driver/public-fixture.cjs');
const requireFrontend=createRequire(path.join(binding.sourceRoot,'frontend/package.json'));
const {JSDOM}=requireFrontend('jsdom'),MarkdownIt=requireFrontend('markdown-it');
const markdown=new MarkdownIt({html:false});
const control=JSON.parse(fs.readFileSync(path.join(__dirname,'HANDOFF.json'),'utf8'));
const handoffPath=path.join(binding.sourceRoot,control.businessHandoff);
const handoff=JSON.parse(fs.readFileSync(handoffPath,'utf8'));
const root=path.join(binding.sourceRoot,'docs/verification/t1302/acceptance/runs/final-t1307-t1308/a');
fs.mkdirSync(root,{recursive:true,mode:0o700});
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const clean=value=>typeof value==='string'?value.split(session.handshake).join('[REDACTED_OWNED_TEST_HANDSHAKE]'):value;
function write(name,value){const bytes=Buffer.from(value);if(bytes.includes(Buffer.from(session.handshake)))throw Error('PRIVATE_SECRET_NOT_PERSISTED');fs.writeFileSync(path.join(root,name),bytes,{mode:0o600});}
const save=(name,value)=>write(name+'.json',JSON.stringify(value,(_key,v)=>clean(v),2)+'\n');
const safeCode=value=>typeof value==='string'&&/^[A-Za-z0-9_.:-]{1,120}$/.test(value)?value:'UNAVAILABLE';
async function rpcReply(page,id,input={}){
 let response;try{response=await page.request.post('/api/v1/dispatch',{timeout:900000,headers:{'x-group-id':handoff.groupId},data:{id,input}});}catch{throw Error('PUBLIC_RPC_TRANSPORT_FAILURE operation='+safeCode(id));}
 let body;try{body=await response.json();}catch{throw Error('PUBLIC_RPC_INVALID_JSON operation='+safeCode(id)+' status='+response.status());}
 if(!response.ok()||body.success===false)throw Error('PUBLIC_RPC_REJECTED operation='+safeCode(id)+' status='+response.status()+' code='+safeCode(body.error?.code??body.code));
 return body;
}
const rpc=async(page,id,input={})=>(await rpcReply(page,id,input)).data;
function op(request){try{return new URL(request.url()).pathname==='/api/v1/dispatch'?request.postDataJSON()?.id:null;}catch{return null;}}
const isWrite=id=>/\.(create|put|save|adopt|apply|update|patch|delete|bind|attach|confirm|transition|promote|runNow|setEnabled|trigger|register|research|reset|restore)$/.test(id??'');
const fourLines=['问题：______','尝试：______','观察：______','下一步：______'];
const compact=value=>String(value??'').replace(/\s+/gu,'');
async function allState(page){
 const versions=[],ids=new Set();let pageIndex=1,total;
 do{const reply=await rpcReply(page,'artifacts.versions.list',{params:{artifactId:handoff.scriptId},query:{page:pageIndex,pageSize:100}});expect(Array.isArray(reply.data)).toBe(true);total=reply.meta?.total;expect(Number.isSafeInteger(total)&&total>=0).toBe(true);for(const row of reply.data){expect(ids.has(row.id)).toBe(false);ids.add(row.id);versions.push(row);}expect(versions.length).toBeLessThanOrEqual(total);if(versions.length<total)expect(reply.data.length).toBeGreaterThan(0);pageIndex++;}while(versions.length<total);
 expect(versions).toHaveLength(total);
 return {article:await rpc(page,'articles.get',{params:{outputId:handoff.turns.joint1.articleId}}),graphic:await rpc(page,'graphicPosts.get',{params:{outputId:handoff.turns.joint1.graphicId}}),script:await rpc(page,'artifacts.get',{params:{artifactId:handoff.scriptId}}),scriptVersions:versions,scriptVersionPages:pageIndex-1,total};
}
async function snap(page,name,detail={}){
 await page.screenshot({path:path.join(root,name+'.png'),fullPage:false,animations:'disabled',caret:'hide',timeout:120000});
 write(name+'.html',clean(await page.content()));write(name+'.aria.txt',clean(await page.locator('body').ariaSnapshot()));
 save(name+'-meta',{at:new Date().toISOString(),url:page.url(),viewport:page.viewportSize(),fullPage:false,clip:false,elementScreenshot:false,...detail});
}
const test=base.extend({context:async({},use)=>{
 const {chromium}=requireFrontend('@playwright/test');
 const context=await chromium.launchPersistentContext('',{channel:'chromium',headless:true,timeout:180000,baseURL:session.baseURL,viewport:{width:1366,height:900},acceptDownloads:true,extraHTTPHeaders:{'x-creatoros-handshake':session.handshake}});
 context.setDefaultTimeout(120000);context.setDefaultNavigationTimeout(300000);
 try{await use(context);}finally{await context.close();}
}});
function sourceDocument(source,family){return family==='editor-article'?source.candidate.candidate.document:family==='creation-graphic'?source.candidate.graphic:source.candidate.article;}
function expectedBlocks(document){
 const values=[document.title];for(const section of [...document.sections].sort((a,b)=>a.order-b.order)){if(section.heading)values.push(section.heading);const dom=new JSDOM(markdown.render(section.body));try{values.push(...Array.from(dom.window.document.body.children).map(n=>n.textContent).filter(Boolean));}finally{dom.window.close();}}return values;
}
function checkSource(actual,document){
 const text=compact(actual),blocks=expectedBlocks(document);let cursor=0;
 const positions=blocks.map(block=>{const at=text.indexOf(compact(block),cursor);expect(at,'真实source全文有序正文：'+block.slice(0,80)).toBeGreaterThanOrEqual(cursor);cursor=at+compact(block).length;return at;});
 for(const line of fourLines)expect(text).toContain(line);expect(actual).not.toMatch(/<\/?(?:strong|span)\b/i);
 return {allSourceBlocksInOrder:true,blocks,positions,fourLinesPreserved:true,newLiteralStrongSpan:false};
}
async function geometry(dialog){return dialog.evaluate(node=>{
 const rect=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right};};
 return {dialog:rect(node),title:rect(node.querySelector('h2')),close:rect(node.querySelector('button[aria-label="关闭"]')??node.querySelector('button')),scrolls:[node,...node.querySelectorAll('*')].filter(n=>n.scrollHeight>n.clientHeight+2).map(n=>({tag:n.tagName,role:n.getAttribute('role'),className:String(n.className),scrollTop:n.scrollTop,clientHeight:n.clientHeight,scrollHeight:n.scrollHeight,rect:rect(n)})),innerWidth,innerHeight,rootZoom:getComputedStyle(document.documentElement).zoom,bodyZoom:getComputedStyle(document.body).zoom};
 });}
async function openOwner(page,family,viewport){
 const kind=family==='creation-graphic'?'graphic':'article',turn=handoff.turns[family==='editor-article'?'editor':'joint1'];await page.setViewportSize(viewport);await page.goto(handoff.ownerURLs[kind]);
 await expect(page.locator(`[data-page="${kind==='graphic'?'graphic-post':'article'}-workbench"]`)).toBeVisible();
 const mobile=page.getByRole('button',{name:'打开编导',exact:true}),expand=page.getByRole('button',{name:'展开编导栏',exact:true});if(await mobile.isVisible())await mobile.click();else if(await expand.isVisible())await expand.click();
 const outer=page.locator('aside[data-slot="stage-chat-rail"]');await expect(outer).toBeVisible();await outer.getByRole('button',{name:'历史记录',exact:true}).click();
 const item=page.locator(`[data-slot="copilot-history-item"][data-conversation-id="${turn.ids.conversationId}"]`);await expect(item).toHaveCount(1);await item.click();
 const region=outer.getByRole('region',{name:family==='editor-article'?'编导编辑候选':'文章和图文联合候选',exact:true});await expect(region).toHaveCount(1);await expect(region).toBeVisible();
 const card=family==='editor-article'?region:region.locator('article').filter({has:page.getByRole('heading',{name:kind==='article'?'文章候选':'图文候选',exact:true})});await expect(card).toHaveCount(1);
 return {kind,turn,outer,card,mobile:await outer.getAttribute('role')==='dialog'};
}
async function visibleFourLines(page,article,dialog,label){
 const block=article.locator('p').filter({hasText:fourLines[0]}).first();await expect(block).toHaveCount(1);await block.scrollIntoViewIfNeeded();
 const rects=await block.evaluate(n=>{
  const r=n.getBoundingClientRect();const ancestors=[];let parent=n.parentElement;
  while(parent){const p=parent.getBoundingClientRect(),style=getComputedStyle(parent);if(/auto|scroll|hidden/.test(style.overflowY))ancestors.push({tag:parent.tagName,className:String(parent.className),top:p.top,bottom:p.bottom,scrollTop:parent.scrollTop,clientHeight:parent.clientHeight,scrollHeight:parent.scrollHeight});parent=parent.parentElement??parent.getRootNode()?.host;}
  return {text:n.textContent,rect:{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right},ancestors,innerWidth,innerHeight};
 });
 expect(rects.rect.y).toBeGreaterThanOrEqual(0);expect(rects.rect.bottom).toBeLessThanOrEqual(rects.innerHeight);for(const line of fourLines)expect(rects.text).toContain(line);
 await snap(page,label+'-four-lines-viewport',{fourLines:rects,dialogGeometry:await geometry(dialog)});return rects;
}
async function articleFidelity(page,dialog,turn,family,label,download){
 const source=await rpc(page,turn.sourceRead.operation,turn.sourceRead.input),document=sourceDocument(source,family);save(label+'-actual-source',source);save(label+'-source-document',document);
 const sourceText=document.sections.map(s=>s.body).join('\n\n');for(const line of fourLines)expect(sourceText).toContain(line);expect(sourceText).not.toMatch(/<\/?(?:strong|span)\b/i);
 const article=dialog.locator('[aria-label="公众号排版编辑器"]').locator('article');await expect(article).toHaveCount(1);
 const preview=await article.evaluate(n=>({html:n.outerHTML,text:n.textContent,blocks:Array.from(n.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li')).map(x=>x.textContent),theme:n.querySelector('[data-wenote-kind]')?.getAttribute('data-wenote-kind')}));write(label+'-native-preview.html',preview.html);save(label+'-native-preview',preview);
 const previewCheck=checkSource(preview.text,document);expect(preview.html.match(/\{\{[^}]+\}\}/g)||[]).toHaveLength(0);
 if(!document.nativeLayout)expect(preview.theme).toBe('graphite-minimal');const lines=await visibleFourLines(page,article,dialog,label);
 let delivery=null;if(download){
  const more=dialog.locator('summary').filter({hasText:/^更多导出$/});await more.click();const promise=page.waitForEvent('download',{timeout:120000});await dialog.getByRole('button',{name:'导出 HTML',exact:true}).click();const item=await promise;let failure;try{failure=await item.failure();}catch{throw Error('PUBLIC_DOWNLOAD_FAILURE');}expect(failure).toBeNull();const relative=label+'-original-download.html';await item.saveAs(path.join(root,relative));const bytes=fs.readFileSync(path.join(root,relative));if(bytes.includes(Buffer.from(session.handshake)))throw Error('PRIVATE_SECRET_NOT_PERSISTED');const dom=new JSDOM(bytes.toString('utf8'));let exported;try{const n=dom.window.document.querySelector('article');expect(n).not.toBeNull();exported={text:n.textContent,blocks:Array.from(n.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li')).map(x=>x.textContent)};}finally{dom.window.close();}
  const exportCheck=checkSource(exported.text,document);expect(compact(exported.text)).toBe(compact(preview.text));expect(exported.blocks.map(compact)).toEqual(preview.blocks.map(compact));delivery={path:path.join(root,relative),bytes:bytes.length,sha256:sha(bytes),rawBytesPreserved:true,downloadFailure:null,suggestedFilename:item.suggestedFilename(),exportCheck,previewAndExportEqual:true,orderedBlocksEqual:true};await expect(dialog.getByText('交付文件已生成。',{exact:true})).toBeVisible();await snap(page,label+'-download-complete');
 }
 const result={previewCheck,delivery,fourLines:lines,nativeLayout:document.nativeLayout??null,theme:preview.theme,sourceRead:turn.sourceRead,normalization:'仅分析副本去空白；source合法格式用独立markdown-it解析；原source及下载字节不改'};save(label+'-source-render-export-check',result);return result;
}
for(const family of ['creation-article','creation-graphic','editor-article']){
 test('T1302新包 '+family+' 当前真实UI与正文交付',async({page,context},info)=>{
  test.setTimeout(1800000);expect(binding.sourceHead).toBe(control.sourceHead);expect(handoff.sourceHead).toBe(binding.sourceHead);expect(session.baseURL).toBe(control.baseURL);expect(sha(fs.readFileSync(handoffPath))).toBe(control.businessHandoffSha256);
  const events=[],attempted=[],results=[];let phase='setup';
  context.on('request',request=>{try{const id=op(request);if(id)events.push({phase,id,input:request.postDataJSON()?.input,at:new Date().toISOString()});else if(new URL(request.url()).pathname==='/api/chat')events.push({phase,id:'/api/chat',method:request.method(),at:new Date().toISOString()});save(family+'-network',{events,attempted});}catch{}});
  await context.route('**/api/v1/dispatch',route=>{const id=op(route.request());if(isWrite(id)){attempted.push({phase,id});save(family+'-network',{events,attempted});return route.abort('blockedbyclient');}return route.fallback();});
  await context.route('**/api/chat',route=>{attempted.push({phase,id:'/api/chat'});save(family+'-network',{events,attempted});return route.abort('blockedbyclient');});
  await context.addCookies([{name:'creatoros_current_group',value:encodeURIComponent(handoff.groupId),url:session.baseURL}]);await context.addInitScript(id=>{localStorage.setItem('creatoros:current-group',id);localStorage.removeItem('creatoros:current-account');localStorage.setItem('creatoros:onboarding:hidden','1');},handoff.groupId);
  save(family+'-binding',{sourceHead:binding.sourceHead,controlHead:'b42967d2ec100860b70c2b0509745e332bf16fad',candidateBinding:session.candidateBinding,candidateBindingSha256:sha(fs.readFileSync(session.candidateBinding)),handoffSha256:sha(fs.readFileSync(handoffPath)),baseURL:session.baseURL,browserVersion:context.browser().version(),freshTemporaryPersistentContext:true,businessStorageCopied:false});
  const before=await allState(page);save(family+'-business-before',before);
  try{
   for(const [view,viewport] of [['ordinary',{width:1366,height:900}],['narrow',{width:1024,height:700}]]){
    phase=view+'-'+family;const {turn,outer,card,mobile}=await openOwner(page,family,viewport);const prompt=outer.locator('#ai-copilot-prompt'),placeholder=family==='creation-graphic'?'告诉我这份图文需要怎么调整':'告诉我这篇文章需要怎么调整';await expect(prompt).toHaveAttribute('aria-label','我能帮你做什么');await expect(prompt).toHaveAttribute('placeholder',placeholder);await expect(outer.locator('[data-slot="suggested-chip"]')).toHaveCount(0);await expect(outer.locator('[data-slot="suggested-action-chips"]')).toBeVisible();await expect(outer.locator('[data-slot="copilot-context-chips"]')).toBeVisible();await expect(outer.getByRole('button',{name:'添加文件或图片',exact:true})).toBeVisible();await expect(outer.locator('[data-slot="prompt-send-hint"]')).toContainText('发送');
    await prompt.fill('T1302未发送自然语言 '+phase);await expect(outer.getByRole('button',{name:'清空输入',exact:true})).toBeEnabled();await outer.getByRole('button',{name:'清空输入',exact:true}).click();await expect(prompt).toHaveValue('');const unsent='T1302保留未发送输入 '+phase;await prompt.fill(unsent);await snap(page,phase+'-assistant',{mobile});
    const marker=events.length;const beforePreviewRequests=events.filter(e=>e.id==='ai.workCandidates.source'&&e.input?.params?.conversationId===turn.ids.conversationId);save(phase+'-before-preview-requests',{requests:beforePreviewRequests,note:family==='editor-article'?'editor卡未开preview时不得预取本候选source':'creation保持原fresh/eager读取，不以editor lazy约束它'});if(family==='editor-article'&&view==='ordinary')expect(beforePreviewRequests).toHaveLength(0);
    const trigger=card.getByRole('button',{name:family==='editor-article'?'预览改动':'预览候选',exact:true});await trigger.focus();await page.keyboard.press('Enter');const dialog=page.getByRole('dialog',{name:family==='editor-article'?'文章改动预览':family==='creation-graphic'?'图文候选预览':'文章候选预览',exact:true});await expect(dialog).toBeVisible();await expect(dialog.getByRole('button',{name:family==='creation-graphic'?'导出分页 ZIP':'复制公众号文章',exact:true})).toBeEnabled();
    const summary=dialog.locator('summary').filter({hasText:/^本次采纳选择$/});await expect(summary).toBeVisible();await expect(dialog.getByRole('region',{name:'本次采纳选择',exact:true})).toHaveCount(0);const initialGeometry=await geometry(dialog);await snap(page,phase+'-default-collapsed',{geometry:initialGeometry});
    const previewRequests=events.slice(marker).filter(e=>['ai.workCandidates.source','articles.versions.get','graphicPosts.versions.get'].includes(e.id));save(phase+'-preview-requests',{requests:previewRequests});
    const close=dialog.getByRole('button',{name:'关闭',exact:true});await close.focus();await page.keyboard.press('Tab');const forward=await page.evaluate(()=>({label:document.activeElement.getAttribute('aria-label')||document.activeElement.textContent,inInner:!!document.activeElement.closest('[role="dialog"][data-state="open"]')&&!document.activeElement.closest('aside')}));expect(forward.inInner).toBe(true);await page.keyboard.press('Shift+Tab');await expect(close).toBeFocused();
    await summary.focus();await page.keyboard.press('Enter');const selection=dialog.getByRole('region',{name:'本次采纳选择',exact:true});await expect(selection).toBeVisible();const readable=await selection.innerText();expect(readable).toContain('引用');expect(readable).toContain('脚本保存版本');expect(readable).toContain('未提供可读名称');expect(readable).not.toContain(handoff.scriptId);expect(readable).not.toContain(turn.toolCallId);expect(readable).not.toContain('"kind"');expect(readable).not.toContain('"sourceRefs"');
    const boxes=selection.getByRole('checkbox'),defaults=await boxes.evaluateAll(nodes=>nodes.map(n=>({label:n.parentElement.textContent,checked:n.checked,disabled:n.disabled})));const locked=defaults.some(n=>n.disabled),lockText=await dialog.locator('[role="status"], [role="alert"]').allTextContents();await snap(page,phase+'-readable-source-expanded',{defaults,locked,lockText});
    const focusTrail=[];for(const key of ['Tab','Tab','Shift+Tab','Shift+Tab']){await page.keyboard.press(key);const current=await page.evaluate(()=>({label:document.activeElement.getAttribute('aria-label')||document.activeElement.textContent,inInner:!!document.activeElement.closest('[role="dialog"][data-state="open"]')&&!document.activeElement.closest('aside')}));focusTrail.push({key,...current});expect(current.inInner).toBe(true);}
    await summary.focus();await page.keyboard.press('Enter');await expect(selection).toHaveCount(0);let fidelity=null;
    if(family!=='creation-graphic')fidelity=await articleFidelity(page,dialog,turn,family,phase,view==='ordinary');else{const more=dialog.locator('summary').filter({hasText:/^更多导出$/});await more.click();await expect(dialog.getByRole('button',{name:'导出 HTML',exact:true})).toHaveCount(0);await expect(dialog.getByRole('button',{name:'下载当前页',exact:true})).toBeVisible();await expect(dialog.getByRole('button',{name:'复制当前页',exact:true})).toBeVisible();await snap(page,phase+'-graphic-export-actions');await more.click();}
    await page.keyboard.press('Escape');await expect(dialog).toBeHidden();await expect(outer).toBeVisible();await expect(trigger).toBeFocused();await expect(prompt).toHaveValue(unsent);await snap(page,phase+'-after-inner-Escape');
    await page.keyboard.press('Enter');await expect(dialog).toBeVisible();await summary.focus();await page.keyboard.press('Enter');await expect(selection).toBeVisible();expect(await boxes.evaluateAll(nodes=>nodes.map(n=>({label:n.parentElement.textContent,checked:n.checked,disabled:n.disabled})))).toEqual(defaults);await page.keyboard.press('Escape');await expect(dialog).toBeHidden();await expect(trigger).toBeFocused();await expect(prompt).toHaveValue(unsent);
    await page.keyboard.press('Escape');if(mobile){await expect(outer).toBeHidden();await expect(page.getByRole('button',{name:'打开编导',exact:true})).toBeFocused();}else await expect(outer).toBeVisible();await snap(page,phase+'-after-outer-Escape');
    results.push({view,viewport,mobile,status:'PASS',placeholder,ariaLabelPreserved:true,genericChips:0,controlsAndActualClear:true,defaultSelectionCollapsed:true,readableSource:true,defaults,locked,lockText,freshContextNoFrozenAdoptionInjected:true,forward,focusTrail,innerEscapePreservesOuterAndFocus:true,unsentRetained:true,choicesRetained:true,fidelity});save(family+'-checks',results);
   }
   save(family+'-result',{status:'PASS',family,checks:results,newModels:0,ownerSavePosts:0,freshContextState:'自然状态；无B业务sessionStorage；不强求本地confirmed/locked'});
  }catch(error){save(family+'-failure',{phase,error:clean(String(error)),stack:clean(error.stack)});await snap(page,family+'-failure',{phase}).catch(()=>{});throw Error(clean(String(error?.message??error)));}
  finally{const after=await allState(page);save(family+'-business-after',after);expect(after).toEqual(before);expect(attempted).toEqual([]);expect(events.filter(e=>isWrite(e.id)||e.id==='/api/chat')).toEqual([]);save(family+'-network',{events,attempted});save(family+'-isolation',{unchanged:true,beforeSha256:sha(JSON.stringify(before)),afterSha256:sha(JSON.stringify(after)),scriptVersionCount:before.total,scriptVersionPages:before.scriptVersionPages,models:0,saves:0,forbiddenAttempts:attempted});}
 });
}
