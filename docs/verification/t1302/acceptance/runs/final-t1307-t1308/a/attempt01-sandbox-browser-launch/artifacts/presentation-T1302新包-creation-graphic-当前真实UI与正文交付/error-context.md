# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: presentation.spec.cjs >> T1302新包 creation-graphic 当前真实UI与正文交付
- Location: docs/verification/t1302/acceptance/public/a/final-t1307-t1308/presentation.spec.cjs:93:2

# Error details

```
Error: browserType.launchPersistentContext: Target page, context or browser has been closed
Browser logs:

<launching> /Users/zyongzhu/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing --disable-field-trial-config --disable-background-networking --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-back-forward-cache --disable-breakpad --disable-client-side-phishing-detection --disable-component-extensions-with-background-pages --disable-component-update --no-default-browser-check --disable-default-apps --disable-dev-shm-usage --disable-edgeupdater --disable-extensions --disable-features=AvoidUnnecessaryBeforeUnloadCheckSync,BoundaryEventDispatchTracksNodeRemoval,DestroyProfileOnBrowserClose,DialMediaRouteProvider,GlobalMediaControls,HttpsUpgrades,LensOverlay,MediaRouter,PaintHolding,ThirdPartyStoragePartitioning,Translate,AutoDeElevate,RenderDocument,OptimizationHints,msForceBrowserSignIn,msEdgeUpdateLaunchServicesPreferredVersion --enable-features=CDPScreenshotNewSurface --allow-pre-commit-input --disable-hang-monitor --disable-ipc-flooding-protection --disable-popup-blocking --disable-prompt-on-repost --disable-renderer-backgrounding --force-color-profile=srgb --metrics-recording-only --no-first-run --password-store=basic --use-mock-keychain --no-service-autorun --export-tagged-pdf --disable-search-engine-choice-screen --unsafely-disable-devtools-self-xss-warnings --edge-skip-compat-layer-relaunch --disable-infobars --disable-search-engine-choice-screen --disable-sync --enable-unsafe-swiftshader --headless --hide-scrollbars --mute-audio --blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4 --no-sandbox --user-data-dir=/var/folders/0f/yn6rgq1j2lj2n8_868n28jzc0000gn/T/playwright_chromiumdev_profile-uye7sP --remote-debugging-pipe about:blank
<launched> pid=72535
Call log:
  - <launching> /Users/zyongzhu/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing --disable-field-trial-config --disable-background-networking --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-back-forward-cache --disable-breakpad --disable-client-side-phishing-detection --disable-component-extensions-with-background-pages --disable-component-update --no-default-browser-check --disable-default-apps --disable-dev-shm-usage --disable-edgeupdater --disable-extensions --disable-features=AvoidUnnecessaryBeforeUnloadCheckSync,BoundaryEventDispatchTracksNodeRemoval,DestroyProfileOnBrowserClose,DialMediaRouteProvider,GlobalMediaControls,HttpsUpgrades,LensOverlay,MediaRouter,PaintHolding,ThirdPartyStoragePartitioning,Translate,AutoDeElevate,RenderDocument,OptimizationHints,msForceBrowserSignIn,msEdgeUpdateLaunchServicesPreferredVersion --enable-features=CDPScreenshotNewSurface --allow-pre-commit-input --disable-hang-monitor --disable-ipc-flooding-protection --disable-popup-blocking --disable-prompt-on-repost --disable-renderer-backgrounding --force-color-profile=srgb --metrics-recording-only --no-first-run --password-store=basic --use-mock-keychain --no-service-autorun --export-tagged-pdf --disable-search-engine-choice-screen --unsafely-disable-devtools-self-xss-warnings --edge-skip-compat-layer-relaunch --disable-infobars --disable-search-engine-choice-screen --disable-sync --enable-unsafe-swiftshader --headless --hide-scrollbars --mute-audio --blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4 --no-sandbox --user-data-dir=/var/folders/0f/yn6rgq1j2lj2n8_868n28jzc0000gn/T/playwright_chromiumdev_profile-uye7sP --remote-debugging-pipe about:blank
  - <launched> pid=72535
  - [pid=72535] <gracefully close start>
  - [pid=72535] <kill>
  - [pid=72535] <will force kill>
  - [pid=72535] exception while trying to kill process: Error: kill EPERM
  - [pid=72535] <process did exit: exitCode=null, signal=SIGABRT>
  - [pid=72535] starting temporary directories cleanup
  - [pid=72535] finished temporary directories cleanup
  - [pid=72535] <gracefully close end>

```

