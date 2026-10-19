# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 22-editor-recover.spec.cjs >> A1302EDITRECOVER-article 原编辑候选预览采纳刷新与真实状态
- Location: ../docs/verification/t1302/acceptance/public/a/22-editor-recover.spec.cjs:4:41

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('region', { name: '编导编辑候选', exact: true }).filter({ hasText: '仅简化文章最后一段，邀请读者留下值得继续追问的问题；保留前面段落和全部事实，不增加经历或数字。' }).last().getByRole('button', { name: '恢复 / 采纳原请求', exact: true })
Expected: visible
Timeout: 120000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 120000ms
  - waiting for getByRole('region', { name: '编导编辑候选', exact: true }).filter({ hasText: '仅简化文章最后一段，邀请读者留下值得继续追问的问题；保留前面段落和全部事实，不增加经历或数字。' }).last().getByRole('button', { name: '恢复 / 采纳原请求', exact: true })

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
  - text: 当前成稿已保存
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
      - heading "先写清楚，这份笔记要解决什么" [level=3]
      - paragraph: 我整理笔记时，会先写清楚要解决的问题，再记下实际做过的步骤，最后检查结果。
      - paragraph: 这个顺序，可以从笔记开头的一句话开始：这次，我想弄明白什么？
      - paragraph: 先把问题放在这里，后面记录的方法就有了对应的对象。回头看时，也能沿着这个问题，检查自己做过什么，还有哪里需要继续想。
      - paragraph: "02"
      - heading "记录实际做过的步骤" [level=3]
      - paragraph: 问题写下来之后，接着记实际尝试过的方法。
      - paragraph: 这一部分可以写得具体一些：为了回答这个问题，我做了什么？先尝试了哪一步，接下来又做了什么？
      - paragraph: 如果某一步还没有做，就留作下一步。这样，已经发生的尝试和准备继续做的事情，都能在笔记里找到各自的位置。
      - paragraph: "03"
      - heading "以一份阅读笔记为例" [level=3]
      - paragraph: 例如整理一份阅读笔记，我会先问：这次阅读解决了什么疑问？然后写下我试过的方法，以及还没有想明白的地方。
      - paragraph: 沿着这个顺序，一份阅读笔记可以留下四项内容：
      - text: •
      - paragraph: 问题：这次阅读想弄明白什么？
      - text: •
      - paragraph: 尝试：围绕这个问题，实际做过哪些步骤？
      - text: •
      - paragraph: 结果：现在能回答到哪一步？
      - text: •
      - paragraph: 未解：还有什么地方没有想明白？
      - paragraph: 这是一份可填写的记录提纲。每一项都按实际情况写；暂时没有答案的地方，也可以直接留下疑问。
      - paragraph: "04"
      - heading "回到最初的问题，检查结果" [level=3]
      - paragraph: 记完方法之后，再回来看最初的问题。
      - paragraph: 哪些地方已经有了答案？哪些地方只是试过，还不能下结论？哪些疑问仍然值得继续追问？把这些状态写清楚，下一次再打开笔记时，就有一个继续思考的起点。
      - paragraph: 这里没有统计数据，也不承诺按这个顺序记录，效率就一定提高。它是我想保留的一种整理习惯：让问题、尝试和结果在同一份记录里对应起来。
      - paragraph: "05"
      - heading "结束时，留下一个值得追问的问题" [level=3]
      - paragraph: 我想保留一个习惯：每次结束工作，记下一个仍然值得追问的问题。
      - paragraph: 可以在笔记最后留一行：接下来，我还想弄明白什么？
      - paragraph: 也请留下一个值得继续追问的问题，不急着回答。
    - group: 开源来源与许可
  - group: 历史版本
