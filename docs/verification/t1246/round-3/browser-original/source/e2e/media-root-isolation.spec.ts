import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, relative, resolve } from "node:path";
import type { Page } from "@playwright/test";
import { ENDPOINTS, ErrorCode } from "@creatoros/contract";
import { expect as baseExpect, test } from "../helpers/test-environment";

const expect = baseExpect.configure({ timeout: 120_000 });
const GROUP_COOKIE = "creatoros_current_group";
const GROUP_STORAGE_KEY = "creatoros:current-group";
const ACCOUNT_COOKIE = "creatoros_current_account";
const ACCOUNT_STORAGE_KEY = "creatoros:current-account";

type Envelope<T> = { data: T; meta?: { total?: number } };

async function dispatch<T>(
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

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertContained(root: string, file: string): void {
  const relativePath = relative(root, file);
  expect(relativePath).not.toBe("");
  expect(isAbsolute(relativePath)).toBe(false);
  expect(relativePath).not.toBe("..");
  expect(relativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)).toBe(false);
}

async function selectGroup(
  page: Page,
  context: import("@playwright/test").BrowserContext,
  baseURL: string,
  groupId: string,
): Promise<void> {
  await context.addCookies([
    { name: GROUP_COOKIE, value: encodeURIComponent(groupId), url: baseURL },
  ]);
  await page.evaluate(({ groupKey, group, accountKey }) => {
    localStorage.setItem(groupKey, group);
    localStorage.removeItem(accountKey);
  }, { groupKey: GROUP_STORAGE_KEY, group: groupId, accountKey: ACCOUNT_STORAGE_KEY });
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), GROUP_STORAGE_KEY), { timeout: 300000 }).toBe(groupId);
  const cookies = await context.cookies(baseURL);
  expect(cookies.find((cookie) => cookie.name === GROUP_COOKIE)?.value).toBe(encodeURIComponent(groupId));
  expect(cookies.find((cookie) => cookie.name === ACCOUNT_COOKIE)).toBeUndefined();
}

async function assertGroupSelection(
  page: Page,
  context: import("@playwright/test").BrowserContext,
  baseURL: string,
  groupId: string,
): Promise<void> {
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), GROUP_STORAGE_KEY), { timeout: 300000 }).toBe(groupId);
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), ACCOUNT_STORAGE_KEY), { timeout: 300000 }).toBeNull();
  const cookies = await context.cookies(baseURL);
  expect(cookies.find((cookie) => cookie.name === GROUP_COOKIE)?.value).toBe(encodeURIComponent(groupId));
  expect(cookies.find((cookie) => cookie.name === ACCOUNT_COOKIE)).toBeUndefined();
}

