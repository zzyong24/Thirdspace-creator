import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { ENDPOINTS, errorEnvelope, executionTaskResourceV2 } from "@creatoros/contract";
import type { APIResponse, Page } from "@playwright/test";
import { expect as baseExpect, test } from "../helpers/test-environment";

const expect = baseExpect.configure({ timeout: 120_000 });
const REQUEST_MS = 120_000;
const AUTH_MESSAGE = "平台登录态未连接或已过期，请到「账号管理」对应平台重新扫码绑定后再采集。";
type Scope = { groupId?: string; accountId?: string | null };
type Input = { params?: unknown; query?: unknown; body?: unknown };
type Endpoint<T> = { id: string; response: { parse(value: unknown): T }; params?: { parse(value: unknown): unknown }; query?: { parse(value: unknown): unknown }; body?: { parse(value: unknown): unknown } };
type Run = ReturnType<typeof ENDPOINTS.getJobRun.response.parse>;
type Ai = ReturnType<typeof ENDPOINTS.getTask.response.parse>;
type Execution = ReturnType<typeof executionTaskResourceV2.parse>;
const key = () => `t1244-${randomUUID()}`;

function inputFor<T>(endpoint: Endpoint<T>, input: Input): Input {
  return {
    ...(endpoint.params ? { params: endpoint.params.parse(input.params) } : {}),
    ...(endpoint.query ? { query: endpoint.query.parse(input.query) } : {}),
    ...(endpoint.body ? { body: endpoint.body.parse(input.body) } : {}),
  };
}
async function request<T>(page: Page, endpoint: Endpoint<T>, input: Input, scope: Scope): Promise<APIResponse> {
  return page.request.post("/api/v1/dispatch", {
    timeout: REQUEST_MS,
    headers: {
      "content-type": "application/json",
      ...(scope.groupId ? { "x-group-id": scope.groupId } : {}),
      ...(scope.accountId ? { "x-account-id": scope.accountId } : {}),
    },
    data: { id: endpoint.id, input: inputFor(endpoint, input) },
  });
}
function envelope(value: unknown): { data: unknown } {
  if (!value || typeof value !== "object" || !("data" in value)) throw new Error("公共响应缺少 data");
  return value as { data: unknown };
}
async function call<T>(page: Page, endpoint: Endpoint<T>, input: Input, scope: Scope = {}): Promise<T> {
  const response = await request(page, endpoint, input, scope);
  expect(response.status(), `${endpoint.id} 应 HTTP 200`).toBe(200);
  return endpoint.response.parse(envelope(await response.json()).data);
}
async function listRuns(page: Page, jobId: string, scope: Scope): Promise<Run[]> {
  const endpoint = ENDPOINTS.listJobRunsByJob;
  const response = await request(page, endpoint, { params: { jobId }, query: { page: 1, pageSize: 50 } }, scope);
  expect(response.status()).toBe(200);
  const data = envelope(await response.json()).data;
  if (!Array.isArray(data)) throw new Error("运行列表不是公共数组");
  return data.map((row) => endpoint.response.parse(row));
}
function isOperation(response: import("@playwright/test").Response, id: string, jobId: string): boolean {
  if (new URL(response.url()).pathname !== "/api/v1/dispatch") return false;
  try {
    const data = response.request().postDataJSON() as { id?: string; input?: { params?: { jobId?: string } } };
    return data.id === id && data.input?.params?.jobId === jobId;
  } catch { return false; }
}
function assertIdentity(run: Run, ai: Ai, execution: Execution | undefined, expected: { jobId: string; runId: string; aiId: string; groupId: string; accountId: string }): void {
  expect(run.id).toBe(expected.runId);
  expect(run.jobId).toBe(expected.jobId);
  expect(run.aiTaskId).toBe(expected.aiId);
  expect(run.groupId).toBe(expected.groupId);
  expect(ai.id).toBe(expected.aiId);
  expect(ai.groupId).toBe(expected.groupId);
  expect(ai.taskType).toBe("scheduled.self.metrics");
  expect(ai.inputData.jobId).toBe(expected.jobId);
  if (execution) {
    expect(execution.id).toBe(ai.executionTaskId);
    expect(execution.ownerType).toBe("ai_task");
    expect(execution.ownerId).toBe(ai.id);
    expect(execution.kind).toBe("ai_task");
    expect(execution.accountId).toBe(expected.accountId);
    expect(execution.groupId).toBe(expected.groupId);
    expect(execution.userId).toBe(ai.userId);
    expect(run.userId).toBe(ai.userId);
  }
}
function assertAuthWait(run: Run, ai: Ai, execution: Execution | undefined): asserts execution is Execution {
  expect(run.status).toBe("needs_reconnect");
  expect(run.itemsNew).toBe(0);
  expect(run.itemsUpdated).toBe(0);
  expect(run.finishedAt).not.toBeNull();
  expect(run.progress ?? null).toBeNull();
  expect(run.error).toBe(AUTH_MESSAGE);
  expect(ai.status).toBe("running");
  expect(ai.runtimeStatus).toBe("waiting_user");
  expect(ai.errorCode).toBe("FLYWHEEL_LOGIN_REQUIRED");
  if (!execution) throw new Error("原AI未绑定公开执行任务");
  expect(execution.status).toBe("blocked");
  expect(execution.runtimeStatus).toBe("waiting_user");
  expect(execution.errorCode).toBe("FLYWHEEL_LOGIN_REQUIRED");
  expect(execution.attempt).toBeGreaterThanOrEqual(1);
  expect(execution.leaseOwner).toBeNull();
  expect(execution.leaseExpiresAt).toBeNull();
  expect(execution.heartbeatAt).toBeNull();
}

