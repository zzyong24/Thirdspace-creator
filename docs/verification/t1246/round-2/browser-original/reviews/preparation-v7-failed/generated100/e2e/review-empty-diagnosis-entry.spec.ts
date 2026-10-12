import { randomUUID } from "node:crypto";
import type { Locator, Page, TestInfo } from "@playwright/test";
import { ENDPOINTS, listMeta, successMeta } from "@creatoros/contract";
import { expect as baseExpect, test } from "../helpers/test-environment";

const expect = baseExpect.configure({ timeout: 120_000 });
const REQUEST_TIMEOUT_MS = 120_000;
const TEST_TIMEOUT_MS = 86_400_000;
const PAGE_SIZE = 100;
const CURRENT_GROUP_KEY = "creatoros:current-group";
const CURRENT_GROUP_COOKIE = "creatoros_current_group";
const CURRENT_ACCOUNT_KEY = "creatoros:current-account";
const CURRENT_ACCOUNT_COOKIE = "creatoros_current_account";
const SCRIPT_TEXT =
  "第一段：先把一个复杂问题拆成几个可核对的步骤，再说明每一步的作用。\n\n" +
  "第二段：读者可以按自己的情况调整顺序，并记录哪些步骤仍需补充材料。";

type DispatchInput = {
  params?: unknown;
  query?: unknown;
  body?: unknown;
};
type DispatchEnvelope = { data: unknown; meta: unknown };
type ParseSchema<T> = { parse(value: unknown): T };
type Scope = { groupId?: string };

async function dispatchEnvelope(
  page: Page,
  id: string,
  input: DispatchInput,
  scope: Scope = {},
): Promise<DispatchEnvelope> {
  const response = await page.request.post("/api/v1/dispatch", {
    timeout: REQUEST_TIMEOUT_MS,
    headers: {
      "content-type": "application/json",
      ...(scope.groupId ? { "x-group-id": scope.groupId } : {}),
    },
    data: { id, input },
  });
  expect(response.ok(), `${id} 应成功，实际状态 ${response.status()}`).toBe(true);
  return (await response.json()) as DispatchEnvelope;
}

function parseSingle<T>(envelope: DispatchEnvelope, schema: ParseSchema<T>): T {
  successMeta.parse(envelope.meta);
  return schema.parse(envelope.data);
}

async function dispatchSingle<T>(
  page: Page,
  id: string,
  input: DispatchInput,
  schema: ParseSchema<T>,
  scope: Scope = {},
): Promise<T> {
  return parseSingle(await dispatchEnvelope(page, id, input, scope), schema);
}

async function dispatchList<T>(
  page: Page,
  id: string,
  input: DispatchInput,
  schema: ParseSchema<T>,
  scope: Scope,
): Promise<{ rows: T[]; meta: ReturnType<typeof listMeta.parse> }> {
  const envelope = await dispatchEnvelope(page, id, input, scope);
  if (!Array.isArray(envelope.data)) {
    throw new Error(`${id} 应返回数组 data，实际不是数组`);
  }
  const rows = envelope.data.map((row) => schema.parse(row));
  const meta = listMeta.parse(envelope.meta);
  expect(meta.page).toBe(1);
  expect(meta.pageSize).toBe(PAGE_SIZE);
  expect(meta.total).toBeGreaterThanOrEqual(rows.length);
  return { rows, meta };
}

async function selectIsolatedGroup(
  page: Page,
  groupId: string,
  baseURL: string | undefined,
) {
  await page.context().addCookies([
    {
      name: CURRENT_GROUP_COOKIE,
      value: encodeURIComponent(groupId),
      url: baseURL ?? "http://127.0.0.1",
    },
    {
      name: CURRENT_ACCOUNT_COOKIE,
      value: "",
      url: baseURL ?? "http://127.0.0.1",
    },
  ]);
  await page.addInitScript(
    ({ groupKey, accountKey, selectedGroup }) => {
      window.localStorage.setItem(groupKey, selectedGroup);
      window.localStorage.removeItem(accountKey);
    },
    {
      groupKey: CURRENT_GROUP_KEY,
      accountKey: CURRENT_ACCOUNT_KEY,
      selectedGroup: groupId,
    },
  );
}

