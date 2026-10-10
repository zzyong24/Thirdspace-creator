import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { expect, test } from "../helpers/test-environment";

type Scope = { groupId?: string; accountId?: string };
type DispatchInput = { params?: unknown; query?: unknown; body?: unknown };
type Account = { id: string; accountHandle: string; platform: string; status: string };
type Group = { id: string; name: string };
type Job = { id: string; accountId: string | null; groupId: string | null; name: string; schedule: string; enabled: boolean };

const fresh = (prefix: string) => `${prefix}-${randomUUID()}`;

async function dispatch<T>(page: Page, id: string, input: DispatchInput, scope: Scope = {}): Promise<T> {
  const response = await page.request.post("/api/v1/dispatch", {
    headers: {
      "content-type": "application/json",
      ...(scope.groupId ? { "x-group-id": scope.groupId } : {}),
      ...(scope.accountId ? { "x-account-id": scope.accountId } : {}),
    },
    data: { id, input },
  });
  expect(response.ok(), `${id} 应成功，实际 ${response.status()}：${await response.text()}`).toBe(true);
  return ((await response.json()) as { data: T }).data;
}

async function createGroup(page: Page, name: string): Promise<Group> {
  return dispatch(page, "accountGroups.create", {
    body: { name, idempotencyKey: fresh("t1207-group") },
  });
}

async function createAccount(page: Page, groupId: string, platform: string, label: string): Promise<Account> {
  return dispatch(page, "accounts.create", {
    body: {
      platform,
      accountHandle: `${label}-${randomUUID().slice(0, 8)}`,
      idempotencyKey: fresh("t1207-account"),
    },
  }, { groupId });
}

async function createJob(page: Page, groupId: string, name: string, accountId?: string): Promise<Job> {
  const job = await dispatch<Job>(page, "scheduledJobs.create", {
    body: {
      name,
      prompt: "仅用于隔离E2E页面验收，不触发外部采集。",
      sourceKind: accountId ? "self.metrics" : "topic.daily",
      target: {},
      schedule: "17 4 * * *",
      toolGrants: [],
    },
  }, { groupId, ...(accountId ? { accountId } : {}) });
  // 保持公开契约回读，但明确关闭测试任务；Playwright 配置还会禁用调度器。
  return dispatch(page, "scheduledJobs.setEnabled", {
    params: { jobId: job.id },
    body: { enabled: false },
  }, { groupId, ...(accountId ? { accountId } : {}) });
}

async function openGroup(page: Page, baseURL: string | undefined, groupId: string): Promise<void> {
  const cookieUrl = baseURL ?? "http://127.0.0.1";
  await page.context().addCookies([
    { name: "creatoros_current_group", value: encodeURIComponent(groupId), url: cookieUrl },
    { name: "creatoros_current_account", value: "", url: cookieUrl },
  ]);
  await page.addInitScript((id) => {
    window.localStorage.setItem("creatoros:current-group", id);
    window.localStorage.removeItem("creatoros:current-account");
  }, groupId);
  await page.goto("/automations");
  await expect(page.getByTestId("automations-current-group")).toBeVisible();
}

async function visibleJobIds(page: Page): Promise<string[]> {
  return page.locator('[data-slot="automations-list"] li[data-job-id]')
    .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-job-id") ?? ""));
}

async function selectGroupFromSidebar(page: Page, groupId: string): Promise<void> {
  await page.getByTestId("account-switcher-trigger").click();
  await page.getByTestId("account-switcher-menu").locator(`[data-group-id="${groupId}"]`).click();
}

