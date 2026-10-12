import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { BrowserContext, Page, TestInfo } from "@playwright/test";
import { ENDPOINTS, ErrorCode } from "@creatoros/contract";
import { expect as baseExpect, test } from "../helpers/test-environment";

const expect = baseExpect.configure({ timeout: 120_000 });
const GROUP_COOKIE = "creatoros_current_group";
const GROUP_STORAGE_KEY = "creatoros:current-group";
const ACCOUNT_COOKIE = "creatoros_current_account";
const ACCOUNT_STORAGE_KEY = "creatoros:current-account";

type Envelope<T> = { data: T; meta?: { total?: number } };
type Asset = ReturnType<typeof ENDPOINTS.listAssets.response.parse>;
type UploadedFixture = {
  sourcePath: string;
  fileName: string;
  sha256: string;
  fileSize: number;
  uploadId: string;
  id: string;
  currentFileId: string;
};

const PNG_FIXTURES = [
  { path: "public/douyin-icon.png", originalName: "douyin-icon.png" },
  {
    path: "public/reference-editors/doocs-md/favicon.png",
    originalName: "doocs-favicon.png",
  },
  {
    path: "public/reference-editors/doocs-md/assets/images/logo.png",
    originalName: "doocs-logo.png",
  },
  {
    path: "public/reference-editors/doocs-md/assets/images/logo-2.png",
    originalName: "doocs-logo-2.png",
  },
] as const;

async function dispatchEnvelope<T>(
  page: Page,
  id: string,
  input: unknown,
  groupId?: string,
): Promise<Envelope<T>> {
  const response = await page.request.post("/api/v1/dispatch", {
    timeout: 120_000,
    headers: {
      "content-type": "application/json",
      ...(groupId ? { "x-group-id": groupId } : {}),
    },
    data: { id, input },
  });
  expect(response.ok(), `${id} 返回 ${response.status()}: ${await response.text()}`).toBe(true);
  return response.json();
}

async function dispatch<T>(page: Page, id: string, input: unknown, groupId?: string): Promise<T> {
  return (await dispatchEnvelope<T>(page, id, input, groupId)).data;
}

async function createGroup(page: Page, name: string) {
  const raw = await dispatch<unknown>(page, "accountGroups.create", {
    body: { name, idempotencyKey: randomUUID() },
  });
  return ENDPOINTS.createAccountGroup.response.parse(raw);
}

async function seedInitialGroup(
  page: Page,
  context: BrowserContext,
  baseURL: string,
  groupId: string,
): Promise<void> {
  await context.clearCookies({ name: ACCOUNT_COOKIE });
  await context.addCookies([
    { name: GROUP_COOKIE, value: encodeURIComponent(groupId), url: baseURL },
  ]);
  // Seed only the first page load; later group switches and reloads must retain their actual value.
  await page.addInitScript(({ groupKey, group, accountKey }) => {
    if (!localStorage.getItem(groupKey)) {
      localStorage.setItem(groupKey, group);
      localStorage.removeItem(accountKey);
    }
  }, { groupKey: GROUP_STORAGE_KEY, group: groupId, accountKey: ACCOUNT_STORAGE_KEY });
}

async function selectGroup(
  page: Page,
  context: BrowserContext,
  baseURL: string,
  groupId: string,
): Promise<void> {
  await context.clearCookies({ name: ACCOUNT_COOKIE });
  await context.addCookies([
    { name: GROUP_COOKIE, value: encodeURIComponent(groupId), url: baseURL },
  ]);
  await page.evaluate(({ groupKey, group, accountKey }) => {
    localStorage.setItem(groupKey, group);
    localStorage.removeItem(accountKey);
  }, { groupKey: GROUP_STORAGE_KEY, group: groupId, accountKey: ACCOUNT_STORAGE_KEY });
}

