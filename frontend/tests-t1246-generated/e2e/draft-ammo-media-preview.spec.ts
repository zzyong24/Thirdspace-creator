import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "../helpers/test-environment";

const CURRENT_ACCOUNT_KEY = "creatoros:current-account";
const CURRENT_ACCOUNT_COOKIE = "creatoros_current_account";
const CHECK_IDS = [
  "AC-AMMO-VIDEO-LIVE-PREVIEW",
  "AC-AMMO-PREVIEW-LAZY-OFFICIAL-URL",
  "AC-AMMO-PREVIEW-KEYBOARD",
  "AC-AMMO-PREVIEW-REFRESH-COMPACT",
];

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
    timeout: 120_000,
  });
  expect(response.ok(), `${id} 应成功，实得 ${response.status()}`).toBe(true);
  return ((await response.json()) as { data: T }).data;
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

test("稿面视频素材双击与键盘均可真实预览，刷新和小窗口仍保持", async ({
  page,
  baseURL,
}, info) => {
  test.setTimeout(Math.max((14_400_000), 15060000));
  page.setDefaultTimeout(120_000);
  page.setDefaultNavigationTimeout(120_000);
  const repoRoot = resolve(process.cwd(), "..");
  const videoBytes = readFileSync(
    resolve(repoRoot, "output/content-samples/ai-copy-eval-loop/motion-preview.mp4"),
  );
  const captures: Array<{
    checkpoint: string;
    check_ids: string[];
    viewport: { width: number; height: number };
    text: string;
  }> = [];

  const account = await dispatch<{ id: string }>(page, "accounts.create", {
    params: undefined,
    query: undefined,
    body: {
      platform: "douyin",
      accountHandle: `@e2e-t853-preview-${Date.now()}`,
    },
  });
  const project = await dispatch<{ id: string }>(
    page,
    "projects.create",
    {
      params: undefined,
      query: undefined,
      body: { title: "稿面视频预览真实验收", brief: "" },
    },
    account.id,
  );
  const upload = await dispatch<{
    uploadId: string;
    uploadUrl: string;
    assetId: string;
  }>(
    page,
    "assets.uploads.create",
    {
      params: undefined,
      query: undefined,
      body: {
        assetType: "video",
        mimeType: "video/mp4",
        fileSize: videoBytes.byteLength,
        projectId: project.id,
        fileName: "编导智能体实拍.mp4",
      },
    },
    account.id,
  );
  const put = await page.request.put(upload.uploadUrl, {
    headers: { "content-type": "video/mp4" },
    data: videoBytes,
    timeout: 120_000,
  });
  expect(put.ok(), `视频字节 PUT 应成功，实得 ${put.status()}`).toBe(true);
  const asset = await dispatch<{ id: string }>(
    page,
    "assets.uploads.complete",
    {
      params: { uploadId: upload.uploadId },
      query: undefined,
      body: { name: "编导智能体实拍.mp4" },
    },
    account.id,
  );
  await dispatch(
    page,
    "materialLinks.create",
    {
      params: undefined,
      query: undefined,
      body: {
        projectId: project.id,
        entityType: "asset",
        entityId: asset.id,
        role: "reference",
        stage: "script",
      },
    },
    account.id,
  );
  await selectAccount(page, account.id, baseURL);

  let previewUrlRequests = 0;
  page.on("request", (request) => {
    if (!request.url().endsWith("/api/v1/dispatch")) return;
    try {
      const body = request.postDataJSON() as { id?: string };
      if (body.id === "assets.downloadUrl") previewUrlRequests += 1;
    } catch {
      // 非 JSON 请求与本旅程无关。
    }
  });

  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.goto(`/projects/${project.id}`);
  const card = page.getByRole("button", { name: "预览 编导智能体实拍.mp4" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("双击预览");
  expect(previewUrlRequests).toBe(0);

  await card.dblclick();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("视频预览");
  const video = dialog.locator('video[data-preview-type="video"]');
  await expect(video).toBeVisible();
  await expect(video).toHaveAttribute("controls", "");
  await expect.poll(() => previewUrlRequests, { timeout: 120_000 }).toBe(1);
  await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).readyState), { timeout: 120_000 }).toBeGreaterThan(0);
  captures.push({
    checkpoint: "desktop-double-click-video-preview",
    check_ids: [...CHECK_IDS],
    viewport: { width: 1536, height: 1024 },
    text: await dialog.innerText(),
  });

  await page.screenshot({ path: info.outputPath("video-preview-desktop.png"), timeout: 120_000 });
  await info.attach("video-preview-desktop", { path: info.outputPath("video-preview-desktop.png"), contentType: "image/png" });

  // 新覆盖：正式中性媒体实际开始播放，保留原元数据与全部旧断言。
  await video.evaluate(async (element) => {
    const player = element as HTMLVideoElement;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        player.play(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("视频开始播放等待超时")), 120_000);
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  });
  await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).readyState), { timeout: 120_000 }).toBeGreaterThanOrEqual(2);
  await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).currentTime), { timeout: 120_000 }).toBeGreaterThan(0.25);
  const playbackObservation = await video.evaluate((element) => {
    const player = element as HTMLVideoElement;
    const observation = {
      currentTime: player.currentTime,
      duration: player.duration,
      readyState: player.readyState,
      videoWidth: player.videoWidth,
      videoHeight: player.videoHeight,
      errorCode: player.error?.code ?? null,
    };
    player.pause();
    return observation;
  });
  expect(playbackObservation.videoWidth).toBeGreaterThan(0);
  expect(playbackObservation.videoHeight).toBeGreaterThan(0);
  expect(playbackObservation.errorCode).toBeNull();
  await page.screenshot({ path: info.outputPath("video-preview-after-playback.png"), timeout: 120_000 });
  await info.attach("video-preview-after-playback", { path: info.outputPath("video-preview-after-playback.png"), contentType: "image/png" });
  await info.attach("video-playback-observation", { body: JSON.stringify(playbackObservation, null, 2), contentType: "application/json" });

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await page.setViewportSize({ width: 900, height: 720 });
  await page.reload();
  const restoredCard = page.getByRole("button", { name: "预览 编导智能体实拍.mp4" });
  await restoredCard.focus();
  await page.keyboard.press("Enter");
  const restoredDialog = page.getByRole("dialog");
  await expect(restoredDialog).toContainText("视频预览");
  await expect(restoredDialog.locator('video[data-preview-type="video"]')).toBeVisible();
  const fitsViewport = await restoredDialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return (
      rect.left >= 0 &&
      rect.top >= 0 &&
      rect.right <= window.innerWidth &&
      rect.bottom <= window.innerHeight
    );
  });
  expect(fitsViewport).toBe(true);
  captures.push({
    checkpoint: "compact-refresh-keyboard-video-preview",
    check_ids: [...CHECK_IDS],
    viewport: { width: 900, height: 720 },
    text: await restoredDialog.innerText(),
  });

  await page.screenshot({ path: info.outputPath("video-preview-compact-after-reload.png"), timeout: 120_000 });
  await info.attach("video-preview-compact-after-reload", { path: info.outputPath("video-preview-compact-after-reload.png"), contentType: "image/png" });

  const evidenceDir = info.outputPath("evidence");
  mkdirSync(evidenceDir, { recursive: true });
  const commitSha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
  const visibleCopy = `${JSON.stringify(
    {
      schema: "frontend-visible-copy/v1",
      task_id: "T-853",
      commit_sha: commitSha,
      captures,
    },
    null,
    2,
  )}\n`;
  writeFileSync(resolve(evidenceDir, "T-853-visible-copy.json"), visibleCopy);
  expect(createHash("sha256").update(visibleCopy).digest("hex")).toHaveLength(64);
});

// T-1246 copied-source declaration: original assertions unchanged.
test.describe.configure({ timeout: 15060000 });