test.describe("账号组内多平台定时任务可见性（T-1199）", () => {
  test("组总览读到真实多平台作业，平台与账号筛选只收窄私有作业并保留共享项", async ({ page, baseURL }) => {
    await page.goto("/");
    const group = await createGroup(page, fresh("多媒体任务组"));
    const douyinA = await createAccount(page, group.id, "douyin", "验收抖音甲");
    const douyinB = await createAccount(page, group.id, "douyin", "验收抖音乙");
    const xhs = await createAccount(page, group.id, "xiaohongshu", "验收小红书");
    const xhsWithoutPlan = await createAccount(page, group.id, "xiaohongshu", "无计划小红书");
    const jobs = [
      await createJob(page, group.id, "验收抖音甲作品同步", douyinA.id),
      await createJob(page, group.id, "验收抖音乙作品同步", douyinB.id),
      await createJob(page, group.id, "验收小红书作品同步", xhs.id),
      await createJob(page, group.id, "验收组共享每日选题"),
    ];

    const readback = await dispatch<Job[]>(page, "scheduledJobs.list", {
      query: { page: 1, pageSize: 100 },
    }, { groupId: group.id });
    expect(new Set(readback.map((job) => job.id))).toEqual(new Set(jobs.map((job) => job.id)));
    expect(readback.every((job) => job.enabled === false)).toBe(true);
    expect(readback.find((job) => job.id === jobs[0]!.id)?.schedule).toBe("17 4 * * *");

    await openGroup(page, baseURL, group.id);
    await expect(page.getByTestId("automations-current-group")).toContainText(group.name);
    await expect.poll(() => visibleJobIds(page)).toEqual(expect.arrayContaining(jobs.map((job) => job.id)));
    await expect(page.locator('[data-slot="automations-list"] li[data-job-id]')).toHaveCount(4);

    const platformFilter = page.getByLabel("筛选媒体平台");
    const accountFilter = page.getByLabel("筛选平台账号");
    await platformFilter.selectOption("xiaohongshu");
    await expect.poll(() => visibleJobIds(page)).toEqual(expect.arrayContaining([jobs[2]!.id, jobs[3]!.id]));
    await expect(page.locator('[data-slot="automations-list"] li[data-job-id]')).toHaveCount(2);
    await expect(page.locator(`[data-slot="automations-list"] li[data-job-id="${jobs[0]!.id}"]`)).toHaveCount(0);

    await accountFilter.selectOption(xhs.id);
    await expect.poll(() => visibleJobIds(page)).toEqual(expect.arrayContaining([jobs[2]!.id, jobs[3]!.id]));
    await expect(page.locator('[data-slot="automations-list"] li[data-job-id]')).toHaveCount(2);

    await accountFilter.selectOption(xhsWithoutPlan.id);
    await expect.poll(() => visibleJobIds(page)).toEqual([jobs[3]!.id]);
    const noPlanCard = page.getByRole("list", { name: "组内账号计划状态" }).locator("li").filter({ hasText: xhsWithoutPlan.accountHandle });
    await expect(noPlanCard).toContainText("尚未建立采集计划");
  });

  test("切换账号组只改变工作区列表，回到原组后原 job ID 与排期仍相同", async ({ page, baseURL }) => {
    await page.goto("/");
    const groupA = await createGroup(page, fresh("切组来源组"));
    const groupB = await createGroup(page, fresh("切组目标组"));
    const xhsA = await createAccount(page, groupA.id, "xiaohongshu", "切组来源小红书");
    const douyinB = await createAccount(page, groupB.id, "douyin", "切组目标抖音");
    const jobA = await createJob(page, groupA.id, "来源组小红书计划", xhsA.id);
    const sharedA = await createJob(page, groupA.id, "来源组共享选题");
    const jobB = await createJob(page, groupB.id, "目标组抖音计划", douyinB.id);

    await openGroup(page, baseURL, groupA.id);
    await expect(page.locator('[data-slot="automations-list"] li[data-job-id]')).toHaveCount(2);
    await expect.poll(() => visibleJobIds(page)).toEqual(expect.arrayContaining([jobA.id, sharedA.id]));

    await selectGroupFromSidebar(page, groupB.id);
    await expect(page.getByTestId("automations-current-group")).toContainText(groupB.name);
    await expect.poll(() => visibleJobIds(page)).toEqual([jobB.id]);
    await expect(page.locator(`[data-slot="automations-list"] li[data-job-id="${jobA.id}"]`)).toHaveCount(0);

    await selectGroupFromSidebar(page, groupA.id);
    await expect(page.getByTestId("automations-current-group")).toContainText(groupA.name);
    await expect(page.locator('[data-slot="automations-list"] li[data-job-id]')).toHaveCount(2);
    expect(new Set(await visibleJobIds(page))).toEqual(new Set([jobA.id, sharedA.id]));

    for (const [groupId, expected] of [[groupA.id, [jobA, sharedA]], [groupB.id, [jobB]]] as const) {
      const current = await dispatch<Job[]>(page, "scheduledJobs.list", {
        query: { page: 1, pageSize: 100 },
      }, { groupId });
      expect(new Set(current.map((job) => job.id))).toEqual(new Set(expected.map((job) => job.id)));
      for (const original of expected) {
        const reread = current.find((job) => job.id === original.id);
        expect(reread?.schedule).toBe(original.schedule);
        expect(reread?.accountId).toBe(original.accountId);
        expect(reread?.groupId).toBe(groupId);
      }
    }
  });

  test("归档账号的历史作业仍可读，按账号筛选会标明归档状态", async ({ page, baseURL }) => {
    await page.goto("/");
    const group = await createGroup(page, fresh("归档历史组"));
    const archived = await createAccount(page, group.id, "xiaohongshu", "归档小红书");
    const history = await createJob(page, group.id, "归档账号历史作品同步", archived.id);
    const archiveResult = await dispatch<Account>(page, "accounts.archive", {
      params: { accountId: archived.id },
    }, { groupId: group.id, accountId: archived.id });
    expect(archiveResult.status).toBe("archived");

    await openGroup(page, baseURL, group.id);
    await expect(page.locator(`[data-slot="automations-list"] li[data-job-id="${history.id}"]`)).toBeVisible();
    await page.getByLabel("筛选平台账号").selectOption(archived.id);
    await expect(page.locator(`[data-slot="automations-list"] li[data-job-id="${history.id}"]`)).toBeVisible();
    await expect(page.getByLabel("筛选平台账号").locator(`option[value="${archived.id}"]`)).toContainText("已归档");
    await expect(page.getByRole("list", { name: "组内账号计划状态" }).locator("li").filter({ hasText: archived.accountHandle })).toContainText("已归档，保留历史任务");
  });

  test("没有作业的账号组显示真实无计划空态和账号入口", async ({ page, baseURL }) => {
    await page.goto("/");
    const group = await createGroup(page, fresh("无计划空态组"));
    const account = await createAccount(page, group.id, "xiaohongshu", "尚无计划小红书");

    const jobs = await dispatch<Job[]>(page, "scheduledJobs.list", {
      query: { page: 1, pageSize: 100 },
    }, { groupId: group.id });
    expect(jobs).toEqual([]);

    await openGroup(page, baseURL, group.id);
    await expect(page.locator('[data-slot="automations-empty"]')).toBeVisible();
    await expect(page.getByRole("list", { name: "组内账号计划状态" }).locator("li").filter({ hasText: account.accountHandle })).toContainText("尚未建立采集计划");
    await expect(page.locator('[data-slot="automations-list"] li[data-job-id]')).toHaveCount(0);
  });
});