async function expectGroupMirrors(page: Page, groupId: string) {
  await expect
    .poll(
      () => page.evaluate((key) => window.localStorage.getItem(key), CURRENT_GROUP_KEY),
      { timeout: REQUEST_TIMEOUT_MS },
    )
    .toBe(groupId);
  const cookies = await page.context().cookies();
  expect(cookies.find((cookie) => cookie.name === CURRENT_GROUP_COOKIE)?.value).toBe(
    encodeURIComponent(groupId),
  );
  expect([undefined, ""]).toContain(
    cookies.find((cookie) => cookie.name === CURRENT_ACCOUNT_COOKIE)?.value,
  );
  expect(
    await page.evaluate((key) => window.localStorage.getItem(key), CURRENT_ACCOUNT_KEY),
  ).toBeNull();
}

async function expectHonestReviewPage(page: Page, projectId: string) {
  const main = page.locator('main[data-page="analytics-review"]');
  await expect(main).toBeVisible();
  await expect(main).toHaveAttribute("data-project-id", projectId);
  await expect(main).toHaveAttribute("data-page-state", "empty");
  await expect(main.locator('[data-slot="page-state-loading"]')).toHaveCount(0);
  await expect(main.locator('[data-slot="page-state-error"]')).toHaveCount(0);

  const primary = main.locator('[data-slot="review-analyze-primary"]');
  await expect(primary).toBeVisible();
  await expect(primary).toBeEnabled();
  await expect(primary).toHaveText("帮我复盘");

  const emptyState = main.locator('[data-slot="current-period-learnings-empty"]');
  await expect(emptyState).toBeVisible();
  await expect(emptyState).toContainText("暂无可沉淀的效果经验，仍可诊断内容");
  await expect(main.locator('[data-slot="candidate-card"]')).toHaveCount(0);
  return { main, primary, emptyState };
}

async function captureVisibleElement(
  page: Page,
  locator: Locator,
  testInfo: TestInfo,
  name: string,
) {
  await locator.scrollIntoViewIfNeeded({ timeout: REQUEST_TIMEOUT_MS });
  await expect(locator).toBeInViewport({ ratio: 1 });
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  expect(box, `${name} 必须有实际页面几何`).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(-1);
  expect(box!.y).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height + 1);
  const documentWidth = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(documentWidth.scroll).toBeLessThanOrEqual(documentWidth.client + 1);

  const path = testInfo.outputPath(name);
  await page.screenshot({
    path,
    fullPage: false,
    animations: "disabled",
    caret: "hide",
    timeout: REQUEST_TIMEOUT_MS,
  });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

async function readSameProjectResources(
  page: Page,
  groupId: string,
  projectId: string,
  artifactId: string,
  versionId: string,
  expectedTitle: string,
) {
  const scope = { groupId };
  const project = await dispatchSingle(
    page,
    "projects.get",
    { params: { projectId } },
    ENDPOINTS.getProject.response,
    scope,
  );
  expect(project).toMatchObject({ id: projectId, title: expectedTitle });

  const artifacts = await dispatchList(
    page,
    "artifacts.list",
    { params: { projectId }, query: { page: 1, pageSize: PAGE_SIZE } },
    ENDPOINTS.listArtifacts.response,
    scope,
  );
  const artifact = artifacts.rows.find((item) => item.id === artifactId);
  if (!artifact) {
    throw new Error(`artifacts.list 未返回稿件 ${artifactId}`);
  }
  expect(artifact).toMatchObject({
    id: artifactId,
    projectId,
    artifactType: "output_script",
    stage: "script",
    currentVersionId: versionId,
  });

  const versions = await dispatchList(
    page,
    "artifacts.versions.list",
    {
      params: { artifactId },
      query: { page: 1, pageSize: PAGE_SIZE },
    },
    ENDPOINTS.listArtifactVersions.response,
    scope,
  );
  const version = versions.rows.find((item) => item.id === versionId);
  if (!version) {
    throw new Error(`artifacts.versions.list 未返回版本 ${versionId}`);
  }
  expect(version).toMatchObject({
    id: versionId,
    artifactId,
    contentText: SCRIPT_TEXT,
  });

  const analytics = await dispatchList(
    page,
    "analytics.projects.get",
    {
      params: { projectId },
      query: { page: 1, pageSize: PAGE_SIZE },
    },
    ENDPOINTS.getProjectAnalytics.response,
    scope,
  );
  expect(analytics.rows).toHaveLength(0);
  expect(analytics.meta.total).toBe(0);

  return {
    project: { id: project.id, title: project.title },
    artifact: {
      id: artifact.id,
      projectId: artifact.projectId,
      artifactType: artifact.artifactType,
      stage: artifact.stage,
      currentVersionId: artifact.currentVersionId,
    },
    version: {
      id: version.id,
      artifactId: version.artifactId,
      contentText: version.contentText,
    },
    analytics: {
      page: analytics.meta.page,
      pageSize: analytics.meta.pageSize,
      total: analytics.meta.total,
      rows: analytics.rows.length,
    },
  };
}