# Test source

```ts
  1   | 'use strict';
  2   | const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{createRequire}=require('node:module');
  3   | const {test:base,expect,session,binding}=require('../../../../../t1307/acceptance/candidate/driver/public-fixture.cjs');
  4   | const requireFrontend=createRequire(path.join(binding.sourceRoot,'frontend/package.json'));
  5   | const {JSDOM}=requireFrontend('jsdom'),MarkdownIt=requireFrontend('markdown-it');
  6   | const markdown=new MarkdownIt({html:false});
  7   | const control=JSON.parse(fs.readFileSync(path.join(__dirname,'HANDOFF.json'),'utf8'));
  8   | const handoffPath=path.join(binding.sourceRoot,control.businessHandoff);
  9   | const handoff=JSON.parse(fs.readFileSync(handoffPath,'utf8'));
  10  | const root=path.join(binding.sourceRoot,'docs/verification/t1302/acceptance/runs/final-t1307-t1308/a');
  11  | fs.mkdirSync(root,{recursive:true,mode:0o700});
  12  | const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
  13  | const clean=value=>typeof value==='string'?value.split(session.handshake).join('[REDACTED_OWNED_TEST_HANDSHAKE]'):value;
  14  | function write(name,value){const bytes=Buffer.from(value);if(bytes.includes(Buffer.from(session.handshake)))throw Error('PRIVATE_SECRET_NOT_PERSISTED');fs.writeFileSync(path.join(root,name),bytes,{mode:0o600});}
  15  | const save=(name,value)=>write(name+'.json',JSON.stringify(value,(_key,v)=>clean(v),2)+'\n');
  16  | const safeCode=value=>typeof value==='string'&&/^[A-Za-z0-9_.:-]{1,120}$/.test(value)?value:'UNAVAILABLE';
  17  | async function rpcReply(page,id,input={}){
  18  |  let response;try{response=await page.request.post('/api/v1/dispatch',{timeout:900000,headers:{'x-group-id':handoff.groupId},data:{id,input}});}catch{throw Error('PUBLIC_RPC_TRANSPORT_FAILURE operation='+safeCode(id));}
  19  |  let body;try{body=await response.json();}catch{throw Error('PUBLIC_RPC_INVALID_JSON operation='+safeCode(id)+' status='+response.status());}
  20  |  if(!response.ok()||body.success===false)throw Error('PUBLIC_RPC_REJECTED operation='+safeCode(id)+' status='+response.status()+' code='+safeCode(body.error?.code??body.code));
  21  |  return body;
  22  | }
  23  | const rpc=async(page,id,input={})=>(await rpcReply(page,id,input)).data;
  24  | function op(request){try{return new URL(request.url()).pathname==='/api/v1/dispatch'?request.postDataJSON()?.id:null;}catch{return null;}}
  25  | const isWrite=id=>/\.(create|put|save|adopt|apply|update|patch|delete|bind|attach|confirm|transition|promote|runNow|setEnabled|trigger|register|research|reset|restore)$/.test(id??'');
  26  | const fourLines=['问题：______','尝试：______','观察：______','下一步：______'];
  27  | const compact=value=>String(value??'').replace(/\s+/gu,'');
  28  | async function allState(page){
  29  |  const versions=[],ids=new Set();let pageIndex=1,total;
  30  |  do{const reply=await rpcReply(page,'artifacts.versions.list',{params:{artifactId:handoff.scriptId},query:{page:pageIndex,pageSize:100}});expect(Array.isArray(reply.data)).toBe(true);total=reply.meta?.total;expect(Number.isSafeInteger(total)&&total>=0).toBe(true);for(const row of reply.data){expect(ids.has(row.id)).toBe(false);ids.add(row.id);versions.push(row);}expect(versions.length).toBeLessThanOrEqual(total);if(versions.length<total)expect(reply.data.length).toBeGreaterThan(0);pageIndex++;}while(versions.length<total);
  31  |  expect(versions).toHaveLength(total);
  32  |  return {article:await rpc(page,'articles.get',{params:{outputId:handoff.turns.joint1.articleId}}),graphic:await rpc(page,'graphicPosts.get',{params:{outputId:handoff.turns.joint1.graphicId}}),script:await rpc(page,'artifacts.get',{params:{artifactId:handoff.scriptId}}),scriptVersions:versions,scriptVersionPages:pageIndex-1,total};
  33  | }
  34  | async function snap(page,name,detail={}){
  35  |  await page.screenshot({path:path.join(root,name+'.png'),fullPage:false,animations:'disabled',caret:'hide',timeout:120000});
  36  |  write(name+'.html',clean(await page.content()));write(name+'.aria.txt',clean(await page.locator('body').ariaSnapshot()));
  37  |  save(name+'-meta',{at:new Date().toISOString(),url:page.url(),viewport:page.viewportSize(),fullPage:false,clip:false,elementScreenshot:false,...detail});
  38  | }
  39  | const test=base.extend({context:async({},use)=>{
  40  |  const {chromium}=requireFrontend('@playwright/test');
> 41  |  const context=await chromium.launchPersistentContext('',{channel:'chromium',headless:true,timeout:180000,baseURL:session.baseURL,viewport:{width:1366,height:900},acceptDownloads:true,extraHTTPHeaders:{'x-creatoros-handshake':session.handshake}});
      |                ^ Error: browserType.launchPersistentContext: Target page, context or browser has been closed
  42  |  context.setDefaultTimeout(120000);context.setDefaultNavigationTimeout(300000);
  43  |  try{await use(context);}finally{await context.close();}
  44  | }});
  45  | function sourceDocument(source,family){return family==='editor-article'?source.candidate.candidate.document:family==='creation-graphic'?source.candidate.graphic:source.candidate.article;}
  46  | function expectedBlocks(document){
  47  |  const values=[document.title];for(const section of [...document.sections].sort((a,b)=>a.order-b.order)){if(section.heading)values.push(section.heading);const dom=new JSDOM(markdown.render(section.body));try{values.push(...Array.from(dom.window.document.body.children).map(n=>n.textContent).filter(Boolean));}finally{dom.window.close();}}return values;
  48  | }
  49  | function checkSource(actual,document){
  50  |  const text=compact(actual),blocks=expectedBlocks(document);let cursor=0;
  51  |  const positions=blocks.map(block=>{const at=text.indexOf(compact(block),cursor);expect(at,'真实source全文有序正文：'+block.slice(0,80)).toBeGreaterThanOrEqual(cursor);cursor=at+compact(block).length;return at;});
  52  |  for(const line of fourLines)expect(text).toContain(line);expect(actual).not.toMatch(/<\/?(?:strong|span)\b/i);
  53  |  return {allSourceBlocksInOrder:true,blocks,positions,fourLinesPreserved:true,newLiteralStrongSpan:false};
  54  | }
  55  | async function geometry(dialog){return dialog.evaluate(node=>{
  56  |  const rect=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right};};
  57  |  return {dialog:rect(node),title:rect(node.querySelector('h2')),close:rect(node.querySelector('button[aria-label="关闭"]')??node.querySelector('button')),scrolls:[node,...node.querySelectorAll('*')].filter(n=>n.scrollHeight>n.clientHeight+2).map(n=>({tag:n.tagName,role:n.getAttribute('role'),className:String(n.className),scrollTop:n.scrollTop,clientHeight:n.clientHeight,scrollHeight:n.scrollHeight,rect:rect(n)})),innerWidth,innerHeight,rootZoom:getComputedStyle(document.documentElement).zoom,bodyZoom:getComputedStyle(document.body).zoom};
  58  |  });}
  59  | async function openOwner(page,family,viewport){
  60  |  const kind=family==='creation-graphic'?'graphic':'article',turn=handoff.turns[family==='editor-article'?'editor':'joint1'];await page.setViewportSize(viewport);await page.goto(handoff.ownerURLs[kind]);
  61  |  await expect(page.locator(`[data-page="${kind==='graphic'?'graphic-post':'article'}-workbench"]`)).toBeVisible();
  62  |  const mobile=page.getByRole('button',{name:'打开编导',exact:true}),expand=page.getByRole('button',{name:'展开编导栏',exact:true});if(await mobile.isVisible())await mobile.click();else if(await expand.isVisible())await expand.click();
  63  |  const outer=page.locator('aside[data-slot="stage-chat-rail"]');await expect(outer).toBeVisible();await outer.getByRole('button',{name:'历史记录',exact:true}).click();
  64  |  const item=page.locator(`[data-slot="copilot-history-item"][data-conversation-id="${turn.ids.conversationId}"]`);await expect(item).toHaveCount(1);await item.click();
  65  |  const region=outer.getByRole('region',{name:family==='editor-article'?'编导编辑候选':'文章和图文联合候选',exact:true});await expect(region).toHaveCount(1);await expect(region).toBeVisible();
  66  |  const card=family==='editor-article'?region:region.locator('article').filter({has:page.getByRole('heading',{name:kind==='article'?'文章候选':'图文候选',exact:true})});await expect(card).toHaveCount(1);
  67  |  return {kind,turn,outer,card,mobile:await outer.getAttribute('role')==='dialog'};
  68  | }
  69  | async function visibleFourLines(page,article,dialog,label){
  70  |  const block=article.locator('p').filter({hasText:fourLines[0]}).first();await expect(block).toHaveCount(1);await block.scrollIntoViewIfNeeded();
  71  |  const rects=await block.evaluate(n=>{
  72  |   const r=n.getBoundingClientRect();const ancestors=[];let parent=n.parentElement;
  73  |   while(parent){const p=parent.getBoundingClientRect(),style=getComputedStyle(parent);if(/auto|scroll|hidden/.test(style.overflowY))ancestors.push({tag:parent.tagName,className:String(parent.className),top:p.top,bottom:p.bottom,scrollTop:parent.scrollTop,clientHeight:parent.clientHeight,scrollHeight:parent.scrollHeight});parent=parent.parentElement??parent.getRootNode()?.host;}
  74  |   return {text:n.textContent,rect:{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right},ancestors,innerWidth,innerHeight};
  75  |  });
  76  |  expect(rects.rect.y).toBeGreaterThanOrEqual(0);expect(rects.rect.bottom).toBeLessThanOrEqual(rects.innerHeight);for(const line of fourLines)expect(rects.text).toContain(line);
  77  |  await snap(page,label+'-four-lines-viewport',{fourLines:rects,dialogGeometry:await geometry(dialog)});return rects;
  78  | }
  79  | async function articleFidelity(page,dialog,turn,family,label,download){
  80  |  const source=await rpc(page,turn.sourceRead.operation,turn.sourceRead.input),document=sourceDocument(source,family);save(label+'-actual-source',source);save(label+'-source-document',document);
  81  |  const sourceText=document.sections.map(s=>s.body).join('\n\n');for(const line of fourLines)expect(sourceText).toContain(line);expect(sourceText).not.toMatch(/<\/?(?:strong|span)\b/i);
  82  |  const article=dialog.locator('[aria-label="公众号排版编辑器"]').locator('article');await expect(article).toHaveCount(1);
  83  |  const preview=await article.evaluate(n=>({html:n.outerHTML,text:n.textContent,blocks:Array.from(n.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li')).map(x=>x.textContent),theme:n.querySelector('[data-wenote-kind]')?.getAttribute('data-wenote-kind')}));write(label+'-native-preview.html',preview.html);save(label+'-native-preview',preview);
  84  |  const previewCheck=checkSource(preview.text,document);expect(preview.html.match(/\{\{[^}]+\}\}/g)||[]).toHaveLength(0);
  85  |  if(!document.nativeLayout)expect(preview.theme).toBe('graphite-minimal');const lines=await visibleFourLines(page,article,dialog,label);
  86  |  let delivery=null;if(download){
  87  |   const more=dialog.locator('summary').filter({hasText:/^更多导出$/});await more.click();const promise=page.waitForEvent('download',{timeout:120000});await dialog.getByRole('button',{name:'导出 HTML',exact:true}).click();const item=await promise;let failure;try{failure=await item.failure();}catch{throw Error('PUBLIC_DOWNLOAD_FAILURE');}expect(failure).toBeNull();const relative=label+'-original-download.html';await item.saveAs(path.join(root,relative));const bytes=fs.readFileSync(path.join(root,relative));if(bytes.includes(Buffer.from(session.handshake)))throw Error('PRIVATE_SECRET_NOT_PERSISTED');const dom=new JSDOM(bytes.toString('utf8'));let exported;try{const n=dom.window.document.querySelector('article');expect(n).not.toBeNull();exported={text:n.textContent,blocks:Array.from(n.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li')).map(x=>x.textContent)};}finally{dom.window.close();}
  88  |   const exportCheck=checkSource(exported.text,document);expect(compact(exported.text)).toBe(compact(preview.text));expect(exported.blocks.map(compact)).toEqual(preview.blocks.map(compact));delivery={path:path.join(root,relative),bytes:bytes.length,sha256:sha(bytes),rawBytesPreserved:true,downloadFailure:null,suggestedFilename:item.suggestedFilename(),exportCheck,previewAndExportEqual:true,orderedBlocksEqual:true};await expect(dialog.getByText('交付文件已生成。',{exact:true})).toBeVisible();await snap(page,label+'-download-complete');
  89  |  }
  90  |  const result={previewCheck,delivery,fourLines:lines,nativeLayout:document.nativeLayout??null,theme:preview.theme,sourceRead:turn.sourceRead,normalization:'仅分析副本去空白；source合法格式用独立markdown-it解析；原source及下载字节不改'};save(label+'-source-render-export-check',result);return result;
  91  | }
  92  | for(const family of ['creation-article','creation-graphic','editor-article']){
  93  |  test('T1302新包 '+family+' 当前真实UI与正文交付',async({page,context},info)=>{
  94  |   test.setTimeout(1800000);expect(binding.sourceHead).toBe(control.sourceHead);expect(handoff.sourceHead).toBe(binding.sourceHead);expect(session.baseURL).toBe(control.baseURL);expect(sha(fs.readFileSync(handoffPath))).toBe(control.businessHandoffSha256);
  95  |   const events=[],attempted=[],results=[];let phase='setup';
  96  |   context.on('request',request=>{try{const id=op(request);if(id)events.push({phase,id,input:request.postDataJSON()?.input,at:new Date().toISOString()});else if(new URL(request.url()).pathname==='/api/chat')events.push({phase,id:'/api/chat',method:request.method(),at:new Date().toISOString()});save(family+'-network',{events,attempted});}catch{}});
  97  |   await context.route('**/api/v1/dispatch',route=>{const id=op(route.request());if(isWrite(id)){attempted.push({phase,id});save(family+'-network',{events,attempted});return route.abort('blockedbyclient');}return route.fallback();});
  98  |   await context.route('**/api/chat',route=>{attempted.push({phase,id:'/api/chat'});save(family+'-network',{events,attempted});return route.abort('blockedbyclient');});
  99  |   await context.addCookies([{name:'creatoros_current_group',value:encodeURIComponent(handoff.groupId),url:session.baseURL}]);await context.addInitScript(id=>{localStorage.setItem('creatoros:current-group',id);localStorage.removeItem('creatoros:current-account');localStorage.setItem('creatoros:onboarding:hidden','1');},handoff.groupId);
  100 |   save(family+'-binding',{sourceHead:binding.sourceHead,controlHead:'b42967d2ec100860b70c2b0509745e332bf16fad',candidateBinding:session.candidateBinding,candidateBindingSha256:sha(fs.readFileSync(session.candidateBinding)),handoffSha256:sha(fs.readFileSync(handoffPath)),baseURL:session.baseURL,browserVersion:context.browser().version(),freshTemporaryPersistentContext:true,businessStorageCopied:false});
  101 |   const before=await allState(page);save(family+'-business-before',before);
  102 |   try{
  103 |    for(const [view,viewport] of [['ordinary',{width:1366,height:900}],['narrow',{width:1024,height:700}]]){
  104 |     phase=view+'-'+family;const {turn,outer,card,mobile}=await openOwner(page,family,viewport);const prompt=outer.locator('#ai-copilot-prompt'),placeholder=family==='creation-graphic'?'告诉我这份图文需要怎么调整':'告诉我这篇文章需要怎么调整';await expect(prompt).toHaveAttribute('aria-label','我能帮你做什么');await expect(prompt).toHaveAttribute('placeholder',placeholder);await expect(outer.locator('[data-slot="suggested-chip"]')).toHaveCount(0);await expect(outer.locator('[data-slot="suggested-action-chips"]')).toBeVisible();await expect(outer.locator('[data-slot="copilot-context-chips"]')).toBeVisible();await expect(outer.getByRole('button',{name:'添加文件或图片',exact:true})).toBeVisible();await expect(outer.locator('[data-slot="prompt-send-hint"]')).toContainText('发送');
  105 |     await prompt.fill('T1302未发送自然语言 '+phase);await expect(outer.getByRole('button',{name:'清空输入',exact:true})).toBeEnabled();await outer.getByRole('button',{name:'清空输入',exact:true}).click();await expect(prompt).toHaveValue('');const unsent='T1302保留未发送输入 '+phase;await prompt.fill(unsent);await snap(page,phase+'-assistant',{mobile});
  106 |     const marker=events.length;const beforePreviewRequests=events.filter(e=>e.id==='ai.workCandidates.source'&&e.input?.params?.conversationId===turn.ids.conversationId);save(phase+'-before-preview-requests',{requests:beforePreviewRequests,note:family==='editor-article'?'editor卡未开preview时不得预取本候选source':'creation保持原fresh/eager读取，不以editor lazy约束它'});if(family==='editor-article'&&view==='ordinary')expect(beforePreviewRequests).toHaveLength(0);
  107 |     const trigger=card.getByRole('button',{name:family==='editor-article'?'预览改动':'预览候选',exact:true});await trigger.focus();await page.keyboard.press('Enter');const dialog=page.getByRole('dialog',{name:family==='editor-article'?'文章改动预览':family==='creation-graphic'?'图文候选预览':'文章候选预览',exact:true});await expect(dialog).toBeVisible();await expect(dialog.getByRole('button',{name:family==='creation-graphic'?'导出分页 ZIP':'复制公众号文章',exact:true})).toBeEnabled();
  108 |     const summary=dialog.locator('summary').filter({hasText:/^本次采纳选择$/});await expect(summary).toBeVisible();await expect(dialog.getByRole('region',{name:'本次采纳选择',exact:true})).toHaveCount(0);const initialGeometry=await geometry(dialog);await snap(page,phase+'-default-collapsed',{geometry:initialGeometry});
  109 |     const previewRequests=events.slice(marker).filter(e=>['ai.workCandidates.source','articles.versions.get','graphicPosts.versions.get'].includes(e.id));save(phase+'-preview-requests',{requests:previewRequests});
  110 |     const close=dialog.getByRole('button',{name:'关闭',exact:true});await close.focus();await page.keyboard.press('Tab');const forward=await page.evaluate(()=>({label:document.activeElement.getAttribute('aria-label')||document.activeElement.textContent,inInner:!!document.activeElement.closest('[role="dialog"][data-state="open"]')&&!document.activeElement.closest('aside')}));expect(forward.inInner).toBe(true);await page.keyboard.press('Shift+Tab');await expect(close).toBeFocused();
  111 |     await summary.focus();await page.keyboard.press('Enter');const selection=dialog.getByRole('region',{name:'本次采纳选择',exact:true});await expect(selection).toBeVisible();const readable=await selection.innerText();expect(readable).toContain('引用');expect(readable).toContain('脚本保存版本');expect(readable).toContain('未提供可读名称');expect(readable).not.toContain(handoff.scriptId);expect(readable).not.toContain(turn.toolCallId);expect(readable).not.toContain('"kind"');expect(readable).not.toContain('"sourceRefs"');
  112 |     const boxes=selection.getByRole('checkbox'),defaults=await boxes.evaluateAll(nodes=>nodes.map(n=>({label:n.parentElement.textContent,checked:n.checked,disabled:n.disabled})));const locked=defaults.some(n=>n.disabled),lockText=await dialog.locator('[role="status"], [role="alert"]').allTextContents();await snap(page,phase+'-readable-source-expanded',{defaults,locked,lockText});
  113 |     const focusTrail=[];for(const key of ['Tab','Tab','Shift+Tab','Shift+Tab']){await page.keyboard.press(key);const current=await page.evaluate(()=>({label:document.activeElement.getAttribute('aria-label')||document.activeElement.textContent,inInner:!!document.activeElement.closest('[role="dialog"][data-state="open"]')&&!document.activeElement.closest('aside')}));focusTrail.push({key,...current});expect(current.inInner).toBe(true);}
  114 |     await summary.focus();await page.keyboard.press('Enter');await expect(selection).toHaveCount(0);let fidelity=null;
  115 |     if(family!=='creation-graphic')fidelity=await articleFidelity(page,dialog,turn,family,phase,view==='ordinary');else{const more=dialog.locator('summary').filter({hasText:/^更多导出$/});await more.click();await expect(dialog.getByRole('button',{name:'导出 HTML',exact:true})).toHaveCount(0);await expect(dialog.getByRole('button',{name:'下载当前页',exact:true})).toBeVisible();await expect(dialog.getByRole('button',{name:'复制当前页',exact:true})).toBeVisible();await snap(page,phase+'-graphic-export-actions');await more.click();}
  116 |     await page.keyboard.press('Escape');await expect(dialog).toBeHidden();await expect(outer).toBeVisible();await expect(trigger).toBeFocused();await expect(prompt).toHaveValue(unsent);await snap(page,phase+'-after-inner-Escape');
  117 |     await page.keyboard.press('Enter');await expect(dialog).toBeVisible();await summary.focus();await page.keyboard.press('Enter');await expect(selection).toBeVisible();expect(await boxes.evaluateAll(nodes=>nodes.map(n=>({label:n.parentElement.textContent,checked:n.checked,disabled:n.disabled})))).toEqual(defaults);await page.keyboard.press('Escape');await expect(dialog).toBeHidden();await expect(trigger).toBeFocused();await expect(prompt).toHaveValue(unsent);
  118 |     await page.keyboard.press('Escape');if(mobile){await expect(outer).toBeHidden();await expect(page.getByRole('button',{name:'打开编导',exact:true})).toBeFocused();}else await expect(outer).toBeVisible();await snap(page,phase+'-after-outer-Escape');
  119 |     results.push({view,viewport,mobile,status:'PASS',placeholder,ariaLabelPreserved:true,genericChips:0,controlsAndActualClear:true,defaultSelectionCollapsed:true,readableSource:true,defaults,locked,lockText,freshContextNoFrozenAdoptionInjected:true,forward,focusTrail,innerEscapePreservesOuterAndFocus:true,unsentRetained:true,choicesRetained:true,fidelity});save(family+'-checks',results);
  120 |    }
  121 |    save(family+'-result',{status:'PASS',family,checks:results,newModels:0,ownerSavePosts:0,freshContextState:'自然状态；无B业务sessionStorage；不强求本地confirmed/locked'});
  122 |   }catch(error){save(family+'-failure',{phase,error:clean(String(error)),stack:clean(error.stack)});await snap(page,family+'-failure',{phase}).catch(()=>{});throw Error(clean(String(error?.message??error)));}
  123 |   finally{const after=await allState(page);save(family+'-business-after',after);expect(after).toEqual(before);expect(attempted).toEqual([]);expect(events.filter(e=>isWrite(e.id)||e.id==='/api/chat')).toEqual([]);save(family+'-network',{events,attempted});save(family+'-isolation',{unchanged:true,beforeSha256:sha(JSON.stringify(before)),afterSha256:sha(JSON.stringify(after)),scriptVersionCount:before.total,scriptVersionPages:before.scriptVersionPages,models:0,saves:0,forbiddenAttempts:attempted});}
  124 |  });
  125 | }
  126 | 
```