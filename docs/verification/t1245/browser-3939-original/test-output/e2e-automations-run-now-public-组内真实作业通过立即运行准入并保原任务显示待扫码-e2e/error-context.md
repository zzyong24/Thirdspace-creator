# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e/automations-run-now-public.spec.ts >> 组内真实作业通过立即运行准入并保原任务显示待扫码
- Location: tests/e2e/automations-run-now-public.spec.ts:229:5

# Error details

```
Error: expect(received).toBeLessThanOrEqual(expected)

Expected: <= 327.5
Received:    530
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
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
        - button "当前账号组：T1244 无绑定媒体组 t1244-42ba9044-e124-4d8e-9a30-7ccdb9c60a2a" [ref=e85] [cursor=pointer]:
          - img [ref=e87]
        - generic "创作者" [ref=e91]:
          - generic [ref=e93]: "?"
    - generic [ref=e94]:
      - banner
      - main [ref=e100]:
        - generic [ref=e101]:
          - heading "自动化" [level=1] [ref=e102]
          - paragraph [ref=e103]: 让作品指标、评论、流量来源和视频内容按需更新，持续支持选题与复盘。
        - generic [ref=e104]:
          - region "账号组任务范围" [ref=e105]:
            - generic [ref=e106]:
              - heading "T1244 无绑定媒体组 t1244-42ba9044-e124-4d8e-9a30-7ccdb9c60a2a" [level=2] [ref=e107]
              - generic [ref=e108]:
                - text: 平台
                - combobox "筛选媒体平台" [ref=e109]:
                  - option "全部媒体" [selected]
                  - option "小红书"
              - generic [ref=e110]:
                - text: 账号
                - combobox "筛选平台账号" [ref=e111]:
                  - option "全部账号" [selected]
                  - option "小红书 · t1244-neutral-9a851b0d-cc70-4ccc-be7e-af97db217931"
            - paragraph [ref=e112]: 共享任务保留在所有筛选中；选择具体账号后，可管理该账号的采集计划。
            - list "组内账号计划状态" [ref=e113]:
              - listitem [ref=e114]:
                - generic [ref=e115]: 小红书 · t1244-neutral-9a851b0d-cc70-4ccc-be7e-af97db217931
                - paragraph [ref=e116]: 1 条采集计划
          - region "从模板入手" [ref=e117]:
            - generic [ref=e118]:
              - img [ref=e119]
              - heading "快速创建" [level=2] [ref=e122]
              - generic [ref=e123]: 从常用任务开始
            - button "每日自动生成选题 新建 每天结合你的定位、评论信号、知识库与当下热点,自动出一批选题进选题池。需配置文本模型。" [ref=e125]:
              - img [ref=e127]
              - generic [ref=e129]: 每日自动生成选题
              - generic [ref=e130]:
                - img [ref=e131]
                - text: 新建
              - generic [ref=e132]: 每天结合你的定位、评论信号、知识库与当下热点,自动出一批选题进选题池。需配置文本模型。
          - generic [ref=e133]:
            - generic [ref=e134]:
              - generic [ref=e135]:
                - heading "我的自动化" [level=2] [ref=e136]
                - generic [ref=e137]: 共 1 个任务
                - generic [ref=e138]: 1 个已启用
              - generic [ref=e140]: T1244 无绑定媒体组 t1244-42ba9044-e124-4d8e-9a30-7ccdb9c60a2a · 全组任务
            - button "新建任务" [ref=e141]:
              - img [ref=e142]
              - text: 新建任务
          - generic "调度作业列表" [ref=e143]:
            - list [ref=e144]:
              - listitem [ref=e145]:
                - article [ref=e146]:
                  - generic [ref=e147]:
                    - img [ref=e149]
                    - generic [ref=e151]:
                      - button "T1244 中性作品同步 t1244-f67af4c3-72bd-42aa-8716-65d048c2d123" [ref=e152]
                      - generic [ref=e153]:
                        - img [ref=e154]
                        - text: 需重连账号 · 去扫码绑定
                      - generic [ref=e156]:
                        - img [ref=e157]
                        - text: 小红书 · t1244-neutral-9a851b0d-cc70-4ccc-be7e-af97db217931
                  - generic [ref=e160]:
                    - generic "17 4 * * *" [ref=e161]:
                      - img [ref=e162]
                      - text: 每天 04:17
                    - generic [ref=e165]: 作品优先
                    - generic [ref=e166]:
                      - text: 成功同步后，近 7 天每 2 小时更新
                      - text: 7–30 天每 6 小时，30 天以上每天更新
                    - generic [ref=e167]: 上次：10-11 21:24
                    - generic [ref=e168]: 下次：等待调度
                  - generic [ref=e170]:
                    - switch "T1244 中性作品同步 t1244-f67af4c3-72bd-42aa-8716-65d048c2d123 启用开关" [checked] [ref=e171]
                    - generic [ref=e172]: 已启用
                  - generic [ref=e173]:
                    - button "编辑" [ref=e174]:
                      - img [ref=e175]
                      - text: 编辑
                    - button "扫码绑定" [ref=e178]:
                      - img [ref=e179]
                      - text: 扫码绑定
  - button "Open Next.js Dev Tools" [ref=e189] [cursor=pointer]:
    - img [ref=e190]
  - alert [ref=e193]
```

