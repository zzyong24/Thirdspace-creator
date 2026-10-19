# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: business.spec.cjs >> T1307 两真实UI turn source预览原HTML及采纳刷新隔离
- Location: ../docs/verification/t1307/acceptance/public/b/final-t1307-t1308/business.spec.cjs:130:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

- Expected  - 3
+ Received  + 0

  我整理工作笔记时，先把问题写清楚，再写尝试过的做法，最后记录观察到的现象。没有实际观察的内容就留空，不为了完整而补成一个结论。
-
  我想留给自己一张四行练习卡。以下四行属于正文，请保留原来的文字、顺序、换行和每处六个下划线，让读者以后自己填写：
-
  问题：______
  尝试：______
  观察：______
  下一步：______
-
  空白不是结果，只是提醒我把事实和判断分开。这里没有统计数字，也不承诺一定提高效率。记录之后，留一个值得继续观察的问题。
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e3]:
    - complementary "主侧栏" [ref=e4]:
      - generic [ref=e5]:
        - generic [ref=e6]:
          - img [ref=e8]
          - generic [ref=e11]: CreatorOS
        - button "收起侧栏" [ref=e12]:
          - img [ref=e13]
      - generic [ref=e16]:
        - navigation "主要导航" [ref=e17]:
          - link "首页" [ref=e18] [cursor=pointer]:
            - /url: /
            - img [ref=e19]
            - generic [ref=e24]: 首页
          - link "创作者总览" [ref=e25] [cursor=pointer]:
            - /url: /overview
            - img [ref=e26]
            - generic [ref=e28]: 创作者总览
          - link "定位中心" [ref=e29] [cursor=pointer]:
            - /url: /positioning
            - img [ref=e30]
            - generic [ref=e32]: 定位中心
          - link "内容雷达" [ref=e33] [cursor=pointer]:
            - /url: /intelligence
            - img [ref=e34]
            - generic [ref=e41]: 内容雷达
          - link "选题" [ref=e42] [cursor=pointer]:
            - /url: /topics
            - img [ref=e43]
            - generic [ref=e46]: 选题
          - link "项目" [ref=e47] [cursor=pointer]:
            - /url: /projects
            - img [ref=e48]
            - generic [ref=e50]: 项目
          - link "知识库" [ref=e51] [cursor=pointer]:
            - /url: /knowledge
            - img [ref=e52]
            - generic [ref=e54]: 知识库
          - link "素材中心" [ref=e55] [cursor=pointer]:
            - /url: /assets
            - img [ref=e56]
            - generic [ref=e61]: 素材中心
          - link "创作画布" [ref=e62] [cursor=pointer]:
            - /url: /canvases
            - img [ref=e63]
            - generic [ref=e67]: 创作画布
          - link "发布中心" [ref=e68] [cursor=pointer]:
            - /url: /publishing
            - img [ref=e69]
            - generic [ref=e72]: 发布中心
          - link "运营分析" [ref=e73] [cursor=pointer]:
            - /url: /daily-report
            - img [ref=e74]
            - generic [ref=e76]: 运营分析
          - link "自动化" [ref=e77] [cursor=pointer]:
            - /url: /automations
            - img [ref=e78]
            - generic [ref=e82]: 自动化
          - link "设置" [ref=e83] [cursor=pointer]:
            - /url: /settings
            - img [ref=e84]
            - generic [ref=e87]: 设置
        - region "当前项目" [ref=e88]:
          - heading "当前项目" [level=2] [ref=e89]
          - list [ref=e90]:
            - listitem [ref=e91]:
              - link "把一次尝试写清楚" [ref=e92] [cursor=pointer]:
                - /url: /projects/project-bcda7005-22
                - generic [ref=e93]: 把一次尝试写清楚
      - generic [ref=e94]:
        - generic [ref=e95]:
          - generic [ref=e96]:
            - img [ref=e98]
            - generic [ref=e101]: AI 助手
          - paragraph [ref=e102]: 创作者，今天想先做点什么？
          - link "打开 AI 助手" [ref=e103] [cursor=pointer]:
            - /url: "?copilot=open&scope=global"
        - button "帮助与反馈" [ref=e104]:
          - img [ref=e105]
          - generic [ref=e114]: 帮助与反馈
        - button "当前账号组：T1307-T1308-B-f7bb4285-fdb5-4a6a-9aaf-16f5a884d597" [ref=e116] [cursor=pointer]:
          - img [ref=e118]
          - generic [ref=e122]:
            - generic [ref=e123]: 当前账号组
            - generic [ref=e124]: T1307-T1308-B-f7bb4285-fdb5-4a6a-9aaf-16f5a884d597
          - img [ref=e125]
        - generic [ref=e128]:
          - generic [ref=e130]: "?"
          - generic [ref=e132]: 创作者
          - generic [ref=e133]: 个人版
    - generic [ref=e134]:
      - banner [ref=e135]:
        - generic [ref=e136]:
          - generic "把一次尝试写清楚" [ref=e138]
          - list "项目工作面" [ref=e139]:
            - listitem [ref=e140]:
              - link "脚本" [ref=e141] [cursor=pointer]:
                - /url: /projects/project-bcda7005-22
            - listitem [ref=e142]:
              - link "制作视频" [ref=e143] [cursor=pointer]:
                - /url: /projects/project-bcda7005-22/production
            - listitem [ref=e144]:
              - link "复盘" [ref=e145] [cursor=pointer]:
                - /url: /projects/project-bcda7005-22/review
        - link "搜索" [ref=e147] [cursor=pointer]:
          - /url: /search
          - img
        - button "充值" [ref=e149]
      - main [ref=e155]:
        - generic [ref=e156]:
          - generic [ref=e157]:
            - generic [ref=e158]:
              - button "这条为什么值得做 把一次尝试写清楚 仅依据原稿；四行练习是正文，请逐字保留文字、冒号与每处六个下划线，不增加统计或经历。 展开 ▾" [ref=e159]:
                - generic [ref=e160]: "?"
                - generic [ref=e161]:
                  - generic [ref=e162]:
                    - generic [ref=e163]: 这条为什么值得做
                    - generic [ref=e164]: 把一次尝试写清楚
                  - generic [ref=e165]: 仅依据原稿；四行练习是正文，请逐字保留文字、冒号与每处六个下划线，不增加统计或经历。
                - generic [ref=e166]: 展开 ▾
              - generic [ref=e167]:
                - generic [ref=e168]:
                  - term [ref=e169]: 给谁看：
                  - definition [ref=e170]: 尚未明确具体观众和处境，可让编导结合已有资料判断
                - generic [ref=e171]:
                  - term [ref=e172]: 希望带来什么：
                  - definition [ref=e173]: 尚未明确主要目的
                - generic [ref=e174]:
                  - term [ref=e175]: 依据与缺口：
                  - definition [ref=e176]: 选题卡尚未记录可核对来源；不代表账号没有材料，需结合素材确认。
              - link "让编导帮你填 →" [ref=e178] [cursor=pointer]:
                - /url: "?copilot=open&surface=project&fn=brief.fill&selKind=project&selId=project-bcda7005-22&selTitle=%E6%8A%8A%E4%B8%80%E6%AC%A1%E5%B0%9D%E8%AF%95%E5%86%99%E6%B8%85%E6%A5%9A&prefill=%E6%A0%B9%E6%8D%AE%E6%88%91%E4%BB%AC%E8%81%8A%E7%9A%84%2C%E5%B8%AE%E6%88%91%E6%8A%8A%E9%80%89%E9%A2%98%E5%8D%A1%E5%A1%AB%E4%BA%86"
            - region "创作流引导" [ref=e179]:
              - button "一键生成文章和图文" [ref=e180]:
                - img
                - text: 一键生成文章和图文
              - button "上传 / 管理素材" [ref=e181]:
                - img
                - text: 上传 / 管理素材
              - button "联网找资料" [ref=e182]:
                - img
                - text: 联网找资料
              - button "先梳理观点（可选）" [ref=e183]:
                - img
                - text: 先梳理观点（可选）
              - generic [ref=e184]: 复杂观点可先梳理；已有完整逐字稿或简单短口播可直接写稿
            - region "创作素材" [ref=e185]:
              - generic [ref=e186]:
                - generic [ref=e187]:
                  - heading "创作素材" [level=2] [ref=e188]
                  - paragraph [ref=e189]: 收集资料、上传文件，也可以用画布制作图片和视频。选中的结果会出现在这件作品里。
                - link "打开创作画布" [ref=e190] [cursor=pointer]:
                  - /url: /canvases?projectId=project-bcda7005-22
                  - img [ref=e191]
                  - text: 打开创作画布
                  - img [ref=e196]
                  - img [ref=e199]
                - button "记一条" [ref=e202]:
                  - img [ref=e203]
                  - text: 记一条
              - button "拖拽、点击或粘贴上传创作素材" [ref=e207] [cursor=pointer]:
                - img [ref=e208]
                - text: 把文档、截图、录屏或封面拖进来 —— 统一保存到当前项目，写稿、制作和复盘时都能继续使用
            - region "论点骨架（可选）" [ref=e211]:
              - generic [ref=e212]:
                - generic [ref=e213]:
                  - heading "论点骨架（可选）" [level=2] [ref=e214]:
                    - img [ref=e215]
                    - text: 论点骨架（可选）
                  - paragraph [ref=e219]: 适合知识讲解、观点评论、测评对比、较长内容，或需要证据与反驳时先理清观点。
                  - paragraph [ref=e220]: 已有完整逐字稿、简单通知、短口播、纯记录或只想快速成稿时，可以直接跳过。
                - generic [ref=e221]:
                  - button "先梳理观点" [ref=e222]:
                    - img
                    - text: 先梳理观点
                  - button "跳过，直接写稿" [ref=e223]
              - paragraph [ref=e225]: 还没有论点骨架。需要复杂论证时可先梳理核心论点、支撑依据、证据和反驳；不需要时直接写稿即可。
            - generic [ref=e226]:
              - generic [ref=e227]:
                - heading "口播脚本" [level=2] [ref=e228]
                - generic [ref=e229]: v2 · 写你的口播稿——保存即新版本,可回滚
                - generic [ref=e231]:
                  - generic [ref=e232]: 选择口播稿版本
                  - combobox "选择口播稿版本" [ref=e233]:
                    - option "v2（当前） · 10/16 12:13" [selected]
                    - option "v1 · 10/16 12:13"
              - generic [ref=e234]:
                - generic [ref=e235]:
                  - button "纯文本稿" [ref=e236]
                  - button "分镜脚本" [ref=e237]
                - generic [ref=e238]:
                  - toolbar "脚本编辑器工具栏" [ref=e239]:
                    - group "格式" [ref=e240]:
                      - button "加粗" [ref=e241]:
                        - img [ref=e242]
                      - button "斜体" [ref=e244]:
                        - img [ref=e245]
                      - button "删除线" [ref=e247]:
                        - img [ref=e248]
                    - group "标题" [ref=e252]:
                      - button "标题 1" [ref=e253]:
                        - img [ref=e254]
                      - button "标题 2" [ref=e256]:
                        - img [ref=e257]
                      - button "标题 3" [ref=e259]:
                        - img [ref=e260]
                    - group "插入" [ref=e264]:
                      - button "无序列表" [ref=e265]:
                        - img [ref=e266]
                      - button "有序列表" [ref=e267]:
                        - img [ref=e268]
                      - button "引用" [ref=e271]:
                        - img [ref=e272]
                    - button "保存" [disabled] [ref=e276]
                  - generic "脚本正文编辑器" [ref=e279]:
                    - paragraph [ref=e280]: 我整理工作笔记时，先把问题写清楚，再写尝试过的做法，最后记录观察到的现象。没有实际观察的内容就留空，不为了完整而补成一个结论。
                    - paragraph [ref=e281]
                    - paragraph [ref=e282]: 我想留给自己一张四行练习卡。以下四行属于正文，请保留原来的文字、顺序、换行和每处六个下划线，让读者以后自己填写：
                    - paragraph [ref=e283]
                    - paragraph [ref=e284]: 问题：______
                    - paragraph [ref=e285]: 尝试：______
                    - paragraph [ref=e286]: 观察：______
                    - paragraph [ref=e287]: 下一步：______
                    - paragraph [ref=e288]
                    - paragraph [ref=e289]: 空白不是结果，只是提醒我把事实和判断分开。这里没有统计数字，也不承诺一定提高效率。记录之后，留一个值得继续观察的问题。
                  - generic [ref=e290]:
                    - generic [ref=e291]: 字数 233
                    - generic [ref=e292]: 已保存
              - region "内容判断" [ref=e293]:
                - paragraph [ref=e294]: 让编导看内容
                - paragraph [ref=e295]: 结合当前稿和已有资料判断，修改建议由你采纳。
                - generic [ref=e296]:
                  - button "判断这条值不值得做" [ref=e297]
                  - button "检查哪里留不住人" [ref=e298]
                  - button "把证据讲清楚" [ref=e299]
              - generic [ref=e300]:
                - generic [ref=e301]:
                  - generic [ref=e302]:
                    - img [ref=e303]
                    - text: 编导文案审核
                  - button "审核" [ref=e306]:
                    - img
                    - text: 审核
                - paragraph [ref=e307]: 当前稿未审核。发布前在右栏对话里跑一次合规审(L1 违禁词 + L2 语义审),命中给逐条改写建议。
            - generic [ref=e308]:
              - generic [ref=e309]:
                - generic [ref=e310]: 封面待生成
                - paragraph [ref=e312]: 发布时会从脚本钩子生成标题草稿、选封面与标签
                - generic [ref=e313]: 发布时创建发布行
              - generic [ref=e314]:
                - paragraph [ref=e315]: 标题 + 简介一键生成，自动过发布合规审核，采纳后写进发布包。
                - button "生成发布物料" [ref=e316]:
                  - img
                  - text: 生成发布物料
              - generic [ref=e317]:
                - generic [ref=e318]:
                  - img [ref=e319]
                  - text: 当前稿未过合规审核
                - button "先去审核" [ref=e321]
              - generic [ref=e323]:
                - generic [ref=e324]:
                  - img [ref=e325]
                  - text: 发布前先盲预测:在对话里让编导逐维度盲评,锁一份预测分,发布后用真实数据对照校准。
                - button "先盲预测" [ref=e327]:
                  - img
                  - text: 先盲预测
              - generic [ref=e329]:
                - img [ref=e330]
                - textbox "抖音链接" [ref=e333]:
                  - /placeholder: 发完了?粘抖音链接(或视频编号),登记为已发布…
                - button "登记已发布" [disabled]
          - separator "调整编导栏宽度" [ref=e334]
          - complementary [ref=e335]:
            - button "收起编导栏" [ref=e337] [cursor=pointer]:
              - generic [ref=e338]: ⟩
              - text: 收起编导
            - generic [ref=e341]:
              - generic [ref=e342]:
                - img [ref=e344]
                - generic [ref=e347]:
                  - heading "编导对话" [level=2] [ref=e348]
                  - paragraph [ref=e349]: 基于当前稿与选区持续调整，预览后再采纳
                - generic [ref=e350]:
                  - button "新对话" [ref=e351]:
                    - img [ref=e352]
                    - text: 新对话
                  - button "历史记录" [ref=e353]:
                    - img [ref=e354]
                    - text: 历史记录
              - generic "当前项目：把一次尝试写清楚" [ref=e358]:
                - img [ref=e359]
                - generic [ref=e361]: 项目
                - generic [ref=e362]: ·
                - generic [ref=e363]: 把一次尝试写清楚
              - generic [ref=e364]:
                - generic [ref=e366]:
                  - img [ref=e368]
                  - paragraph [ref=e371]: 描述你的目标，我来帮你规划下一步
                  - paragraph [ref=e372]: 试试「基于最近评论出 5 个选题」，或用下方推荐指令开聊。
                - generic [ref=e375]:
                  - textbox "我能帮你做什么" [ref=e377]:
                    - /placeholder: 我能帮你做什么？（试试「基于最近评论出 5 个选题」，或输入 @ 引用一个项目）
                  - generic [ref=e378]:
                    - button "Choose File" [ref=e379]
                    - generic [ref=e380]:
                      - button "添加文件或图片" [ref=e381]:
                        - img [ref=e382]
                        - text: 添加文件或图片
                      - generic [ref=e384]: 也可拖到这里；图片识别效果取决于当前模型
                  - generic [ref=e385]:
                    - generic [ref=e386]:
                      - button "分析机会" [ref=e387]:
                        - img [ref=e389]
                        - text: 分析机会
                      - button "生成脚本" [ref=e391]:
                        - img [ref=e393]
                        - text: 生成脚本
                      - button "寻找素材" [ref=e396]:
                        - img [ref=e398]
                        - text: 寻找素材
                      - button "生成图片素材" [ref=e403]:
                        - img [ref=e405]
                        - text: 生成图片素材
                      - button "生成视频素材" [ref=e409]:
                        - img [ref=e411]
                        - text: 生成视频素材
                      - button "生成封面" [ref=e414]:
                        - img [ref=e416]
                        - text: 生成封面
                      - button "发布复盘" [ref=e420]:
                        - img [ref=e422]
                        - text: 发布复盘
                    - generic [ref=e425]:
                      - generic [ref=e426]: ⌘/Ctrl ↩ 发送 · Enter 换行
                      - button "清空输入" [disabled] [ref=e427]: 清空
                      - button "提交提示给 Copilot" [disabled] [ref=e428]:
                        - img [ref=e429]
                        - generic [ref=e431]: 生成
  - alert [ref=e432]
