# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: source.spec.cjs >> T1305 creation-article 真实source暂持中断与原位恢复
- Location: docs/verification/t1305/acceptance/public/a/final-t1304-t1305/source.spec.cjs:37:2

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('aside[data-slot="stage-chat-rail"]').getByRole('region', { name: '文章和图文联合候选', exact: true })
Expected: visible
Timeout: 120000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 120000ms
  - waiting for locator('aside[data-slot="stage-chat-rail"]').getByRole('region', { name: '文章和图文联合候选', exact: true })

```

```yaml
- complementary "主侧栏":
  - button "收起侧栏"
  - navigation "主要导航":
    - link "首页":
      - /url: /
    - link "创作者总览":
      - /url: /overview
    - link "定位中心":
      - /url: /positioning
    - link "内容雷达":
      - /url: /intelligence
    - link "选题":
      - /url: /topics
    - link "项目":
      - /url: /projects
    - link "知识库":
      - /url: /knowledge
    - link "素材中心":
      - /url: /assets
    - link "创作画布":
      - /url: /canvases
    - link "发布中心":
      - /url: /publishing
    - link "运营分析":
      - /url: /daily-report
    - link "自动化":
      - /url: /automations
    - link "设置":
      - /url: /settings
  - region "当前项目":
    - heading "当前项目" [level=2]
    - list:
      - listitem:
        - link "先写问题，再记录方法":
          - /url: /projects/project-d99d5a06-22
  - text: AI 助手
  - paragraph: 创作者，今天想先做点什么？
  - link "打开 AI 助手":
    - /url: "?copilot=open&scope=global"
  - button "帮助与反馈"
  - button "当前账号组：T1303-FINAL-B-fb228a46-df02-4a37-97d1-46b11d92e44c": 当前账号组 T1303-FINAL-B-fb228a46-df02-4a37-97d1-46b11d92e44c
  - text: "? 创作者 个人版"
- banner:
  - text: 先写问题，再记录方法
  - list "项目工作面":
    - listitem:
      - link "脚本":
        - /url: /projects/project-d99d5a06-22
    - listitem:
      - link "文章":
        - /url: /projects/project-d99d5a06-22/article?outputId=output-d99d5a06-76
    - listitem:
      - link "图文":
        - /url: /projects/project-d99d5a06-22/outputs/output-d99d5a06-88/image
    - listitem:
      - link "复盘":
        - /url: /projects/project-d99d5a06-22/review
  - link "搜索":
    - /url: /search
  - button "充值"
