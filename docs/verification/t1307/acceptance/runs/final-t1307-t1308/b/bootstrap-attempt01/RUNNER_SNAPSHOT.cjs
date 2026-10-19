'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {test,expect,session,binding}=require('../../../candidate/driver/public-fixture.cjs');
const root=path.join(binding.sourceRoot,'docs/verification/t1307/acceptance/runs/final-t1307-t1308/b');
fs.mkdirSync(root,{recursive:true,mode:0o700});
const save=(name,value)=>write(path.join(root,name+'.json'),JSON.stringify(value,null,2)+'\n');
function write(file,value){const bytes=Buffer.from(value);if(bytes.includes(Buffer.from(session.handshake)))throw Error('PRIVATE_SECRET_NOT_PERSISTED');fs.writeFileSync(file,bytes,{mode:0o600});}
const uuid=()=>crypto.randomUUID();
function op(request){try{return new URL(request.url()).pathname==='/api/v1/dispatch'?request.postDataJSON()?.id:null;}catch{return null;}}
const canonical=value=>JSON.stringify(value,(_k,v)=>v&&!Array.isArray(v)&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
let groupId,projectId,scriptId;const turns={};const network=[];let modelPosts=0;let phase='resume';
const safeCode=value=>typeof value==='string'&&/^[A-Za-z0-9_.:-]{1,120}$/.test(value)?value:'UNAVAILABLE';
// Never propagate Playwright transport errors: they may carry request headers.
async function rpcReply(page,id,input={}){
 let response;try{response=await page.request.post('/api/v1/dispatch',{timeout:900000,headers:groupId?{'x-group-id':groupId}:{},data:{id,input}});}catch{throw new Error('PUBLIC_RPC_TRANSPORT_FAILURE operation='+safeCode(id));}
 let body;try{body=await response.json();}catch{throw new Error('PUBLIC_RPC_INVALID_JSON operation='+safeCode(id)+' status='+response.status());}
 if(!response.ok()||body.success===false)throw new Error('PUBLIC_RPC_REJECTED operation='+safeCode(id)+' status='+response.status()+' code='+safeCode(body.error?.code??body.code));
 return body;
}
const rpc=async(page,id,input={})=>(await rpcReply(page,id,input)).data;
async function safeRouteFetch(route,operation){try{return await route.fetch({timeout:900000});}catch{throw new Error('PUBLIC_ROUTE_FETCH_FAILURE operation='+safeCode(operation));}}

const isWrite=id=>/\.(create|put|save|adopt|apply|update|delete|bind|attach)$/.test(id??'');
const writes=()=>network.filter(x=>['articles.versions.create','graphicPosts.versions.create'].includes(x.id));
async function scriptVersions(page){
 const all=[],ids=new Set();let pageNumber=1,total;
 do{const reply=await rpcReply(page,'artifacts.versions.list',{params:{artifactId:scriptId},query:{page:pageNumber,pageSize:100}});expect(Array.isArray(reply.data)).toBe(true);total=reply.meta?.total;expect(Number.isSafeInteger(total)&&total>=0,'完整版本列表须有真实total').toBe(true);
 for(const item of reply.data){expect(ids.has(item.id),'分页不能重复版本').toBe(false);ids.add(item.id);all.push(item);}expect(all.length).toBeLessThanOrEqual(total);if(all.length<total)expect(reply.data.length,'仍有后续页时必须前进').toBeGreaterThan(0);pageNumber++;
 }while(all.length<total);
 expect(all).toHaveLength(total);return all;
}
const scriptState=async page=>({artifact:await rpc(page,'artifacts.get',{params:{artifactId:scriptId}}),versions:await scriptVersions(page)});

async function resource(page,kind,turn){expect(turn,'所有资源读取必须显式绑定候选目标').toBeTruthy();const outputId=kind==='article'?turn.articleId:turn.graphicId;expect(outputId).toBeTruthy();const value=await rpc(page,kind==='article'?'articles.get':'graphicPosts.get',{params:{outputId}});expect(value.outputId).toBe(outputId);return value;}
async function snapshot(page,info,label){
 const png=path.join(root,label+'.png');await page.screenshot({path:png,fullPage:true,animations:'disabled',caret:'hide',timeout:120000});
 write(path.join(root,label+'.html'),await page.content());
 save(label+'-counts',{phase,modelPosts,ownerSavePosts:writes().length,operations:network.map(n=>({id:n.id,at:n.at,phase:n.phase})),url:page.url(),viewport:page.viewportSize(),at:new Date().toISOString()});
 await info.attach(label,{path:png,contentType:'image/png'});
}
async function openAssistant(page){
 const mobile=page.getByRole('button',{name:'打开编导',exact:true}),rail=page.getByRole('button',{name:'展开编导栏',exact:true});
 if(await mobile.isVisible())await mobile.click();else if(await rail.isVisible())await rail.click();
 await expect(page.getByRole('button',{name:'历史记录',exact:true})).toBeVisible();
}
async function history(page,turn){
 await openAssistant(page);await page.getByRole('button',{name:'历史记录',exact:true}).click();
 const item=page.locator(`[data-slot="copilot-history-item"][data-conversation-id="${turn.ids.conversationId}"]`);await expect(item).toHaveCount(1);await item.click();
 const card=page.getByRole('region',{name:turn.kind==='editor'?'编导编辑候选':'文章和图文联合候选',exact:true});await expect(card).toHaveCount(1);await expect(card).toBeVisible();return card;
}
async function owner(page,kind,turn,{navigate=true,dirty=false,width=1366}={}){
 if(navigate){await page.setViewportSize({width,height:900});await page.goto(kind==='article'?`/projects/${projectId}/article?outputId=${turn.articleId}`:`/projects/${projectId}/outputs/${turn.graphicId}/image`);}
 const main=page.locator(`[data-page="${kind==='article'?'article':'graphic-post'}-workbench"]`);await expect(main).toBeVisible();
 await expect(main.getByText(dirty?'已承接脚本，开始对话或导出时保存':'当前成稿已保存',{exact:true})).toBeVisible();
 await expect(main.getByRole('button',{name:kind==='article'?'复制公众号文章':'导出分页 ZIP',exact:true})).toBeEnabled();
 const region=await history(page,turn);
 await expect(page.getByRole('textbox',{name:'我能帮你做什么',exact:true})).toHaveAttribute('placeholder',kind==='article'?'告诉我这篇文章需要怎么调整':'告诉我这份图文需要怎么调整');
 return {main,region};
}
function member(page,region,kind){return region.locator('article').filter({has:page.getByRole('heading',{name:kind==='article'?'文章候选':'图文候选',exact:true})});}
async function modal(page,card,kind,editor=false){
 await card.getByRole('button',{name:editor?'预览改动':'预览候选',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:editor?(kind==='article'?'文章改动预览':'图文改动预览'):(kind==='article'?'文章候选预览':'图文候选预览'),exact:true});
 await expect(dialog).toBeVisible();await expect(dialog.getByRole('button',{name:kind==='article'?'复制公众号文章':'导出分页 ZIP',exact:true})).toBeEnabled();return dialog;
}
async function expand(page,dialog){const summary=dialog.locator('summary').filter({hasText:/^本次采纳选择$/});await expect(summary).toHaveCount(1);await summary.click();await expect(dialog.getByRole('region',{name:'本次采纳选择',exact:true})).toBeVisible();return dialog.getByRole('region',{name:'本次采纳选择',exact:true});}
async function close(dialog){await dialog.getByRole('button',{name:'关闭',exact:true}).click();await expect(dialog).toBeHidden();}
async function settle(page,response,label,kind){
 const headers=response.headers();const ids={conversationId:headers['x-conversation-id'],sourceMessageId:headers['x-source-message-id'],aiTaskId:headers['x-ai-task-id'],executionTaskId:headers['x-execution-task-id']};
 save(label+'-submission',{ids,httpStatus:response.status(),request:response.request().postDataJSON(),at:new Date().toISOString()});expect(response.status()).toBe(200);for(const value of Object.values(ids))expect(value).toBeTruthy();
 return observeOriginal(page,ids,label,kind);
}
async function observeOriginal(page,ids,label,kind){
 let task;await expect.poll(async()=>{task=await rpc(page,'execution.tasks.get',{params:{taskId:ids.executionTaskId}});save(label+'-task',{ids,task,at:new Date().toISOString()});return ['succeeded','failed','blocked','waiting_user','unknown_result','paused','cancelled','partial'].includes(task.runtimeStatus??task.status);},{timeout:1800000,intervals:[2000,5000]}).toBe(true);
 timingEvent('original-task-terminal',{label,ids,status:task.runtimeStatus??task.status,attempt:task.attempt});expect(task.runtimeStatus??task.status,'原任务终态，失败/未知不自动重发').toBe('succeeded');
 const messages=await rpc(page,'ai.conversations.messages.list',{params:{conversationId:ids.conversationId}});save(label+'-messages',messages);
 const assistant=messages.find(m=>m.role==='assistant'&&m.modelMetadata?.sourceMessageId===ids.sourceMessageId);expect(assistant).toBeTruthy();expect(assistant.modelMetadata.actualEngine).toBe('codex');
 const proposals=assistant.parts.map(p=>({...p,output:p.output?.data??p.output})).filter(p=>p.output?.kind===(kind==='editor'?'work.editor.candidate':'work.creation.propose')&&p.output.error===null);expect(proposals,'新独立会话只应有可精确对应的一张目标候选').toHaveLength(1);
 const part=proposals[0],value=part.output;const turn={label,kind,ids,assistantId:assistant.id,toolCallId:part.toolCallId,value,articleId:kind==='editor'?value.target.outputId:value.target.articleMember.outputId,graphicId:kind==='editor'?turns.joint1.graphicId:value.target.graphicMember.outputId};
 turn.attempt=task.attempt;turn.modelMetadata=assistant.modelMetadata;turn.sourceRead={operation:'ai.workCandidates.source',input:{params:{conversationId:ids.conversationId},query:{sourceMessageId:ids.sourceMessageId,toolCallId:part.toolCallId}}};save(label+'-candidate',turn);return turn;
}

const readFixture=()=>JSON.parse(fs.readFileSync(path.join(root,"fixture.json"),"utf8"));
async function generateInitial(page){
 phase='joint1-ui-generate';await page.goto(`/projects/${projectId}`);await openAssistant(page);await page.getByRole('button',{name:'新对话',exact:true}).click();
 const before=await scriptVersions(page);save('joint1-script-before-button',before);const promise=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/chat'&&r.request().method()==='POST',{timeout:1800000});await page.getByRole('button',{name:'一键生成文章和图文',exact:true}).click();const response=await promise;
 const request=response.request().postDataJSON(),target=request.chatContext.creationTarget;save('joint1-frozen-target',target);const confirmed=await scriptVersions(page);save('joint1-script-confirmed-baseline',confirmed);expect(confirmed.slice(0,before.length)).toEqual(before);expect(confirmed.at(-1).id).toBe(target.scriptSourceRef.versionId);expect(confirmed.at(-1).contentData.sections.map(s=>s.body).join('\n\n')).toBe(readFixture().original);
 const turn=await settle(page,response,'joint1','joint');turn.scriptBaseline=confirmed;turns.joint1=turn;save('turns-index',turns);expect(await scriptVersions(page)).toEqual(confirmed);return turn;
}
const {performance}=require('node:perf_hooks'),{createRequire}=require('node:module');
const requireFrontend=createRequire(path.join(binding.sourceRoot,'frontend/package.json'));
const {JSDOM}=requireFrontend('jsdom'),MarkdownIt=requireFrontend('markdown-it');
const markdown=new MarkdownIt({html:false});
const compact=s=>String(s??'').replace(/\s+/gu,'');
const fourLines=['问题：______','尝试：______','观察：______','下一步：______'];
const timing=[];function timingEvent(kind,detail={}){timing.push({kind,...detail,at:new Date().toISOString(),monotonicMs:performance.now(),phase});save('safe-timing',timing);}
async function allState(page,turn){return {article:await resource(page,'article',turn),graphic:await resource(page,'image',turn),script:await scriptState(page)};}
async function isolated(page,label,turn,action,{changed=null}={}){
 const before=await allState(page,turn);save(label+'-before',before);const result=await action();const after=await allState(page,turn);save(label+'-after',after);
 expect(after.script).toEqual(before.script);if(changed!=='article')expect(after.article).toEqual(before.article);if(changed!=='graphic')expect(after.graphic).toEqual(before.graphic);save(label+'-isolation',{status:'PASS',changed,scriptMetadataAndAllVersionsEqual:true,articleEqual:canonical(after.article)===canonical(before.article),graphicEqual:canonical(after.graphic)===canonical(before.graphic)});return result;
}
function sourceDocument(source,turn){return turn.kind==='editor'?source.candidate.candidate.document:source.candidate.article;}
function plainBlocks(document){const expected=[document.title];for(const section of [...document.sections].sort((a,b)=>a.order-b.order)){if(section.heading)expected.push(section.heading);const dom=new JSDOM(markdown.render(section.body));try{expected.push(...Array.from(dom.window.document.body.children).map(n=>n.textContent).filter(Boolean));}finally{dom.window.close();}}return expected;}
function validateText(actual,document){const expected=plainBlocks(document),text=compact(actual);let cursor=0;const positions=expected.map(block=>{const at=text.indexOf(compact(block),cursor);expect(at,'source全文有序正文必须保真：'+block.slice(0,100)).toBeGreaterThanOrEqual(cursor);cursor=at+compact(block).length;return at;});for(const line of fourLines)expect(text).toContain(line);expect(actual).not.toMatch(/<\/?(?:strong|span)\b/i);return {allSourceBlocksInOrder:true,expected,positions,fourLinesPreserved:true,newLiteralStrongSpan:false};}
async function fidelity(page,info,host,turn,label){
 const source=await rpc(page,turn.sourceRead.operation,turn.sourceRead.input);save(label+'-actual-source',source);const document=sourceDocument(source,turn);save(label+'-source-document',document);
 const sourceText=document.sections.map(x=>x.body).join('\n\n');const retained=fourLines.every(line=>sourceText.includes(line));save(label+'-source-family',{retained,expectedFourLines:fourLines,sourceContainsLiteralStrongSpan:/<\/?(?:strong|span)\b/i.test(sourceText),modelRetry:false});expect(retained,'真实模型source未保四行；保原task/source，不自动补发').toBe(true);expect(sourceText).not.toMatch(/<\/?(?:strong|span)\b/i);
 const article=host.locator('[aria-label="公众号排版编辑器"]').locator('article');await expect(article).toHaveCount(1);
 const preview=await article.evaluate(node=>({html:node.outerHTML,text:node.textContent,blocks:Array.from(node.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li')).map(n=>n.textContent),theme:node.querySelector('[data-wenote-kind]')?.getAttribute('data-wenote-kind')}));write(path.join(root,label+'-native-preview.html'),preview.html);save(label+'-native-preview',preview);expect(preview.theme).toBe('graphite-minimal');const previewCheck=validateText(preview.text,document);
 const relevant=article.locator('p').filter({hasText:'问题：______'});await expect(relevant.first()).toBeVisible();await relevant.first().scrollIntoViewIfNeeded();await article.screenshot({path:path.join(root,label+'-four-lines.png'),animations:'disabled',caret:'hide',timeout:120000});await snapshot(page,info,label+'-preview-visible');
 const more=host.locator('summary').filter({hasText:/^更多导出$/});await more.click();const pending=page.waitForEvent('download',{timeout:900000});await host.getByRole('button',{name:'导出 HTML',exact:true}).click();const download=await pending;let failed;try{failed=await download.failure();}catch{throw Error('PUBLIC_DOWNLOAD_FAILURE');}expect(failed).toBeNull();const file=path.join(root,label+'-original-download.html');await download.saveAs(file);const bytes=fs.readFileSync(file);if(bytes.includes(Buffer.from(session.handshake)))throw Error('PRIVATE_SECRET_NOT_PERSISTED');const html=bytes.toString('utf8');const dom=new JSDOM(html);let exported;try{const node=dom.window.document.querySelector('article');expect(node).not.toBeNull();exported={text:node.textContent,blocks:Array.from(node.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li')).map(n=>n.textContent)};}finally{dom.window.close();}
 const exportCheck=validateText(exported.text,document);save(label+'-source-render-export-check',{status:'PASS',previewCheck,exportCheck,originalDownload:{path:file,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,rawBytesUnchanged:true,suggestedFilename:download.suggestedFilename()},theme:preview.theme,nativeLayout:document.nativeLayout??null,normalization:'分析副本仅去空白；独立Markdown parser解释source合法格式，原source/HTML未改',previewAndExportEqual:compact(exported.text)===compact(preview.text)});return document;
}
async function exactCurrent(page,kind,turn){const current=await resource(page,kind,turn);const exact=await rpc(page,kind==='article'?'articles.versions.get':'graphicPosts.versions.get',{params:{outputId:current.outputId,versionId:current.currentVersionId}});expect(exact.versionId).toBe(current.currentVersionId);expect(current.current).toEqual(exact.document);return current;}
async function adopt(page,info,turn,kind,{dirty=false}={}){
 const label=turn.label+'-'+kind;phase=label;const {main,region}=await owner(page,kind,turn,{dirty});const card=turn.kind==='editor'?region:member(page,region,kind);
 const source=await isolated(page,label+'-source-read',turn,()=>rpc(page,turn.sourceRead.operation,turn.sourceRead.input));save(label+'-source',source);
 const dialog=await isolated(page,label+'-open-preview',turn,()=>modal(page,card,kind,turn.kind==='editor'));
 let document;if(kind==='article')document=await isolated(page,label+'-preview-and-original-download',turn,()=>fidelity(page,info,dialog,turn,label));
 await isolated(page,label+'-selection',turn,async()=>{const controls=await expand(page,dialog);save(label+'-selection-values',await controls.getByRole('checkbox').evaluateAll(nodes=>nodes.map(n=>({label:n.parentElement.textContent,checked:n.checked,disabled:n.disabled}))));});
 await isolated(page,label+'-close-preview',turn,()=>close(dialog));
 const before=await resource(page,kind,turn),count=writes().length;
 await isolated(page,label+'-adoption',turn,async()=>{await card.getByRole('button',{name:turn.kind==='editor'?'采纳到当前作品':kind==='article'?'采纳文章':'采纳图文',exact:true}).click();await expect(card.getByRole('status')).toContainText('已保存');await expect(main.getByText('当前成稿已保存',{exact:true})).toBeVisible();},{changed:kind==='article'?'article':'graphic'});
 const current=await exactCurrent(page,kind,turn);expect(current.currentVersionId).not.toBe(before.currentVersionId);expect(writes()).toHaveLength(count+1);if(document){expect(current.current.sections).toEqual(document.sections);for(const line of fourLines)expect(current.current.sections.map(x=>x.body).join('\n\n')).toContain(line);}
 await isolated(page,label+'-natural-reload',turn,async()=>{const url=page.url();await page.reload();expect(page.url()).toBe(url);await owner(page,kind,turn,{navigate:false});await exactCurrent(page,kind,turn);});
 if(kind==='article')await isolated(page,label+'-current-export',turn,()=>fidelity(page,info,page.locator('[data-page="article-workbench"]'),turn,label+'-adopted'));
 save(label+'-result',{status:'PASS',versionId:current.currentVersionId,exactCurrentReadback:true,request:writes().at(-1),sourceRead:turn.sourceRead,actualSourcePreserved:true,naturalReload:true});return current;
}
function handoff(){const value={sourceHead:binding.sourceHead,controlHead:'354786143377c58a12876731d00b075c4008a858',candidateBinding:session.candidateBinding,candidateBindingSha256:crypto.createHash('sha256').update(fs.readFileSync(session.candidateBinding)).digest('hex'),baseURL:session.baseURL,ownedRoot:session.ownedRoot,privateSessionPath:process.env.T1300_SESSION,groupId,projectId,scriptId,scriptURL:session.baseURL+'/projects/'+projectId,ownerURLs:{article:session.baseURL+`/projects/${projectId}/article?outputId=${turns.joint1.articleId}`,graphic:session.baseURL+`/projects/${projectId}/outputs/${turns.joint1.graphicId}/image`},turns,history:{A:turns.editor?.ids.conversationId,B:turns.joint1.ids.conversationId},timing:{file:'safe-timing.json',prepareInternal:'缺测；仅有实际UI触发、公开保存请求/POST及可见状态',backendJoin:'executionTaskId+attempt；toolCallId+sourceMessageId用于C按原日志映射callId；尚未取得的backend phase时刻不编造'},sourceInterceptOrder:'creation来源eager；先按operation+conversation/source/toolCall注册，再导航/挂载；editor预览前注册',models:modelPosts};save('HANDOFF',value);}
test('T1307 两真实UI turn source预览原HTML及采纳刷新隔离',async({page},info)=>{
 test.setTimeout(28800000);expect(binding.sourceHead).toBe('dc46cfa700ec9c9cbada47fb76237d0b50d10a67');let observer;
 page.on('request',request=>{const id=op(request);if(id){network.push({phase,id,input:request.postDataJSON()?.input,at:new Date().toISOString(),monotonicMs:performance.now()});save('network',network);if(['artifacts.versions.create','articles.versions.create','graphicPosts.versions.create'].includes(id))timingEvent('public-save-post-issued',{operation:id});}if(new URL(request.url()).pathname==='/api/chat'&&request.method()==='POST'){modelPosts++;save('model-posts',{count:modelPosts,phase,request:request.postDataJSON()});timingEvent('model-post-issued',{ordinal:modelPosts});}});
 page.on('response',response=>{if(new URL(response.url()).pathname==='/api/chat'&&response.request().method()==='POST'){const h=response.headers();timingEvent('chat-response-headers',{httpStatus:response.status(),ids:{conversationId:h['x-conversation-id'],sourceMessageId:h['x-source-message-id'],aiTaskId:h['x-ai-task-id'],executionTaskId:h['x-execution-task-id']}});}});
 await page.route('**/api/chat',route=>{if(modelPosts>2)return route.abort('blockedbyclient');return route.continue();});
 try{
  phase='setup';save('binding-reference',{sourceHead:binding.sourceHead,baseURL:session.baseURL,candidateBinding:session.candidateBinding});
  const group=await rpc(page,'accountGroups.create',{body:{name:'T1307-T1308-B-'+uuid(),idempotencyKey:uuid()}});groupId=group.id;save('owned',{groupId,sourceHead:binding.sourceHead,baseURL:session.baseURL,freshRoot:true,businessStorageCopied:false});
  await page.context().addCookies([{name:'creatoros_current_group',value:encodeURIComponent(groupId),url:session.baseURL}]);await page.addInitScript(id=>{localStorage.setItem('creatoros:current-group',id);localStorage.removeItem('creatoros:current-account');localStorage.setItem('creatoros:onboarding:hidden','1');},groupId);
  await page.goto('/settings?highlight=assistant-engine');save('cfg-before',await rpc(page,'settings.modelRouting.get'));await page.getByLabel('文本创作与结构化模型来源',{exact:true}).selectOption('codex');await page.getByLabel('图片模型来源',{exact:true}).selectOption('codex');const settings=page.waitForResponse(r=>op(r.request())==='settings.modelRouting.put',{timeout:900000});await page.getByRole('button',{name:'保存模型来源',exact:true}).click();expect((await settings).status()).toBe(200);await expect(page.getByRole('status').filter({hasText:'已保存并读回当前设置'})).toBeVisible();const cfg=await rpc(page,'settings.modelRouting.get');save('cfg-after',cfg);expect(cfg.choices).toMatchObject({text:'codex',vision:'codex',image:'codex'});
  const project=await rpc(page,'projects.create',{body:{title:'把一次尝试写清楚',brief:'仅依据原稿；四行练习是正文，请逐字保留文字、冒号与每处六个下划线，不增加统计或经历。',contentType:'article',targetPlatforms:['wechatOfficialAccount','xiaohongshu']}});projectId=project.id;const script=await rpc(page,'artifacts.create',{params:{projectId},body:{title:'一次尝试的四行记录',artifactType:'output_script',stage:'script'}});scriptId=script.id;
  const original='我整理工作笔记时，先把问题写清楚，再写尝试过的做法，最后记录观察到的现象。没有实际观察的内容就留空，不为了完整而补成一个结论。\n\n我想留给自己一张四行练习卡。以下四行属于正文，请保留原来的文字、顺序、换行和每处六个下划线，让读者以后自己填写：\n\n'+fourLines.join('\n')+'\n\n空白不是结果，只是提醒我把事实和判断分开。这里没有统计数字，也不承诺一定提高效率。记录之后，留一个值得继续观察的问题。';save('fixture',{groupId,projectId,scriptId,original,fourLines});
  await page.goto(`/projects/${projectId}`);const scriptEditor=page.locator('[data-slot="script-document"] [contenteditable="true"]');await expect(scriptEditor).toBeVisible();await scriptEditor.fill(original);await page.locator('[data-slot="editor-save-button"]').click();await expect(page.locator('[data-slot="editor-status-save-status"]')).toHaveText('已保存');const scripts=await scriptState(page);expect(scripts.versions.at(-1).contentData.sections.map(x=>x.body).join('\n\n')).toBe(original);save('script-ui-saved',scripts);
  const seen=new Set();let observing=false;observer=setInterval(async()=>{if(observing||page.isClosed())return;observing=true;try{const values=await page.locator('[data-slot="copilot-messages"]').evaluateAll(nodes=>nodes.map(n=>n.textContent));const text=values.join('\n');for(const label of ['读取','候选','完成','已保存'])if(text.includes(label)&&!seen.has(phase+':'+label)){seen.add(phase+':'+label);timingEvent('browser-first-visible-text-family',{label,pollIntervalMs:250,exactTTI:false});}}catch{}finally{observing=false;}},250);
  timingEvent('ui-joint-action-start');const joint=await generateInitial(page);expect(modelPosts).toBe(1);handoff();for(const kind of ['article','image'])await adopt(page,info,joint,kind,{dirty:true});save('joint1-complete',{status:'PASS',modelPosts});
  phase='editor-prepare-ui';await owner(page,'article',joint);await page.getByRole('button',{name:'新对话',exact:true}).click();const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/chat'&&r.request().method()==='POST',{timeout:1800000});const input=page.getByRole('textbox',{name:'我能帮你做什么',exact:true});await input.fill('请先work.editor.read读取当前文章，仅将文章最后一句改为“下一步，留下一个值得继续观察的问题。”。保留其它全部正文、顺序和四行“问题：______ / 尝试：______ / 观察：______ / 下一步：______”，四行分别换行，原字及六个下划线不能删除、转义或改成其它符号。不改变脚本或图文，不生成媒体。请用work.editor.propose给一份完整文章编辑候选，只出一份，先不保存。');timingEvent('ui-editor-submit-start');await page.getByRole('button',{name:'提交提示给 Copilot',exact:true}).click();turns.editor=await settle(page,await response,'editor','editor');expect(modelPosts).toBe(2);save('turns-index',turns);handoff();await adopt(page,info,turns.editor,'article');
  save('final-business',await allState(page,joint));handoff();save('BUSINESS_RESULT',{status:'PASS',modelPosts,groupId,projectId,scriptId,samePageContext:true,sourceFidelityBothTurns:true,completeIsolation:true,at:new Date().toISOString()});
 }catch(error){const code=String(error?.message??error);if(code.includes(session.handshake))throw Error('PRIVATE_ERROR_NOT_PERSISTED');save('FAILURE',{phase,modelPosts,message:code,at:new Date().toISOString()});await snapshot(page,info,'failure-'+phase).catch(()=>{});throw Error(code);}
 finally{if(observer)clearInterval(observer);save('network',network);save('safe-timing',timing);}
});
