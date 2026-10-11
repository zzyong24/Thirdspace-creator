# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e/automations-run-now-public.spec.ts >> 组内真实作业通过立即运行准入并保原任务显示待扫码
- Location: tests/e2e/automations-run-now-public.spec.ts:229:5

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Page snapshot

```yaml
- generic:
  - generic:
    - complementary:
      - generic:
        - generic:
          - generic:
            - img
        - button [pressed]:
          - img
      - generic:
        - navigation:
          - link:
            - /url: /
            - img
          - link:
            - /url: /overview
            - img
          - link:
            - /url: /positioning
            - img
          - link:
            - /url: /intelligence
            - img
          - link:
            - /url: /topics
            - img
          - link:
            - /url: /projects
            - img
          - link:
            - /url: /knowledge
            - img
          - link:
            - /url: /assets
            - img
          - link:
            - /url: /canvases
            - img
          - link:
            - /url: /publishing
            - img
          - link:
            - /url: /daily-report
            - img
          - link:
            - /url: /automations
            - img
          - link:
            - /url: /settings
            - img
      - generic:
        - button:
          - img
        - generic:
          - button:
            - generic:
              - img
        - generic:
          - generic:
            - generic: "?"
    - generic:
      - banner
      - generic:
        - generic:
          - generic:
            - generic:
              - generic:
                - main:
                  - generic:
                    - heading [level=1]: 自动化
                    - paragraph: 让作品指标、评论、流量来源和视频内容按需更新，持续支持选题与复盘。
                  - generic:
                    - region:
                      - generic:
                        - heading [level=2]: T1244 无绑定媒体组 t1244-59c9b0e0-4b10-4815-a042-3953f2cc821d
                        - generic:
                          - text: 平台
                          - combobox
                        - generic:
                          - text: 账号
                          - combobox
                      - paragraph: 共享任务保留在所有筛选中；选择具体账号后，可管理该账号的采集计划。
                      - list:
                        - listitem:
                          - generic: 小红书 · t1244-neutral-06c9f5a3-9b4f-4bbe-b68f-6973b6f0f3a8
                          - paragraph: 1 条采集计划
                    - region:
                      - generic:
                        - img
                        - heading [level=2]: 快速创建
                        - generic: 从常用任务开始
                      - generic:
                        - button:
                          - generic:
                            - img
                          - generic: 每日自动生成选题
                          - generic:
                            - img
                            - text: 新建
                          - generic: 每天结合你的定位、评论信号、知识库与当下热点,自动出一批选题进选题池。需配置文本模型。
                    - generic:
                      - generic:
                        - generic:
                          - heading [level=2]: 我的自动化
                          - generic: 共 1 个任务
                          - generic: 1 个已启用
                        - generic:
                          - generic: T1244 无绑定媒体组 t1244-59c9b0e0-4b10-4815-a042-3953f2cc821d · 全组任务
                      - button:
                        - img
                        - text: 新建任务
                    - generic:
                      - list:
                        - listitem:
                          - article:
                            - generic:
                              - generic:
                                - img
                              - generic:
                                - button: T1244 中性作品同步 t1244-758b90f2-1010-4a43-bd17-ad67499aaf57
                                - generic:
                                  - img
                                  - text: 需重连账号 · 去扫码绑定
                                - generic:
                                  - img
                                  - text: 小红书 · t1244-neutral-06c9f5a3-9b4f-4bbe-b68f-6973b6f0f3a8
                            - generic:
                              - generic:
                                - img
                                - text: 每天 04:17
                              - generic: 作品优先
                              - generic: 成功同步后，近 7 天每 2 小时更新 7–30 天每 6 小时，30 天以上每天更新
                              - generic: 上次：10-11 21:27
                              - generic: 下次：等待调度
                            - generic:
                              - generic:
                                - switch [checked]
                                - generic: 已启用
                            - generic:
                              - button:
                                - img
                                - text: 编辑
                              - button:
                                - img
                                - text: 扫码绑定
  - button "Open Next.js Dev Tools" [ref=e6] [cursor=pointer]:
    - img [ref=e7]
  - alert
  - dialog "运行详情 · T1244 中性作品同步 t1244-758b90f2-1010-4a43-bd17-ad67499aaf57" [ref=e11]:
    - generic [ref=e12]:
      - heading "运行详情 · T1244 中性作品同步 t1244-758b90f2-1010-4a43-bd17-ad67499aaf57" [level=2] [ref=e13]:
        - img [ref=e14]
        - text: 运行详情 · T1244 中性作品同步 t1244-758b90f2-1010-4a43-bd17-ad67499aaf57
      - paragraph [ref=e17]: 查看本次进度和历史运行记录。
    - generic [ref=e20]:
      - button "需重连账号 10-11 21:27 ⚠️ 需重连账号 · 去扫码绑定" [active] [ref=e21]:
        - generic [ref=e22]:
          - img [ref=e23]
          - generic [ref=e28]: 需重连账号
          - generic [ref=e29]: 10-11 21:27
          - generic [ref=e30]: ⚠️ 需重连账号 · 去扫码绑定
      - generic [ref=e31]:
        - paragraph [ref=e32]: 平台登录态未连接或已过期，请到「账号管理」对应平台重新扫码绑定后再采集。
        - paragraph [ref=e33]: 这次运行暂无详细步骤。
    - button "关闭" [ref=e34]:
      - img
      - generic [ref=e35]: 关闭
```