- main:
  - heading "公众号成稿" [level=1]
  - paragraph: 原稿来自脚本，在对话中调整这篇文章。
  - button "重新组织内容"
  - text: 当前成稿已保存
  - link "查看脚本原稿":
    - /url: /projects/project-d99d5a06-22
  - region "NoteRelay 排版预览":
    - heading "成稿预览" [level=2]
    - button "复制公众号文章"
    - group: 更多导出
    - article:
      - paragraph: 石墨极简风
      - heading "先写问题，再记录方法" [level=1]
      - paragraph: "01"
      - heading "先写下，这次要解决什么问题" [level=3]
      - paragraph: 我整理笔记时，会先写清楚要解决的问题，再记下实际做过的步骤，最后检查结果。
      - paragraph: 比如整理一份阅读笔记，我会先问自己：这次阅读解决了什么疑问？接着写下试过的方法，以及还没有想明白的地方。
      - paragraph: 这个问题可以具体一点：原来哪里没理解？读完以后，哪一点有了新的认识？如果暂时还说不清楚，就把疑问先留下来。后面记录方法时，再回头看它回应的是哪个问题。
      - paragraph: "02"
      - heading "沿着问题，记录实际做过的步骤" [level=3]
      - paragraph: 问题写下来之后，再顺着实际过程记录：先做了什么，接着尝试了什么，做到哪里仍然没有想明白。
      - paragraph: 读到的方法和自己做过的步骤，可以在笔记里分清楚。只是读到了、还没有亲自尝试的方法，就注明“尚未尝试”；已经试过的，则写下实际过程。
      - paragraph: 这样回看时，能知道哪些内容来自阅读，哪些是自己的实践记录，也能把做过的步骤对应到开头的问题。
      - paragraph: "03"
      - heading "写完步骤，再回头检查结果" [level=3]
      - paragraph: 步骤记完，还要回到最初的问题：现在想明白了什么，还有什么没有想明白？
      - paragraph: 整理阅读笔记时，可以把已经理解的部分写下来，再留下仍然困惑的地方。只想明白了一部分，就照实记录这一部分；暂时没有答案，也可以写明。
      - paragraph: 检查结果不必写得复杂。几句具体的话就够了：现在能解释什么，哪一步还说不清楚，接下来需要继续弄明白什么。
      - paragraph: "04"
      - heading "结束工作时，留下一个追问" [level=3]
      - paragraph: 我想保留一个习惯：每次结束工作，记下一个仍然值得追问的问题。
      - paragraph: 阅读笔记也可以这样收尾。从还没有想明白的地方，找出下一次想继续弄清楚的事。比如，把“这里还不太懂”写得更具体一些：“我还不能解释这一步为什么这样做。”这只是提问的示例，具体问题要来自当次阅读。
      - paragraph: 留下的问题不必当场回答。先把它写清楚，再考虑下一步。
      - paragraph: "05"
      - heading "下次整理笔记，试着留下这四行" [level=3]
      - paragraph:
        - text: 这次要解决的问题：___
        - emphasis: <strong style="color:#27272A;"><span leaf=""> 实际试过的方法和步骤：</span></strong>
        - emphasis: <strong style="color:#27272A;"><span leaf=""> 目前想明白的部分，以及还没想明白的地方：</span></strong>
        - emphasis: <strong style="color:#27272A;"><span leaf=""> 下次仍然值得追问的一个问题：</span></strong>
        - text: ___
      - paragraph: 这里没有统计数据，也不承诺这样记录，效率就一定提高。我想保留的，是整理笔记时写清楚问题、实际做法和当前结果，结束工作时再留下一个值得追问的问题。
      - paragraph: 下一步，先记录一个值得追问的问题。
    - group: 开源来源与许可
  - group: 历史版本
- separator "调整编导栏宽度"
- complementary "编导对话":
  - button "收起编导栏": 收起编导
  - heading "编导对话" [level=2]
  - paragraph: 基于当前稿与选区持续调整，预览后再采纳
  - text: ↑225K ↓566
  - button "新对话"
  - button "历史记录"
  - text: 项目 先写问题，再记录方法
  - list "助手活动记录":
    - listitem: 请先读取当前已采纳文章，将最后一句改为“下一步，先记录一个值得追问的问题。”。保留其他正文、事实和图片，不增加经历或数字，不修改脚本或其他平台。请用work.editor.propose给一份完整可预览采纳的文章编辑候选，先不要保存，只出一份。
    - listitem:
      - paragraph: 已生成一份完整可预览、可采纳的文章编辑候选，仅将最后一句改为：
      - blockquote:
        - paragraph: 下一步，先记录一个值得追问的问题。
      - paragraph: 其余正文、事实和图片状态保持不变，未增加经历或数字，未修改脚本或其他平台。候选尚未保存，等待你预览采纳。
      - group: 读取完成 · 读取当前作品
      - group: 已读取当前文章与选区
      - group: 读取完成 · 读取项目全流程
      - text: 项目全流程 · 先写问题，再记录方法
      - paragraph: 选题卡
      - paragraph: 已有
      - paragraph: 封面
      - paragraph: 暂无
      - paragraph: 审核
      - paragraph: 暂无
      - paragraph: 数据
      - paragraph: 暂无
      - paragraph: 稿件
      - paragraph: 已有
      - paragraph: 创作素材
      - paragraph: 暂无
      - paragraph: 发布
      - paragraph: 暂无
      - paragraph: 复盘
      - paragraph: 暂未接入
      - paragraph: 4 类稿件 · 0 份素材 · 0 条发布记录
      - group: 读取完成 · 读取执行方法
      - group: 候选待采用 · 生成精调候选
      - region "编导编辑候选":
        - heading "文章编辑候选" [level=3]
        - text: 1 项改动
        - paragraph: 仅将文章最后一句替换为“下一步，先记录一个值得追问的问题。”，保留其余正文、事实、来源、图片与版式。
        - button "预览改动"
        - button "采纳到当前作品" [disabled]
        - link "打开作品":
          - /url: /projects/project-d99d5a06-22/article?outputId=output-d99d5a06-76
  - textbox "我能帮你做什么":
    - /placeholder: 告诉我这篇文章需要怎么调整
  - button "Choose File"
  - button "添加文件或图片"
  - text: 也可拖到这里；图片识别效果取决于当前模型 ⌘/Ctrl ↩ 发送 · Enter 换行
  - button "清空输入" [disabled]: 清空
  - button "提交提示给 Copilot" [disabled]: 生成