async function expectGroupSelection(
  page: Page,
  context: BrowserContext,
  baseURL: string,
  groupId: string,
): Promise<void> {
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), GROUP_STORAGE_KEY), { timeout: 300000 }).toBe(groupId);
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), ACCOUNT_STORAGE_KEY), { timeout: 300000 }).toBeNull();
  const cookies = await context.cookies(baseURL);
  expect(cookies.find((cookie) => cookie.name === GROUP_COOKIE)?.value).toBe(encodeURIComponent(groupId));
  expect(cookies.find((cookie) => cookie.name === ACCOUNT_COOKIE)).toBeUndefined();
}

async function uploadFixture(
  page: Page,
  baseURL: string,
  groupId: string,
  testKey: string,
  index: number,
): Promise<UploadedFixture> {
  const fixture = PNG_FIXTURES[index];
  if (!fixture) throw new Error(`T-1225 缺少第 ${index} 个既有 PNG 夹具`);
  const sourcePath = resolve(process.cwd(), fixture.path);
  const bytes = await readFile(sourcePath);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const fileName = `t1225-${testKey}-${index + 1}-${fixture.originalName}`;
  const startRaw = await dispatch<unknown>(page, "assets.uploads.create", {
    body: {
      assetType: "image",
      mimeType: "image/png",
      fileSize: bytes.length,
      fileName,
    },
  }, groupId);
  const started = ENDPOINTS.createUpload.response.parse(startRaw);
  const uploadUrl = new URL(started.uploadUrl, baseURL);
  expect(uploadUrl.origin, "真实上传地址必须留在本轮隔离的本地服务").toBe(new URL(baseURL).origin);
  const put = await page.request.put(uploadUrl.toString(), {
    timeout: 120_000,
    headers: { "content-type": "image/png" },
    data: bytes,
  });
  expect(put.status(), `素材真实 PUT ${fileName}: ${await put.text()}`).toBe(200);
  const completedRaw = await dispatch<unknown>(page, "assets.uploads.complete", {
    params: { uploadId: started.uploadId },
    body: { name: fileName },
  }, groupId);
  const completed = ENDPOINTS.completeUpload.response.parse(completedRaw);
  expect(completed).toMatchObject({
    id: started.assetId,
    name: fileName,
    currentFileId: expect.any(String),
  });
  return {
    sourcePath,
    fileName,
    sha256,
    fileSize: bytes.length,
    uploadId: started.uploadId,
    id: completed.id,
    currentFileId: completed.currentFileId,
  };
}

async function uploadFourFixtures(
  page: Page,
  baseURL: string,
  groupId: string,
  testKey: string,
): Promise<UploadedFixture[]> {
  const uploaded: UploadedFixture[] = [];
  for (let index = 0; index < PNG_FIXTURES.length; index += 1) {
    uploaded.push(await uploadFixture(page, baseURL, groupId, testKey, index));
  }
  expect(new Set(uploaded.map((item) => item.sha256)).size).toBe(PNG_FIXTURES.length);
  expect(new Set(uploaded.map((item) => item.id)).size).toBe(PNG_FIXTURES.length);
  return uploaded;
}

async function listAssets(page: Page, groupId: string): Promise<{ assets: Asset[]; total: number | undefined }> {
  const result = await dispatchEnvelope<unknown[]>(page, "assets.list", {
    query: { page: 1, pageSize: 100 },
  }, groupId);
  expect(Array.isArray(result.data)).toBe(true);
  const assets = result.data.map((asset) => ENDPOINTS.listAssets.response.parse(asset));
  return { assets, total: result.meta?.total };
}

async function getAsset(page: Page, groupId: string, assetId: string): Promise<Asset> {
  const raw = await dispatch<unknown>(page, "assets.get", {
    params: { assetId },
  }, groupId);
  return ENDPOINTS.getAsset.response.parse(raw);
}

