# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e/t1136-calendar-dialog-layout.spec.ts >> T-1136 读取中及共享反馈、参考素材弹窗仍可操作
- Location: tests/e2e/t1136-calendar-dialog-layout.spec.ts:144:5

# Error details

```
TimeoutError: locator.selectOption: Timeout 120000ms exceeded.
Call log:
  - waiting for locator('aside').filter({ has: getByRole('heading', { name: '节点设置', exact: true }) }).getByLabel('模式', { exact: true })

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e2]:
    - complementary "主侧栏" [ref=e3]:
      - generic [ref=e4]:
        - img [ref=e7]
        - button "展开侧栏" [pressed] [ref=e10]:
          - img [ref=e11]
      - navigation "主要导航" [ref=e15]:
        - link "首页" [ref=e16] [cursor=pointer]:
          - /url: /
          - img [ref=e17]
        - link "创作者总览" [ref=e22] [cursor=pointer]:
          - /url: /overview
          - img [ref=e23]
        - link "定位中心" [ref=e25] [cursor=pointer]:
          - /url: /positioning
          - img [ref=e26]
        - link "内容雷达" [ref=e28] [cursor=pointer]:
          - /url: /intelligence
          - img [ref=e29]
        - link "选题" [ref=e36] [cursor=pointer]:
          - /url: /topics
          - img [ref=e37]
        - link "项目" [ref=e40] [cursor=pointer]:
          - /url: /projects
          - img [ref=e41]
        - link "知识库" [ref=e43] [cursor=pointer]:
          - /url: /knowledge
          - img [ref=e44]
        - link "素材中心" [ref=e46] [cursor=pointer]:
          - /url: /assets
          - img [ref=e47]
        - link "创作画布" [ref=e52] [cursor=pointer]:
          - /url: /canvases
          - img [ref=e53]
        - link "发布中心" [ref=e57] [cursor=pointer]:
          - /url: /publishing
          - img [ref=e58]
        - link "运营分析" [ref=e61] [cursor=pointer]:
          - /url: /daily-report
          - img [ref=e62]
        - link "自动化" [ref=e64] [cursor=pointer]:
          - /url: /automations
          - img [ref=e65]
        - link "设置" [ref=e69] [cursor=pointer]:
          - /url: /settings
          - img [ref=e70]
      - generic [ref=e73]:
        - button "帮助与反馈" [ref=e74]:
          - img [ref=e75]
        - button "当前账号组：排期布局验证-e9f130bd-8bea-4648-9c4c-75e705cd0519" [ref=e85] [cursor=pointer]:
          - img [ref=e87]
        - generic "创作者" [ref=e91]:
          - generic [ref=e93]: "?"
    - generic [ref=e94]:
      - banner:
        - generic:
          - generic: 创作画布
          - paragraph: 整理想法，生成图片和视频
      - main [ref=e100]:
        - generic [ref=e101]:
          - button "画布库" [ref=e102]:
            - img [ref=e103]
            - text: 画布库
          - generic [ref=e105]:
            - generic [ref=e106]: 画布标题
            - textbox "画布标题" [ref=e107]: 共享弹窗验证画布
          - status [ref=e108]:
            - img [ref=e109]
            - text: 已保存
          - button "保存" [ref=e111]:
            - img [ref=e112]
            - text: 保存
          - generic [ref=e116]:
            - button "撤销" [ref=e117]
            - button "重做" [disabled] [ref=e118]
          - button "归档" [ref=e119]
        - generic [ref=e120]:
          - img [ref=e121]
          - generic [ref=e125]: 创作归属
          - combobox "关联项目（可选）" [ref=e126]:
            - option "独立画布 · 当前账号"
            - option "发布策略复盘与内容创作计划发布策略复盘与内容创作计划发布策略复盘与内容创作计划发布策略复盘与内容创作计划发布策略复盘与内容创作计划发布策略复盘与内容创作计划发布策略复盘与内容创作计划发布策略复盘与内容创作计划发布策略复盘与内容创作计划" [selected]
          - generic [ref=e127]: 结果由你选择加入作品
          - button "返回作品 · 发布策略复盘与内容创作计划发布策略复盘与内容创作计划发布策略复盘与内容创作计划发布策略复盘与内容创作计划发布策略复盘与内容创作计划发布策略复盘与内容创作计划发布策略复盘与内容创作计划发布策略复盘与内容创作计划发布策略复盘与内容创作计划" [ref=e128]:
            - text: 返回作品 · 发布策略复盘与内容创作计划发布策略复盘与内容创作计划发布策略复盘与内容创作计划发布策略复盘与内容创作计划发布策略复盘与内容创作计划发布策略复盘与内容创作计划发布策略复盘与内容创作计划发布策略复盘与内容创作计划发布策略复盘与内容创作计划
            - img [ref=e129]
        - generic [ref=e131]:
          - generic:
            - generic:
              - generic:
                - img "画布连接"
                - generic [ref=e132]:
                  - button "连接到图片生成" [ref=e133]
                  - generic [ref=e134]:
                    - generic [ref=e135]: 图片生成
                    - generic [ref=e136]: 创作中枢
                  - generic [ref=e137]:
                    - combobox "生成模式" [ref=e138]:
                      - option "文生图" [selected]
                      - option "参考图生图"
                    - textbox "生成描述" [ref=e139]:
                      - /placeholder: 描述你想生成的画面…
                    - generic [ref=e140]:
                      - generic "当前账号尚未配置可用模型" [ref=e141]
                      - button "生成" [disabled] [ref=e142]
                    - paragraph [ref=e143]:
                      - text: 当前账号尚未配置可用模型
                      - link "查看模型设置" [ref=e144] [cursor=pointer]:
                        - /url: /settings
                  - button "从图片生成连接" [ref=e145]
                  - button "调整图片生成大小" [ref=e146]
            - generic:
              - generic [ref=e147]:
                - generic [ref=e148]: 添加
                - button "＋ 文字" [ref=e149]:
                  - img [ref=e150]
                  - text: ＋ 文字
                - button "＋ 图片生成" [ref=e153]:
                  - img [ref=e154]
                  - text: ＋ 图片生成
                - button "＋ 视频生成" [ref=e158]:
                  - img [ref=e159]
                  - text: ＋ 视频生成
                - button "素材库" [ref=e163]:
                  - img [ref=e164]
                  - text: 素材库
                - button "案例库" [ref=e166]:
                  - img [ref=e167]
                  - text: 案例库
                - button "图文与发布" [ref=e169]:
                  - img [ref=e170]
                  - text: 图文与发布
              - button "收起详情" [expanded] [active] [ref=e174]:
                - img [ref=e175]
                - text: 收起详情
            - generic [ref=e178]:
              - generic [ref=e179]: 100%
              - button "选择：框选" [ref=e180]:
                - img [ref=e181]
                - text: 选择：框选
              - button "缩小" [ref=e186]:
                - img [ref=e187]
              - button "放大" [ref=e188]:
                - img [ref=e189]
              - button "适合内容" [ref=e190]:
                - img [ref=e191]
                - text: 适合内容
          - complementary [ref=e196]:
            - heading "节点设置" [level=2] [ref=e197]
            - generic [ref=e198]:
              - text: 名称
              - textbox "名称" [ref=e199]
            - generic [ref=e200]:
              - text: 生成描述
              - textbox "生成描述" [ref=e201]
            - generic [ref=e202]:
              - text: 模式
              - combobox "模式" [ref=e203]:
                - option "文生图" [selected]
                - option "参考图生图"
            - generic [ref=e204]:
              - text: 画幅
              - combobox "画幅" [ref=e205]:
                - option "模型默认" [selected]
                - option "1:1"
                - option "3:4"
                - option "16:9"
                - option "9:16"
                - option "2:3"
                - option "3:2"
                - option "4:3"
                - option "4:5"
                - option "5:4"
                - option "21:9"
            - paragraph [ref=e206]: 当前账号尚未配置可用模型
            - button "生成" [disabled] [ref=e207]
            - button "删除节点" [ref=e208]
            - generic [ref=e209]:
              - generic [ref=e210]:
                - heading "编导建议" [level=2] [ref=e211]
                - button "刷新" [ref=e212]
              - link "和编导讨论这张画布" [ref=e213] [cursor=pointer]:
                - /url: "?copilot=open&surface=canvas&selKind=canvas&selId=490664ff-373c-4b22-b369-75402ff8ee0f&selTitle=%E5%85%B1%E4%BA%AB%E5%BC%B9%E7%AA%97%E9%AA%8C%E8%AF%81%E7%94%BB%E5%B8%83&prefill=%E8%AF%B7%E5%85%88%E8%AF%BB%E5%8F%96%E5%BD%93%E5%89%8D%E7%94%BB%E5%B8%83%EF%BC%8C%E5%86%8D%E6%8F%90%E5%87%BA%E6%88%91%E5%8F%AF%E4%BB%A5%E9%80%90%E9%A1%B9%E5%AE%A1%E6%A0%B8%E7%9A%84%E7%94%BB%E5%B8%83%E4%BF%AE%E6%94%B9%E5%BB%BA%E8%AE%AE%E3%80%82&scope=surface%3Acanvas%3A490664ff-373c-4b22-b369-75402ff8ee0f"
            - generic [ref=e214]:
              - heading "连线" [level=2] [ref=e215]
              - paragraph [ref=e216]: 暂无连线
            - generic [ref=e217]:
              - heading "生成历史" [level=2] [ref=e218]
              - paragraph [ref=e219]: 暂无生成任务
  - button "Open Next.js Dev Tools" [ref=e225] [cursor=pointer]:
    - img [ref=e226]
  - alert [ref=e229]
```