- separator "调整编导栏宽度"
- complementary "编导对话":
  - button "收起编导栏": 收起编导
  - heading "编导对话" [level=2]
  - paragraph: 基于当前稿与选区持续调整，预览后再采纳
  - text: ↑477K ↓3.1K
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
          - button "采纳文章" [disabled]
          - link "打开文章":
            - /url: /projects/project-e2aea52e-83/article?outputId=output-e2aea52e-130
        - article:
          - heading "图文候选" [level=4]
          - paragraph: 先写问题，再记录方法
          - button "预览候选"
          - button "采纳图文" [disabled]
          - link "打开图文":
            - /url: /projects/project-e2aea52e-83/outputs/output-e2aea52e-143/image
    - listitem: 请微调当前文章：把最后一段改得更简洁，仍然邀请读者留下一个值得继续追问的问题。保留全部事实和前面段落，不增加经历或数字。请基于当前稿给出可预览和采纳的文章编辑候选，先不要保存。
    - listitem:
      - paragraph: 已生成可预览、可采纳的文章编辑候选，尚未保存。仅将最后一段改为：
      - blockquote:
        - paragraph: 也请留下一个值得继续追问的问题，不急着回答。
      - paragraph: 前面段落和全部事实保持不变，未增加经历或数字。
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
      - paragraph: 已有
      - paragraph: 发布
      - paragraph: 暂无
      - paragraph: 复盘
      - paragraph: 暂未接入
      - paragraph: 4 类稿件 · 1 份素材 · 0 条发布记录
      - group: 读取完成 · 读取执行方法
      - group: 候选待采用 · 生成精调候选
      - region "编导编辑候选":
        - heading "文章编辑候选" [level=3]
        - text: 1 项改动
        - paragraph: 仅简化文章最后一段，邀请读者留下值得继续追问的问题；保留前面段落和全部事实，不增加经历或数字。
        - button "预览改动"
        - button "采纳到当前作品" [disabled]
        - link "打开作品":
          - /url: /projects/project-e2aea52e-83/article?outputId=output-e2aea52e-130
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
  2  | const {test,expect,save,read,owned,rpc,capture,opId}=require('./support.cjs');
  3  | async function openEditor(page,f,kind){const article=kind==='article';await page.goto(article?`/projects/${f.projectId}/article?outputId=${f.articleId}`:`/projects/${f.projectId}/outputs/${f.graphicId}/image`);await expect(page.getByRole('button',{name:article?'复制公众号文章':'导出分页 ZIP',exact:true})).toBeEnabled();await page.getByRole('button',{name:'历史记录',exact:true}).click();await page.locator(`[data-slot="copilot-history-item"][data-conversation-id="${read(kind+'-edit-submission').conversationId}"]`).click();return page.getByRole('region',{name:'编导编辑候选',exact:true}).filter({hasText:read(kind+'-edit-candidate').output.summary}).last();}
  4  | for(const kind of ['article','graphic'])test(`A1302EDITRECOVER-${kind} 原编辑候选预览采纳刷新与真实状态`,async({page},info)=>{
  5  |  test.setTimeout(5400000);await owned(page);const f=read('work-fixture'),article=kind==='article',id=article?f.articleId:f.graphicId,op=article?'articles.get':'graphicPosts.get',otherOp=article?'graphicPosts.get':'articles.get';const before=await rpc(page,op,{params:{outputId:id}}),otherBefore=await rpc(page,otherOp,{params:{outputId:article?f.graphicId:f.articleId}}),scripts=await rpc(page,'artifacts.versions.list',{params:{artifactId:f.scriptId},query:{page:1,pageSize:50}});let posts=0;const reads=[];page.on('request',r=>{if(new URL(r.url()).pathname==='/api/chat'&&r.method()==='POST')posts++;const operation=opId(r);if(operation)reads.push({operation,input:r.postDataJSON()?.input,observedAt:new Date().toISOString()});});
  6  |  let card=await openEditor(page,f,kind);await expect(card.getByRole('region',{name:'本次采纳选择',exact:true})).toHaveCount(0);const preSources=reads.filter(x=>x.operation==='ai.workCandidates.source'&&x.input?.query?.toolCallId===read(kind+'-edit-candidate').toolCallId);save(kind+'-history-before-open',{sourceReads:preSources,reads});expect(preSources).toHaveLength(0);
  7  |  let trigger=card.getByRole('button',{name:'预览改动',exact:true});await trigger.focus();await page.keyboard.press('Enter');let dialog=page.getByRole('dialog',{name:article?'文章改动预览':'图文改动预览',exact:true});await expect(dialog).toBeVisible();
  8  |  if(article){await expect(dialog.getByRole('region',{name:'本次采纳选择',exact:true})).toBeVisible();await expect(dialog.getByRole('checkbox',{name:/替换为联合候选事实/})).toBeDisabled();save('article-editor-recovery-defaults',await dialog.getByRole('checkbox').evaluateAll(ns=>ns.map(n=>({label:n.parentElement.textContent,checked:n.checked,disabled:n.disabled}))));}
  9  |  await expect(dialog.getByRole('button',{name:article?'复制公众号文章':'导出分页 ZIP',exact:true})).toBeEnabled();await capture(page,info,kind+'-editor-preview-ready');const sourceCount=reads.filter(x=>x.operation==='ai.workCandidates.source'&&x.input?.query?.toolCallId===read(kind+'-edit-candidate').toolCallId).length;
  10 |  await page.keyboard.press('Escape');await expect(dialog).toBeHidden();await expect(trigger).toBeFocused();await trigger.press('Enter');dialog=page.getByRole('dialog',{name:article?'文章改动预览':'图文改动预览',exact:true});await expect(dialog.getByRole('button',{name:article?'复制公众号文章':'导出分页 ZIP',exact:true})).toBeEnabled();expect(reads.filter(x=>x.operation==='ai.workCandidates.source'&&x.input?.query?.toolCallId===read(kind+'-edit-candidate').toolCallId)).toHaveLength(sourceCount);await dialog.getByRole('button',{name:'关闭',exact:true}).click();
  11 |  const adoptRequests=[];let dropped=false;if(article)await page.route('**/api/v1/dispatch',async route=>{if(opId(route.request())==='articles.versions.create'&&route.request().postDataJSON()?.input?.params?.outputId===id){const input=route.request().postDataJSON().input;adoptRequests.push(input);save('article-editor-adopt-requests',adoptRequests);if(!dropped){dropped=true;const actual=await route.fetch({timeout:900000});save('article-editor-adopt-loss-injection',{injection:'真实服务器采纳完成后丢客户端响应；非自然故障',httpStatus:actual.status(),body:await actual.json(),originalInput:input});await route.abort('connectionfailed');return;}}await route.continue();});
> 12 |  await card.getByRole('button',{name:'采纳到当前作品',exact:true}).click();if(article){await expect(card.getByRole('button',{name:'恢复 / 采纳原请求',exact:true})).toBeVisible();save('article-editor-pending-storage',await page.evaluate(()=>Object.fromEntries(Object.entries(sessionStorage).filter(([key])=>key.startsWith('creatoros:t1097:adopt:')))));const committed=await rpc(page,op,{params:{outputId:id}});save('article-editor-server-committed',committed);expect(committed.currentVersionId).not.toBe(before.currentVersionId);await capture(page,info,'article-editor-pending-response-lost');await page.reload();card=await openEditor(page,f,kind);await expect(card.getByRole('button',{name:'恢复 / 采纳原请求',exact:true})).toBeVisible();await card.getByRole('button',{name:'预览改动',exact:true}).click();dialog=page.getByRole('dialog',{name:'文章改动预览',exact:true});await expect(dialog.getByRole('button',{name:'复制公众号文章',exact:true})).toBeEnabled();for(const c of await dialog.getByRole('checkbox').all())await expect(c).toBeDisabled();await capture(page,info,'article-editor-pending-reloaded');await dialog.getByRole('button',{name:'关闭',exact:true}).click();await card.getByRole('button',{name:'恢复 / 采纳原请求',exact:true}).click();await expect(card.getByRole('status')).toContainText('已保存');expect(adoptRequests).toHaveLength(2);expect(adoptRequests[1]).toEqual(adoptRequests[0]);expect((await rpc(page,op,{params:{outputId:id}})).currentVersionId).toBe(committed.currentVersionId);}else await expect(card.getByRole('status')).toContainText('已保存');
     |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                ^ Error: expect(locator).toBeVisible() failed
  13 |  const after=await rpc(page,op,{params:{outputId:id}});save(kind+'-editor-adopted',after);expect(after.currentVersionId).not.toBe(before.currentVersionId);expect(await rpc(page,otherOp,{params:{outputId:article?f.graphicId:f.articleId}})).toEqual(otherBefore);expect(await rpc(page,'artifacts.versions.list',{params:{artifactId:f.scriptId},query:{page:1,pageSize:50}})).toEqual(scripts);await page.reload();await expect(page.getByRole('button',{name:article?'复制公众号文章':'导出分页 ZIP',exact:true})).toBeEnabled();expect((await rpc(page,op,{params:{outputId:id}})).currentVersionId).toBe(after.currentVersionId);await capture(page,info,kind+'-editor-adopted-refreshed');expect(posts).toBe(0);save(kind+'-editor-adopt-result',{status:'PASS',newModelPosts:posts,sourceFailureInjection:false,priorSourceInjectionEvidence:'article-source-failure-injection.json',pendingLossAndOriginalRequestRecovery:article,sourceCountBeforeReopen:sourceCount,scriptUnchanged:true,otherPlatformUnchanged:true,reads,observedAt:new Date().toISOString()});
  14 | });
  15 | 
```