- alert
```

# Test source

```ts
  1  | 'use strict';
  2  | const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{createRequire}=require('node:module');
  3  | const {test:base,expect,session,binding,dispatch}=require('../../../../../t1304/acceptance/candidate/driver/public-fixture.cjs');
  4  | const test=base.extend({context:async({},use)=>{
  5  |  const {chromium}=createRequire(path.join(binding.sourceRoot,'frontend/package.json'))('@playwright/test');
  6  |  const context=await chromium.launchPersistentContext('',{channel:'chromium',headless:true,timeout:180000,baseURL:session.baseURL,viewport:{width:1600,height:1000},extraHTTPHeaders:{'x-creatoros-handshake':session.handshake}});
  7  |  context.setDefaultTimeout(120000);context.setDefaultNavigationTimeout(300000);
  8  |  try{await use(context);}finally{await context.close();}
  9  | }});
  10 | const root=path.join(binding.sourceRoot,'docs/verification/t1305/acceptance/runs/final-t1304-t1305/a');
  11 | const handoffPath=path.join(binding.sourceRoot,'docs/verification/t1303/acceptance/runs/final-t1304-t1305/b/HANDOFF.json');
  12 | const handoff=JSON.parse(fs.readFileSync(handoffPath,'utf8'));const checks=[];let phase='setup';
  13 | const clean=x=>typeof x==='string'?x.split(session.handshake).join('[REDACTED_OWNED_TEST_HANDSHAKE]'):x;
  14 | function save(name,value){fs.writeFileSync(path.join(root,name+'.json'),JSON.stringify(value,(_key,v)=>clean(v),2)+'\n',{mode:0o600});}
  15 | async function snap(page,name){await page.screenshot({path:path.join(root,name+'.png'),animations:'disabled',caret:'hide',timeout:120000});fs.writeFileSync(path.join(root,name+'.html'),clean(await page.content()),{mode:0o600});fs.writeFileSync(path.join(root,name+'.aria.txt'),clean(await page.locator('body').ariaSnapshot()),{mode:0o600});save(name+'-meta',{at:new Date().toISOString(),phase,url:page.url(),viewport:page.viewportSize()});}
  16 | async function metrics(page,cdp,name){const cdpMetrics=await cdp.send('Page.getLayoutMetrics');const dom=await page.evaluate(()=>({innerWidth,innerHeight,devicePixelRatio,rootZoom:getComputedStyle(document.documentElement).zoom,bodyZoom:getComputedStyle(document.body).zoom,visualViewport:{width:visualViewport.width,height:visualViewport.height,scale:visualViewport.scale}}));save(name,{cdp:cdpMetrics,dom});return {cdp:cdpMetrics,dom};}
  17 | async function readAll(page){const rpc=(id,input)=>dispatch(page,id,input,handoff.groupId);const versions=[];let pageIndex=1;for(;;){const items=await rpc('artifacts.versions.list',{params:{artifactId:handoff.scriptId},query:{page:pageIndex,pageSize:100}});expect(Array.isArray(items)).toBe(true);versions.push(...items);if(items.length<100)break;pageIndex++;}return {article:await rpc('articles.get',{params:{outputId:handoff.turns.joint1.articleId}}),graphic:await rpc('graphicPosts.get',{params:{outputId:handoff.turns.joint1.graphicId}}),script:await rpc('artifacts.get',{params:{artifactId:handoff.scriptId}}),scriptVersions:versions,scriptVersionPages:pageIndex};}
  18 | async function openOwner(page,family,viewport){
  19 |  await page.setViewportSize(viewport);const kind=family==='creation-graphic'?'graphic':'article';await page.goto(handoff.ownerURLs[kind]);
  20 |  await expect(page.locator(`[data-page="${kind==='graphic'?'graphic-post':'article'}-workbench"]`)).toBeVisible();
  21 |  const mobile=page.getByRole('button',{name:'打开编导',exact:true}),expand=page.getByRole('button',{name:'展开编导栏',exact:true});
  22 |  if(await mobile.isVisible()){await mobile.click();await expect(page.getByRole('button',{name:'收起编导栏',exact:true})).toBeFocused();}else if(await expand.isVisible())await expand.click();
  23 |  const outer=page.locator('aside[data-slot="stage-chat-rail"]');await expect(outer).toBeVisible();
  24 |  await outer.getByRole('button',{name:'历史记录',exact:true}).click();const turn=handoff.turns[family==='editor-article'?'editor':'joint1'];
  25 |  await page.locator(`[data-slot="copilot-history-item"][data-conversation-id="${turn.ids.conversationId}"]`).click();
> 26 |  const region=outer.getByRole('region',{name:family==='editor-article'?'编导编辑候选':'文章和图文联合候选',exact:true});await expect(region).toBeVisible();
     |                                                                                                                               ^ Error: expect(locator).toBeVisible() failed
  27 |  const card=family==='editor-article'?region:region.locator('article').filter({has:page.getByRole('heading',{name:kind==='article'?'文章候选':'图文候选',exact:true})});await expect(card).toHaveCount(1);
  28 |  return {outer,card,mobile:await outer.getAttribute('role')==='dialog',turn};
  29 | }
  30 | 
  31 | const COPY='候选来源暂时读取失败，请关闭预览后重新打开。';
  32 | const forbidden=new Set(['articles.versions.create','graphicPosts.versions.create','artifacts.versions.create','artifacts.scriptPatches.apply','ai.conversations.messages.create']);
  33 | function sourceMatch(request,turn){try{if(new URL(request.url()).origin!==new URL(session.baseURL).origin)return false;const post=request.postDataJSON();return post?.id==='ai.workCandidates.source'&&JSON.stringify(post.input)===JSON.stringify(turn.sourceRead.input);}catch{return false;}}
  34 | async function openDialog(page,card,family){const trigger=card.getByRole('button',{name:family==='editor-article'?'预览改动':'预览候选',exact:true});await trigger.focus();await expect(trigger).toBeFocused();await page.keyboard.press('Enter');const dialog=page.getByRole('dialog',{name:family==='editor-article'?'文章改动预览':family==='creation-graphic'?'图文候选预览':'文章候选预览',exact:true});await expect(dialog).toBeVisible();return {dialog,trigger};}
  35 | function detailsState(page){return page.locator('[role="dialog"] input[type="checkbox"]').evaluateAll(nodes=>nodes.map(n=>({label:n.parentElement.textContent,checked:n.checked,disabled:n.disabled})));}
  36 | for(const family of ['creation-article','creation-graphic','editor-article']){
  37 |  test('T1305 '+family+' 真实source暂持中断与原位恢复',async({page,context},info)=>{
  38 |   phase=family;const events=[],attemptedWrites=[],sourceRequests=[],sourceResponses=[],held=[];const turn=handoff.turns[family==='editor-article'?'editor':'joint1'];let release;const gate=new Promise(resolve=>{release=resolve;});
  39 |   const record=()=>save(family+'-network',{events,attemptedWrites,sourceRequests,sourceResponses,held});
  40 |   context.on('request',request=>{try{const u=new URL(request.url());if(u.pathname==='/api/v1/dispatch')events.push({id:request.postDataJSON()?.id,input:request.postDataJSON()?.input});else if(u.pathname==='/api/chat')events.push({id:'/api/chat',method:request.method()});if(sourceMatch(request,turn)){sourceRequests.push({url:request.url(),body:request.postDataJSON()});}record();}catch{}});
  41 |   page.on('response',async response=>{if(sourceMatch(response.request(),turn)){try{sourceResponses.push({status:response.status(),url:response.url(),body:await response.json()});record();}catch(error){save(family+'-response-read-error',{error:clean(String(error))});}}});
  42 |   await context.route('**/api/v1/dispatch',route=>{const id=route.request().postDataJSON()?.id;if(forbidden.has(id)){attemptedWrites.push({id});record();return route.abort('blockedbyclient');}return route.fallback();});
  43 |   await context.route('**/api/chat',route=>{attemptedWrites.push({id:'/api/chat'});record();return route.abort('blockedbyclient');});
  44 |   await context.addCookies([{name:'creatoros_current_group',value:encodeURIComponent(handoff.groupId),url:session.baseURL}]);await context.addInitScript(id=>{localStorage.setItem('creatoros:current-group',id);localStorage.removeItem('creatoros:current-account');localStorage.setItem('creatoros:onboarding:hidden','1');},handoff.groupId);
  45 |   save(family+'-binding',{sourceHead:binding.sourceHead,controlHead:'148a7da951a31ea3e3f94fcb8b42956f5daf6f2d',bindingSha256:crypto.createHash('sha256').update(fs.readFileSync(session.candidateBinding)).digest('hex'),handoffSha256:crypto.createHash('sha256').update(fs.readFileSync(handoffPath)).digest('hex'),browserVersion:context.browser().version(),temporaryPersistentProfile:true,freshContext:true,businessStorageCopied:false,sourceInput:turn.sourceRead.input});
  46 |   const before=await readAll(page);save(family+'-business-before',before);
  47 |   const handler=async route=>{if(!sourceMatch(route.request(),turn))return route.fallback();held.push({body:route.request().postDataJSON(),groupHeader:await route.request().headerValue('x-group-id'),accountHeader:await route.request().headerValue('x-account-id'),classification:'同源匿名fresh请求，不按顺序分配article/graphic身份'});record();await gate;try{await route.abort('connectionfailed');}catch(error){save(family+'-abort-cleanup-error',{error:clean(String(error))});}};
  48 |   await page.route('**/api/v1/dispatch',handler);
  49 |   try{
  50 |    const {outer,card}=await openOwner(page,family,{width:1600,height:1000});const prompt=outer.locator('#ai-copilot-prompt'),unsent='T1305未发送输入 '+family;await prompt.fill(unsent);await expect(prompt).toHaveValue(unsent);
  51 |    const {dialog,trigger}=await openDialog(page,card,family);const initialExpected=family==='editor-article'?1:2;await expect.poll(()=>held.length,{timeout:120000}).toBe(initialExpected);expect(sourceRequests).toHaveLength(initialExpected);
  52 |    for(const request of held){expect(request.body.input).toEqual(turn.sourceRead.input);expect(request.groupHeader).toBe(handoff.groupId);expect(request.accountHeader).toBeNull();}
  53 |    await expect(dialog.getByText('正在核对原候选来源与稿件版本…',{exact:true})).toBeVisible();await expect(dialog.getByRole('region',{name:'本次采纳选择',exact:true})).toHaveCount(0);await expect(prompt).toHaveValue(unsent);await snap(page,family+'-source-loading');
  54 |    release();await expect(dialog.getByRole('alert')).toHaveText(COPY);await expect(prompt).toHaveValue(unsent);await snap(page,family+'-source-error');expect(sourceRequests).toHaveLength(initialExpected);expect(sourceResponses).toHaveLength(0);
  55 |    await page.unroute('**/api/v1/dispatch',handler);await dialog.getByRole('button',{name:'关闭',exact:true}).click();await expect(dialog).toBeHidden();await expect(trigger).toBeFocused();await expect(prompt).toHaveValue(unsent);await snap(page,family+'-error-closed');
  56 |    await trigger.focus();await page.keyboard.press('Enter');await expect(dialog).toBeVisible();const summary=dialog.locator('summary').filter({hasText:/^本次采纳选择$/});await expect(summary).toBeVisible();await expect.poll(()=>sourceResponses.length,{timeout:120000}).toBe(1);expect(sourceResponses[0].status).toBe(200);expect(sourceRequests).toHaveLength(initialExpected+1);await expect(prompt).toHaveValue(unsent);await snap(page,family+'-source-recovered-default');
  57 |    const receipt=sourceResponses[0].body.data,candidate=receipt.candidate;const member=family==='editor-article'?null:family==='creation-article'?candidate.target.articleMember:candidate.target.graphicMember;
  58 |    const outputId=member?.outputId??candidate.target.outputId,versionId=member?.baseVersionId??candidate.base.versionId,article=family!=='creation-graphic';
  59 |    const exact=await dispatch(page,article?'articles.versions.get':'graphicPosts.versions.get',{params:{outputId,versionId}},handoff.groupId);expect(exact.versionId).toBe(versionId);save(family+'-actual-base',{outputId,versionId,exact});
  60 |    const proposed=family==='editor-article'?candidate.candidate.document:article?candidate.article:candidate.graphic;
  61 |    await summary.focus();await page.keyboard.press('Enter');const selection=dialog.getByRole('region',{name:'本次采纳选择',exact:true});await expect(selection).toBeVisible();const expectedFields={};
  62 |    // SEMANTIC_BOUNDARY_ALLOW: 仅核当前协议默认字段，不替人选择创作内容。
  63 |    for(const field of ['title','summary','tags'].filter(field=>Object.hasOwn(proposed,field))){const name='采用候选'+({title:'标题',summary:'摘要',tags:'标签'}[field]);const box=selection.getByRole('checkbox',{name:new RegExp(name)});const value=exact.document[field],expected=Array.isArray(value)?value.length===0:!value?.trim();expectedFields[field]=expected;await expect(box).toBeChecked({checked:expected});}
  64 |    const defaults=await detailsState(page);const first=selection.getByRole('checkbox',{name:/采用候选标题/});await expect(first).toBeEnabled();await first.focus();await page.keyboard.press('Space');const chosen=await detailsState(page);expect(chosen[0].checked).not.toBe(defaults[0].checked);await snap(page,family+'-recovered-user-selection');
  65 |    await page.keyboard.press('Escape');await expect(dialog).toBeHidden();await expect(trigger).toBeFocused();await expect(prompt).toHaveValue(unsent);await page.keyboard.press('Enter');await expect(dialog).toBeVisible();await summary.focus();await page.keyboard.press('Enter');await expect(selection).toBeVisible();expect(await detailsState(page)).toEqual(chosen);expect(sourceRequests).toHaveLength(initialExpected+1);await snap(page,family+'-selection-reopened');await page.keyboard.press('Escape');await expect(dialog).toBeHidden();await expect(prompt).toHaveValue(unsent);
  66 |    let otherState=null;if(family!=='editor-article'){
  67 |     const otherKind=family==='creation-article'?'图文候选':'文章候选';const region=outer.getByRole('region',{name:'文章和图文联合候选',exact:true});const other=region.locator('article').filter({has:page.getByRole('heading',{name:otherKind,exact:true})});
  68 |     const targetAdopt=card.getByRole('button',{name:family==='creation-article'?'采纳文章':'采纳图文',exact:true}),otherAdopt=other.getByRole('button',{name:family==='creation-article'?'采纳图文':'采纳文章',exact:true});await expect(targetAdopt).toBeEnabled();await expect(otherAdopt).toBeDisabled();
  69 |     const otherFamily=family==='creation-article'?'creation-graphic':'creation-article';const {dialog:otherDialog}=await openDialog(page,other,otherFamily);await expect(otherDialog.getByRole('alert')).toHaveText(COPY);expect(sourceRequests).toHaveLength(initialExpected+1);await snap(page,family+'-other-member-still-error');await otherDialog.getByRole('button',{name:'关闭',exact:true}).click();await expect(otherDialog).toBeHidden();otherState={firstOpenedAfterTargetRecovery:true,visibleSourceError:COPY,extraReads:0,closedWithoutReopeningAgain:true};
  70 |    }
  71 |    await expect(prompt).toHaveValue(unsent);save(family+'-result',{family,initialAnonymousMatchedRequests:initialExpected,initialWireIdentical:held.every(x=>JSON.stringify(x.body.input)===JSON.stringify(turn.sourceRead.input)),targetActualOpenedAndSawError:true,recoveryAddedReads:1,recoveryStatus:sourceResponses[0].status,recoveryWireSame:JSON.stringify(sourceRequests.at(-1).body.input)===JSON.stringify(turn.sourceRead.input),otherState,promptRetainedThroughLoadingErrorCloseRecovery:true,preFailureManualSelection:false,defaultFieldsVerifiedAgainstActualBase:expectedFields,defaults,userSelected:chosen,selectionRetainedAfterReadyOrdinaryReopen:true,noExtraReadAfterReadyReopen:true});
  72 |    checks.push({family,status:'PASS'});save('checks',checks);console.log(JSON.stringify(checks.at(-1)));
  73 |   }catch(error){checks.push({family,status:'FAIL',error:clean(String(error)),stack:clean(error.stack)});save('checks',checks);await snap(page,family+'-failure').catch(()=>{});throw error;}
  74 |   finally{release();await page.unroute('**/api/v1/dispatch',handler);const after=await readAll(page);save(family+'-business-after',after);expect(after).toEqual(before);expect(attemptedWrites).toEqual([]);expect(events.filter(event=>forbidden.has(event.id)||event.id==='/api/chat')).toEqual([]);record();}
  75 |  });
  76 | }
  77 | 
```