# Test source

```ts
  82  |  for(const vp of viewports) {
  83  |   await page.setViewportSize(vp);const trigger=page.getByRole("button",{name:"安排创作",exact:true});await trigger.click(wait);
  84  |   const dialog=page.getByRole("dialog",{name:"安排创作日期"});
  85  |   await expect(dialog.getByRole("option",{name:"微信公众号 · "+handle,exact:true})).toHaveCount(1,wait);
  86  |   await dialog.getByLabel("共享项目",{exact:true}).selectOption(project.id,wait);
  87  |   await dialog.getByLabel("发布目标（可选）",{exact:true}).selectOption(first.id,wait);
  88  |   records.push(await capture(page,dialog,"calendar-long-"+vp.width));
  89  |   await page.keyboard.press("Escape");await expect(dialog).toBeHidden(wait);await expect(trigger).toBeFocused(wait);
  90  |  }
  91  |  writeFileSync(resolve(evidence,"layout-observation.json"),JSON.stringify({surface:"browser",mode:"non-fixture",input:"fresh public synthetic group/project/accounts",viewports:records},null,2));
  92  |  expect(records.filter(r=>!noOverflow(r.dimensions)).map(r=>r.name),"弹窗或控件超出窗口/容器").toEqual([]);
  93  |  for(const r of records.filter(r=>r.viewport!.width>=640))expect(r.dimensions.width).toBeCloseTo(448,0);
  94  |  expect(await list(page,group.id)).toHaveLength(0);
  95  | });
  96  |
  97  | test("T-1136 真实保存回读重开、目标转组重选与失败保留输入",async({page,context,baseURL})=>{
  98  |  test.setTimeout(720_000);page.setDefaultTimeout(120_000);page.setDefaultNavigationTimeout(120_000);
  99  |  const {group,first,second,project}=await setup(page);await enter(page,context,baseURL!,group.id);await page.setViewportSize({width:900,height:900});
  100 |  const captures=[];const trigger=page.getByRole("button",{name:"安排创作",exact:true});
  101 |  await trigger.click(wait);let dialog=page.getByRole("dialog",{name:"安排创作日期"});
  102 |  await expect(dialog.getByRole("option",{name:"微信公众号 · "+handle,exact:true})).toHaveCount(1,wait);
  103 |  expect(noOverflow(await dimensions(dialog))).toBe(true);
  104 |  await dialog.getByLabel("共享项目",{exact:true}).selectOption(project.id,wait);await date(page,dialog);
  105 |  await dialog.getByLabel("发布目标（可选）",{exact:true}).selectOption(first.id,wait);
  106 |  await dialog.getByRole("button",{name:"保存计划",exact:true}).click(wait);await expect(dialog).toBeHidden(wait);
  107 |  let rows=await list(page,group.id);expect(rows).toHaveLength(1);const entry=rows[0]!;
  108 |  expect(entry).toMatchObject({projectId:project.id,accountId:first.id,plannedDate:today(),targetStatus:"ready"});
  109 |  await page.reload(wait);expect(await list(page,group.id)).toEqual(rows);
  110 |  await trigger.click(wait);dialog=page.getByRole("dialog",{name:"安排创作日期"});await expect(dialog.getByLabel("共享项目")).toBeVisible(wait);
  111 |  await dialog.getByRole("button",{name:"取消",exact:true}).click(wait);await expect(dialog).toBeHidden(wait);expect(await list(page,group.id)).toEqual(rows);
  112 |  const other=await createGroup(page,"排期目标转出验证-"+crypto.randomUUID());await transfer(page,first.id,other.id);
  113 |  await page.reload(wait);await openDay(page);await page.getByRole("button",{name:"重新选择目标",exact:true}).click(wait);
  114 |  dialog=page.getByRole("dialog",{name:"选择发布目标"});await expect(dialog.getByRole("option",{name:"小红书 · "+handle+"2",exact:true})).toHaveCount(1,wait);
  115 |  await dialog.getByLabel("发布目标（可选）",{exact:true}).selectOption(second.id,wait);
  116 |  let injected=0;
  117 |  await page.route("**/api/v1/dispatch",async route=>{
  118 |   const payload=route.request().postDataJSON();
  119 |   if(payload?.id==="calendar.entries.target"&&injected===0){injected++;await route.fulfill({status:409,contentType:"application/json",body:JSON.stringify({data:null,error:{code:"ConflictError",message:"隔离测试：一次保存失败"}})});return;}
  120 |   await route.fallback();
  121 |  });
  122 |  await dialog.getByRole("button",{name:"保存计划",exact:true}).click(wait);await expect(dialog.getByRole("alert")).toBeVisible(wait);
  123 |  expect(injected).toBe(1);await expect(dialog.getByLabel("发布目标（可选）")).toHaveValue(second.id,wait);
  124 |  rows=await list(page,group.id);expect(rows[0]).toMatchObject({id:entry.id,accountId:first.id,targetStatus:"needs_reselection"});
  125 |  captures.push(await capture(page,dialog,"calendar-save-error-900"));
  126 |  await dialog.getByRole("button",{name:"取消",exact:true}).click(wait);await expect(dialog).toBeHidden(wait);expect(await list(page,group.id)).toEqual(rows);
  127 |  await page.getByRole("button",{name:"重新选择目标",exact:true}).click(wait);dialog=page.getByRole("dialog",{name:"选择发布目标"});
  128 |  await expect(dialog.getByLabel("发布目标（可选）")).toBeEnabled(wait);
  129 |  await dialog.getByLabel("发布目标（可选）").selectOption(second.id,wait);
  130 |  await dialog.getByRole("button",{name:"保存计划",exact:true}).click(wait);await expect(dialog).toBeHidden(wait);
  131 |  rows=await list(page,group.id);expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({id:entry.id,projectId:project.id,accountId:second.id,targetStatus:"ready"});
  132 |  await page.reload(wait);expect(await list(page,group.id)).toEqual(rows);
  133 |  await page.goto("/projects",wait);await page.goto("/publishing",wait);expect(await list(page,group.id)).toEqual(rows);
  134 |  // 空目标沿正式原操作，保真实entry/归属，不开启发布或模型。
  135 |  await transfer(page,second.id,other.id);await page.reload(wait);await openDay(page);await page.getByRole("button",{name:"重新选择目标",exact:true}).click(wait);
  136 |  dialog=page.getByRole("dialog",{name:"选择发布目标"});await expect(dialog.getByText("当前组未绑定平台账号，可先安排创作。")).toBeVisible(wait);
  137 |  await dialog.getByLabel("发布目标（可选）").selectOption("",wait);
  138 |  captures.push(await capture(page,dialog,"calendar-empty-target-900"));
  139 |  await dialog.getByRole("button",{name:"保存计划",exact:true}).click(wait);await expect(dialog).toBeHidden(wait);
  140 |  rows=await list(page,group.id);expect(rows[0]).toMatchObject({id:entry.id,accountId:null,targetStatus:"unassigned"});
  141 |  writeFileSync(resolve(evidence,"public-write-read-observation.json"),JSON.stringify({surface:"browser",mode:"non-fixture",witnesses:{groupId:group.id,projectId:project.id,entryId:entry.id},finalEntry:rows[0],faultFixture:{operation:"calendar.entries.target",http:409,count:injected,successfulWritesReplaced:false},captures},null,2));
  142 | });
  143 |
  144 | test("T-1136 读取中及共享反馈、参考素材弹窗仍可操作",async({page,context,baseURL})=>{
  145 |  test.setTimeout(600_000);page.setDefaultTimeout(120_000);page.setDefaultNavigationTimeout(120_000);
  146 |  await page.setViewportSize({width:900,height:900});
  147 |  const {group,project}=await setup(page);await enter(page,context,baseURL!,group.id);
  148 |  const captures=[];
  149 |  let release!:()=>void,held=false;const gate=new Promise<void>(resolve=>{release=resolve;});
  150 |  await page.route("**/api/v1/dispatch",async route=>{
  151 |   if(route.request().postDataJSON()?.id==="accountGroups.get"&&!held){held=true;await gate;}
  152 |   await route.fallback();
  153 |  });
  154 |  await page.getByRole("button",{name:"安排创作",exact:true}).click(wait);
  155 |  let dialog=page.getByRole("dialog",{name:"安排创作日期"});
  156 |  try {
  157 |   await expect(dialog.getByText("正在读取当前组的平台账号…")).toBeVisible(wait);
  158 |   await expect(dialog.getByRole("button",{name:"保存计划",exact:true})).toBeDisabled(wait);
  159 |   captures.push(await capture(page,dialog,"calendar-loading-900"));
  160 |  } finally {release();}
  161 |  await expect(dialog.getByLabel("共享项目")).toBeEnabled(wait);
  162 |  await dialog.getByRole("button",{name:"取消",exact:true}).click(wait);expect(await list(page,group.id)).toHaveLength(0);
  163 |  // 反馈只填写、检查和关闭；不发送反馈、外部消息或诊断日志。
  164 |  await page.getByRole("button",{name:"帮助与反馈",exact:true}).click(wait);
  165 |  dialog=page.getByRole("dialog",{name:"帮助与反馈",exact:true});
  166 |  await dialog.getByLabel("问题摘要",{exact:true}).fill("本地隔离验证弹窗可操作",wait);
  167 |  await dialog.getByLabel("问题描述",{exact:true}).fill("核对表单、中文换行和关闭功能，未提交反馈。",wait);
  168 |  for(const vp of [{width:1366,height:900},{width:900,height:900}]){
  169 |   await page.setViewportSize(vp);expect(noOverflow(await dimensions(dialog))).toBe(true);
  170 |   captures.push(await capture(page,dialog,"shared-feedback-"+vp.width));
  171 |  }
  172 |  await page.keyboard.press("Escape");await expect(dialog).toBeHidden(wait);
  173 |  await expect(page.getByRole("button",{name:"帮助与反馈",exact:true})).toBeFocused(wait);
  174 |  const name="本地弹窗预览图.png",bytes=readFileSync(resolve("public/douyin-icon.png"));
  175 |  const upload=await dispatch<{uploadId:string;uploadUrl:string}>(page,"assets.uploads.create",{body:{assetType:"image",mimeType:"image/png",fileSize:bytes.length,fileName:name}},{groupId:group.id});
  176 |  const put=await page.request.put(upload.uploadUrl,{...wait,headers:{"content-type":"image/png"},data:bytes});expect(put.ok()).toBe(true);
  177 |  const asset=await dispatch<{id:string;currentFileId:string}>(page,"assets.uploads.complete",{params:{uploadId:upload.uploadId},body:{name}},{groupId:group.id});
  178 |  const canvas=await dispatch(page,"canvas.create",{body:{title:"共享弹窗验证画布",projectId:project.id}},{groupId:group.id});
  179 |  await page.goto("/canvases/"+canvas.id,wait);await page.getByRole("button",{name:"＋ 图片生成",exact:true}).click(wait);
  180 |  await page.getByRole("button",{name:"编导与详情",exact:true}).click(wait);
  181 |  const inspector=page.locator("aside").filter({has:page.getByRole("heading",{name:"节点设置",exact:true})});
> 182 |  await inspector.getByLabel("模式",{exact:true}).selectOption("image_to_image",wait);
      |                                                ^ TimeoutError: locator.selectOption: Timeout 120000ms exceeded.
  183 |  const field=inspector.getByRole("button",{name:"参考图片",exact:true});await field.click(wait);
  184 |  dialog=page.getByRole("dialog",{name:"参考图片",exact:true});
  185 |  const preview=dialog.getByRole("button",{name:"预览 "+name,exact:true});await preview.click(wait);
  186 |  const large=dialog.getByAltText("画布图片素材",{exact:true});
  187 |  await expect.poll(()=>large.evaluate((node:HTMLImageElement)=>node.complete&&node.naturalWidth>0),wait).toBe(true);
  188 |  await expect.poll(()=>preview.getByRole("img").evaluate((node:HTMLImageElement)=>node.complete&&node.naturalWidth>0),wait).toBe(true);
  189 |  for(const vp of [{width:1366,height:900},{width:900,height:900},{width:683,height:450}]){
  190 |   await page.setViewportSize(vp);const box=await dialog.boundingBox();expect(box).not.toBeNull();
  191 |   expect(box!.x).toBeGreaterThanOrEqual(15);expect(box!.x+box!.width).toBeLessThanOrEqual(vp.width-15);
  192 |   const confirm=await dialog.getByRole("button",{name:"使用此素材",exact:true}).boundingBox();expect(confirm).not.toBeNull();
  193 |   expect(confirm!.y).toBeGreaterThanOrEqual(0);expect(confirm!.y+confirm!.height).toBeLessThanOrEqual(vp.height);
  194 |   captures.push(await capture(page,dialog,"shared-asset-picker-"+vp.width));
  195 |  }
  196 |  await dialog.getByRole("button",{name:"取消",exact:true}).click(wait);await expect(dialog).toBeHidden(wait);
  197 |  await expect(field).toBeFocused(wait);
  198 |  const saved=await dispatch<{document:{nodes:Array<{referenceAssetId?:string}>}}>(page,"canvas.get",{params:{canvasId:canvas.id}},{groupId:group.id});
  199 |  expect(saved.document.nodes.every(node=>node.referenceAssetId!==asset.id)).toBe(true);
  200 |  writeFileSync(resolve(evidence,"shared-consumer-observation.json"),JSON.stringify({surface:"browser",loadingFixture:"once held real accountGroups.get; original response retained",feedbackSubmitted:false,modelCalled:false,assetId:asset.id,canvasId:canvas.id,captures},null,2));
  201 | });
  202 |
```
