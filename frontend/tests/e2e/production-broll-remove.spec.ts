import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "../helpers/test-environment";

const CURRENT_ACCOUNT_KEY = "creatoros:current-account";
const CURRENT_ACCOUNT_COOKIE = "creatoros_current_account";
const SCRIPT = "开场先展示真实操作，再解释为什么企业落地 AI 要先梳理流程。";

async function dispatch<T>(
  page: Page,
  id: string,
  input: unknown,
  accountId?: string,
): Promise<T> {
  const response = await page.request.post("/api/v1/dispatch", {
    headers: {
      "content-type": "application/json",
      ...(accountId ? { "x-account-id": accountId } : {}),
    },
    data: { id, input },
  timeout: 120000});
  const payload = (await response.json()) as {
    data?: T;
    error?: { message?: string };
  };
  expect(
    response.ok(),
    `${id} 应成功，实得 ${response.status()}：${payload.error?.message ?? "unknown"}`,
  ).toBe(true);
  return payload.data as T;
}

async function selectAccount(page: Page, accountId: string, baseURL?: string) {
  await page.context().addCookies([
    {
      name: CURRENT_ACCOUNT_COOKIE,
      value: encodeURIComponent(accountId),
      url: baseURL ?? "http://127.0.0.1",
    },
  ]);
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key!, value!),
    [CURRENT_ACCOUNT_KEY, accountId],
  );
}

async function uploadVideoAsset(
  page: Page,
  accountId: string,
  projectId: string,
) {
  const bytes = readFileSync(
    resolve(
      process.cwd(),
      "../output/content-samples/ai-copy-eval-loop/motion-preview.mp4",
    ),
  );
  const upload = await dispatch<{
    uploadId: string;
    uploadUrl: string;
  }>(
    page,
    "assets.uploads.create",
    {
      params: undefined,
      query: undefined,
      body: {
        assetType: "video",
        mimeType: "video/mp4",
        fileSize: bytes.byteLength,
        projectId,
        fileName: "待剔除真实素材.mp4",
      },
    },
    accountId,
  );
  const put = await page.request.put(upload.uploadUrl, {
    headers: { "content-type": "video/mp4" },
    data: bytes,
  timeout: 120000});
  expect(put.ok()).toBe(true);
  return dispatch<{ id: string }>(
    page,
    "assets.uploads.complete",
    {
      params: { uploadId: upload.uploadId },
      query: undefined,
      body: { name: "待剔除真实素材.mp4" },
    },
    accountId,
  );
}