# Test source

```ts
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
  154 |     expect(pageGeometry.scrollWidth).toBeLessThanOrEqual(pageGeometry.clientWidth+1.5);
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
> 214 |       expect(rect.right<=textGeometry.close.left+1.5||rect.bottom<=textGeometry.close.top+1.5||rect.top>=textGeometry.close.bottom-1.5).toBe(true);
      |                                                                                                                                         ^ Error: expect(received).toBe(expected) // Object.is equality
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
  255 |   await expect(row).toHaveCount(1);
  256 |   const enabled = row.getByRole("switch", { name: `${job.name} 启用开关`, exact: true });
  257 |   await expect(enabled).toHaveAttribute("aria-checked", "false");
  258 |   const toggleResponse = page.waitForResponse((response) => isOperation(response, "scheduledJobs.setEnabled", job.id), { timeout: REQUEST_MS });
  259 |   try {
  260 |     await enabled.click();
  261 |     const response = await toggleResponse;
  262 |     expect(response.status()).toBe(200);
  263 |     const toggled = ENDPOINTS.setScheduledJobEnabled.response.parse(envelope(await response.json()).data);
  264 |     expect(toggled).toMatchObject({ id: job.id, accountId: account.id, groupId: groupA.id, enabled: true });
  265 |   } finally { await toggleResponse.catch(() => undefined); }
  266 |   await expect(enabled).toHaveAttribute("aria-checked", "true");
  267 |   const enabledJob = await call(page, ENDPOINTS.getScheduledJob, { params: { jobId: job.id } }, target);
  268 |   expect(enabledJob.enabled).toBe(true);
  269 |   const triggers: Array<{ jobId: string; groupId: string | undefined; accountId: string | undefined }> = [];
  270 |   page.on("request", (request) => {
  271 |     if (new URL(request.url()).pathname !== "/api/v1/dispatch") return;
  272 |     try {
  273 |       const body = request.postDataJSON() as { id?: string; input?: { params?: { jobId?: string } } };
  274 |       if (body.id === "scheduledJobs.runNow") {
  275 |         const headers = request.headers();
  276 |         triggers.push({ jobId: body.input?.params?.jobId ?? "", groupId: headers["x-group-id"], accountId: headers["x-account-id"] });
  277 |       }
  278 |     } catch { /* 非JSON请求不属于该机械operation */ }
  279 |   });
  280 |   const runResponse = page.waitForResponse((response) => isOperation(response, "scheduledJobs.runNow", job.id), { timeout: REQUEST_MS });
  281 |   let trigger: ReturnType<typeof ENDPOINTS.runScheduledJobNow.response.parse>;
  282 |   try {
  283 |     await row.getByTestId("automation-run-now").click();
  284 |     const response = await runResponse;
  285 |     expect(response.status()).toBe(200);
  286 |     trigger = ENDPOINTS.runScheduledJobNow.response.parse(envelope(await response.json()).data);
  287 |     expect(trigger.deduped).toBe(false);
  288 |   } finally { await runResponse.catch(() => undefined); }
  289 |   const original = { jobId: job.id, runId: trigger.jobRunId, aiId: trigger.aiTaskId, groupId: groupA.id, accountId: account.id };
  290 |   let run: Run | undefined;
  291 |   let ai: Ai | undefined;
  292 |   let execution: Execution | undefined;
  293 |   let frozenExecutionId: string | undefined;
  294 |   let observations = 0;
  295 |   for (let readNo = 0; readNo < 30; readNo += 1) {
  296 |     observations += 1;
  297 |     run = await call(page, ENDPOINTS.getJobRun, { params: { runId: original.runId } }, target);
  298 |     ai = await call(page, ENDPOINTS.getTask, { params: { taskId: original.aiId } }, target);
  299 |     if (ai.executionTaskId) {
  300 |       if (frozenExecutionId) expect(ai.executionTaskId).toBe(frozenExecutionId);
  301 |       frozenExecutionId ??= ai.executionTaskId;
  302 |       execution = executionTaskResourceV2.parse(await call(page, ENDPOINTS.getExecutionTask, { params: { taskId: frozenExecutionId } }, target));
  303 |     }
  304 |     assertIdentity(run, ai, execution, original);
  305 |     if (run.status === "needs_reconnect" && execution?.runtimeStatus === "waiting_user") break;
  306 |     if (["failed", "cancelled", "succeeded"].includes(execution?.status ?? "") || execution?.runtimeStatus === "unknown_result" || run.status === "failed" || run.status === "succeeded") break;
  307 |     // 固定30轮只读；快速非终态响应也保留29×5秒观察，不以短观察预算重发任务。
  308 |     if (readNo < 29) await new Promise((resolve) => setTimeout(resolve, 5000));
  309 |   }
  310 |   if (!run || !ai) throw new Error("原运行只读观察未取得公共响应");
  311 |   assertAuthWait(run, ai, execution);
  312 |   const dialog = page.locator('[data-slot="automation-run-detail-dialog"]');
  313 |   await expect(dialog).toBeVisible();
  314 |   await expect(dialog.locator('[data-slot="automation-run-item"]')).toHaveCount(1);
```