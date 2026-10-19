# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 01-auto-classify.spec.cjs >> A1301CLASSIFY 新上传自动分类原任务独立终态与文件跨组读回
- Location: ../docs/verification/t1301/acceptance/public/a/01-auto-classify.spec.cjs:4:1

# Error details

```
TypeError: dispatch is not a function
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e3]:
    - complementary "主侧栏" [ref=e4]:
      - generic [ref=e5]:
        - generic [ref=e6]:
          - img [ref=e8]
          - generic [ref=e11]: CreatorOS
        - button "收起侧栏" [ref=e12]:
          - img [ref=e13]
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
      - generic [ref=e88]:
        - generic [ref=e89]:
          - generic [ref=e90]:
            - img [ref=e92]
            - generic [ref=e95]: AI 助手
          - paragraph [ref=e96]: 创作者，今天想先做点什么？
          - link "打开 AI 助手" [ref=e97] [cursor=pointer]:
            - /url: "?copilot=open&scope=global"
        - button "帮助与反馈" [ref=e98]:
          - img [ref=e99]
          - generic [ref=e108]: 帮助与反馈
        - button "当前账号组：T1301-A-5f885d39-bf36-4ec3-9988-84cc561584a9" [ref=e110] [cursor=pointer]:
          - img [ref=e112]
          - generic [ref=e116]:
            - generic [ref=e117]: 当前账号组
            - generic [ref=e118]: T1301-A-5f885d39-bf36-4ec3-9988-84cc561584a9
          - img [ref=e119]
        - generic [ref=e122]:
          - generic [ref=e124]: "?"
          - generic [ref=e126]: 创作者
          - generic [ref=e127]: 个人版
    - generic [ref=e128]:
      - banner:
        - generic:
          - generic: 账号组与绑定账号
          - paragraph: 管理创作者工作区和各平台账号
        - button "充值" [ref=e130]
      - generic [ref=e134]:
        - main [ref=e136]:
          - generic [ref=e137]:
            - heading "账号组与绑定账号" [level=1] [ref=e138]
            - paragraph [ref=e139]: 同一创作者的内容在一个工作区管理，平台账号分别绑定与分发。
          - generic [ref=e140]:
            - complementary [ref=e141]:
              - region "账号组" [ref=e142]:
                - generic [ref=e145]: 账号组
                - generic [ref=e147]:
                  - generic [ref=e148]:
                    - checkbox "显示已归档组" [ref=e149]
                    - text: 显示已归档组
                  - list [ref=e150]:
                    - listitem [ref=e151]:
                      - button "T1301-A-5f885d39-bf36-4ec3-9988-84cc561584a9 0 个平台账号 · 当前工作区" [pressed] [ref=e152]:
                        - generic [ref=e153]: T1301-A-5f885d39-bf36-4ec3-9988-84cc561584a9
                        - generic [ref=e154]: 0 个平台账号 · 当前工作区
                  - generic [ref=e155]: 新账号组名称
                  - textbox "新账号组名称" [ref=e156]
                  - button "创建账号组" [disabled]
            - generic [ref=e157]:
              - region "T1301-A-5f885d39-bf36-4ec3-9988-84cc561584a9" [ref=e158]:
                - generic [ref=e161]: T1301-A-5f885d39-bf36-4ec3-9988-84cc561584a9
                - generic [ref=e163]:
                  - generic [ref=e164]:
                    - generic [ref=e165]: 账号组名称
                    - textbox "账号组名称" [ref=e166]: T1301-A-5f885d39-bf36-4ec3-9988-84cc561584a9
                    - button "保存名称" [disabled]
                  - generic [ref=e167]:
                    - group [ref=e168]:
                      - generic "管理账号组" [ref=e169] [cursor=pointer]
                    - link "继续创作 →" [ref=e170] [cursor=pointer]:
                      - /url: /projects
              - region "组内平台账号" [ref=e171]:
                - generic [ref=e173]:
                  - generic [ref=e174]: 组内平台账号
                  - generic [ref=e175]: 同平台可以登记多个账号，发布时选择具体目标。
                - list [ref=e177]:
                  - listitem [ref=e178]: 这个账号组还没有平台账号，可以先创建内容。
              - region "平台能力" [ref=e179]:
                - generic [ref=e181]:
                  - generic [ref=e182]: 平台能力
                  - generic [ref=e183]: 能力来自当前已装配的服务。可用不代表账号已登录，采集结果以真实任务为准。
                - table "各平台能力" [ref=e186]:
                  - rowgroup [ref=e187]:
                    - row "平台 扫码绑定 自动采集 自动发布 平台草稿 手动登记" [ref=e188]:
                      - columnheader "平台" [ref=e189]
                      - columnheader "扫码绑定" [ref=e190]
                      - columnheader "自动采集" [ref=e191]
                      - columnheader "自动发布" [ref=e192]
                      - columnheader "平台草稿" [ref=e193]
                      - columnheader "手动登记" [ref=e194]
                  - rowgroup [ref=e195]:
                    - row "抖音 可用 已接入平台登录与真实身份读取 扫码绑定抖音账号 可用 已接入作品与明细采集 暂不可用 尚未接入自动发布 暂不可用 尚未接入平台草稿保存 可用 可登记账号、导出物料与录入真实发布记录" [ref=e196]:
                      - rowheader "抖音" [ref=e197]
                      - cell "可用 已接入平台登录与真实身份读取 扫码绑定抖音账号" [ref=e198]:
                        - text: 可用
                        - paragraph [ref=e199]: 已接入平台登录与真实身份读取
                        - button "扫码绑定抖音账号" [ref=e200]
                      - cell "可用 已接入作品与明细采集" [ref=e201]:
                        - text: 可用
                        - paragraph [ref=e202]: 已接入作品与明细采集
                      - cell "暂不可用 尚未接入自动发布" [ref=e203]:
                        - text: 暂不可用
                        - paragraph [ref=e204]: 尚未接入自动发布
                      - cell "暂不可用 尚未接入平台草稿保存" [ref=e205]:
                        - text: 暂不可用
                        - paragraph [ref=e206]: 尚未接入平台草稿保存
                      - cell "可用 可登记账号、导出物料与录入真实发布记录" [ref=e207]:
                        - text: 可用
                        - paragraph [ref=e208]: 可登记账号、导出物料与录入真实发布记录
                    - row "快手 可用 已接入平台登录与真实身份读取 扫码绑定快手账号 可用 已接入作品与明细采集 暂不可用 尚未接入自动发布 暂不可用 尚未接入平台草稿保存 可用 可登记账号、导出物料与录入真实发布记录" [ref=e209]:
                      - rowheader "快手" [ref=e210]
                      - cell "可用 已接入平台登录与真实身份读取 扫码绑定快手账号" [ref=e211]:
                        - text: 可用
                        - paragraph [ref=e212]: 已接入平台登录与真实身份读取
                        - button "扫码绑定快手账号" [ref=e213]
                      - cell "可用 已接入作品与明细采集" [ref=e214]:
                        - text: 可用
                        - paragraph [ref=e215]: 已接入作品与明细采集
                      - cell "暂不可用 尚未接入自动发布" [ref=e216]:
                        - text: 暂不可用
                        - paragraph [ref=e217]: 尚未接入自动发布
                      - cell "暂不可用 尚未接入平台草稿保存" [ref=e218]:
                        - text: 暂不可用
                        - paragraph [ref=e219]: 尚未接入平台草稿保存
                      - cell "可用 可登记账号、导出物料与录入真实发布记录" [ref=e220]:
                        - text: 可用
                        - paragraph [ref=e221]: 可登记账号、导出物料与录入真实发布记录
                    - row "视频号 可用 已接入平台登录与真实身份读取 扫码绑定视频号账号 可用 已接入后台原生报表采集 暂不可用 尚未接入自动发布 暂不可用 尚未接入平台草稿保存 可用 可登记账号、导出物料与录入真实发布记录" [ref=e222]:
                      - rowheader "视频号" [ref=e223]
                      - cell "可用 已接入平台登录与真实身份读取 扫码绑定视频号账号" [ref=e224]:
                        - text: 可用
                        - paragraph [ref=e225]: 已接入平台登录与真实身份读取
                        - button "扫码绑定视频号账号" [ref=e226]
                      - cell "可用 已接入后台原生报表采集" [ref=e227]:
                        - text: 可用
                        - paragraph [ref=e228]: 已接入后台原生报表采集
                      - cell "暂不可用 尚未接入自动发布" [ref=e229]:
                        - text: 暂不可用
                        - paragraph [ref=e230]: 尚未接入自动发布
                      - cell "暂不可用 尚未接入平台草稿保存" [ref=e231]:
                        - text: 暂不可用
                        - paragraph [ref=e232]: 尚未接入平台草稿保存
                      - cell "可用 可登记账号、导出物料与录入真实发布记录" [ref=e233]:
                        - text: 可用
                        - paragraph [ref=e234]: 可登记账号、导出物料与录入真实发布记录
                    - row "公众号 可用 已接入平台登录与真实身份读取 扫码绑定公众号账号 可用 已接入后台原生报表采集 暂不可用 尚未接入自动发布 暂不可用 尚未接入平台草稿保存 可用 可登记账号、导出物料与录入真实发布记录" [ref=e235]:
                      - rowheader "公众号" [ref=e236]
                      - cell "可用 已接入平台登录与真实身份读取 扫码绑定公众号账号" [ref=e237]:
                        - text: 可用
                        - paragraph [ref=e238]: 已接入平台登录与真实身份读取
                        - button "扫码绑定公众号账号" [ref=e239]
                      - cell "可用 已接入后台原生报表采集" [ref=e240]:
                        - text: 可用
                        - paragraph [ref=e241]: 已接入后台原生报表采集
                      - cell "暂不可用 尚未接入自动发布" [ref=e242]:
                        - text: 暂不可用
                        - paragraph [ref=e243]: 尚未接入自动发布
                      - cell "暂不可用 尚未接入平台草稿保存" [ref=e244]:
                        - text: 暂不可用
                        - paragraph [ref=e245]: 尚未接入平台草稿保存
                      - cell "可用 可登记账号、导出物料与录入真实发布记录" [ref=e246]:
                        - text: 可用
                        - paragraph [ref=e247]: 可登记账号、导出物料与录入真实发布记录
                    - row "小红书 可用 已接入平台登录与真实身份读取 扫码绑定小红书账号 可用 已接入作品与明细采集 暂不可用 尚未接入自动发布 暂不可用 尚未接入平台草稿保存 可用 可登记账号、导出物料与录入真实发布记录" [ref=e248]:
                      - rowheader "小红书" [ref=e249]
                      - cell "可用 已接入平台登录与真实身份读取 扫码绑定小红书账号" [ref=e250]:
                        - text: 可用
                        - paragraph [ref=e251]: 已接入平台登录与真实身份读取
                        - button "扫码绑定小红书账号" [ref=e252]
                      - cell "可用 已接入作品与明细采集" [ref=e253]:
                        - text: 可用
                        - paragraph [ref=e254]: 已接入作品与明细采集
                      - cell "暂不可用 尚未接入自动发布" [ref=e255]:
                        - text: 暂不可用
                        - paragraph [ref=e256]: 尚未接入自动发布
                      - cell "暂不可用 尚未接入平台草稿保存" [ref=e257]:
                        - text: 暂不可用
                        - paragraph [ref=e258]: 尚未接入平台草稿保存
                      - cell "可用 可登记账号、导出物料与录入真实发布记录" [ref=e259]:
                        - text: 可用
                        - paragraph [ref=e260]: 可登记账号、导出物料与录入真实发布记录
              - region "手动登记平台账号" [ref=e261]:
                - generic [ref=e263]:
                  - generic [ref=e264]: 手动登记平台账号
                  - generic [ref=e265]: 目标账号组：T1301-A-5f885d39-bf36-4ec3-9988-84cc561584a9
                - generic [ref=e268]:
                  - paragraph [ref=e269]: 登记用于保存分发目标，不会验证登录或自动采集数据。
                  - generic [ref=e270]:
                    - generic [ref=e271]:
                      - text: 登记平台
                      - combobox "登记平台" [ref=e272]:
                        - option "抖音"
                        - option "快手"
                        - option "视频号"
                        - option "公众号"
                        - option "小红书" [selected]
                    - generic [ref=e273]:
                      - text: 平台账号名称
                      - textbox "平台账号名称" [ref=e274]
                  - generic [ref=e275]:
                    - checkbox "确认这是我管理的账号" [ref=e276]
                    - text: 确认这是我管理的账号
                  - button "登记账号" [disabled]
              - region "共享资源" [ref=e277]:
                - generic [ref=e279]:
                  - generic [ref=e280]: 共享资源
                  - generic [ref=e281]: 资料保留在原组，目标组通过授权继续引用。
                - generic [ref=e283]:
                  - generic [ref=e284]:
                    - generic [ref=e285]:
                      - checkbox "显示已撤销授权" [ref=e286]
                      - text: 显示已撤销授权
                    - button "重新读取" [ref=e287]
                  - paragraph [ref=e288]: 当前没有共享授权。整理历史资料时，需要的素材与知识会保留来源并授权给目标组。
                  - list
              - region "整理历史资料" [ref=e289]:
                - generic [ref=e291]:
                  - generic [ref=e292]: 整理历史资料
                  - generic [ref=e293]: 把历史项目与内容归入另一个账号组，先预览完整影响。
                - button "整理历史资料" [ref=e295]
        - dialog "AI 助手" [ref=e298]:
          - generic [ref=e299]:
            - banner [ref=e300]:
              - generic [ref=e301]:
                - img [ref=e302]
                - heading "AI 助手" [level=2] [ref=e305]
              - button "关闭 AI 助手" [active] [ref=e307]:
                - img [ref=e308]
            - generic [ref=e312]:
              - generic [ref=e313]:
                - img [ref=e315]
                - generic [ref=e318]:
                  - heading "AI 助手" [level=2] [ref=e319]
                  - paragraph [ref=e320]: 描述你的目标，我来帮你规划下一步
                - generic [ref=e321]:
                  - button "新对话" [ref=e322]:
                    - img [ref=e323]
                    - text: 新对话
                  - button "历史记录" [ref=e324]:
                    - img [ref=e325]
                    - text: 历史记录
              - generic [ref=e329]: 未关联项目 · 输入 @ 引用一个项目
              - generic [ref=e330]:
                - generic [ref=e332]:
                  - img [ref=e334]
                  - paragraph [ref=e337]: 描述你的目标，我来帮你规划下一步
                  - paragraph [ref=e338]: 试试「基于最近评论出 5 个选题」，或用下方推荐指令开聊。
                - generic [ref=e341]:
                  - textbox "我能帮你做什么" [ref=e343]:
                    - /placeholder: 我能帮你做什么？（试试「基于最近评论出 5 个选题」，或输入 @ 引用一个项目）
                  - generic [ref=e344]:
                    - button "Choose File" [ref=e345]
                    - generic [ref=e346]:
                      - button "添加文件或图片" [ref=e347]:
                        - img [ref=e348]
                        - text: 添加文件或图片
                      - generic [ref=e350]: 也可拖到这里；图片识别效果取决于当前模型
                  - generic [ref=e351]:
                    - generic [ref=e352]:
                      - button "分析机会" [ref=e353]:
                        - img [ref=e355]
                        - text: 分析机会
                      - button "生成脚本" [ref=e357]:
                        - img [ref=e359]
                        - text: 生成脚本
                      - button "寻找素材" [ref=e362]:
                        - img [ref=e364]
                        - text: 寻找素材
                      - button "生成图片素材" [ref=e369]:
                        - img [ref=e371]
                        - text: 生成图片素材
                      - button "生成视频素材" [ref=e375]:
                        - img [ref=e377]
                        - text: 生成视频素材
                      - button "生成封面" [ref=e380]:
                        - img [ref=e382]
                        - text: 生成封面
                      - button "发布复盘" [ref=e386]:
                        - img [ref=e388]
                        - text: 发布复盘
                    - generic [ref=e391]:
                      - generic [ref=e392]: ⌘/Ctrl ↩ 发送 · Enter 换行
                      - button "清空输入" [disabled] [ref=e393]: 清空
                      - button "提交提示给 Copilot" [disabled] [ref=e394]:
                        - img [ref=e395]
                        - generic [ref=e397]: 生成
          - paragraph: 按 Esc 关闭 · ↑↓ 切换 · Enter 执行
          - separator "调整 AI 助手大小" [ref=e398]
  - alert [ref=e403]
```