async function expectPublicFixtureSet(
  page: Page,
  groupId: string,
  fixtures: UploadedFixture[],
): Promise<Asset[]> {
  const listed = await listAssets(page, groupId);
  if (listed.total !== undefined) expect(listed.total).toBe(fixtures.length);
  expect(listed.assets).toHaveLength(fixtures.length);
  expect(new Set(listed.assets.map((asset) => asset.id))).toEqual(new Set(fixtures.map((asset) => asset.id)));
  for (const fixture of fixtures) {
    const listedAsset = listed.assets.find((asset) => asset.id === fixture.id);
    expect(listedAsset).toMatchObject({
      id: fixture.id,
      name: fixture.fileName,
      currentFileId: fixture.currentFileId,
    });
    const readBack = await getAsset(page, groupId, fixture.id);
    expect(readBack).toMatchObject({
      id: fixture.id,
      name: fixture.fileName,
      currentFileId: fixture.currentFileId,
    });
  }
  return listed.assets;
}

async function visibleCardIds(page: Page): Promise<string[]> {
  return page.locator('[data-slot="asset-card"]').evaluateAll((cards) =>
    cards.map((card) => card.getAttribute("data-asset-id") ?? ""),
  );
}

async function captureViewport(page: Page, testInfo: TestInfo, fileName: string): Promise<void> {
  const path = testInfo.outputPath(fileName);
  await mkdir(dirname(path), { recursive: true });
  await page.screenshot({ path, fullPage: true, timeout: 120_000, animations: "disabled", caret: "hide" });
  await testInfo.attach(fileName, { path, contentType: "image/png" });
}

async function attachReadback(testInfo: TestInfo, name: string, evidence: unknown): Promise<void> {
  await testInfo.attach(name, {
    body: JSON.stringify(evidence, null, 2),
    contentType: "application/json",
  });
}

/**
 * E2E contract for the Assets Center page (Task 20).
 *
 *  - Direct visit to `/assets` renders the asset gallery with the
 *    canonical asset cards (image / video / audio / document).
 *  - The page-internal AssetTypeSidebar is distinct from the global
 *    Sidebar (different `data-slot`).
 *  - The TopHeader is in `global` mode with page title "素材中心"
 *    and the Sidebar marks Assets as the active nav item.
 *  - The global Sidebar uses the approved `storage` contextual-card
 *    variant (D-003).
 *  - Clicking a different card updates the fixed right-side detail
 *    panel's `data-asset-id` slot. The detail panel is NOT a dialog.
 *  - The StorageUsageCard is rendered below the gallery.
 */