import type { Locator, TestInfo } from "@playwright/test";

// 只追加几何观察；不写 scope、不调用运行/登录/创建或编辑提交。
async function layoutBox(locator: Locator, parentSelector: string) {
  return locator.evaluate((node, selector) => {
    const parent = node.closest(selector);
    if (!parent) throw new Error("几何对象缺少真实父容器");
    const r = node.getBoundingClientRect(), p = parent.getBoundingClientRect();
    return { left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width,
      parentLeft:p.left, parentRight:p.right, parentTop:p.top, parentBottom:p.bottom,
      viewportWidth:innerWidth, viewportHeight:innerHeight,
      clientWidth:node.clientWidth, scrollWidth:node.scrollWidth,
      fontSize:parseFloat(getComputedStyle(node.querySelector("span")??node).fontSize) };
  }, parentSelector);
}
async function horizontalInside(locator: Locator, parentSelector: string) {
  const box = await layoutBox(locator, parentSelector);
  expect(box.left).toBeGreaterThanOrEqual(Math.max(0,box.parentLeft)-1.5);
  expect(box.right).toBeLessThanOrEqual(Math.min(box.viewportWidth,box.parentRight)+1.5);
  expect(box.width).toBeGreaterThan(0);
  return box;
}
async function visibleInside(locator: Locator, parentSelector: string) {
  await expect(locator).toBeInViewport();
  const box = await horizontalInside(locator,parentSelector);
  expect(box.top).toBeGreaterThanOrEqual(Math.max(0,box.parentTop)-1.5);
  expect(box.bottom).toBeLessThanOrEqual(Math.min(box.viewportHeight,box.parentBottom)+1.5);
  return box;
}
async function layoutShot(page: Page, info: TestInfo, name: string) {
  const file=info.outputPath(`${name}.png`);
  await page.screenshot({path:file,fullPage:true,timeout:REQUEST_MS});
  await info.attach(name,{path:file,contentType:"image/png"});
}
async function responsiveEvidence(page: Page, row: Locator, dialog: Locator, info: TestInfo) {
  const geometries: unknown[]=[];
  // 固定三个视口；不得追加一次 runNow 或调用扫码。
  for (const viewport of [{width:390,height:844},{width:900,height:900},{width:1536,height:1024}]) {
    await page.setViewportSize(viewport);
    const sidebar=page.getByTestId("app-sidebar");
    await expect(sidebar).toHaveAttribute("data-collapsed",viewport.width<=1024?"true":"false");
    let previousWidth: number | undefined;
    await expect.poll(async()=>{
      const state=await sidebar.evaluate(node=>({width:node.getBoundingClientRect().width,
        expanded:parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--creatoros-sidebar-width"))}));
      const target=viewport.width<=1024?64:state.expanded;
      const stable=previousWidth!==undefined&&Math.abs(previousWidth-state.width)<0.1;
      previousWidth=state.width;
      return stable&&Math.abs(state.width-target)<0.5;
    },{timeout:300000,intervals:[100,250,500,1000]}).toBe(true);
    // section 无显式 role，使用真实 aria-label 对象；不造测试专用页面状态。
    const scopePanel=page.locator('section[aria-label="账号组任务范围"]');
    await scopePanel.scrollIntoViewIfNeeded();
    const pageGeometry=await page.locator('[data-testid="page-scroll-area"] [data-slot="scroll-area-viewport"]').evaluate(node=>({clientWidth:node.clientWidth,scrollWidth:node.scrollWidth}));
    expect(pageGeometry.scrollWidth).toBeLessThanOrEqual(pageGeometry.clientWidth+1.5);
    const filterGeometry=[];
    for (const name of ["筛选媒体平台","筛选平台账号"]) {
      const filter=page.getByRole("combobox",{name,exact:true});
      await expect(filter).toBeEnabled();
      filterGeometry.push(await visibleInside(filter,'section[aria-label="账号组任务范围"]'));
    }
    await layoutShot(page,info,`t1245-${viewport.width}-filters`);
    const cards=page.locator('[data-slot="automation-template-card"]');
    const count=await cards.count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(3); // 当前 intent.ts 明确只有三个模板；异常不截断成通过。
    const cardGeometry=[];
    for (let index=0;index<3;index+=1) {
      if(index>=count)break;
      const card=cards.nth(index);
      await card.scrollIntoViewIfNeeded();
      const box=await visibleInside(card,'[data-slot="automation-templates"]');
      const title=card.locator(':scope > span').nth(1);
      const titleBox=await horizontalInside(title,'[data-slot="automation-template-card"]');
      // 标题栏至少容纳四个现有字号的汉字，防止原图逐字挤列；没有缩小文字来过关。
      expect(titleBox.width).toBeGreaterThanOrEqual(titleBox.fontSize*4-1.5);
      cardGeometry.push({box,titleBox});
    }
    await cards.first().scrollIntoViewIfNeeded();
    await layoutShot(page,info,`t1245-${viewport.width}-quick-cards`);
    const actionGeometry=[];
    for (const control of [row.getByRole("switch"),row.getByTestId("automation-edit"),row.getByTestId("automation-login-douyin")]) {
      await control.scrollIntoViewIfNeeded();
      await expect(control).toBeEnabled();
      actionGeometry.push(await visibleInside(control,'[data-slot="automation-row"]'));
    }
    await row.getByTestId("automation-login-douyin").scrollIntoViewIfNeeded();
    await layoutShot(page,info,`t1245-${viewport.width}-original-job`);
    await row.locator('[data-slot="automation-open-detail"]').click();
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('[data-slot="automation-run-item"]')).toHaveCount(1);
    await dialog.locator('[data-slot="automation-run-item"]').getByRole("button").click();
    await expect(dialog.locator('[data-slot="automation-run-error"]')).toHaveText(AUTH_MESSAGE);
    const close=dialog.locator('[data-slot="dialog-close"]');
    const dialogGeometry=await visibleInside(close,'[data-slot="automation-run-detail-dialog"]');
    const textGeometry=await dialog.locator('[data-slot="dialog-title"]').evaluate(node=>{
      const header=node.closest('[data-slot="dialog-header"]');
      const close=node.closest('[data-slot="automation-run-detail-dialog"]')?.querySelector('[data-slot="dialog-close"]');
      if(!header||!close)throw new Error("运行详情缺少真实标题或关闭控件");
      const h=header.getBoundingClientRect(),c=close.getBoundingClientRect();
      const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT); const rects=[];
      for(let text=walker.nextNode();text;text=walker.nextNode()) {
        if(!text.textContent?.trim())continue;
        const range=document.createRange(); range.selectNodeContents(text);
        for(const r of range.getClientRects())rects.push({left:r.left,right:r.right,top:r.top,bottom:r.bottom});
      }
      return {header:{left:h.left,right:h.right,top:h.top,bottom:h.bottom},close:{left:c.left,right:c.right,top:c.top,bottom:c.bottom},rects};
    });
    expect(textGeometry.rects.length).toBeGreaterThan(0);
    for(const rect of textGeometry.rects) {
      expect(rect.left).toBeGreaterThanOrEqual(textGeometry.header.left-1.5);
      expect(rect.right).toBeLessThanOrEqual(textGeometry.header.right+1.5);
      expect(rect.top).toBeGreaterThanOrEqual(textGeometry.header.top-1.5);
      expect(rect.bottom).toBeLessThanOrEqual(textGeometry.header.bottom+1.5);
      expect(rect.right<=textGeometry.close.left+1.5||rect.bottom<=textGeometry.close.top+1.5||rect.top>=textGeometry.close.bottom-1.5).toBe(true);
    }
    const error=dialog.locator('[data-slot="automation-run-error"]');
    await error.scrollIntoViewIfNeeded();
    const errorGeometry=await visibleInside(error,'[data-slot="automation-run-detail-dialog"]');
    await layoutShot(page,info,`t1245-${viewport.width}-original-run-dialog`);
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    geometries.push({viewport,pageGeometry,filterGeometry,cardGeometry,actionGeometry,dialogGeometry,textGeometry,errorGeometry});
  }
  const path=info.outputPath("t1245-responsive-geometry.json");
  await writeFile(path,`${JSON.stringify(geometries,null,2)}\n`);
  await info.attach("t1245-responsive-geometry",{path,contentType:"application/json"});
}

test("组内真实作业通过立即运行准入并保原任务显示待扫码", async ({ page, context, baseURL }, testInfo) => {
  test.setTimeout(Math.max((86_400_000), 321060000));
  page.setDefaultTimeout(REQUEST_MS);
  page.setDefaultNavigationTimeout(REQUEST_MS);
  context.setDefaultTimeout(REQUEST_MS);
  await page.goto("/");
  await context.clearCookies({ name: /^creatoros_current_(account|group)$/ });
  const groupA = await call(page, ENDPOINTS.createAccountGroup, { body: { name: `T1244 无绑定媒体组 ${key()}`, idempotencyKey: key() } });
  const groupB = await call(page, ENDPOINTS.createAccountGroup, { body: { name: `T1244 隔离组 ${key()}`, idempotencyKey: key() } });
  const account = await call(page, ENDPOINTS.createAccount, { body: { platform: "xiaohongshu", accountHandle: `t1244-neutral-${randomUUID()}`, idempotencyKey: key() } }, { groupId: groupA.id });
  const target = { groupId: groupA.id, accountId: account.id };
  const readiness = await call(page, ENDPOINTS.getAccountCollectionPlanReadiness, { params: { accountId: account.id } }, target);
  expect(readiness.planEvidence).toBe("missing");
  const job = await call(page, ENDPOINTS.createScheduledJob, { body: { name: `T1244 中性作品同步 ${key()}`, prompt: "无绑定隔离验收，不访问外部平台", sourceKind: "self.metrics", target: {}, schedule: "17 4 * * *", toolGrants: [] } }, target);
  await call(page, ENDPOINTS.setScheduledJobEnabled, { params: { jobId: job.id }, body: { enabled: false } }, target);
  const beforeJob = await call(page, ENDPOINTS.getScheduledJob, { params: { jobId: job.id } }, target);
  expect(beforeJob).toMatchObject({ id: job.id, groupId: groupA.id, accountId: account.id, enabled: false });
  expect(beforeJob.membershipVersion).toBeGreaterThanOrEqual(1);
  expect(beforeJob.groupVersion).toBeGreaterThanOrEqual(1);
  expect(await listRuns(page, job.id, target)).toEqual([]);
  await page.reload({waitUntil:"domcontentloaded",timeout:REQUEST_MS});
  await expect(page.getByTestId("account-switcher")).toHaveAttribute("data-state","ready");
  await page.getByTestId("account-switcher-trigger").click();
  await page.getByTestId("account-switcher-menu").locator(`[data-group-id="${groupA.id}"]`).click();
  await expect.poll(()=>page.evaluate(()=>localStorage.getItem("creatoros:current-group")), { timeout: 300000 }).toBe(groupA.id);
  await expect.poll(async()=> (await context.cookies(baseURL!)).find(c=>c.name==="creatoros_current_group")?.value, { timeout: 300000 }).toBe(encodeURIComponent(groupA.id));
  await expect(page.getByTestId("account-switcher")).toHaveAttribute("data-state","ready");
  await page.goto("/automations");
  await expect(page.getByTestId("automations-current-group")).toContainText(groupA.name);
  const row = page.locator(`[data-slot="automations-list"] li[data-job-id="${job.id}"]`);
  await expect(row).toHaveCount(1);
  const enabled = row.getByRole("switch", { name: `${job.name} 启用开关`, exact: true });
  await expect(enabled).toHaveAttribute("aria-checked", "false");
  const toggleResponse = page.waitForResponse((response) => isOperation(response, "scheduledJobs.setEnabled", job.id), { timeout: 300000 });
  try {
    await enabled.click();
    const response = await toggleResponse;
    expect(response.status()).toBe(200);
    const toggled = ENDPOINTS.setScheduledJobEnabled.response.parse(envelope(await response.json()).data);
    expect(toggled).toMatchObject({ id: job.id, accountId: account.id, groupId: groupA.id, enabled: true });
  } finally { await toggleResponse.catch(() => undefined); }
  await expect(enabled).toHaveAttribute("aria-checked", "true");
  const enabledJob = await call(page, ENDPOINTS.getScheduledJob, { params: { jobId: job.id } }, target);
  expect(enabledJob.enabled).toBe(true);
  const triggers: Array<{ jobId: string; groupId: string | undefined; accountId: string | undefined }> = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname !== "/api/v1/dispatch") return;
    try {
      const body = request.postDataJSON() as { id?: string; input?: { params?: { jobId?: string } } };
      if (body.id === "scheduledJobs.runNow") {
        const headers = request.headers();
        triggers.push({ jobId: body.input?.params?.jobId ?? "", groupId: headers["x-group-id"], accountId: headers["x-account-id"] });
      }
    } catch { /* 非JSON请求不属于该机械operation */ }
  });
  const runResponse = page.waitForResponse((response) => isOperation(response, "scheduledJobs.runNow", job.id), { timeout: 300000 });
  let trigger: ReturnType<typeof ENDPOINTS.runScheduledJobNow.response.parse>;
  try {
    await row.getByTestId("automation-run-now").click();
    const response = await runResponse;
    expect(response.status()).toBe(200);
    trigger = ENDPOINTS.runScheduledJobNow.response.parse(envelope(await response.json()).data);
    expect(trigger.deduped).toBe(false);
  } finally { await runResponse.catch(() => undefined); }
  const original = { jobId: job.id, runId: trigger.jobRunId, aiId: trigger.aiTaskId, groupId: groupA.id, accountId: account.id };
  let run: Run | undefined;
  let ai: Ai | undefined;
  let execution: Execution | undefined;
  let frozenExecutionId: string | undefined;
  let observations = 0;
  for (let readNo = 0; readNo < 30; readNo += 1) {
    observations += 1;
    run = await call(page, ENDPOINTS.getJobRun, { params: { runId: original.runId } }, target);
    ai = await call(page, ENDPOINTS.getTask, { params: { taskId: original.aiId } }, target);
    if (ai.executionTaskId) {
      if (frozenExecutionId) expect(ai.executionTaskId).toBe(frozenExecutionId);
      frozenExecutionId ??= ai.executionTaskId;
      execution = executionTaskResourceV2.parse(await call(page, ENDPOINTS.getExecutionTask, { params: { taskId: frozenExecutionId } }, target));
    }
    assertIdentity(run, ai, execution, original);
    if (run.status === "needs_reconnect" && execution?.runtimeStatus === "waiting_user") break;
    if (["failed", "cancelled", "succeeded"].includes(execution?.status ?? "") || execution?.runtimeStatus === "unknown_result" || run.status === "failed" || run.status === "succeeded") break;
    // 固定30轮只读；快速非终态响应也保留29×5秒观察，不以短观察预算重发任务。
    if (readNo < 29) await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  if (!run || !ai) throw new Error("原运行只读观察未取得公共响应");
  assertAuthWait(run, ai, execution);
  const dialog = page.locator('[data-slot="automation-run-detail-dialog"]');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-slot="automation-run-item"]')).toHaveCount(1);
  await expect(dialog.locator('[data-slot="automation-run-item"]')).toHaveAttribute("data-run-status", "needs_reconnect");
  await expect(dialog.locator('[data-slot="automation-run-error"]')).toHaveText(AUTH_MESSAGE);
  const desktopPath = testInfo.outputPath("run-now-auth-wait-desktop.png");
  await page.screenshot({ path: desktopPath, fullPage: true , timeout: 120000});
  await testInfo.attach("待扫码原运行桌面", { path: desktopPath, contentType: "image/png" });
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(row.getByTestId("automation-login-douyin")).toBeVisible();
  await expect(row.getByTestId("automation-login-douyin")).toContainText("扫码绑定");
  await page.setViewportSize({ width: 390, height: 844 });
  const narrowPath = testInfo.outputPath("run-now-auth-wait-narrow-after-reload.png");
  await page.screenshot({ path: narrowPath, fullPage: true , timeout: 120000});
  await testInfo.attach("刷新后的扫码指引窄窗口", { path: narrowPath, contentType: "image/png" });
  await responsiveEvidence(page,row,dialog,testInfo);
  const runs = await listRuns(page, job.id, target);
  expect(runs).toHaveLength(1);
  expect(runs[0]).toMatchObject({ id: original.runId, jobId: original.jobId, aiTaskId: original.aiId, status: "needs_reconnect" });
  const afterJob = await call(page, ENDPOINTS.getScheduledJob, { params: { jobId: job.id } }, target);
  expect(afterJob).toMatchObject({ id: beforeJob.id, accountId: beforeJob.accountId, groupId: beforeJob.groupId, groupVersion: beforeJob.groupVersion, membershipVersion: beforeJob.membershipVersion, schedule: beforeJob.schedule, target: beforeJob.target, enabled: true });
  // 错组负例仅只读，不再提交runNow。清已知账号镜像，防cookie把ctx变成矛盾账号/组。
  await context.clearCookies({ name: "creatoros_current_account" });
  const denied = await request(page, ENDPOINTS.getScheduledJob, { params: { jobId: job.id } }, { groupId: groupB.id });
  expect(denied.status()).toBe(404);
  const rejection = errorEnvelope.parse(await denied.json());
  expect(rejection.error.code).toBe("OwnershipError");
  const finalRun = await call(page, ENDPOINTS.getJobRun, { params: { runId: original.runId } }, target);
  const finalAi = await call(page, ENDPOINTS.getTask, { params: { taskId: original.aiId } }, target);
  const finalExecution = executionTaskResourceV2.parse(await call(page, ENDPOINTS.getExecutionTask, { params: { taskId: frozenExecutionId } }, target));
  assertIdentity(finalRun, finalAi, finalExecution, original);
  assertAuthWait(finalRun, finalAi, finalExecution);
  expect(finalRun).toEqual(run);
  expect(finalAi).toEqual(ai);
  expect(finalExecution).toEqual(execution);
  expect(triggers).toEqual([{ jobId: job.id, groupId: groupA.id, accountId: account.id }]);
  const evidence = { original: { ...original, executionId: frozenExecutionId }, observations, triggers, readiness: readiness.planEvidence, run: { id: finalRun.id, status: finalRun.status, itemsNew: finalRun.itemsNew, itemsUpdated: finalRun.itemsUpdated, finishedAt: finalRun.finishedAt }, ai: { id: finalAi.id, status: finalAi.status, runtimeStatus: finalAi.runtimeStatus, executionTaskId: finalAi.executionTaskId, errorCode: finalAi.errorCode }, execution: { id: finalExecution.id, status: finalExecution.status, runtimeStatus: finalExecution.runtimeStatus, errorCode: finalExecution.errorCode, attempt: finalExecution.attempt, ownerId: finalExecution.ownerId }, wrongGroupStatus: denied.status(), boundary: "真实无绑定授权等待，不代表平台采集成功或真人账号绑定" };
  const evidencePath = testInfo.outputPath("public-original-task-auth-wait.json");
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  await testInfo.attach("public-original-task-auth-wait", { path: evidencePath, contentType: "application/json" });
});

// T-1246 copied-source declaration: original assertions unchanged.
test.describe.configure({ timeout: 321060000 });