test.describe("T-1239 无指标项目复盘入口与诚实空态", () => {
  test("真实同组稿件在桌面、窄屏与刷新后显示内容诊断入口", async ({
    page,
    baseURL,
  }, testInfo) => {
    test.setTimeout(TEST_TIMEOUT_MS);
    page.setDefaultTimeout(REQUEST_TIMEOUT_MS);
    page.setDefaultNavigationTimeout(REQUEST_TIMEOUT_MS);

    const chatRequests: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/chat") {
        chatRequests.push(request.url());
      }
    });

    const group = await dispatchSingle(
      page,
      "accountGroups.create",
      {
        body: {
          name: `T1239无指标复盘-${randomUUID().slice(0, 8)}`,
          idempotencyKey: `t1239-group-${randomUUID()}`,
        },
      },
      ENDPOINTS.createAccountGroup.response,
    );
    const projectTitle = `T1239中性稿件-${randomUUID().slice(0, 8)}`;
    const project = await dispatchSingle(
      page,
      "projects.create",
      { body: { title: projectTitle, brief: "" } },
      ENDPOINTS.createProject.response,
      { groupId: group.id },
    );
    const artifact = await dispatchSingle(
      page,
      "artifacts.create",
      {
        params: { projectId: project.id },
        body: { title: "中性复盘验收稿", artifactType: "output_script", stage: "script" },
      },
      ENDPOINTS.createArtifact.response,
      { groupId: group.id },
    );
    const version = await dispatchSingle(
      page,
      "artifacts.versions.create",
      {
        params: { artifactId: artifact.id },
        body: {
          expectedCurrentVersionId: artifact.currentVersionId,
          contentText: SCRIPT_TEXT,
          changeSummary: "T-1239隔离页面验收稿",
        },
      },
      ENDPOINTS.createArtifactVersion.response,
      { groupId: group.id },
    );
    expect(project).toMatchObject({ id: project.id, title: projectTitle });
    expect(artifact).toMatchObject({
      projectId: project.id,
      artifactType: "output_script",
      stage: "script",
    });
    expect(version).toMatchObject({
      artifactId: artifact.id,
      contentText: SCRIPT_TEXT,
    });

    await selectIsolatedGroup(page, group.id, baseURL);
    const reviewPath = `/projects/${encodeURIComponent(project.id)}/review`;
    await page.setViewportSize({ width: 1536, height: 1024 });
    const initialResponse = await page.goto(reviewPath, { timeout: REQUEST_TIMEOUT_MS });
    expect(initialResponse).not.toBeNull();
    expect(initialResponse!.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe(reviewPath);
    await expectGroupMirrors(page, group.id);
    const desktop = await expectHonestReviewPage(page, project.id);

    const initialReadback = await readSameProjectResources(
      page,
      group.id,
      project.id,
      artifact.id,
      version.id,
      projectTitle,
    );
    await captureVisibleElement(page, desktop.primary, testInfo, "review-desktop-primary.png");
    await captureVisibleElement(page, desktop.emptyState, testInfo, "review-desktop-empty.png");

    await page.setViewportSize({ width: 390, height: 844 });
    const mobile = await expectHonestReviewPage(page, project.id);
    await captureVisibleElement(page, mobile.primary, testInfo, "review-mobile-primary.png");
    await captureVisibleElement(page, mobile.emptyState, testInfo, "review-mobile-empty.png");

    const reloadResponse = await page.reload({ timeout: REQUEST_TIMEOUT_MS });
    expect(reloadResponse).not.toBeNull();
    expect(reloadResponse!.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe(reviewPath);
    await expectGroupMirrors(page, group.id);
    const afterReload = await expectHonestReviewPage(page, project.id);
    const reloadReadback = await readSameProjectResources(
      page,
      group.id,
      project.id,
      artifact.id,
      version.id,
      projectTitle,
    );
    expect(reloadReadback).toEqual(initialReadback);
    await captureVisibleElement(page, afterReload.emptyState, testInfo, "review-mobile-after-reload.png");
    expect(chatRequests).toHaveLength(0);

    await testInfo.attach(
      "t1239-真实公开资源回读.json",
      {
        body: JSON.stringify(
          {
            groupId: group.id,
            projectId: project.id,
            artifactId: artifact.id,
            versionId: version.id,
            initialReadback,
            reloadReadback,
            chatRequestCount: chatRequests.length,
          },
          null,
          2,
        ),
        contentType: "application/json",
      },
    );
  });
});