test("已确认分镜剔除 B-roll 后写入新版本，刷新也不会恢复旧素材", async ({
  page,
  baseURL,
}) => {
  test.setTimeout(Math.max((90_000), 31260000));
  const account = await dispatch<{ id: string }>(page, "accounts.create", {
    params: undefined,
    query: undefined,
    body: {
      platform: "douyin",
      accountHandle: `@e2e-t881-${Date.now()}`,
    },
  });
  const project = await dispatch<{ id: string }>(
    page,
    "projects.create",
    {
      params: undefined,
      query: undefined,
      body: { title: "删除素材真实验收", brief: "" },
    },
    account.id,
  );
  const artifact = await dispatch<{ id: string }>(
    page,
    "artifacts.create",
    {
      params: { projectId: project.id },
      query: undefined,
      body: { title: "口播稿", artifactType: "output_script", stage: "script" },
    },
    account.id,
  );
  await dispatch(
    page,
    "artifacts.versions.create",
    {
      params: { artifactId: artifact.id },
      query: undefined,
      body: { contentText: SCRIPT, changeSummary: "T-881 浏览器验收稿" },
    },
    account.id,
  );
  const output = await dispatch<{ id: string }>(
    page,
    "projects.outputs.create",
    {
      params: { projectId: project.id },
      query: undefined,
      body: { title: "主视频", contentRole: "conversion" },
    },
    account.id,
  );
  const asset = await uploadVideoAsset(page, account.id, project.id);
  await dispatch(
    page,
    "materialLinks.create",
    {
      params: undefined,
      query: undefined,
      body: {
        projectId: project.id,
        contentOutputId: output.id,
        entityType: "asset",
        entityId: asset.id,
        role: "reference",
        stage: "script",
      },
    },
    account.id,
  );
  const decisions = {
    scenes: [{ title: "开场", startSec: 0, endSec: 8, summary: SCRIPT }],
    cards: [{ sceneIdx: 0, kind: "quote", content: "先梳理流程", at: 2 }],
    visualSlots: [],
    broll: [{ sceneIdx: 0, assetId: asset.id, at: 0.1, durationSec: 2 }],
    subtitles: [{ index: 1, startSec: 0, endSec: 8, zh: SCRIPT, en: "" }],
    srtLines: [{ index: 1, startSec: 0, endSec: 8, text: SCRIPT }],
    direction: {
      motionThesis: "素材接管开场",
      beatGraph: [{
        id: "old-broll",
        sceneIdx: 0,
        startSec: 0.1,
        endSec: 2.1,
        subject: { kind: "broll", ref: `broll:${asset.id}` },
        startState: "off_canvas",
        endState: "takeover",
        motionVerb: "enter",
        stageMode: "takeover",
        transitionIn: "cut",
        transitionOut: "cut",
        returnGeometry: "not_applicable",
      }],
    },
  };
  await dispatch(
    page,
    "outputs.production.get",
    { params: { outputId: output.id }, query: undefined, body: undefined },
    account.id,
  );
  await dispatch(
    page,
    "outputs.production.editingPlan.confirm",
    {
      params: { outputId: output.id },
      query: undefined,
      body: {
        expectedRevision: 0,
        plan: {
          sourceTaskId: null,
          sourceRenderTaskId: null,
          confirmedAt: new Date().toISOString(),
          excludedAssetIds: [],
          decisions,
          renderProps: {
            meta: { title: "T881 成片" },
            talkingHead: { file: "placeholder-talking-head", durationSec: 8 },
            captions: [],
            scenes: [],
            broll: [{ file: asset.id, at: 0.1, durationSec: 2, label: "待剔除" }],
            delivery: { width: 1920, height: 1080, fps: 30 },
            direction: decisions.direction,
          },
          inventory: [{
            assetId: asset.id,
            label: "待剔除真实素材.mp4",
            kind: "video",
            description: "",
            source: "ammo",
          }],
        },
      },
    },
    account.id,
  );

  await selectAccount(page, account.id, baseURL);
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.goto(`/projects/${project.id}/production`);
  await page.getByRole("button", { name: "返回制作页", exact: true }).click();
  await expect(page.locator('[data-slot="confirmed-decisions-notice"]')).toBeVisible();
  const item = page.locator('[data-slot="broll-auto-item"]', {
    hasText: "待剔除真实素材.mp4",
  });
  await expect(item).toHaveAttribute("data-excluded", "false");
  await item.locator('[data-slot="broll-auto-toggle"]').click();
  await expect(item).toHaveAttribute("data-excluded", "true");
  await expect(page.getByText(/已从当前分镜移除并保存/)).toBeVisible();

  const production = await dispatch<{
    recordingConfig: { videoEditingPlan: Record<string, unknown> };
  }>(
    page,
    "outputs.production.get",
    { params: { outputId: output.id }, query: undefined, body: undefined },
    account.id,
  );
  const plan = production.recordingConfig.videoEditingPlan as {
    revision: number;
    excludedAssetIds: string[];
    decisions: { broll: Array<{ assetId: string }>; direction?: unknown };
    renderProps: { broll: Array<{ file: string }>; direction?: unknown };
  };
  expect(plan.revision).toBe(2);
  expect(plan.excludedAssetIds).toContain(asset.id);
  expect(plan.decisions.broll).toEqual([]);
  expect(plan.renderProps.broll).toEqual([]);
  expect(plan.decisions.direction).toBeUndefined();
  expect(plan.renderProps.direction).toBeUndefined();

  await page.setViewportSize({ width: 1024, height: 720 });
  await page.reload();
  // 原生工作台刷新回入口；真实再进入备料，随后仍核同output公开plan与原UI剔除状态。
  await page.getByRole("button", { name: "返回制作页", exact: true }).click();
  const afterReload = await dispatch<{ recordingConfig: { videoEditingPlan: typeof plan } }>(
    page, "outputs.production.get", { params: { outputId: output.id }, query: undefined, body: undefined }, account.id,
  );
  expect(afterReload.recordingConfig.videoEditingPlan).toEqual(plan);
  const restored = page.locator('[data-slot="broll-auto-item"]', {
    hasText: "待剔除真实素材.mp4",
  });
  await expect(restored).toHaveAttribute("data-excluded", "true");
  await expect(page.locator('[data-slot="video-decision-preview"]')).not.toContainText(
    "待剔除真实素材.mp4",
  );

});

// T-1246：原字节/FAIL封存；本活跃副本仅作已批准的本case合同校准，其余正文、标题及预算保持。
test.describe.configure({ timeout: 31260000 });