test("T-1226 上传、公开下载与错组拒绝都使用本轮隔离媒体根", async ({ page, context, baseURL }, info) => {
  test.setTimeout(Math.max((4_200_000), 45660000));
  page.setDefaultTimeout(120_000);
  page.setDefaultNavigationTimeout(120_000);
  expect(baseURL).toBeTruthy();

  const dataRootValue = process.env.CREATOROS_PLAYWRIGHT_DATA_ROOT;
  const configuredMediaRoot = process.env.CREATOROS_MEDIA_ROOT;
  expect(dataRootValue, "Playwright 必须向 worker 传入本轮隔离数据根").toBeTruthy();
  expect(configuredMediaRoot, "Playwright 必须覆盖继承的真实媒体根").toBeTruthy();
  const dataRoot = resolve(dataRootValue!);
  const expectedRoot = resolve(dataRoot, "media");
  expect(resolve(configuredMediaRoot!)).toBe(expectedRoot);
  // 本测试只在 config 用 mkdtemp 建立的临时根下操作，不接受用户主目录或仓库目录。
  expect(relative(resolve(tmpdir()), dataRoot).startsWith(".."), "隔离数据根必须位于系统临时目录").toBe(false);
  expect(dataRoot).not.toBe(resolve(homedir()));
  expect(dataRoot.split(/[\\/]/).at(-1)).toMatch(/^creatoros-playwright-/);

  const suffix = crypto.randomUUID();
  const groupA = ENDPOINTS.createAccountGroup.response.parse((await dispatch<unknown>(page, "accountGroups.create", {
    body: { name: `T1226媒体隔离甲组-${suffix}`, idempotencyKey: crypto.randomUUID() },
  })).data);
  const groupB = ENDPOINTS.createAccountGroup.response.parse((await dispatch<unknown>(page, "accountGroups.create", {
    body: { name: `T1226媒体隔离乙组-${suffix}`, idempotencyKey: crypto.randomUUID() },
  })).data);
  expect(groupA.id).not.toBe(groupB.id);

  await context.addCookies([
    { name: GROUP_COOKIE, value: encodeURIComponent(groupA.id), url: baseURL! },
  ]);
  await page.addInitScript(({ groupKey, group, accountKey }) => {
    if (!localStorage.getItem(groupKey)) {
      localStorage.setItem(groupKey, group);
      localStorage.removeItem(accountKey);
    }
  }, { groupKey: GROUP_STORAGE_KEY, group: groupA.id, accountKey: ACCOUNT_STORAGE_KEY });
  await page.goto("/assets", { waitUntil: "domcontentloaded", timeout: 120_000 });
  await assertGroupSelection(page, context, baseURL!, groupA.id);
  await expect(page.getByTestId("assets-gallery-empty")).toBeVisible();
  const storage = ENDPOINTS.getStorage.response.parse((await dispatch<unknown>(page, "settings.storage.get", {}, groupA.id)).data);
  expect(storage.backend).toBe("local");
  expect(resolve(storage.rootPath)).toBe(expectedRoot);
  assertContained(dataRoot, expectedRoot);

  const bytes = await readFile(resolve(process.cwd(), "public/douyin-icon.png"));
  const expectedSha256 = sha256(bytes);
  const fileName = `t1226-${suffix}.png`;
  const started = ENDPOINTS.createUpload.response.parse((await dispatch<unknown>(page, "assets.uploads.create", {
    body: { assetType: "image", mimeType: "image/png", fileSize: bytes.length, fileName },
  }, groupA.id)).data);
  const put = await page.request.put(started.uploadUrl, {
    timeout: 120_000,
    headers: { "content-type": "image/png" },
    data: bytes,
  });
  expect(put.status(), `真实上传 PUT: ${await put.text()}`).toBe(200);
  const uploaded = ENDPOINTS.completeUpload.response.parse((await dispatch<unknown>(page, "assets.uploads.complete", {
    params: { uploadId: started.uploadId },
    body: { name: fileName },
  }, groupA.id)).data);
  expect(uploaded).toMatchObject({ id: started.assetId, name: fileName, currentFileId: expect.any(String) });

  const listed = await dispatch<unknown[]>(page, "assets.list", { query: { page: 1, pageSize: 100 } }, groupA.id);
  const listedAsset = listed.data.map((item) => ENDPOINTS.getAsset.response.parse(item)).find((item) => item.id === uploaded.id);
  expect(listedAsset).toMatchObject({ id: uploaded.id, name: fileName, currentFileId: uploaded.currentFileId });
  const readBack = ENDPOINTS.getAsset.response.parse((await dispatch<unknown>(page, "assets.get", {
    params: { assetId: uploaded.id },
  }, groupA.id)).data);
  expect(readBack).toMatchObject({ id: uploaded.id, name: fileName, currentFileId: uploaded.currentFileId });

  await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
  await expect(page.getByText(fileName, { exact: true })).toBeVisible();
  await expect(page.getByTestId("assets-gallery-empty")).toHaveCount(0);

  // Root was first validated from the public settings contract above. Read only this upload's key.
  const physicalPath = resolve(expectedRoot, started.storageKey);
  assertContained(expectedRoot, physicalPath);
  const storedBytes = await readFile(physicalPath);
  expect(sha256(storedBytes)).toBe(expectedSha256);

  const download = ENDPOINTS.getDownloadUrl.response.parse((await dispatch<unknown>(page, "assets.downloadUrl", {
    params: { assetId: uploaded.id },
  }, groupA.id)).data);
  const downloaded = await page.request.get(download.url, { timeout: 120_000 });
  expect(downloaded.status(), `真实下载 URL: ${await downloaded.text()}`).toBe(200);
  expect(sha256(await downloaded.body())).toBe(expectedSha256);

  const forgedUrl = new URL(download.url, baseURL);
  forgedUrl.searchParams.set("token", "t1226-forged-token");
  const forged = await page.request.get(forgedUrl.toString(), { timeout: 120_000 });
  expect(forged.status()).toBe(403);
  const forgedBody = await forged.json() as { error?: string };
  expect(forgedBody.error).toMatch(/^blob token rejected:/);

  await page.screenshot({ path: info.outputPath("group-a-uploaded-asset.png"), fullPage: true , timeout: 120000});
  await selectGroup(page, context, baseURL!, groupB.id);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
  await assertGroupSelection(page, context, baseURL!, groupB.id);
  await expect(page.getByTestId("assets-gallery-empty")).toBeVisible();
  await expect(page.getByText(fileName, { exact: true })).toHaveCount(0);
  const groupBList = await dispatch<unknown[]>(page, "assets.list", { query: { page: 1, pageSize: 100 } }, groupB.id);
  expect(groupBList.data.some((item) => (item as { id?: string }).id === uploaded.id)).toBe(false);
  const wrongGroup = await page.request.post("/api/v1/dispatch", {
    timeout: 120_000,
    headers: { "content-type": "application/json", "x-group-id": groupB.id },
    data: { id: "assets.get", input: { params: { assetId: uploaded.id } } },
  });
  expect(wrongGroup.status()).toBe(404);
  const wrongGroupBody = await wrongGroup.json() as { error?: { code?: string } };
  expect(wrongGroupBody.error?.code).toBe(ErrorCode.OwnershipError);

  const wrongScope = await page.request.get(download.url, { timeout: 120_000 });
  expect(wrongScope.status()).toBe(403);
  expect(await wrongScope.json()).toEqual({ error: "文件凭证属于其他账号组" });
  await page.screenshot({ path: info.outputPath("group-b-cannot-see-group-a-asset.png"), fullPage: true , timeout: 120000});
  await info.attach("T1226隔离媒体根与公开链路回读", {
    contentType: "application/json",
    body: JSON.stringify({
      dataRoot,
      expectedRoot,
      storageRoot: storage.rootPath,
      groupA: groupA.id,
      groupB: groupB.id,
      assetId: uploaded.id,
      fileId: uploaded.currentFileId,
      storageKey: started.storageKey,
      fileName,
      expectedSha256,
      storedSha256: sha256(storedBytes),
      downloadedSha256: sha256(await downloaded.body()),
      forgedToken: { status: forged.status(), error: forgedBody.error },
      wrongGroupRead: { status: wrongGroup.status(), code: wrongGroupBody.error?.code },
      wrongGroupBlob: { status: wrongScope.status(), body: await wrongScope.json() },
    }, null, 2),
  });
});

// T-1246 copied-source declaration: original assertions unchanged.
test.describe.configure({ timeout: 45660000 });
