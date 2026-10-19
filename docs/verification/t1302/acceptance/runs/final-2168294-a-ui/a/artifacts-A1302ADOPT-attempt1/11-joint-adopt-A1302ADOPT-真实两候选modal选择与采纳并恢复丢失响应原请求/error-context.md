# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 11-joint-adopt.spec.cjs >> A1302ADOPT 真实两候选modal选择与采纳并恢复丢失响应原请求
- Location: ../docs/verification/t1302/acceptance/public/a/11-joint-adopt.spec.cjs:6:1

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: getByRole('region', { name: '文章和图文联合候选', exact: true }).last().locator('article').filter({ has: getByRole('heading', { name: '文章候选', exact: true }) }).getByRole('status')
Expected substring: "已保存"
Timeout: 120000ms
Error: element(s) not found

Call log:
  - Expect "toContainText" with timeout 120000ms
  - waiting for getByRole('region', { name: '文章和图文联合候选', exact: true }).last().locator('article').filter({ has: getByRole('heading', { name: '文章候选', exact: true }) }).getByRole('status')

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
          - /url: /projects/project-e2aea52e-83
  - text: AI 助手
  - paragraph: 创作者，今天想先做点什么？
  - link "打开 AI 助手":
    - /url: "?copilot=open&scope=global"
  - button "帮助与反馈"
  - button "当前账号组：T1301-A-5f885d39-bf36-4ec3-9988-84cc561584a9": 当前账号组 T1301-A-5f885d39-bf36-4ec3-9988-84cc561584a9
  - text: "? 创作者 个人版"
- banner:
  - text: 先写问题，再记录方法
  - list "项目工作面":
    - listitem:
      - link "脚本":
        - /url: /projects/project-e2aea52e-83
    - listitem:
      - link "文章":
        - /url: /projects/project-e2aea52e-83/article?outputId=output-e2aea52e-130
    - listitem:
      - link "图文":
        - /url: /projects/project-e2aea52e-83/outputs/output-e2aea52e-143/image
    - listitem:
      - link "复盘":
        - /url: /projects/project-e2aea52e-83/review
  - link "搜索":
    - /url: /search
  - button "充值"
- main:
  - heading "公众号成稿" [level=1]
  - paragraph: 原稿来自脚本，在对话中调整这篇文章。
  - button "重新组织内容"
  - text: 已承接脚本，开始对话或导出时保存
  - link "查看脚本原稿":
    - /url: /projects/project-e2aea52e-83
  - region "NoteRelay 排版预览":
    - heading "成稿预览" [level=2]
    - button "复制公众号文章"
    - group: 更多导出
    - article:
      - paragraph: 石墨极简风
      - heading "先写问题，再记录方法" [level=1]
      - paragraph: "01"
      - heading [level=3]
      - paragraph: 脚本正文 我整理笔记时，先写清楚要解决的问题，再记下实际做过的步骤，最后检查结果。
      - paragraph: 例如整理一份阅读笔记，我会先问：这次阅读解决了什么疑问？然后写下我试过的方法，以及还没有想明白的地方。这里没有统计数据，也不承诺效率一定提高。
      - paragraph: 我想保留一个习惯：每次结束工作，记下一个仍然值得追问的问题。先把问题写清楚，再决定下一步。
    - group: 开源来源与许可
  - group: 历史版本