test.describe("Assets Center page", () => {
  test("renders the assets gallery with toolbar, type sidebar, and detail panel", async ({
    page,
    context,
    baseURL,
  }, testInfo) => {
    // 18 explicit 120s public/upload consumers (36m), initial navigation (2m),
    // UI/selector observations (up to 60m), screenshots and service setup/teardown margin.
    test.setTimeout(Math.max((6_600_000), 103260000));
    page.setDefaultTimeout(120_000);
    page.setDefaultNavigationTimeout(120_000);
    context.setDefaultTimeout(120_000);
    expect(baseURL).toBeTruthy();

    const testKey = randomUUID();
    const group = await createGroup(page, `T1225 画廊甲组 ${testKey}`);
    await seedInitialGroup(page, context, baseURL!, group.id);
    const fixtures = await uploadFourFixtures(page, baseURL!, group.id, testKey);
    const publicAssets = await expectPublicFixtureSet(page, group.id, fixtures);

    await page.goto("/assets", { waitUntil: "domcontentloaded", timeout: 120_000 });
    await expectGroupSelection(page, context, baseURL!, group.id);

    // Header in global mode with the page title.
    const header = page.locator('[data-slot="app-top-header"]');
    await expect(header).toHaveAttribute("data-mode", "global");
    const heading = page.locator('[data-slot="header-page-heading"]');
    await expect(heading).toContainText("素材中心");

    // The Assets nav item is the active page in the sidebar.
    const nav = page.getByRole("navigation", { name: "主要导航" });
    const active = nav.locator('[aria-current="page"]');
    await expect(active).toHaveAttribute("href", "/assets");

    // Global Sidebar uses the approved storage contextual-card
    // variant (D-003).
    const storageCard = page.locator(
      '[data-slot="sidebar-contextual-card"][data-variant="storage"]',
    );
    await expect(storageCard).toBeVisible();

    // Single AppShell with one Sidebar/TopHeader.
    await expect(page.locator('[data-slot="app-shell"]')).toHaveCount(1);
    await expect(page.locator('[data-slot="app-sidebar"]')).toHaveCount(1);
    await expect(page.locator('[data-slot="app-top-header"]')).toHaveCount(1);

    // The page-internal AssetTypeSidebar is rendered INSIDE the page
    // content region with a distinct `data-slot` so it can never be
    // confused with the global Sidebar (page-specs §12).
    const typeSidebar = page.locator(
      '[data-slot="asset-type-sidebar"]',
    );
    await expect(typeSidebar).toBeVisible();
    expect(
      await typeSidebar.evaluate((el) =>
        el.closest('[data-slot="app-sidebar"]') !== null,
      ),
    ).toBe(false);
    // And it carries its own type rows.
    const typeRows = typeSidebar.locator(
      '[data-asset-type]',
    );
    expect(await typeRows.count()).toBeGreaterThanOrEqual(2);

    // Asset toolbar with search, filter and upload affordances.
    await expect(page.locator('[data-slot="asset-toolbar"]')).toBeVisible();
    await expect(
      page.locator('input[type="search"]').first(),
    ).toBeVisible();

    // Asset gallery: three-column grid.
    const grid = page.locator('[data-slot="asset-card-grid"]');
    await expect(grid).toBeVisible();
    const cards = grid.locator('[data-slot="asset-card"]');
    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThanOrEqual(4);
    const cardIds = await visibleCardIds(page);
    expect(new Set(cardIds)).toEqual(new Set(fixtures.map((fixture) => fixture.id)));
    for (const fixture of fixtures) {
      const card = page.locator(`[data-slot="asset-card"][data-asset-id="${fixture.id}"]`);
      await expect(card).toBeVisible();
      await expect(card).toContainText(fixture.fileName);
    }

    // Detail panel is fixed right-rail (NOT a dialog).
    const panel = page.locator('[data-slot="asset-detail-panel"]:visible');
    await expect(panel).toBeVisible();
    expect(
      await panel.evaluate((el) => el.closest('[role="dialog"]') !== null),
    ).toBe(false);
    expect(fixtures.map((fixture) => fixture.id)).toContain(await panel.getAttribute("data-asset-id"));

    // Storage usage card is below the gallery.
    const storageUsage = page.locator('[data-slot="storage-usage-card"]');
    await expect(storageUsage).toBeVisible();

    await page.setViewportSize({ width: 1536, height: 1024 });
    await captureViewport(page, testInfo, "assets-gallery-1536x1024.png");
    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(grid).toBeVisible();
    await captureViewport(page, testInfo, "assets-gallery-1024x768.png");
    await page.setViewportSize({ width: 1536, height: 1024 });
    await attachReadback(testInfo, "T1225 画廊公共素材回读", {
      groupId: group.id,
      fixtures,
      publicAssets,
      cardIds,
      detailsAssetId: await panel.getAttribute("data-asset-id"),
    });
  });

  test("clicking a different card updates the AssetDetailPanel", async ({
    page,
    context,
    baseURL,
  }, testInfo) => {
    // 22 explicit 120s public/upload consumers (44m), three navigations (6m),
    // UI/selector observations (up to 70m), screenshots and service setup/teardown margin.
    test.setTimeout(Math.max((8_400_000), 103260000));
    page.setDefaultTimeout(120_000);
    page.setDefaultNavigationTimeout(120_000);
    context.setDefaultTimeout(120_000);
    expect(baseURL).toBeTruthy();

    const testKey = randomUUID();
    const groupA = await createGroup(page, `T1225 画廊甲组 ${testKey}`);
    const groupB = await createGroup(page, `T1225 空画廊乙组 ${testKey}`);
    expect(groupA.id).not.toBe(groupB.id);
    await seedInitialGroup(page, context, baseURL!, groupA.id);
    const fixtures = await uploadFourFixtures(page, baseURL!, groupA.id, testKey);
    const publicAssets = await expectPublicFixtureSet(page, groupA.id, fixtures);

    await page.goto("/assets", { waitUntil: "domcontentloaded", timeout: 120_000 });
    await expectGroupSelection(page, context, baseURL!, groupA.id);
    const panel = page.locator('[data-slot="asset-detail-panel"]:visible');
    await expect(panel).toBeVisible();
    const initialAssetId = await panel.getAttribute("data-asset-id");
    expect(initialAssetId).not.toBeNull();
    expect(fixtures.map((fixture) => fixture.id)).toContain(initialAssetId);

    // Click the first card whose asset-id differs from the initial one.
    const cards = page.locator('[data-slot="asset-card"]');
    const count = await cards.count();
    let clicked = false;
    let clickedAssetId: string | null = null;
    for (let i = 0; i < count; i += 1) {
      const id = await cards.nth(i).getAttribute("data-asset-id");
      if (id !== null && id !== initialAssetId) {
        await cards.nth(i).locator('[data-slot="asset-card-button"]').click();
        clicked = true;
        clickedAssetId = id;
        break;
      }
    }
    expect(clicked).toBe(true);

    await expect(panel).not.toHaveAttribute("data-asset-id", initialAssetId!);
    expect(fixtures.map((fixture) => fixture.id)).toContain(clickedAssetId);
    await expect(panel).toHaveAttribute("data-asset-id", clickedAssetId!);
    const selectedReadBack = await getAsset(page, groupA.id, clickedAssetId!);
    const selectedFixture = fixtures.find((fixture) => fixture.id === clickedAssetId);
    expect(selectedFixture).toBeDefined();
    expect(selectedReadBack).toMatchObject({
      id: selectedFixture!.id,
      name: selectedFixture!.fileName,
      currentFileId: selectedFixture!.currentFileId,
    });
    await page.setViewportSize({ width: 1536, height: 1024 });
    await captureViewport(page, testInfo, "assets-gallery-group-a-selected-1536x1024.png");

    await selectGroup(page, context, baseURL!, groupB.id);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
    await expectGroupSelection(page, context, baseURL!, groupB.id);
    await expect(page.getByTestId("assets-gallery-empty")).toBeVisible();
    await expect(page.locator('[data-slot="asset-card"]')).toHaveCount(0);
    for (const fixture of fixtures) {
      await expect(page.getByText(fixture.fileName, { exact: true })).toHaveCount(0);
    }
    const groupBList = await listAssets(page, groupB.id);
    if (groupBList.total !== undefined) expect(groupBList.total).toBe(0);
    expect(groupBList.assets).toEqual([]);

    const wrongGroupRead = await page.request.post("/api/v1/dispatch", {
      timeout: 120_000,
      headers: { "content-type": "application/json", "x-group-id": groupB.id },
      data: { id: "assets.get", input: { params: { assetId: fixtures[0]!.id } } },
    });
    expect(wrongGroupRead.status()).toBe(404);
    const wrongGroupBody = await wrongGroupRead.json() as { error?: { code?: string } };
    expect(wrongGroupBody.error?.code).toBe(ErrorCode.OwnershipError);
    await page.setViewportSize({ width: 1024, height: 768 });
    await captureViewport(page, testInfo, "assets-gallery-group-b-empty-1024x768.png");

    await selectGroup(page, context, baseURL!, groupA.id);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
    await expectGroupSelection(page, context, baseURL!, groupA.id);
    await expect(page.getByTestId("assets-gallery-empty")).toHaveCount(0);
    await expect(page.locator('[data-slot="asset-card-grid"]')).toBeVisible();
    await expect(page.locator('[data-slot="asset-card"]')).toHaveCount(fixtures.length);
    const restoredCardIds = await visibleCardIds(page);
    expect(new Set(restoredCardIds)).toEqual(new Set(fixtures.map((fixture) => fixture.id)));
    const restoredAssets = await listAssets(page, groupA.id);
    if (restoredAssets.total !== undefined) expect(restoredAssets.total).toBe(fixtures.length);
    expect(new Set(restoredAssets.assets.map((asset) => asset.id))).toEqual(new Set(fixtures.map((fixture) => fixture.id)));
    const restoredPanelId = await page.locator('[data-slot="asset-detail-panel"]:visible').getAttribute("data-asset-id");
    expect(fixtures.map((fixture) => fixture.id)).toContain(restoredPanelId);
    await page.setViewportSize({ width: 1536, height: 1024 });
    await captureViewport(page, testInfo, "assets-gallery-group-a-restored-1536x1024.png");
    await attachReadback(testInfo, "T1225 切组、错组与回归公共回读", {
      groupA: groupA.id,
      groupB: groupB.id,
      fixtures,
      groupAPublicAssets: publicAssets,
      selectedAssetId: clickedAssetId,
      selectedReadBack,
      groupBList: groupBList.assets,
      wrongGroupRead: { status: wrongGroupRead.status(), code: wrongGroupBody.error?.code },
      restoredCardIds,
      restoredAssets: restoredAssets.assets,
      restoredPanelId,
    });
  });

  test("真实空账号组显示零素材并能打开系统文件选择器", async ({
    page,
    context,
    baseURL,
  }, testInfo) => {
    // Four 120s public/navigation/file-chooser consumers plus rendering, screenshot, startup and cleanup margin.
    test.setTimeout(Math.max((2_400_000), 103260000));
    page.setDefaultTimeout(120_000);
    page.setDefaultNavigationTimeout(120_000);
    context.setDefaultTimeout(120_000);
    expect(baseURL).toBeTruthy();

    const testKey = randomUUID();
    const group = await createGroup(page, `T1225 真实空素材组 ${testKey}`);
    await seedInitialGroup(page, context, baseURL!, group.id);
    await page.goto("/assets", { waitUntil: "domcontentloaded", timeout: 120_000 });
    await expectGroupSelection(page, context, baseURL!, group.id);

    const listed = await listAssets(page, group.id);
    if (listed.total !== undefined) expect(listed.total).toBe(0);
    expect(listed.assets).toEqual([]);
    await expect(page.getByTestId("assets-gallery-empty")).toBeVisible();
    await expect(page.locator('[data-slot="asset-card"]')).toHaveCount(0);

    await page.setViewportSize({ width: 1536, height: 1024 });
    await captureViewport(page, testInfo, "assets-gallery-empty-1536x1024.png");
    const chooserPromise = page.waitForEvent("filechooser", { timeout: 120_000 });
    await page.locator('[data-slot="assets-upload-button"][aria-label="上传素材"]').click();
    const chooser = await chooserPromise;
    expect(await chooser.isMultiple()).toBe(false);
    // Dismiss the native chooser without selecting a file or starting an upload.
    await chooser.setFiles([]);
    await expect(page.getByTestId("assets-gallery-empty")).toBeVisible();
    await page.setViewportSize({ width: 1024, height: 768 });
    await captureViewport(page, testInfo, "assets-gallery-empty-1024x768.png");
    await attachReadback(testInfo, "T1225 真实空态公开列表", {
      groupId: group.id,
      total: listed.total,
      assets: listed.assets,
      fileChooserOpened: true,
      noUploadStarted: true,
    });
  });
});

// T-1246 copied-source declaration: original assertions unchanged.
test.describe.configure({ timeout: 103260000 });