# Test source

```ts
  1  |  'use strict';
  2  | const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
  3  | const {test,expect,save,read,uuid,owned,rpc,capture,opId,session,dispatch}=require('./support.cjs');
  4  | test('A1301CLASSIFY 新上传自动分类原任务独立终态与文件跨组读回',async({page},info)=>{
  5  |  test.setTimeout(5400000);await owned(page);const cfg=await rpc(page,'settings.modelRouting.get');save('U02-cfg',cfg);expect(cfg.choices.vision).toBe('codex');await page.goto('/accounts?copilot=open');const dialog=page.locator('[data-slot="ai-copilot-dialog"]');await expect(dialog).toBeVisible();
> 6  |  const foreign=await dispatch(page,'accountGroups.create',{body:{name:'T1301-A-cross-group-'+uuid(),idempotencyKey:uuid()}});save('classify-foreign-group',{id:foreign.id});const uploaded=[],classifications=[],errors=[],pending=[],uploadRequests=[];
     |                      ^ TypeError: dispatch is not a function
  7  |  page.on('response',response=>{const job=(async()=>{try{const request=response.request(),id=opId(request);if(!id)return;const input=request.postDataJSON()?.input;
  8  |  if(id==='assets.uploads.create'){const body=await response.json();uploadRequests.push({input,httpStatus:response.status(),uploadId:body.data?.uploadId,assetId:body.data?.assetId,observedAt:new Date().toISOString()});save('U02-upload-create',uploadRequests);}
  9  |  if(id==='assets.uploads.complete'){const body=await response.json();uploaded.push(body.data);save('U02-owned-upload',uploaded);}
  10 |  if(id==='ai.tasks.create'&&input?.body?.taskType==='asset.classify'){const body=await response.json();classifications.push({input,httpStatus:response.status(),response:body,observedAt:new Date().toISOString()});save('U02-classify-create',classifications);}
  11 |  }catch(e){errors.push(String(e));save('U02-listener-errors',errors);}})();pending.push(job);});
  12 |  await page.evaluate(()=>{window.__T1300_CLASSIFY_DOM=[];const seen=new Set();const update=()=>{for(const n of document.querySelectorAll('[data-slot="task-notification"]')){const row={taskId:n.getAttribute('data-task-id'),status:n.getAttribute('data-status'),text:n.textContent,observedAt:new Date().toISOString()};const key=row.taskId+':'+row.status;if(!seen.has(key)){seen.add(key);window.__T1300_CLASSIFY_DOM.push(row);}}};const obs=new MutationObserver(update);obs.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['data-status']});window.__T1300_CLASSIFY_OBSERVER=obs;update();});
  13 |  const filename='t1301-blue-circle-orange-square.png',file=path.join(__dirname,'fixtures',filename),inputHash=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  14 |  await dialog.locator('[data-slot="copilot-attachment-picker"] input[type="file"]').setInputFiles(file);
  15 |  await expect(dialog.getByText(filename,{exact:true})).toBeVisible();await expect.poll(()=>uploaded.length,{timeout:900000,intervals:[1000,2000]}).toBe(1);await expect.poll(()=>classifications.length,{timeout:900000,intervals:[1000,2000]}).toBe(1);await Promise.all(pending);
  16 |  const asset=uploaded[0],created=classifications[0],task=created.response.data;expect(created.input.body.inputData.assetId).toBe(asset.id);expect(task.id).toBeTruthy();expect(task.attemptId).toBe(created.input.body.attemptId);expect(task.inputData.assetId).toBe(asset.id);expect(asset.currentFileId).toBeTruthy();
  17 |  save('U02-classify-binding',{sourceHead:read('owned').sourceHead,assetId:asset.id,currentFileId:asset.currentFileId,aiTaskId:task.id,executionTaskId:task.executionTaskId??null,attemptId:task.attemptId,localInputSHA256:inputHash,requestedFileName:filename,createdTask:task,observedAt:new Date().toISOString()});
  18 |  const initial=await rpc(page,'assets.get',{params:{assetId:asset.id}});save('U02-asset-before',initial);save('U02-tags-before',await rpc(page,'taxonomy.entityTags.listForEntity',{query:{entityType:'asset',entityId:asset.id}}));
  19 |  const download=await rpc(page,'assets.fileDownloadUrl',{params:{assetId:asset.id,assetFileId:asset.currentFileId}});expect(new URL(download.url,session.baseURL).origin).toBe(session.baseURL);const bytes=await page.request.get(download.url,{timeout:900000});expect(bytes.status()).toBe(200);const outputHash=crypto.createHash('sha256').update(await bytes.body()).digest('hex');save('U02-upload-file-checksum',{assetId:asset.id,currentFileId:asset.currentFileId,localInputSHA256:inputHash,publicFileSHA256:outputHash,equal:inputHash===outputHash});expect(outputHash).toBe(inputHash);
  20 |  const transitions=[{source:'create',task,observedAt:created.observedAt}];let last=task,execution;
  21 |  await expect.poll(async()=>{last=await rpc(page,'ai.tasks.get',{params:{taskId:task.id}});transitions.push({source:'get',task:last,observedAt:new Date().toISOString()});if(last.executionTaskId){execution=await rpc(page,'execution.tasks.get',{params:{taskId:last.executionTaskId}});transitions[transitions.length-1].execution=execution;}save('U02-classify-transitions',transitions);save('U02-classify-dom',await page.evaluate(()=>window.__T1300_CLASSIFY_DOM));return ['succeeded','awaiting_confirmation','failed','cancelled','unknown_result','blocked','waiting_user','partial','paused'].includes(last.runtimeStatus??last.status);},{timeout:1200000,intervals:[2000,5000]}).toBe(true);
  22 |  save('U02-classify-final',{aiTask:last,execution,observedAt:new Date().toISOString()});save('U02-classify-results',await rpc(page,'ai.tasks.results.list',{params:{taskId:task.id}}));save('U02-classify-steps',await rpc(page,'ai.tasks.steps.list',{params:{taskId:task.id}}));
  23 |  if(last.executionTaskId){const response=await page.request.post('/api/v1/dispatch',{timeout:900000,headers:{'x-group-id':read('owned').groupId},data:{id:'workbench.modelCalls.summary',input:{params:{taskId:last.executionTaskId},query:{afterSequence:0,limit:20}}}});save('U02-classify-modelcalls',{httpStatus:response.status(),body:await response.json()});}
  24 |  save('U02-asset-after',await rpc(page,'assets.get',{params:{assetId:asset.id}}));save('U02-tags-after',await rpc(page,'taxonomy.entityTags.listForEntity',{query:{entityType:'asset',entityId:asset.id}}));await capture(page,info,'U02-classify-terminal');
  25 | 
  26 |  const results=await rpc(page,'ai.tasks.results.list',{params:{taskId:task.id}}),row=results.find(r=>r.resultType==='asset.classify'&&r.resultData.assetId===asset.id);save('classify-result-readback',results);const tags=await rpc(page,'taxonomy.entityTags.listForEntity',{query:{entityType:'asset',entityId:asset.id}});const denied=[];
  27 |  for(const [id,input] of [['assets.get',{params:{assetId:asset.id}}],['assets.fileDownloadUrl',{params:{assetId:asset.id,assetFileId:asset.currentFileId}}],['ai.tasks.get',{params:{taskId:task.id}}],['taxonomy.entityTags.listForEntity',{query:{entityType:'asset',entityId:asset.id}}]]){const response=await page.request.post('/api/v1/dispatch',{timeout:900000,headers:{'x-group-id':foreign.id},data:{id,input}});const body=await response.json();denied.push({id,httpStatus:response.status(),body,foreignGroupId:foreign.id});}save('classify-cross-group',denied);for(const r of denied)expect([403,404]).toContain(r.httpStatus);
  28 |  await capture(page,info,'classify-public-terminal-and-isolation');save('classify-scope-result',{acceptanceTask:'T-1301',sourceHead:read('owned').sourceHead,groupId:read('owned').groupId,assetId:asset.id,currentFileId:asset.currentFileId,aiTaskId:task.id,executionTaskId:last.executionTaskId,attemptId:task.attemptId,configuredSource:cfg.choices.vision,taskModelKey:last.modelKey,status:last.runtimeStatus??last.status,classification:row?.resultData?.classification??null,tags,originalFileSHA256Unchanged:outputHash===inputHash,oneAutomaticClassification:classifications.length===1,resubmissions:0,visionChatSubmissions:0,foreignGroupId:foreign.id,crossGroupDenied:denied.every(r=>[403,404].includes(r.httpStatus)),metadataBoundary:'公共assets.get未投影asset_files.mediaMetadata；description字段不冒aiDescription。原分类result只证明结果回执，存储注解需Root/C受权只读补证。',callBoundary:'公共workbench.modelCalls.summary若非chat映射409保原响应，不填calls空。',listenerErrors:errors,observedAt:new Date().toISOString()});
  29 |  expect(last.runtimeStatus??last.status,'后台自动分类原任务失败保ID，不重发').toBe('succeeded');expect(last.modelKey).toBe('codex');expect(row).toBeTruthy();expect(row.resultData.classification.description.length).toBeGreaterThan(0);for(const name of row.resultData.classification.tags)expect(tags.map(t=>t.name)).toContain(name);expect(classifications).toHaveLength(1);
  30 | });
  31 | 
```