- separator "调整编导栏宽度"
- complementary "编导对话":
  - button "收起编导栏": 收起编导
  - heading "编导对话" [level=2]
  - paragraph: 基于当前稿与选区持续调整，预览后再采纳
  - text: ↑215K ↓2.2K
  - button "新对话"
  - button "历史记录"
  - text: 项目 先写问题，再记录方法
  - list "助手活动记录":
    - listitem: 请使用已确认脚本与同一创作方法，一起生成完整文章和图文候选。我会分别预览采纳，再继续微调。不要生成视频、语音或插画。
    - listitem:
      - paragraph: 已基于确认脚本生成两份同源候选：
      - list:
        - listitem: 完整文章：含标题、摘要及五节正文。
        - listitem: 纯文字图文：含完整配文、标签及五张文字图卡。
      - paragraph: 两份均待你分别预览采纳，尚未写入正式稿。未生成视频、语音或插画。
      - group: 读取完成 · 读取确认脚本
      - group: 已读取联合创作来源
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
      - paragraph: 已有
      - paragraph: 发布
      - paragraph: 暂无
      - paragraph: 复盘
      - paragraph: 暂未接入
      - paragraph: 4 类稿件 · 1 份素材 · 0 条发布记录
      - group: 读取完成 · 读取执行方法
      - group: 候选待采用 · 生成文章和图文候选
      - region "文章和图文联合候选":
        - heading "文章和图文已生成，分别预览并采纳" [level=3]
        - paragraph: 共用已确认脚本；两份作品分别保存，采纳后可继续微调。
        - article:
          - heading "文章候选" [level=4]
          - paragraph: 先写问题，再记录方法
          - button "预览候选"
          - button "恢复原采纳请求"
          - link "打开文章":
            - /url: /projects/project-e2aea52e-83/article?outputId=output-e2aea52e-130
          - alert: 当前作品有未保存修改，请先保存或核对；原输入已保留。
        - article:
          - heading "图文候选" [level=4]
          - paragraph: 先写问题，再记录方法
          - button "预览候选"
          - button "采纳图文" [disabled]
          - link "打开图文":
            - /url: /projects/project-e2aea52e-83/outputs/output-e2aea52e-143/image
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
  2  | const fs=require('node:fs');const {test,expect,save,read,owned,rpc,capture,opId}=require('./support.cjs');
  3  | async function openJoint(page,f){await page.goto(`/projects/${f.projectId}/article?outputId=${f.articleId}`);await page.getByRole('button',{name:'历史记录',exact:true}).click();await page.locator(`[data-slot="copilot-history-item"][data-conversation-id="${read('joint-submission').conversationId}"]`).click();const region=page.getByRole('region',{name:'文章和图文联合候选',exact:true}).last();await expect(region).toBeVisible();return region;}
  4  | const member=(page,region,kind)=>region.locator('article').filter({has:page.getByRole('heading',{name:kind==='article'?'文章候选':'图文候选',exact:true})});
  5  | async function exportArticle(page,dialog,info,name){await dialog.getByText('更多导出',{exact:true}).click();const downloading=page.waitForEvent('download',{timeout:900000});await dialog.getByRole('button',{name:'导出 HTML',exact:true}).click();const file=info.outputPath(name+'.html');await(await downloading).saveAs(file);const html=fs.readFileSync(file,'utf8');save(name+'-witness',{file,templateVariables:html.match(/\{\{[^}]+\}\}/g)??[],length:html.length,observedAt:new Date().toISOString()});return html;}
  6  | test('A1302ADOPT 真实两候选modal选择与采纳并恢复丢失响应原请求',async({page},info)=>{
  7  |  test.setTimeout(5400000);await owned(page);const f=read('work-fixture'),proposal=read('joint-proposal').output;let posts=0;const network=[];page.on('request',r=>{if(new URL(r.url()).pathname==='/api/chat'&&r.method()==='POST')posts++;const id=opId(r);if(id)network.push({id,input:r.postDataJSON()?.input,at:new Date().toISOString()});});
  8  |  const scripts=()=>rpc(page,'artifacts.versions.list',{params:{artifactId:f.scriptId},query:{page:1,pageSize:50}});const frozen=read('joint-script-confirmed-baseline');expect(await scripts()).toEqual(frozen);
  9  |  let region=await openJoint(page,f);await expect(page.getByRole('textbox',{name:'我能帮你做什么',exact:true})).toHaveAttribute('placeholder','告诉我这篇文章需要怎么调整');const chips=page.locator('[data-slot="suggested-action-chips"]');save('article-composer-controls',{visibleButtons:await chips.getByRole('button').allTextContents()});expect(await chips.getByRole('button').allTextContents()).not.toEqual(expect.arrayContaining(['分析机会']));await expect(page.getByRole('button',{name:'提交提示给 Copilot',exact:true})).toBeVisible();
  10 |  await expect(region.getByRole('region',{name:'本次采纳选择',exact:true})).toHaveCount(0);const articleBefore=await rpc(page,'articles.get',{params:{outputId:f.articleId}}),graphicBefore=await rpc(page,'graphicPosts.get',{params:{outputId:f.graphicId}});save('joint-article-before',articleBefore);save('joint-graphic-before',graphicBefore);
  11 |  let card=member(page,region,'article');const trigger=card.getByRole('button',{name:'预览候选',exact:true});await trigger.focus();await page.keyboard.press('Enter');let dialog=page.getByRole('dialog',{name:'文章候选预览',exact:true});await expect(dialog.getByRole('region',{name:'本次采纳选择',exact:true})).toBeVisible();await expect(dialog.getByRole('button',{name:'复制公众号文章',exact:true})).toBeEnabled();
  12 |  const defaults=await dialog.getByRole('checkbox').evaluateAll(ns=>ns.map(n=>({label:n.parentElement.textContent,checked:n.checked,disabled:n.disabled})));save('joint-article-defaults',defaults);
  13 |  for(const label of ['采用候选标题','采用候选摘要','采用候选标签']){const c=dialog.getByRole('checkbox',{name:new RegExp('^'+label)});if(await c.count())await c.setChecked(label==='采用候选标题');}const facts=dialog.getByRole('checkbox',{name:/替换为联合候选事实/});await facts.check();
  14 |  await capture(page,info,'joint-article-selection-ready');const beforeModalSources=network.filter(x=>['ai.workCandidates.source','articles.versions.get','graphicPosts.versions.get'].includes(x.id));await page.keyboard.press('Escape');await expect(dialog).toBeHidden();await expect(trigger).toBeFocused();await trigger.press('Enter');dialog=page.getByRole('dialog',{name:'文章候选预览',exact:true});await expect(dialog.getByRole('checkbox',{name:/^采用候选标题/})).toBeChecked();await expect(dialog.getByRole('checkbox',{name:/^采用候选摘要/})).not.toBeChecked();await expect(dialog.getByRole('checkbox',{name:/替换为联合候选事实/})).toBeChecked();await expect(dialog.getByRole('button',{name:'复制公众号文章',exact:true})).toBeEnabled();save('joint-modal-reopen-source-count',{before:beforeModalSources.length,after:network.filter(x=>['ai.workCandidates.source','articles.versions.get','graphicPosts.versions.get'].includes(x.id)).length});
> 15 |  const previewHTML=await exportArticle(page,dialog,info,'joint-article-ready-preview');await dialog.getByRole('button',{name:'关闭',exact:true}).click();await card.getByRole('button',{name:'采纳文章',exact:true}).click();await expect(card.getByRole('status')).toContainText('已保存');const articleAfter=await rpc(page,'articles.get',{params:{outputId:f.articleId}});save('joint-article-adopted',articleAfter);expect(articleAfter.currentVersionId).not.toBe(articleBefore.currentVersionId);expect(articleAfter.current.title).toBe(proposal.article.title);expect(articleAfter.current.summary).toBe(articleBefore.current.summary);expect(articleAfter.current.tags).toEqual(articleBefore.current.tags);expect((await rpc(page,'graphicPosts.get',{params:{outputId:f.graphicId}})).currentVersionId).toBe(graphicBefore.currentVersionId);expect(await scripts()).toEqual(frozen);
     |                                                                                                                                                                                                                                                               ^ Error: expect(locator).toContainText(expected) failed
  16 |  card=member(page,region,'image');await card.getByRole('button',{name:'预览候选',exact:true}).click();dialog=page.getByRole('dialog',{name:'图文候选预览',exact:true});await expect(dialog.getByRole('button',{name:'导出分页 ZIP',exact:true})).toBeEnabled();save('joint-graphic-defaults',await dialog.getByRole('checkbox').evaluateAll(ns=>ns.map(n=>({label:n.parentElement.textContent,checked:n.checked,disabled:n.disabled}))));await capture(page,info,'joint-graphic-ready-preview');const zipped=page.waitForEvent('download',{timeout:900000});await dialog.getByRole('button',{name:'导出分页 ZIP',exact:true}).click();await(await zipped).saveAs(info.outputPath('joint-graphic-preview.zip'));await dialog.getByRole('button',{name:'关闭',exact:true}).click();
  17 |  let dropped=false;const adopts=[];await page.route('**/api/v1/dispatch',async route=>{const request=route.request(),id=opId(request),input=request.postDataJSON()?.input;if(id==='graphicPosts.versions.create'&&input?.params?.outputId===f.graphicId){adopts.push(input);save('joint-graphic-adopt-requests',adopts);if(!dropped){dropped=true;const actual=await route.fetch({timeout:900000});save('joint-graphic-injected-response-loss',{injection:'真实服务器已处理后的客户端响应丢弃；不是自然服务故障',httpStatus:actual.status(),body:await actual.json(),originalInput:input,observedAt:new Date().toISOString()});await route.abort('connectionfailed');return;}}await route.continue();});
  18 |  await card.getByRole('button',{name:'采纳图文',exact:true}).click();await expect(card.getByRole('button',{name:'恢复原采纳请求',exact:true})).toBeVisible();await expect(card.getByRole('alert')).toBeVisible();save('joint-graphic-pending-storage',await page.evaluate(()=>Object.fromEntries(Object.entries(sessionStorage).filter(([key])=>key.startsWith('creatoros:t1097:adopt:')))));await capture(page,info,'joint-graphic-pending-response-lost');const committed=await rpc(page,'graphicPosts.get',{params:{outputId:f.graphicId}});save('joint-graphic-server-committed',committed);expect(committed.currentVersionId).not.toBe(graphicBefore.currentVersionId);
  19 |  await page.reload();region=await openJoint(page,f);card=member(page,region,'image');await expect(card.getByText('原采用请求待核对，请继续恢复原请求。',{exact:true})).toBeVisible();await expect(card.getByRole('button',{name:'恢复原采纳请求',exact:true})).toBeVisible();await card.getByRole('button',{name:'预览候选',exact:true}).click();dialog=page.getByRole('dialog',{name:'图文候选预览',exact:true});await expect(dialog.getByRole('button',{name:'导出分页 ZIP',exact:true})).toBeEnabled();for(const c of await dialog.getByRole('checkbox').all())await expect(c).toBeDisabled();await capture(page,info,'joint-graphic-pending-reloaded');await dialog.getByRole('button',{name:'关闭',exact:true}).click();await card.getByRole('button',{name:'恢复原采纳请求',exact:true}).click();await expect(card.getByRole('status')).toContainText('已保存');expect(adopts).toHaveLength(2);expect(adopts[1]).toEqual(adopts[0]);const graphicAfter=await rpc(page,'graphicPosts.get',{params:{outputId:f.graphicId}});expect(graphicAfter.currentVersionId).toBe(committed.currentVersionId);expect(graphicAfter.current).toEqual(committed.current);expect((await rpc(page,'articles.get',{params:{outputId:f.articleId}})).currentVersionId).toBe(articleAfter.currentVersionId);expect(await scripts()).toEqual(frozen);save('joint-graphic-adopted',graphicAfter);
  20 |  for(const [kind,id,op,path,button] of [['article',f.articleId,'articles.get',`/projects/${f.projectId}/article?outputId=${f.articleId}`,'复制公众号文章'],['graphic',f.graphicId,'graphicPosts.get',`/projects/${f.projectId}/outputs/${f.graphicId}/image`,'导出分页 ZIP']]){await page.goto(path);await expect(page.getByRole('button',{name:button,exact:true})).toBeEnabled();await page.reload();await expect(page.getByRole('button',{name:button,exact:true})).toBeEnabled();const after=await rpc(page,op,{params:{outputId:id}});expect(after.currentVersionId).toBe(kind==='article'?articleAfter.currentVersionId:graphicAfter.currentVersionId);save('joint-'+kind+'-refreshed',after);await capture(page,info,'joint-'+kind+'-refreshed-ready');if(kind==='article'){const main=page.locator('[data-page="article-workbench"]');const adoptedHTML=await exportArticle(page,main,info,'joint-article-adopted-export');save('joint-article-preview-adopted-visual-comparison',{sameHTML:previewHTML===adoptedHTML,previewHasTemplateVariables:previewHTML.match(/\{\{[^}]+\}\}/g)??[],adoptedHasTemplateVariables:adoptedHTML.match(/\{\{[^}]+\}\}/g)??[],nativeLayout:after.current.nativeLayout??null,semantics:'均等待原ready导出，原生handler未替换；若不同保实际产物待Root判定'});}}
  21 |  expect(posts).toBe(0);save('joint-adopt-result',{status:'PASS',articlePartialFieldsAndReplaceFacts:true,graphicDefaultFields:true,modalSelectionRetained:true,pendingOriginalBodyAndKey:true,serverResponseLostOnce:true,scriptBaseline:frozen.at(-1).id,otherPlatformUnchanged:true,newModelPosts:posts,network,observedAt:new Date().toISOString()});
  22 | });
  23 | 
```