# Test source

```ts
  54  |   if (new URL(response.url()).pathname !== "/api/v1/dispatch") return false;
  55  |   try {
  56  |     const data = response.request().postDataJSON() as { id?: string; input?: { params?: { jobId?: string } } };
  57  |     return data.id === id && data.input?.params?.jobId === jobId;
  58  |   } catch { return false; }
  59  | }
  60  | function assertIdentity(run: Run, ai: Ai, execution: Execution | undefined, expected: { jobId: string; runId: string; aiId: string; groupId: string; accountId: string }): void {
  61  |   expect(run.id).toBe(expected.runId);
  62  |   expect(run.jobId).toBe(expected.jobId);
  63  |   expect(run.aiTaskId).toBe(expected.aiId);
  64  |   expect(run.groupId).toBe(expected.groupId);
  65  |   expect(ai.id).toBe(expected.aiId);
  66  |   expect(ai.groupId).toBe(expected.groupId);
  67  |   expect(ai.taskType).toBe("scheduled.self.metrics");
  68  |   expect(ai.inputData.jobId).toBe(expected.jobId);
  69  |   if (execution) {
  70  |     expect(execution.id).toBe(ai.executionTaskId);
  71  |     expect(execution.ownerType).toBe("ai_task");
  72  |     expect(execution.ownerId).toBe(ai.id);
  73  |     expect(execution.kind).toBe("ai_task");
  74  |     expect(execution.accountId).toBe(expected.accountId);
  75  |     expect(execution.groupId).toBe(expected.groupId);
  76  |     expect(execution.userId).toBe(ai.userId);
  77  |     expect(run.userId).toBe(ai.userId);
  78  |   }
  79  | }
  80  | function assertAuthWait(run: Run, ai: Ai, execution: Execution | undefined): asserts execution is Execution {
  81  |   expect(run.status).toBe("needs_reconnect");
  82  |   expect(run.itemsNew).toBe(0);
  83  |   expect(run.itemsUpdated).toBe(0);
  84  |   expect(run.finishedAt).not.toBeNull();
  85  |   expect(run.progress ?? null).toBeNull();
  86  |   expect(run.error).toBe(AUTH_MESSAGE);
  87  |   expect(ai.status).toBe("running");
  88  |   expect(ai.runtimeStatus).toBe("waiting_user");
  89  |   expect(ai.errorCode).toBe("FLYWHEEL_LOGIN_REQUIRED");
  90  |   if (!execution) throw new Error("原AI未绑定公开执行任务");
  91  |   expect(execution.status).toBe("blocked");
  92  |   expect(execution.runtimeStatus).toBe("waiting_user");
  93  |   expect(execution.errorCode).toBe("FLYWHEEL_LOGIN_REQUIRED");
  94  |   expect(execution.attempt).toBeGreaterThanOrEqual(1);
  95  |   expect(execution.leaseOwner).toBeNull();
  96  |   expect(execution.leaseExpiresAt).toBeNull();
  97  |   expect(execution.heartbeatAt).toBeNull();
  98  | }
  99  | 
  100 | import type { Locator, TestInfo } from "@playwright/test";
  101 | 
  102 | // 只追加几何观察；不写 scope、不调用运行/登录/创建或编辑提交。
  103 | async function layoutBox(locator: Locator, parentSelector: string) {
  104 |   return locator.evaluate((node, selector) => {
  105 |     const parent = node.closest(selector);
  106 |     if (!parent) throw new Error("几何对象缺少真实父容器");
  107 |     const r = node.getBoundingClientRect(), p = parent.getBoundingClientRect();
  108 |     return { left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width,
  109 |       parentLeft:p.left, parentRight:p.right, parentTop:p.top, parentBottom:p.bottom,
  110 |       viewportWidth:innerWidth, viewportHeight:innerHeight,
  111 |       clientWidth:node.clientWidth, scrollWidth:node.scrollWidth,
  112 |       fontSize:parseFloat(getComputedStyle(node.querySelector("span")??node).fontSize) };
  113 |   }, parentSelector);
  114 | }
  115 | async function horizontalInside(locator: Locator, parentSelector: string) {
  116 |   const box = await layoutBox(locator, parentSelector);
  117 |   expect(box.left).toBeGreaterThanOrEqual(Math.max(0,box.parentLeft)-1.5);
  118 |   expect(box.right).toBeLessThanOrEqual(Math.min(box.viewportWidth,box.parentRight)+1.5);
  119 |   expect(box.width).toBeGreaterThan(0);
  120 |   return box;
  121 | }
  122 | async function visibleInside(locator: Locator, parentSelector: string) {
  123 |   await expect(locator).toBeInViewport();
  124 |   const box = await horizontalInside(locator,parentSelector);
  125 |   expect(box.top).toBeGreaterThanOrEqual(Math.max(0,box.parentTop)-1.5);
  126 |   expect(box.bottom).toBeLessThanOrEqual(Math.min(box.viewportHeight,box.parentBottom)+1.5);
  127 |   return box;
  128 | }
  129 | async function layoutShot(page: Page, info: TestInfo, name: string) {
  130 |   const file=info.outputPath(`${name}.png`);
  131 |   await page.screenshot({path:file,fullPage:true,timeout:REQUEST_MS});
  132 |   await info.attach(name,{path:file,contentType:"image/png"});
  133 | }
  134 | async function responsiveEvidence(page: Page, row: Locator, dialog: Locator, info: TestInfo) {
  135 |   const geometries: unknown[]=[];
  136 |   // 固定三个视口；不得追加一次 runNow 或调用扫码。
  137 |   for (const viewport of [{width:390,height:844},{width:900,height:900},{width:1536,height:1024}]) {
  138 |     await page.setViewportSize(viewport);
  139 |     const sidebar=page.getByTestId("app-sidebar");
  140 |     await expect(sidebar).toHaveAttribute("data-collapsed",viewport.width<=1024?"true":"false");
  141 |     let previousWidth: number | undefined;
  142 |     await expect.poll(async()=>{
  143 |       const state=await sidebar.evaluate(node=>({width:node.getBoundingClientRect().width,
  144 |         expanded:parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--creatoros-sidebar-width"))}));
  145 |       const target=viewport.width<=1024?64:state.expanded;
  146 |       const stable=previousWidth!==undefined&&Math.abs(previousWidth-state.width)<0.1;
  147 |       previousWidth=state.width;
  148 |       return stable&&Math.abs(state.width-target)<0.5;
  149 |     },{timeout:REQUEST_MS,intervals:[100,250,500,1000]}).toBe(true);
  150 |     // section 无显式 role，使用真实 aria-label 对象；不造测试专用页面状态。
  151 |     const scopePanel=page.locator('section[aria-label="账号组任务范围"]');
  152 |     await scopePanel.scrollIntoViewIfNeeded();
  153 |     const pageGeometry=await page.locator('[data-testid="page-scroll-area"] [data-slot="scroll-area-viewport"]').evaluate(node=>({clientWidth:node.clientWidth,scrollWidth:node.scrollWidth}));
> 154 |     expect(pageGeometry.scrollWidth).toBeLessThanOrEqual(pageGeometry.clientWidth+1.5);
      |                                      ^ Error: expect(received).toBeLessThanOrEqual(expected)
  155 |     const filterGeometry=[];
  156 |     for (const name of ["筛选媒体平台","筛选平台账号"]) {
  157 |       const filter=page.getByRole("combobox",{name,exact:true});
  158 |       await expect(filter).toBeEnabled();
  159 |       filterGeometry.push(await visibleInside(filter,'section[aria-label="账号组任务范围"]'));
  160 |     }
  161 |     await layoutShot(page,info,`t1245-${viewport.width}-filters`);
  162 |     const cards=page.locator('[data-slot="automation-template-card"]');
  163 |     const count=await cards.count();
  164 |     expect(count).toBeGreaterThan(0);
  165 |     expect(count).toBeLessThanOrEqual(3); // 当前 intent.ts 明确只有三个模板；异常不截断成通过。
  166 |     const cardGeometry=[];
  167 |     for (let index=0;index<3;index+=1) {
  168 |       if(index>=count)break;
  169 |       const card=cards.nth(index);
  170 |       await card.scrollIntoViewIfNeeded();
  171 |       const box=await visibleInside(card,'[data-slot="automation-templates"]');
  172 |       const title=card.locator(':scope > span').nth(1);
  173 |       const titleBox=await horizontalInside(title,'[data-slot="automation-template-card"]');
  174 |       // 标题栏至少容纳四个现有字号的汉字，防止原图逐字挤列；没有缩小文字来过关。
  175 |       expect(titleBox.width).toBeGreaterThanOrEqual(titleBox.fontSize*4-1.5);
  176 |       cardGeometry.push({box,titleBox});
  177 |     }
  178 |     await cards.first().scrollIntoViewIfNeeded();
  179 |     await layoutShot(page,info,`t1245-${viewport.width}-quick-cards`);
  180 |     const actionGeometry=[];
  181 |     for (const control of [row.getByRole("switch"),row.getByTestId("automation-edit"),row.getByTestId("automation-login-douyin")]) {
  182 |       await control.scrollIntoViewIfNeeded();
  183 |       await expect(control).toBeEnabled();
  184 |       actionGeometry.push(await visibleInside(control,'[data-slot="automation-row"]'));
  185 |     }
  186 |     await row.getByTestId("automation-login-douyin").scrollIntoViewIfNeeded();
  187 |     await layoutShot(page,info,`t1245-${viewport.width}-original-job`);
  188 |     await row.locator('[data-slot="automation-open-detail"]').click();
  189 |     await expect(dialog).toBeVisible();
  190 |     await expect(dialog.locator('[data-slot="automation-run-item"]')).toHaveCount(1);
  191 |     await dialog.locator('[data-slot="automation-run-item"]').getByRole("button").click();
  192 |     await expect(dialog.locator('[data-slot="automation-run-error"]')).toHaveText(AUTH_MESSAGE);
  193 |     const close=dialog.locator('[data-slot="dialog-close"]');
  194 |     const dialogGeometry=await visibleInside(close,'[data-slot="automation-run-detail-dialog"]');
  195 |     const textGeometry=await dialog.locator('[data-slot="dialog-title"]').evaluate(node=>{
  196 |       const header=node.closest('[data-slot="dialog-header"]');
  197 |       const close=node.closest('[data-slot="automation-run-detail-dialog"]')?.querySelector('[data-slot="dialog-close"]');
  198 |       if(!header||!close)throw new Error("运行详情缺少真实标题或关闭控件");
  199 |       const h=header.getBoundingClientRect(),c=close.getBoundingClientRect();
  200 |       const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT); const rects=[];
  201 |       for(let text=walker.nextNode();text;text=walker.nextNode()) {
  202 |         if(!text.textContent?.trim())continue;
  203 |         const range=document.createRange(); range.selectNodeContents(text);
  204 |         for(const r of range.getClientRects())rects.push({left:r.left,right:r.right,top:r.top,bottom:r.bottom});
  205 |       }
  206 |       return {header:{left:h.left,right:h.right,top:h.top,bottom:h.bottom},close:{left:c.left,right:c.right,top:c.top,bottom:c.bottom},rects};
  207 |     });
  208 |     expect(textGeometry.rects.length).toBeGreaterThan(0);
  209 |     for(const rect of textGeometry.rects) {
  210 |       expect(rect.left).toBeGreaterThanOrEqual(textGeometry.header.left-1.5);
  211 |       expect(rect.right).toBeLessThanOrEqual(textGeometry.header.right+1.5);
  212 |       expect(rect.top).toBeGreaterThanOrEqual(textGeometry.header.top-1.5);
  213 |       expect(rect.bottom).toBeLessThanOrEqual(textGeometry.header.bottom+1.5);
  214 |       expect(rect.right<=textGeometry.close.left+1.5||rect.bottom<=textGeometry.close.top+1.5||rect.top>=textGeometry.close.bottom-1.5).toBe(true);
  215 |     }
  216 |     const error=dialog.locator('[data-slot="automation-run-error"]');
  217 |     await error.scrollIntoViewIfNeeded();
  218 |     const errorGeometry=await visibleInside(error,'[data-slot="automation-run-detail-dialog"]');
  219 |     await layoutShot(page,info,`t1245-${viewport.width}-original-run-dialog`);
  220 |     await page.keyboard.press("Escape");
  221 |     await expect(dialog).not.toBeVisible();
  222 |     geometries.push({viewport,pageGeometry,filterGeometry,cardGeometry,actionGeometry,dialogGeometry,textGeometry,errorGeometry});
  223 |   }
  224 |   const path=info.outputPath("t1245-responsive-geometry.json");
  225 |   await writeFile(path,`${JSON.stringify(geometries,null,2)}\n`);
  226 |   await info.attach("t1245-responsive-geometry",{path,contentType:"application/json"});
  227 | }
  228 | 
  229 | test("组内真实作业通过立即运行准入并保原任务显示待扫码", async ({ page, context, baseURL }, testInfo) => {
  230 |   test.setTimeout(86_400_000);
  231 |   page.setDefaultTimeout(REQUEST_MS);
  232 |   page.setDefaultNavigationTimeout(REQUEST_MS);
  233 |   context.setDefaultTimeout(REQUEST_MS);
  234 |   await page.goto("/");
  235 |   await context.clearCookies({ name: /^creatoros_current_(account|group)$/ });
  236 |   const groupA = await call(page, ENDPOINTS.createAccountGroup, { body: { name: `T1244 无绑定媒体组 ${key()}`, idempotencyKey: key() } });
  237 |   const groupB = await call(page, ENDPOINTS.createAccountGroup, { body: { name: `T1244 隔离组 ${key()}`, idempotencyKey: key() } });
  238 |   const account = await call(page, ENDPOINTS.createAccount, { body: { platform: "xiaohongshu", accountHandle: `t1244-neutral-${randomUUID()}`, idempotencyKey: key() } }, { groupId: groupA.id });
  239 |   const target = { groupId: groupA.id, accountId: account.id };
  240 |   const readiness = await call(page, ENDPOINTS.getAccountCollectionPlanReadiness, { params: { accountId: account.id } }, target);
  241 |   expect(readiness.planEvidence).toBe("missing");
  242 |   const job = await call(page, ENDPOINTS.createScheduledJob, { body: { name: `T1244 中性作品同步 ${key()}`, prompt: "无绑定隔离验收，不访问外部平台", sourceKind: "self.metrics", target: {}, schedule: "17 4 * * *", toolGrants: [] } }, target);
  243 |   await call(page, ENDPOINTS.setScheduledJobEnabled, { params: { jobId: job.id }, body: { enabled: false } }, target);
  244 |   const beforeJob = await call(page, ENDPOINTS.getScheduledJob, { params: { jobId: job.id } }, target);
  245 |   expect(beforeJob).toMatchObject({ id: job.id, groupId: groupA.id, accountId: account.id, enabled: false });
  246 |   expect(beforeJob.membershipVersion).toBeGreaterThanOrEqual(1);
  247 |   expect(beforeJob.groupVersion).toBeGreaterThanOrEqual(1);
  248 |   expect(await listRuns(page, job.id, target)).toEqual([]);
  249 |   await context.clearCookies({ name: /^creatoros_current_(account|group)$/ });
  250 |   await context.addCookies([{ name: "creatoros_current_group", value: encodeURIComponent(groupA.id), url: baseURL! }]);
  251 |   await page.addInitScript((id) => { localStorage.setItem("creatoros:current-group", id); localStorage.removeItem("creatoros:current-account"); }, groupA.id);
  252 |   await page.goto("/automations");
  253 |   await expect(page.getByTestId("automations-current-group")).toContainText(groupA.name);
  254 |   const row = page.locator(`[data-slot="automations-list"] li[data-job-id="${job.id}"]`);
```