```

# Test source

```ts
  47  |  await openAssistant(page);await page.getByRole('button',{name:'历史记录',exact:true}).click();
  48  |  const item=page.locator(`[data-slot="copilot-history-item"][data-conversation-id="${turn.ids.conversationId}"]`);await expect(item).toHaveCount(1);await item.click();
  49  |  const card=page.getByRole('region',{name:turn.kind==='editor'?'编导编辑候选':'文章和图文联合候选',exact:true});await expect(card).toHaveCount(1);await expect(card).toBeVisible();return card;
  50  | }
  51  | async function owner(page,kind,turn,{navigate=true,dirty=false,width=1366}={}){
  52  |  if(navigate){await page.setViewportSize({width,height:900});await page.goto(kind==='article'?`/projects/${projectId}/article?outputId=${turn.articleId}`:`/projects/${projectId}/outputs/${turn.graphicId}/image`);}
  53  |  const main=page.locator(`[data-page="${kind==='article'?'article':'graphic-post'}-workbench"]`);await expect(main).toBeVisible();
  54  |  await expect(main.getByText(dirty?'已承接脚本，开始对话或导出时保存':'当前成稿已保存',{exact:true})).toBeVisible();
  55  |  await expect(main.getByRole('button',{name:kind==='article'?'复制公众号文章':'导出分页 ZIP',exact:true})).toBeEnabled();
  56  |  const region=await history(page,turn);
  57  |  await expect(page.getByRole('textbox',{name:'我能帮你做什么',exact:true})).toHaveAttribute('placeholder',kind==='article'?'告诉我这篇文章需要怎么调整':'告诉我这份图文需要怎么调整');
  58  |  return {main,region};
  59  | }
  60  | function member(page,region,kind){return region.locator('article').filter({has:page.getByRole('heading',{name:kind==='article'?'文章候选':'图文候选',exact:true})});}
  61  | async function modal(page,card,kind,editor=false){
  62  |  await card.getByRole('button',{name:editor?'预览改动':'预览候选',exact:true}).click();
  63  |  const dialog=page.getByRole('dialog',{name:editor?(kind==='article'?'文章改动预览':'图文改动预览'):(kind==='article'?'文章候选预览':'图文候选预览'),exact:true});
  64  |  await expect(dialog).toBeVisible();await expect(dialog.getByRole('button',{name:kind==='article'?'复制公众号文章':'导出分页 ZIP',exact:true})).toBeEnabled();return dialog;
  65  | }
  66  | async function expand(page,dialog){const summary=dialog.locator('summary').filter({hasText:/^本次采纳选择$/});await expect(summary).toHaveCount(1);await summary.click();await expect(dialog.getByRole('region',{name:'本次采纳选择',exact:true})).toBeVisible();return dialog.getByRole('region',{name:'本次采纳选择',exact:true});}
  67  | async function close(dialog){await dialog.getByRole('button',{name:'关闭',exact:true}).click();await expect(dialog).toBeHidden();}
  68  | async function settle(page,response,label,kind){
  69  |  const headers=response.headers();const ids={conversationId:headers['x-conversation-id'],sourceMessageId:headers['x-source-message-id'],aiTaskId:headers['x-ai-task-id'],executionTaskId:headers['x-execution-task-id']};
  70  |  save(label+'-submission',{ids,httpStatus:response.status(),request:response.request().postDataJSON(),at:new Date().toISOString()});expect(response.status()).toBe(200);for(const value of Object.values(ids))expect(value).toBeTruthy();
  71  |  return observeOriginal(page,ids,label,kind);
  72  | }
  73  | async function observeOriginal(page,ids,label,kind){
  74  |  let task;await expect.poll(async()=>{task=await rpc(page,'execution.tasks.get',{params:{taskId:ids.executionTaskId}});save(label+'-task',{ids,task,at:new Date().toISOString()});return ['succeeded','failed','blocked','waiting_user','unknown_result','paused','cancelled','partial'].includes(task.runtimeStatus??task.status);},{timeout:1800000,intervals:[2000,5000]}).toBe(true);
  75  |  timingEvent('original-task-terminal',{label,ids,status:task.runtimeStatus??task.status,attempt:task.attempt});expect(task.runtimeStatus??task.status,'原任务终态，失败/未知不自动重发').toBe('succeeded');
  76  |  const messages=await rpc(page,'ai.conversations.messages.list',{params:{conversationId:ids.conversationId}});save(label+'-messages',messages);
  77  |  const assistant=messages.find(m=>m.role==='assistant'&&m.modelMetadata?.sourceMessageId===ids.sourceMessageId);expect(assistant).toBeTruthy();expect(assistant.modelMetadata.actualEngine).toBe('codex');
  78  |  const proposals=assistant.parts.map(p=>({...p,output:p.output?.data??p.output})).filter(p=>p.output?.kind===(kind==='editor'?'work.editor.candidate':'work.creation.propose')&&p.output.error===null);expect(proposals,'新独立会话只应有可精确对应的一张目标候选').toHaveLength(1);
  79  |  const part=proposals[0],value=part.output;const turn={label,kind,ids,assistantId:assistant.id,toolCallId:part.toolCallId,value,articleId:kind==='editor'?value.target.outputId:value.target.articleMember.outputId,graphicId:kind==='editor'?turns.joint1.graphicId:value.target.graphicMember.outputId};
  80  |  turn.attempt=task.attempt;turn.modelMetadata=assistant.modelMetadata;turn.sourceRead={operation:'ai.workCandidates.source',input:{params:{conversationId:ids.conversationId},query:{sourceMessageId:ids.sourceMessageId,toolCallId:part.toolCallId}}};save(label+'-candidate',turn);return turn;
  81  | }
  82  | 
  83  | const readFixture=()=>JSON.parse(fs.readFileSync(path.join(root,"fixture.json"),"utf8"));
  84  | async function generateInitial(page){
  85  |  phase='joint1-ui-generate';await page.goto(`/projects/${projectId}`);await openAssistant(page);await page.getByRole('button',{name:'新对话',exact:true}).click();
  86  |  const before=await scriptVersions(page);save('joint1-script-before-button',before);const promise=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/chat'&&r.request().method()==='POST',{timeout:1800000});await page.getByRole('button',{name:'一键生成文章和图文',exact:true}).click();const response=await promise;
  87  |  const request=response.request().postDataJSON(),target=request.chatContext.creationTarget;save('joint1-frozen-target',target);const confirmed=await scriptVersions(page);save('joint1-script-confirmed-baseline',confirmed);expect(confirmed.slice(0,before.length)).toEqual(before);expect(confirmed.at(-1).id).toBe(target.scriptSourceRef.versionId);expect(confirmed.at(-1).contentData.sections.map(s=>s.body).join('\n\n')).toBe(readFixture().original);
  88  |  const turn=await settle(page,response,'joint1','joint');turn.scriptBaseline=confirmed;turns.joint1=turn;save('turns-index',turns);expect(await scriptVersions(page)).toEqual(confirmed);return turn;
  89  | }
  90  | const {performance}=require('node:perf_hooks'),{createRequire}=require('node:module');
  91  | const requireFrontend=createRequire(path.join(binding.sourceRoot,'frontend/package.json'));
  92  | const {JSDOM}=requireFrontend('jsdom'),MarkdownIt=requireFrontend('markdown-it');
  93  | const markdown=new MarkdownIt({html:false});
  94  | const compact=s=>String(s??'').replace(/\s+/gu,'');
  95  | const fourLines=['问题：______','尝试：______','观察：______','下一步：______'];
  96  | const timing=[];function timingEvent(kind,detail={}){timing.push({kind,...detail,at:new Date().toISOString(),monotonicMs:performance.now(),phase});save('safe-timing',timing);}
  97  | async function allState(page,turn){return {article:await resource(page,'article',turn),graphic:await resource(page,'image',turn),script:await scriptState(page)};}
  98  | async function isolated(page,label,turn,action,{changed=null}={}){
  99  |  const before=await allState(page,turn);save(label+'-before',before);const result=await action();const after=await allState(page,turn);save(label+'-after',after);
  100 |  expect(after.script).toEqual(before.script);if(changed!=='article')expect(after.article).toEqual(before.article);if(changed!=='graphic')expect(after.graphic).toEqual(before.graphic);save(label+'-isolation',{status:'PASS',changed,scriptMetadataAndAllVersionsEqual:true,articleEqual:canonical(after.article)===canonical(before.article),graphicEqual:canonical(after.graphic)===canonical(before.graphic)});return result;
  101 | }
  102 | function sourceDocument(source,turn){return turn.kind==='editor'?source.candidate.candidate.document:source.candidate.article;}
  103 | function plainBlocks(document){const expected=[document.title];for(const section of [...document.sections].sort((a,b)=>a.order-b.order)){if(section.heading)expected.push(section.heading);const dom=new JSDOM(markdown.render(section.body));try{expected.push(...Array.from(dom.window.document.body.children).map(n=>n.textContent).filter(Boolean));}finally{dom.window.close();}}return expected;}
  104 | function validateText(actual,document){const expected=plainBlocks(document),text=compact(actual);let cursor=0;const positions=expected.map(block=>{const at=text.indexOf(compact(block),cursor);expect(at,'source全文有序正文必须保真：'+block.slice(0,100)).toBeGreaterThanOrEqual(cursor);cursor=at+compact(block).length;return at;});for(const line of fourLines)expect(text).toContain(line);expect(actual).not.toMatch(/<\/?(?:strong|span)\b/i);return {allSourceBlocksInOrder:true,expected,positions,fourLinesPreserved:true,newLiteralStrongSpan:false};}
  105 | async function fidelity(page,info,host,turn,label){
  106 |  const source=await rpc(page,turn.sourceRead.operation,turn.sourceRead.input);save(label+'-actual-source',source);const document=sourceDocument(source,turn);save(label+'-source-document',document);
  107 |  const sourceText=document.sections.map(x=>x.body).join('\n\n');const retained=fourLines.every(line=>sourceText.includes(line));save(label+'-source-family',{retained,expectedFourLines:fourLines,sourceContainsLiteralStrongSpan:/<\/?(?:strong|span)\b/i.test(sourceText),modelRetry:false});expect(retained,'真实模型source未保四行；保原task/source，不自动补发').toBe(true);expect(sourceText).not.toMatch(/<\/?(?:strong|span)\b/i);
  108 |  const article=host.locator('[aria-label="公众号排版编辑器"]').locator('article');await expect(article).toHaveCount(1);
  109 |  const preview=await article.evaluate(node=>({html:node.outerHTML,text:node.textContent,blocks:Array.from(node.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li')).map(n=>n.textContent),theme:node.querySelector('[data-wenote-kind]')?.getAttribute('data-wenote-kind')}));write(path.join(root,label+'-native-preview.html'),preview.html);save(label+'-native-preview',preview);expect(preview.theme).toBe('graphite-minimal');const previewCheck=validateText(preview.text,document);
  110 |  const relevant=article.locator('p').filter({hasText:'问题：______'});await expect(relevant.first()).toBeVisible();await relevant.first().scrollIntoViewIfNeeded();await article.screenshot({path:path.join(root,label+'-four-lines.png'),animations:'disabled',caret:'hide',timeout:120000});await snapshot(page,info,label+'-preview-visible');
  111 |  const more=host.locator('summary').filter({hasText:/^更多导出$/});await more.click();const pending=page.waitForEvent('download',{timeout:900000});await host.getByRole('button',{name:'导出 HTML',exact:true}).click();const download=await pending;let failed;try{failed=await download.failure();}catch{throw Error('PUBLIC_DOWNLOAD_FAILURE');}expect(failed).toBeNull();const file=path.join(root,label+'-original-download.html');await download.saveAs(file);const bytes=fs.readFileSync(file);if(bytes.includes(Buffer.from(session.handshake)))throw Error('PRIVATE_SECRET_NOT_PERSISTED');const html=bytes.toString('utf8');const dom=new JSDOM(html);let exported;try{const node=dom.window.document.querySelector('article');expect(node).not.toBeNull();exported={text:node.textContent,blocks:Array.from(node.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li')).map(n=>n.textContent)};}finally{dom.window.close();}
  112 |  const exportCheck=validateText(exported.text,document);save(label+'-source-render-export-check',{status:'PASS',previewCheck,exportCheck,originalDownload:{path:file,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,rawBytesUnchanged:true,suggestedFilename:download.suggestedFilename()},theme:preview.theme,nativeLayout:document.nativeLayout??null,normalization:'分析副本仅去空白；独立Markdown parser解释source合法格式，原source/HTML未改',previewAndExportEqual:compact(exported.text)===compact(preview.text)});return document;
  113 | }
  114 | async function exactCurrent(page,kind,turn){const current=await resource(page,kind,turn);const exact=await rpc(page,kind==='article'?'articles.versions.get':'graphicPosts.versions.get',{params:{outputId:current.outputId,versionId:current.currentVersionId}});expect(exact.versionId).toBe(current.currentVersionId);expect(current.current).toEqual(exact.document);return current;}
  115 | async function adopt(page,info,turn,kind,{dirty=false}={}){
  116 |  const label=turn.label+'-'+kind;phase=label;const {main,region}=await owner(page,kind,turn,{dirty});const card=turn.kind==='editor'?region:member(page,region,kind);
  117 |  const source=await isolated(page,label+'-source-read',turn,()=>rpc(page,turn.sourceRead.operation,turn.sourceRead.input));save(label+'-source',source);
  118 |  const dialog=await isolated(page,label+'-open-preview',turn,()=>modal(page,card,kind,turn.kind==='editor'));
  119 |  let document;if(kind==='article')document=await isolated(page,label+'-preview-and-original-download',turn,()=>fidelity(page,info,dialog,turn,label));
  120 |  await isolated(page,label+'-selection',turn,async()=>{const controls=await expand(page,dialog);save(label+'-selection-values',await controls.getByRole('checkbox').evaluateAll(nodes=>nodes.map(n=>({label:n.parentElement.textContent,checked:n.checked,disabled:n.disabled}))));});
  121 |  await isolated(page,label+'-close-preview',turn,()=>close(dialog));
  122 |  const before=await resource(page,kind,turn),count=writes().length;
  123 |  await isolated(page,label+'-adoption',turn,async()=>{await card.getByRole('button',{name:turn.kind==='editor'?'采纳到当前作品':kind==='article'?'采纳文章':'采纳图文',exact:true}).click();await expect(card.getByRole('status')).toContainText('已保存');await expect(main.getByText('当前成稿已保存',{exact:true})).toBeVisible();},{changed:kind==='article'?'article':'graphic'});
  124 |  const current=await exactCurrent(page,kind,turn);expect(current.currentVersionId).not.toBe(before.currentVersionId);expect(writes()).toHaveLength(count+1);if(document){expect(current.current.sections).toEqual(document.sections);for(const line of fourLines)expect(current.current.sections.map(x=>x.body).join('\n\n')).toContain(line);}
  125 |  await isolated(page,label+'-natural-reload',turn,async()=>{const url=page.url();await page.reload();expect(page.url()).toBe(url);await owner(page,kind,turn,{navigate:false});await exactCurrent(page,kind,turn);});
  126 |  if(kind==='article')await isolated(page,label+'-current-export',turn,()=>fidelity(page,info,page.locator('[data-page="article-workbench"]'),turn,label+'-adopted'));
  127 |  save(label+'-result',{status:'PASS',versionId:current.currentVersionId,exactCurrentReadback:true,request:writes().at(-1),sourceRead:turn.sourceRead,actualSourcePreserved:true,naturalReload:true});return current;
  128 | }
  129 | function handoff(){const value={sourceHead:binding.sourceHead,controlHead:'354786143377c58a12876731d00b075c4008a858',candidateBinding:session.candidateBinding,candidateBindingSha256:crypto.createHash('sha256').update(fs.readFileSync(session.candidateBinding)).digest('hex'),baseURL:session.baseURL,ownedRoot:session.ownedRoot,privateSessionPath:process.env.T1300_SESSION,groupId,projectId,scriptId,scriptURL:session.baseURL+'/projects/'+projectId,ownerURLs:{article:session.baseURL+`/projects/${projectId}/article?outputId=${turns.joint1.articleId}`,graphic:session.baseURL+`/projects/${projectId}/outputs/${turns.joint1.graphicId}/image`},turns,history:{A:turns.editor?.ids.conversationId,B:turns.joint1.ids.conversationId},timing:{file:'safe-timing.json',prepareInternal:'缺测；仅有实际UI触发、公开保存请求/POST及可见状态',backendJoin:'executionTaskId+attempt；toolCallId+sourceMessageId用于C按原日志映射callId；尚未取得的backend phase时刻不编造'},sourceInterceptOrder:'creation来源eager；先按operation+conversation/source/toolCall注册，再导航/挂载；editor预览前注册',models:modelPosts};save('HANDOFF',value);}
  130 | test('T1307 两真实UI turn source预览原HTML及采纳刷新隔离',async({page},info)=>{
  131 |  test.setTimeout(28800000);expect(binding.sourceHead).toBe('dc46cfa700ec9c9cbada47fb76237d0b50d10a67');let observer;
  132 |  page.on('request',request=>{const id=op(request);if(id){network.push({phase,id,input:request.postDataJSON()?.input,at:new Date().toISOString(),monotonicMs:performance.now()});save('network',network);if(['artifacts.versions.create','articles.versions.create','graphicPosts.versions.create'].includes(id))timingEvent('public-save-post-issued',{operation:id});}if(new URL(request.url()).pathname==='/api/chat'&&request.method()==='POST'){modelPosts++;save('model-posts',{count:modelPosts,phase,request:request.postDataJSON()});timingEvent('model-post-issued',{ordinal:modelPosts});}});
  133 |  page.on('response',response=>{if(new URL(response.url()).pathname==='/api/chat'&&response.request().method()==='POST'){const h=response.headers();timingEvent('chat-response-headers',{httpStatus:response.status(),ids:{conversationId:h['x-conversation-id'],sourceMessageId:h['x-source-message-id'],aiTaskId:h['x-ai-task-id'],executionTaskId:h['x-execution-task-id']}});}});
  134 |  await page.route('**/api/chat',route=>{if(modelPosts>2)return route.abort('blockedbyclient');return route.continue();});
  135 |  try{
  136 |   phase='setup';save('binding-reference',{sourceHead:binding.sourceHead,baseURL:session.baseURL,candidateBinding:session.candidateBinding});
  137 |   const group=await rpc(page,'accountGroups.create',{body:{name:'T1307-T1308-B-'+uuid(),idempotencyKey:uuid()}});groupId=group.id;save('owned',{groupId,sourceHead:binding.sourceHead,baseURL:session.baseURL,freshRoot:true,businessStorageCopied:false});
  138 |   await page.context().addCookies([{name:'creatoros_current_group',value:encodeURIComponent(groupId),url:session.baseURL}]);await page.addInitScript(id=>{localStorage.setItem('creatoros:current-group',id);localStorage.removeItem('creatoros:current-account');localStorage.setItem('creatoros:onboarding:hidden','1');},groupId);
  139 |   await page.goto('/settings?highlight=assistant-engine');save('cfg-before',await rpc(page,'settings.modelRouting.get'));await page.getByLabel('文本创作与结构化模型来源',{exact:true}).selectOption('codex');await page.getByLabel('图片模型来源',{exact:true}).selectOption('codex');const settings=page.waitForResponse(r=>op(r.request())==='settings.modelRouting.put',{timeout:900000});await page.getByRole('button',{name:'保存模型来源',exact:true}).click();expect((await settings).status()).toBe(200);await expect(page.getByRole('status').filter({hasText:'已保存并读回当前设置'})).toBeVisible();const cfg=await rpc(page,'settings.modelRouting.get');save('cfg-after',cfg);expect(cfg.choices).toMatchObject({text:'codex',vision:'codex',image:'codex'});
  140 |   const project=await rpc(page,'projects.create',{body:{title:'把一次尝试写清楚',brief:'仅依据原稿；四行练习是正文，请逐字保留文字、冒号与每处六个下划线，不增加统计或经历。',contentType:'article',targetPlatforms:['wechatOfficialAccount','xiaohongshu']}});projectId=project.id;const script=await rpc(page,'artifacts.create',{params:{projectId},body:{title:'一次尝试的四行记录',artifactType:'output_script',stage:'script'}});scriptId=script.id;
  141 |   const original='我整理工作笔记时，先把问题写清楚，再写尝试过的做法，最后记录观察到的现象。没有实际观察的内容就留空，不为了完整而补成一个结论。\n\n我想留给自己一张四行练习卡。以下四行属于正文，请保留原来的文字、顺序、换行和每处六个下划线，让读者以后自己填写：\n\n'+fourLines.join('\n')+'\n\n空白不是结果，只是提醒我把事实和判断分开。这里没有统计数字，也不承诺一定提高效率。记录之后，留一个值得继续观察的问题。';save('fixture',{groupId,projectId,scriptId,original,fourLines});
  142 |   await page.goto(`/projects/${projectId}`);const scriptEditor=page.locator('[data-slot="script-document"] [contenteditable="true"]');await expect(scriptEditor).toBeVisible();await scriptEditor.fill(original);await page.locator('[data-slot="editor-save-button"]').click();await expect(page.locator('[data-slot="editor-status-save-status"]')).toHaveText('已保存');const scripts=await scriptState(page);expect(scripts.versions.at(-1).contentData.sections.map(x=>x.body).join('\n\n')).toBe(original);save('script-ui-saved',scripts);
  143 |   const seen=new Set();let observing=false;observer=setInterval(async()=>{if(observing||page.isClosed())return;observing=true;try{const values=await page.locator('[data-slot="copilot-messages"]').evaluateAll(nodes=>nodes.map(n=>n.textContent));const text=values.join('\n');for(const label of ['读取','候选','完成','已保存'])if(text.includes(label)&&!seen.has(phase+':'+label)){seen.add(phase+':'+label);timingEvent('browser-first-visible-text-family',{label,pollIntervalMs:250,exactTTI:false});}}catch{}finally{observing=false;}},250);
  144 |   timingEvent('ui-joint-action-start');const joint=await generateInitial(page);expect(modelPosts).toBe(1);handoff();for(const kind of ['article','image'])await adopt(page,info,joint,kind,{dirty:true});save('joint1-complete',{status:'PASS',modelPosts});
  145 |   phase='editor-prepare-ui';await owner(page,'article',joint);await page.getByRole('button',{name:'新对话',exact:true}).click();const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/chat'&&r.request().method()==='POST',{timeout:1800000});const input=page.getByRole('textbox',{name:'我能帮你做什么',exact:true});await input.fill('请先work.editor.read读取当前文章，仅将文章最后一句改为“下一步，留下一个值得继续观察的问题。”。保留其它全部正文、顺序和四行“问题：______ / 尝试：______ / 观察：______ / 下一步：______”，四行分别换行，原字及六个下划线不能删除、转义或改成其它符号。不改变脚本或图文，不生成媒体。请用work.editor.propose给一份完整文章编辑候选，只出一份，先不保存。');timingEvent('ui-editor-submit-start');await page.getByRole('button',{name:'提交提示给 Copilot',exact:true}).click();turns.editor=await settle(page,await response,'editor','editor');expect(modelPosts).toBe(2);save('turns-index',turns);handoff();await adopt(page,info,turns.editor,'article');
  146 |   save('final-business',await allState(page,joint));handoff();save('BUSINESS_RESULT',{status:'PASS',modelPosts,groupId,projectId,scriptId,samePageContext:true,sourceFidelityBothTurns:true,completeIsolation:true,at:new Date().toISOString()});
> 147 |  }catch(error){const code=String(error?.message??error);if(code.includes(session.handshake))throw Error('PRIVATE_ERROR_NOT_PERSISTED');save('FAILURE',{phase,modelPosts,message:code,at:new Date().toISOString()});await snapshot(page,info,'failure-'+phase).catch(()=>{});throw Error(code);}
      |                                                                                                                                                                                                                                                                                   ^ Error: expect(received).toBe(expected) // Object.is equality
  148 |  finally{if(observer)clearInterval(observer);save('network',network);save('safe-timing',timing);}
  149 | });
  150 | 
```