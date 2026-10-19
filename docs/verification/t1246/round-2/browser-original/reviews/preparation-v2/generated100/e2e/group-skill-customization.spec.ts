import { createHash, randomUUID } from "node:crypto";
import type { BrowserContext, Locator, Page, Request, Route, TestInfo } from "@playwright/test";
import { ENDPOINTS, ErrorCode, type AccountGroupResource } from "@creatoros/contract";
import { expect as baseExpect, test } from "../helpers/test-environment";

const expect = baseExpect.configure({ timeout: 120_000 });
const GROUP_STORAGE_KEY = "creatoros:current-group";
const GROUP_COOKIE = "creatoros_current_group";
const ACCOUNT_STORAGE_KEY = "creatoros:current-account";
const ACCOUNT_COOKIE = "creatoros_current_account";
const SKILL_ID = "script.draft";

type DispatchEnvelope<T> = { data: T; meta?: unknown };
type PromptPutObservation = {
  groupId: string | null;
  accountId: string | null;
};

async function dispatch<T>(
  page: Page,
  operationId: string,
  input: unknown,
  groupId?: string,
): Promise<DispatchEnvelope<T>> {
  const response = await page.request.post("/api/v1/dispatch", {
    timeout: 120_000,
    headers: {
      "content-type": "application/json",
      ...(groupId ? { "x-group-id": groupId } : {}),
    },
    data: { id: operationId, input },
  });
  expect(
    response.ok(),
    `${operationId} 返回 ${response.status()}: ${await response.text()}`,
  ).toBe(true);
  return response.json();
}

async function selectGroupInUi(page: Page, groupId: string): Promise<void> {
  await page.getByTestId("account-switcher-trigger").click();
  const menu = page.getByTestId("account-switcher-menu");
  await expect(menu).toBeVisible();
  const item = menu.locator(
    `[data-testid="account-switcher-item"][data-group-id="${groupId}"]`,
  );
  await expect(item).toHaveCount(1);
  await expect(item).toHaveAttribute("data-selected", "false");
  await item.click();
}

async function readGroupMirrors(
  page: Page,
  context: BrowserContext,
  baseURL: string,
) {
  const [storage, cookies] = await Promise.all([
    page.evaluate((keys) => ({
      groupId: localStorage.getItem(keys.group),
      accountId: localStorage.getItem(keys.account),
    }), { group: GROUP_STORAGE_KEY, account: ACCOUNT_STORAGE_KEY }),
    context.cookies(baseURL),
  ]);
  return {
    groupId: storage.groupId,
    accountId: storage.accountId,
    groupCookie: cookies.find((cookie) => cookie.name === GROUP_COOKIE)?.value ?? null,
    accountCookie: cookies.find((cookie) => cookie.name === ACCOUNT_COOKIE)?.value ?? null,
  };
}

async function expectGroupMirrors(
  page: Page,
  context: BrowserContext,
  baseURL: string,
  groupId: string,
): Promise<void> {
  await expect.poll(() => readGroupMirrors(page, context, baseURL)).toEqual({
    groupId,
    accountId: null,
    groupCookie: encodeURIComponent(groupId),
    accountCookie: null,
  });
}

async function expectHomeWorkspace(page: Page, groupName?: string): Promise<void> {
  const filters = page.getByRole("region", {
    name: "账号组数据筛选",
    exact: true,
  });
  await expect(filters).toBeVisible();
  if (groupName) {
    await expect(filters.getByText(groupName, { exact: true })).toBeVisible();
  }
  await expect(page.getByTestId("workspace-initialization-loading")).toHaveCount(0);
}

async function selectedActiveGroupFromMenu(page: Page): Promise<string> {
  await page.getByTestId("account-switcher-trigger").click();
  const menu = page.getByTestId("account-switcher-menu");
  await expect(menu).toBeVisible();
  const selected = menu.locator(
    '[data-testid="account-switcher-item"][data-selected="true"]',
  );
  await expect(selected).toHaveCount(1);
  const groupId = await selected.getAttribute("data-group-id");
  expect(groupId, "菜单必须标出唯一真实的当前活动账号组").toBeTruthy();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  return groupId!;
}

async function captureViewport(
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<string> {
  const path = testInfo.outputPath(name);
  await page.screenshot({ path, animations: "disabled", caret: "hide" , timeout: 120000});
  await testInfo.attach(name, { path, contentType: "image/png" });
  return name;
}

test("空账号组通过设置页定制官方 Skill 的首写入口可用", async (
  { page, context, baseURL },
  testInfo,
) => {
  page.setDefaultTimeout(120_000);
  page.setDefaultNavigationTimeout(120_000);
  expect(baseURL).toBeTruthy();

  const promptPutRequests: PromptPutObservation[] = [];
  page.on("request", (request) => {
    if (request.method() !== "POST" || !request.url().endsWith("/api/v1/dispatch")) {
      return;
    }
    let body: { id?: unknown } | null = null;
    try {
      body = request.postDataJSON() as { id?: unknown } | null;
    } catch {
      return;
    }
    if (body?.id !== "settings.prompts.put") return;
    const headers = request.headers();
    promptPutRequests.push({
      groupId: headers["x-group-id"] ?? null,
      accountId: headers["x-account-id"] ?? null,
    });
  });

  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 120_000 });
  await expect(page.getByTestId("account-switcher")).toHaveAttribute(
    "data-state",
    "ready",
  );

  // These public groups are isolated test fixtures. No skill overlay is written here.
  const anchor = ENDPOINTS.createAccountGroup.response.parse(
    (
      await dispatch<unknown>(page, "accountGroups.create", {
        body: {
          name: "T1234 技能选择锚组",
          idempotencyKey: crypto.randomUUID(),
        },
      })
    ).data,
  );
  const groupA = ENDPOINTS.createAccountGroup.response.parse(
    (
      await dispatch<unknown>(page, "accountGroups.create", {
        body: {
          name: "T1234 空账号组 A",
          idempotencyKey: crypto.randomUUID(),
        },
      })
    ).data,
  );
  expect(anchor.id).not.toBe(groupA.id);
  expect(anchor.status).toBe("active");
  expect(groupA.status).toBe("active");
  expect(groupA.members).toEqual([]);

  const verifiedGroup = ENDPOINTS.getAccountGroup.response.parse(
    (
      await dispatch<unknown>(page, "accountGroups.get", {
        params: { groupId: groupA.id },
      })
    ).data,
  ) as AccountGroupResource;
  expect(verifiedGroup).toMatchObject({ id: groupA.id, status: "active", members: [] });

  await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
  await expect(page.getByTestId("account-switcher")).toHaveAttribute(
    "data-state",
    "ready",
  );
  await expectHomeWorkspace(page);

  const currentGroupId = await selectedActiveGroupFromMenu(page);
  const initialGroup=ENDPOINTS.getAccountGroup.response.parse((await dispatch<unknown>(page,"accountGroups.get",{params:{groupId:currentGroupId}})).data);
  expect(initialGroup.id).toBe(currentGroupId);expect(initialGroup.status).toBe("active");
  await expectGroupMirrors(page, context, baseURL!, currentGroupId);
  await expectHomeWorkspace(page, initialGroup!.name);

  if (currentGroupId !== anchor.id) {
    await selectGroupInUi(page, anchor.id);
    await expectGroupMirrors(page, context, baseURL!, anchor.id);
    await expectHomeWorkspace(page, anchor.name);
    expect(await selectedActiveGroupFromMenu(page)).toBe(anchor.id);
  }

  await selectGroupInUi(page, groupA.id);
  await expectGroupMirrors(page, context, baseURL!, groupA.id);
  await expectHomeWorkspace(page, groupA.name);
  expect(await selectedActiveGroupFromMenu(page)).toBe(groupA.id);

  await page.goto("/settings", {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
  const settingsDialog = page.locator('[data-slot="settings-dialog"]');
  await expect(settingsDialog).toBeVisible();
  await expectGroupMirrors(page, context, baseURL!, groupA.id);
  await settingsDialog.getByRole("tab", { name: "技能", exact: true }).click();
  const skillsPanel = page.locator(
    '[data-slot="settings-panel"][data-tab-id="skills"]',
  );
  await expect(skillsPanel).toBeVisible();

  const catalogEnvelope = await dispatch<unknown>(
    page,
    "settings.prompts.list",
    {},
    groupA.id,
  );
  const catalog = ENDPOINTS.listPrompts.response.parse(catalogEnvelope.data);
  const skill = catalog.find((row) => row.skillId === SKILL_ID);
  expect(skill, `${SKILL_ID} 必须来自真实官方目录`).toBeDefined();
  expect(skill).toMatchObject({
    skillId: SKILL_ID,
    groupId: groupA.id,
    accountId: null,
    rowRevision: null,
    overlay: null,
    compatibility: "compatible",
  });
  expect(skill!.baseVersion.length).toBeGreaterThan(0);
  expect(skill!.editableFields).toContain("system");

  const skillRow = skillsPanel.locator(
    `[data-slot="skill-row"][data-skill-id="${SKILL_ID}"]`,
  );
  await expect(skillRow).toHaveCount(1);
  await skillRow.getByRole("button").click();
  const detail = skillRow.locator('[data-slot="skill-detail"]');
  await expect(detail).toBeVisible();
  const systemInput = detail.getByRole("textbox", {
    name: /system 提示$/,
  });
  const saveButton = detail.getByRole("button", { name: "保存", exact: true });
  await expect(systemInput).toBeVisible();
  await systemInput.scrollIntoViewIfNeeded();

  const desktopScreenshot = await captureViewport(
    page,
    testInfo,
    "red-desktop-1536x1024.png",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await systemInput.scrollIntoViewIfNeeded();
  await expect(systemInput).toBeVisible();
  const mobileScreenshot = await captureViewport(
    page,
    testInfo,
    "red-mobile-390x844.png",
  );

  const inputEnabled = await systemInput.isEnabled();
  const saveEnabled = await saveButton.isEnabled();
  const redEvidence = {
    test: "T1234 空账号组 Skill 首写 UI RED",
    fixture: {
      anchorGroupId: anchor.id,
      targetGroupId: groupA.id,
      targetGroupStatus: groupA.status,
      targetGroupMemberCount: groupA.members.length,
    },
    selectedScope: {
      localStorageGroupId: groupA.id,
      localStorageAccountId: null,
      cookieGroupId: groupA.id,
      accountCookiePresent: false,
      catalogRequestGroupId: groupA.id,
      catalogRequestAccountId: null,
    },
    publicSkill: {
      skillId: skill!.skillId,
      groupId: skill!.groupId,
      accountId: skill!.accountId,
      baseVersion: skill!.baseVersion,
      editableFields: skill!.editableFields,
      rowRevision: skill!.rowRevision,
      overlayPresent: skill!.overlay !== null,
      compatibility: skill!.compatibility,
    },
    controls: { systemInputEnabled: inputEnabled, saveButtonEnabledBeforeEdit: saveEnabled },
    skillPutRequestCountBeforeExpectedRed: promptPutRequests.length,
    skillPutRequestScopes: promptPutRequests,
    screenshots: [desktopScreenshot, mobileScreenshot],
    note: "预期 RED 是真实 UI 控件禁用；未用后台 settings.prompts.put 写入。",
  };
  await testInfo.attach("T1234 首写 RED 真实 scope 与控件状态", {
    body: JSON.stringify(redEvidence, null, 2),
    contentType: "application/json",
  });
  expect(promptPutRequests, "采集首写 UI 状态期间不得后台或界面写入 Skill").toHaveLength(0);

  // Natural pre-fix failure: the public group scope and editableFields permit
  // this system field, while the current UI still gates all edits on accountId.
  await expect(systemInput).toBeEnabled();
});

type PromptResource = ReturnType<typeof ENDPOINTS.getPrompt.response.parse>;
type PromptVersionResource = ReturnType<
  typeof ENDPOINTS.listPromptVersions.response.parse
>[number];
type DispatchInput = {
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
};
type PromptPutRequestObservation = {
  groupId: string | null;
  accountId: string | null;
  expectedRevision: number | null;
  patchKeys: string[];
};

function requestDispatchId(request: Request): string | null {
  try {
    const body = request.postDataJSON() as { id?: unknown } | null;
    return typeof body?.id === "string" ? body.id : null;
  } catch {
    return null;
  }
}

function promptPutObservation(request: Request): PromptPutRequestObservation | null {
  if (requestDispatchId(request) !== "settings.prompts.put") return null;
  let parsed: unknown;
  try {
    parsed = request.postDataJSON();
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const body = parsed as { input?: { body?: { expectedRevision?: unknown; patch?: unknown } } };
  const input = body?.input?.body;
  if (!input || !input.patch || typeof input.patch !== "object") return null;
  const expectedRevision = input.expectedRevision;
  if (expectedRevision !== null && typeof expectedRevision !== "number") return null;
  const headers = request.headers();
  return {
    groupId: headers["x-group-id"] ?? null,
    accountId: headers["x-account-id"] ?? null,
    expectedRevision,
    patchKeys: Object.keys(input.patch as Record<string, unknown>).sort(),
  };
}

async function dispatchResponse(
  page: Page,
  operationId: string,
  input: DispatchInput,
  groupId?: string,
) {
  return page.request.post("/api/v1/dispatch", {
    timeout: 120_000,
    headers: {
      "content-type": "application/json",
      ...(groupId ? { "x-group-id": groupId } : {}),
    },
    data: { id: operationId, input },
  });
}

async function createGroup(
  page: Page,
  name: string,
): Promise<AccountGroupResource> {
  const result = await dispatch<unknown>(page, "accountGroups.create", {
    body: { name, idempotencyKey: randomUUID() },
  });
  return ENDPOINTS.createAccountGroup.response.parse(result.data);
}

async function selectGroupOnHome(
  page: Page,
  context: BrowserContext,
  baseURL: string,
  group: AccountGroupResource,
): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 120_000 });
  await expect(page.getByTestId("account-switcher")).toHaveAttribute(
    "data-state",
    "ready",
  );
  const currentGroupId = await selectedActiveGroupFromMenu(page);
  if (currentGroupId !== group.id) {
    await selectGroupInUi(page, group.id);
  }
  await expectGroupMirrors(page, context, baseURL, group.id);
  await expectHomeWorkspace(page, group.name);
  expect(await selectedActiveGroupFromMenu(page)).toBe(group.id);
}

async function openSkillPanel(
  page: Page,
  context: BrowserContext,
  baseURL: string,
  groupId: string,
): Promise<{ detail: Locator; systemInput: Locator; saveButton: Locator }> {
  await page.goto("/settings", {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
  return openCurrentSkillPanel(page, context, baseURL, groupId);
}

async function openCurrentSkillPanel(
  page: Page,
  context: BrowserContext,
  baseURL: string,
  groupId: string,
): Promise<{
  detail: Locator;
  systemInput: Locator;
  saveButton: Locator;
}> {
  const settingsDialog = page.locator('[data-slot="settings-dialog"]');
  await expect(settingsDialog).toBeVisible();
  await expectGroupMirrors(page, context, baseURL, groupId);
  await settingsDialog.getByRole("tab", { name: "技能", exact: true }).click();
  const skillsPanel = page.locator(
    '[data-slot="settings-panel"][data-tab-id="skills"]',
  );
  await expect(skillsPanel).toBeVisible();
  const skillRow = skillsPanel.locator(
    `[data-slot="skill-row"][data-skill-id="${SKILL_ID}"]`,
  );
  await expect(skillRow).toHaveCount(1);
  const toggle = skillRow.locator('[data-slot="skill-row-toggle"]');
  if ((await toggle.getAttribute("aria-expanded")) !== "true") {
    await toggle.click();
  }
  const detail = skillRow.locator('[data-slot="skill-detail"]');
  await expect(detail).toBeVisible();
  const systemInput = detail.getByRole("textbox", { name: /system 提示$/ });
  const saveButton = detail.getByRole("button", { name: "保存", exact: true });
  await expect(systemInput).toBeVisible();
  return { detail, systemInput, saveButton };
}

async function getSkill(page: Page, groupId: string): Promise<PromptResource> {
  const result = await dispatch<unknown>(
    page,
    "settings.prompts.get",
    { params: { id: SKILL_ID } },
    groupId,
  );
  return ENDPOINTS.getPrompt.response.parse(result.data);
}

async function getVersions(
  page: Page,
  groupId: string,
): Promise<PromptVersionResource[]> {
  const result = await dispatch<unknown>(
    page,
    "settings.prompts.versions.list",
    { params: { id: SKILL_ID } },
    groupId,
  );
  return ENDPOINTS.listPromptVersions.response.parse(result.data);
}

async function saveSkillThroughUi(
  page: Page,
  systemInput: Locator,
  saveButton: Locator,
  groupId: string,
  systemValue: string,
  expectedRevision: number | null,
  testInfo: TestInfo,
): Promise<PromptResource> {
  await systemInput.fill(systemValue);
  await expect(saveButton).toBeEnabled();
  const responseSettlement = page
    .waitForResponse(
      async (response) =>
        response.url().endsWith("/api/v1/dispatch") &&
        requestDispatchId(response.request()) === "settings.prompts.put",
      { timeout: 120_000 },
    )
    .then(
      (response) => ({ ok: true as const, response }),
      (error: unknown) => ({ ok: false as const, error }),
    );
  try {
    await saveButton.click();
    const responseResult = await responseSettlement;
    if (!responseResult.ok) throw responseResult.error;
    const response = responseResult.response;
    expect(response.status()).toBe(200);
    const request = response.request();
    expect(request.headers()["x-group-id"]).toBe(groupId);
    expect(request.headers()["x-account-id"]).toBeUndefined();
    const requestBody = request.postDataJSON() as {
      input?: { body?: { expectedRevision?: unknown; patch?: unknown } };
    };
    expect(requestBody.input?.body?.expectedRevision).toBe(expectedRevision);
    const patch = requestBody.input?.body?.patch as Record<string, unknown>;
    expect(patch.system).toBe(systemValue);
    expect(Object.keys(patch).every((key) => ["system", "template", "completionPolicy"].includes(key))).toBe(true);
    const envelope = (await response.json()) as { data: unknown };
    const saved = ENDPOINTS.putPrompt.response.parse(envelope.data);
    expect(saved.rowRevision).toBe(expectedRevision === null ? 1 : expectedRevision + 1);
    return saved;
  } finally {
    const responseResult = await responseSettlement;
    await testInfo.attach("T1234 UI Skill save response settlement", {
      body: JSON.stringify(
        responseResult.ok
          ? {
              settled: true,
              responseReceived: true,
              outcome: "response",
              status: responseResult.response.status(),
              groupId: responseResult.response.request().headers()["x-group-id"] ?? null,
              hasAccountHeader: Boolean(
                responseResult.response.request().headers()["x-account-id"],
              ),
            }
          : {
              settled: true,
              responseReceived: false,
              outcome: "wait-error",
              errorName:
                responseResult.error instanceof Error
                  ? responseResult.error.name
                  : typeof responseResult.error,
              error:
                responseResult.error instanceof Error
                  ? responseResult.error.message
                  : String(responseResult.error),
            },
        null,
        2,
      ),
      contentType: "application/json",
    });
  }
}

function releaseGate() {
  let release!: () => void;
  let observed = false;
  const promise = new Promise<void>((resolve) => {
    release = () => {
      observed = true;
      resolve();
    };
  });
  return {
    promise,
    release,
    get released() {
      return observed;
    },
  };
}

function hashBody(body: Buffer): string {
  return createHash("sha256").update(body).digest("hex");
}

test("账号组 Skill 首写、刷新、二次 CAS、历史与跨组版本归属", async (
  { page, context, baseURL },
  testInfo,
) => {
  // AST helper展开为280个保守120秒槽；24小时外层覆盖720槽与启动/清理余量。
  test.setTimeout(Math.max((86_400_000), 166500000));
  page.setDefaultTimeout(120_000);
  page.setDefaultNavigationTimeout(120_000);
  expect(baseURL).toBeTruthy();
  const anchor = await createGroup(page, `T1234 保存锚组 ${randomUUID()}`);
  const groupA = await createGroup(page, `T1234 保存组 A ${randomUUID()}`);
  const groupB = await createGroup(page, `T1234 保存组 B ${randomUUID()}`);
  expect(new Set([anchor.id, groupA.id, groupB.id]).size).toBe(3);
  for (const group of [anchor, groupA, groupB]) {
    expect(group.status).toBe("active");
    expect(group.members).toEqual([]);
  }

  await selectGroupOnHome(page, context, baseURL!, anchor);
  await selectGroupOnHome(page, context, baseURL!, groupA);
  const beforeA = await getSkill(page, groupA.id);
  expect(beforeA).toMatchObject({
    skillId: SKILL_ID,
    groupId: groupA.id,
    accountId: null,
    rowRevision: null,
    overlay: null,
    compatibility: "compatible",
  });
  expect(beforeA.editableFields).toContain("system");
  const officialBase = { baseVersion: beforeA.baseVersion, official: beforeA.official };

  let panel = await openSkillPanel(page, context, baseURL!, groupA.id);
  await expect(panel.systemInput).toBeEnabled();
  const r1Text = `T1234 isolated group A system revision one ${randomUUID()}`;
  const r1 = await saveSkillThroughUi(
    page,
    panel.systemInput,
    panel.saveButton,
    groupA.id,
    r1Text,
    null,
    testInfo,
  );
  expect(r1).toMatchObject({
    skillId: SKILL_ID,
    groupId: groupA.id,
    accountId: null,
    rowRevision: 1,
    baseVersion: officialBase.baseVersion,
    official: officialBase.official,
    effective: { system: r1Text },
    overlay: { system: r1Text },
  });
  const publicR1 = await getSkill(page, groupA.id);
  expect(publicR1.rowRevision).toBe(1);
  expect(publicR1.effective.system).toBe(r1Text);
  expect(publicR1.official).toEqual(officialBase.official);
  if (beforeA.official.tools.length > 0) {
    const tools = panel.detail.locator('[data-slot="skill-tools"]');
    await expect(tools).toBeVisible();
    await expect(tools.locator('input, textarea, [contenteditable="true"]')).toHaveCount(0);
  } else {
    await expect(panel.detail.locator('[data-slot="skill-tools"]')).toHaveCount(0);
  }
  if (beforeA.official.outputSchema !== null) {
    const outputSchema = panel.detail.locator('[data-slot="skill-output-schema"]');
    await expect(outputSchema).toBeVisible();
    await expect(outputSchema.locator('input, textarea, [contenteditable="true"]')).toHaveCount(0);
  } else {
    await expect(panel.detail.locator('[data-slot="skill-output-schema"]')).toHaveCount(0);
  }
  const historyR1 = await getVersions(page, groupA.id);
  expect(historyR1).toHaveLength(1);
  expect(historyR1[0]).toMatchObject({
    groupId: groupA.id,
    accountId: null,
    skillId: SKILL_ID,
    rowRevision: 1,
    observedBaseVersion: officialBase.baseVersion,
    overlay: { system: r1Text },
  });
  const firstVersionId = historyR1[0]!.id;

  await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
  panel = await openSkillPanel(page, context, baseURL!, groupA.id);
  await expect(panel.systemInput).toHaveValue(r1Text);
  const r2Text = `T1234 isolated group A system revision two ${randomUUID()}`;
  const r2 = await saveSkillThroughUi(
    page,
    panel.systemInput,
    panel.saveButton,
    groupA.id,
    r2Text,
    1,
    testInfo,
  );
  expect(r2).toMatchObject({
    skillId: SKILL_ID,
    groupId: groupA.id,
    accountId: null,
    rowRevision: 2,
    baseVersion: officialBase.baseVersion,
    official: officialBase.official,
    effective: { system: r2Text },
    overlay: { system: r2Text },
  });
  const publicR2 = await getSkill(page, groupA.id);
  expect(publicR2.rowRevision).toBe(2);
  expect(publicR2.effective.system).toBe(r2Text);
  expect(publicR2.official).toEqual(officialBase.official);
  const historyR2 = await getVersions(page, groupA.id);
  expect(historyR2).toHaveLength(2);
  expect(historyR2.map((row) => row.rowRevision)).toEqual([2, 1]);
  expect(historyR2[1]?.id).toBe(firstVersionId);
  expect(historyR2.every((row) => row.groupId === groupA.id)).toBe(true);
  expect(historyR2.every((row) => row.accountId === null)).toBe(true);

  await expect(panel.systemInput).toBeEnabled();
  await expect(panel.systemInput).toHaveValue(r2Text);
  await expect(panel.saveButton).toHaveText("保存");
  await expect(panel.saveButton).toBeDisabled();
  const history = panel.detail.locator('[data-slot="skill-version-history"]');
  await expect(history).toHaveJSProperty("open", false);
  const uiHistoryRequests: Request[] = [];
  const observeUiHistory = (request: Request) => {
    if (requestDispatchId(request) === "settings.prompts.versions.list") {
      uiHistoryRequests.push(request);
    }
  };
  page.on("request", observeUiHistory);
  const uiHistoryObservation = await (async () => {
    const uiHistoryResponseSettlement = page
      .waitForResponse(
        (response) =>
          response.url().endsWith("/api/v1/dispatch") &&
          requestDispatchId(response.request()) === "settings.prompts.versions.list",
        { timeout: 120_000 },
      )
      .then(
        (response) => ({ ok: true as const, response }),
        (error: unknown) => ({ ok: false as const, error }),
      );
    try {
      await history.locator("summary").click();
      await expect(history).toHaveJSProperty("open", true);
      const responseSettlement = await uiHistoryResponseSettlement;
      if (!responseSettlement.ok) throw responseSettlement.error;
      const uiHistoryResponse = responseSettlement.response;
      expect(uiHistoryResponse.status()).toBe(200);
      expect(uiHistoryResponse.request().headers()["x-group-id"]).toBe(groupA.id);
      expect(uiHistoryResponse.request().headers()["x-account-id"]).toBeUndefined();
      const parsedRows = ENDPOINTS.listPromptVersions.response.parse(
        ((await uiHistoryResponse.json()) as { data: unknown }).data,
      );
      expect(uiHistoryRequests).toHaveLength(1);
      expect(parsedRows).toHaveLength(2);
      expect(parsedRows.map((row) => row.rowRevision)).toEqual([2, 1]);
      expect(parsedRows.every((row) => row.groupId === groupA.id)).toBe(true);
      expect(parsedRows.every((row) => row.accountId === null)).toBe(true);
      expect(parsedRows.map((row) => row.id)).toEqual(
        historyR2.map((row) => row.id),
      );
      return {
        status: uiHistoryResponse.status(),
        groupId: uiHistoryResponse.request().headers()["x-group-id"] ?? null,
        accountId: uiHistoryResponse.request().headers()["x-account-id"] ?? null,
        requestCount: uiHistoryRequests.length,
        rows: parsedRows,
      };
    } finally {
      const responseSettlement = await uiHistoryResponseSettlement;
      try {
        await testInfo.attach("T1234 history UI response wait settlement", {
          body: JSON.stringify(
            responseSettlement.ok
              ? {
                  settled: true,
                  responseReceived: true,
                  outcome: "response",
                  status: responseSettlement.response.status(),
                  requestGroupId:
                    responseSettlement.response.request().headers()["x-group-id"] ?? null,
                  requestAccountId:
                    responseSettlement.response.request().headers()["x-account-id"] ?? null,
                }
              : {
                  settled: true,
                  responseReceived: false,
                  outcome: "wait-error",
                  error:
                    responseSettlement.error instanceof Error
                      ? responseSettlement.error.message
                      : String(responseSettlement.error),
                },
            null,
            2,
          ),
          contentType: "application/json",
        });
      } finally {
        page.off("request", observeUiHistory);
      }
    }
  })();
  expect(uiHistoryObservation.rows.map((row) => row.id)).toEqual(
    historyR2.map((row) => row.id),
  );
  const historyRows = history.locator('[data-slot="skill-version-row"]');
  await expect(historyRows).toHaveCount(2);
  await expect(historyRows.nth(0)).toHaveAttribute(
    "data-version-id",
    historyR2[0]!.id,
  );
  await expect(historyRows.nth(0)).toContainText("r2");
  await expect(historyRows.nth(1)).toHaveAttribute(
    "data-version-id",
    historyR2[1]!.id,
  );
  await expect(historyRows.nth(1)).toContainText("r1");
  const domHistoryVersionIds = await historyRows.evaluateAll((rows) =>
    rows.map((row) => row.getAttribute("data-version-id")),
  );
  await testInfo.attach("T1234 history UI response and rows", {
    body: JSON.stringify(
      {
        cleanR2: {
          editorEnabled: true,
          editorMatchesR2: true,
          saveButtonText: "保存",
          saveButtonDisabled: true,
          detailsWasClosedBeforeClick: true,
        },
        uiResponse: {
          status: uiHistoryObservation.status,
          groupId: uiHistoryObservation.groupId,
          accountId: uiHistoryObservation.accountId,
          requestCount: uiHistoryObservation.requestCount,
        },
        rows: uiHistoryObservation.rows.map(({ id, rowRevision, groupId, accountId }) => ({
          id,
          rowRevision,
          groupId,
          accountId,
        })),
        domRowCount: await historyRows.count(),
        domVersionIds: domHistoryVersionIds,
      },
      null,
      2,
    ),
    contentType: "application/json",
  });
  await captureViewport(page, testInfo, "group-a-r2-history-1536x1024.png");

  await selectGroupOnHome(page, context, baseURL!, groupB);
  panel = await openSkillPanel(page, context, baseURL!, groupB.id);
  const beforeB = await getSkill(page, groupB.id);
  expect(beforeB).toMatchObject({
    skillId: SKILL_ID,
    groupId: groupB.id,
    accountId: null,
    rowRevision: null,
    overlay: null,
    compatibility: "compatible",
  });
  expect(beforeB.effective).toEqual(beforeB.official);
  await expect(panel.systemInput).toHaveValue(beforeB.official.system);
  await expect(panel.systemInput).not.toHaveValue(r1Text);
  await expect(panel.systemInput).not.toHaveValue(r2Text);
  await captureViewport(page, testInfo, "group-b-official-skill-1536x1024.png");

  const rollbackResponse = await dispatchResponse(
    page,
    "settings.prompts.rollback",
    {
      params: { id: SKILL_ID },
      body: { versionId: historyR2[0]!.id, expectedRevision: 1 },
    },
    groupB.id,
  );
  expect(rollbackResponse.status()).toBe(404);
  const rollbackFailure = (await rollbackResponse.json()) as {
    error?: { code?: string };
  };
  expect(rollbackFailure.error?.code).toBe(ErrorCode.OwnershipError);
  const afterNegativeA = await getSkill(page, groupA.id);
  const afterNegativeB = await getSkill(page, groupB.id);
  const afterNegativeHistoryA = await getVersions(page, groupA.id);
  const afterNegativeHistoryB = await getVersions(page, groupB.id);
  expect(afterNegativeA.rowRevision).toBe(2);
  expect(afterNegativeA.effective.system).toBe(r2Text);
  expect(afterNegativeHistoryA.map((row) => row.id)).toEqual(
    historyR2.map((row) => row.id),
  );
  expect(afterNegativeB.rowRevision).toBeNull();
  expect(afterNegativeB.overlay).toBeNull();
  expect(afterNegativeB.effective).toEqual(afterNegativeB.official);
  expect(afterNegativeHistoryB).toEqual([]);

  await selectGroupOnHome(page, context, baseURL!, groupA);
  const archiveResponse = await dispatchResponse(
    page,
    "accountGroups.archive",
    { params: { groupId: groupA.id }, body: { expectedVersion: groupA.version } },
    groupA.id,
  );
  expect(archiveResponse.ok()).toBe(true);
  const archived = ENDPOINTS.archiveAccountGroup.response.parse(
    ((await archiveResponse.json()) as { data: unknown }).data,
  );
  expect(archived).toMatchObject({ id: groupA.id, status: "archived" });
  const archivedWrite = await dispatchResponse(
    page,
    "settings.prompts.put",
    {
      params: { id: SKILL_ID },
      body: { expectedRevision: 2, patch: { system: `T1234 rejected archived write ${randomUUID()}` } },
    },
    groupA.id,
  );
  expect(archivedWrite.status()).toBe(404);
  const archivedFailure = (await archivedWrite.json()) as {
    error?: { code?: string };
  };
  expect(archivedFailure.error?.code).toBe(ErrorCode.OwnershipError);
  const afterArchivedSkill = await getSkill(page, groupA.id);
  const afterArchivedWrite = await getVersions(page, groupA.id);
  expect(afterArchivedSkill.rowRevision).toBe(2);
  expect(afterArchivedSkill.effective.system).toBe(r2Text);
  expect(afterArchivedWrite.map((row) => row.id)).toEqual(
    historyR2.map((row) => row.id),
  );
  await testInfo.attach("T1234 同组版本与归属拒绝观察", {
    body: JSON.stringify(
      {
        anchorGroupId: anchor.id,
        groupAId: groupA.id,
        groupBId: groupB.id,
        skillId: SKILL_ID,
        firstSave: { groupId: r1.groupId, accountId: r1.accountId, rowRevision: r1.rowRevision },
        secondSave: { groupId: r2.groupId, accountId: r2.accountId, rowRevision: r2.rowRevision },
        historyIds: historyR2.map((row) => ({ id: row.id, rowRevision: row.rowRevision })),
        crossGroupRollback: { status: rollbackResponse.status(), code: rollbackFailure.error?.code },
        archivedGroup: { id: archived.id, status: archived.status, writeStatus: archivedWrite.status(), writeCode: archivedFailure.error?.code },
        afterRejectedOperations: {
          groupARevision: afterArchivedSkill.rowRevision,
          groupASystemUnchanged: afterArchivedSkill.effective.system === r2Text,
          latestHistoryRevision: afterArchivedWrite[0]?.rowRevision,
          groupAVersionCount: afterArchivedWrite.length,
          groupBRevision: afterNegativeB.rowRevision,
          groupBVersionCount: afterNegativeHistoryB.length,
        },
      },
      null,
      2,
    ),
    contentType: "application/json",
  });
});

test("同组双页面保存只接受一个 CAS revision 并保留冲突草稿", async (
  { page, context, baseURL },
  testInfo,
) => {
  // AST helper展开为133个保守120秒槽；24小时外层覆盖720槽与双页清理余量。
  test.setTimeout(Math.max((86_400_000), 166500000));
  page.setDefaultTimeout(120_000);
  page.setDefaultNavigationTimeout(120_000);
  expect(baseURL).toBeTruthy();
  const anchor = await createGroup(page, `T1234 CAS 锚组 ${randomUUID()}`);
  const groupA = await createGroup(page, `T1234 CAS 组 A ${randomUUID()}`);
  await selectGroupOnHome(page, context, baseURL!, anchor);
  await selectGroupOnHome(page, context, baseURL!, groupA);
  const [pageOne, pageTwo] = await Promise.all([
    openSkillPanel(page, context, baseURL!, groupA.id),
    (async () => {
      const secondPage = await context.newPage();
      secondPage.setDefaultTimeout(120_000);
      secondPage.setDefaultNavigationTimeout(120_000);
      await secondPage.goto("/settings", {
        waitUntil: "domcontentloaded",
        timeout: 120_000,
      });
      const secondDialog = secondPage.locator('[data-slot="settings-dialog"]');
      await expect(secondDialog).toBeVisible();
      await expectGroupMirrors(secondPage, context, baseURL!, groupA.id);
      await secondDialog.getByRole("tab", { name: "技能", exact: true }).click();
      const secondPanel = secondPage.locator(
        '[data-slot="settings-panel"][data-tab-id="skills"]',
      );
      const row = secondPanel.locator(
        `[data-slot="skill-row"][data-skill-id="${SKILL_ID}"]`,
      );
      await expect(row).toHaveCount(1);
      await row.locator('[data-slot="skill-row-toggle"]').click();
      const detail = row.locator('[data-slot="skill-detail"]');
      await expect(detail).toBeVisible();
      return {
        page: secondPage,
        detail,
        systemInput: detail.getByRole("textbox", { name: /system 提示$/ }),
        saveButton: detail.getByRole("button", { name: "保存", exact: true }),
      };
    })(),
  ]);
  const initial = await getSkill(page, groupA.id);
  expect(initial.rowRevision).toBeNull();
  await expect(pageOne.systemInput).toBeEnabled();
  await expect(pageTwo.systemInput).toBeEnabled();
  const winnerText = `T1234 CAS winning draft ${randomUUID()}`;
  const losingDraft = `T1234 CAS preserved stale draft ${randomUUID()}`;
  const winnerApiResponse = await (async () => {
    const winnerResponseSettlement = page
      .waitForResponse(
        (response) =>
          response.url().endsWith("/api/v1/dispatch") &&
          (() => {
            try {
              return response.request().postDataJSON()?.id === "settings.prompts.put";
            } catch {
              return false;
            }
          })(),
        { timeout: 120_000 },
      )
      .then(
        (response) => ({ ok: true as const, response }),
        (error: unknown) => ({ ok: false as const, error }),
      );
    try {
      await pageOne.systemInput.fill(winnerText);
      await expect(pageOne.saveButton).toBeEnabled();
      await pageOne.saveButton.click();
      const responseSettlement = await winnerResponseSettlement;
      if (!responseSettlement.ok) throw responseSettlement.error;
      return responseSettlement.response;
    } finally {
      const responseSettlement = await winnerResponseSettlement;
      await testInfo.attach("T1234 CAS winner response settlement", {
        body: JSON.stringify(
          responseSettlement.ok
            ? {
                settled: true,
                responseReceived: true,
                outcome: "response",
                status: responseSettlement.response.status(),
                groupId: responseSettlement.response.request().headers()["x-group-id"] ?? null,
                hasAccountHeader: Boolean(
                  responseSettlement.response.request().headers()["x-account-id"],
                ),
              }
            : {
                settled: true,
                responseReceived: false,
                outcome: "wait-error",
                errorName:
                  responseSettlement.error instanceof Error
                    ? responseSettlement.error.name
                    : typeof responseSettlement.error,
                error:
                  responseSettlement.error instanceof Error
                    ? responseSettlement.error.message
                    : String(responseSettlement.error),
              },
          null,
          2,
        ),
        contentType: "application/json",
      });
    }
  })();
  expect(winnerApiResponse.status()).toBe(200);
  const winnerRequest = winnerApiResponse.request();
  expect(winnerRequest.headers()["x-group-id"]).toBe(groupA.id);
  expect(winnerRequest.headers()["x-account-id"]).toBeUndefined();
  const winnerRequestBody = winnerRequest.postDataJSON() as {
    input?: { body?: { expectedRevision?: unknown } };
  };
  expect(winnerRequestBody.input?.body?.expectedRevision).toBeNull();
  const winnerResource = ENDPOINTS.putPrompt.response.parse(
    ((await winnerApiResponse.json()) as { data: unknown }).data,
  );
  expect(winnerResource.rowRevision).toBe(1);

  await pageTwo.systemInput.fill(losingDraft);
  await expect(pageTwo.saveButton).toBeEnabled();
  const conflictApiResponse = await (async () => {
    const conflictResponseSettlement = pageTwo.page
      .waitForResponse(
        (response) =>
          response.url().endsWith("/api/v1/dispatch") &&
          (() => {
            try {
              return response.request().postDataJSON()?.id === "settings.prompts.put";
            } catch {
              return false;
            }
          })(),
        { timeout: 120_000 },
      )
      .then(
        (response) => ({ ok: true as const, response }),
        (error: unknown) => ({ ok: false as const, error }),
      );
    try {
      await pageTwo.saveButton.click();
      const responseSettlement = await conflictResponseSettlement;
      if (!responseSettlement.ok) throw responseSettlement.error;
      return responseSettlement.response;
    } finally {
      const responseSettlement = await conflictResponseSettlement;
      await testInfo.attach("T1234 CAS conflict response settlement", {
        body: JSON.stringify(
          responseSettlement.ok
            ? {
                settled: true,
                responseReceived: true,
                outcome: "response",
                status: responseSettlement.response.status(),
                groupId: responseSettlement.response.request().headers()["x-group-id"] ?? null,
                hasAccountHeader: Boolean(
                  responseSettlement.response.request().headers()["x-account-id"],
                ),
              }
            : {
                settled: true,
                responseReceived: false,
                outcome: "wait-error",
                errorName:
                  responseSettlement.error instanceof Error
                    ? responseSettlement.error.name
                    : typeof responseSettlement.error,
                error:
                  responseSettlement.error instanceof Error
                    ? responseSettlement.error.message
                    : String(responseSettlement.error),
              },
          null,
          2,
        ),
        contentType: "application/json",
      });
    }
  })();
  expect(conflictApiResponse.status()).toBe(409);
  const conflictRequestBody = conflictApiResponse.request().postDataJSON() as {
    input?: { body?: { expectedRevision?: unknown } };
  };
  expect(conflictRequestBody.input?.body?.expectedRevision).toBeNull();
  const conflictEnvelope = (await conflictApiResponse.json()) as {
    error?: { code?: string; details?: { domainCode?: string } };
  };
  expect(conflictEnvelope.error?.code).toBe(ErrorCode.ConflictError);
  expect(conflictEnvelope.error?.details?.domainCode).toBe(
    "SKILL_OVERLAY_REVISION_CONFLICT",
  );
  await expect(pageTwo.detail.locator('[data-slot="skill-save-error"]')).toHaveText(
    "该账号的技能配置已在别处更新，请刷新后再编辑。",
  );
  await expect(pageTwo.systemInput).toHaveValue(losingDraft);
  const afterConflict = await getSkill(page, groupA.id);
  const history = await getVersions(page, groupA.id);
  expect(afterConflict.rowRevision).toBe(1);
  expect(afterConflict.effective.system).toBe(winnerText);
  expect(history).toHaveLength(1);
  expect(history[0]).toMatchObject({ groupId: groupA.id, rowRevision: 1 });
  await expect(pageOne.systemInput).toHaveValue(winnerText);
  await captureViewport(page, testInfo, "cas-winner-1536x1024.png");
  await captureViewport(pageTwo.page, testInfo, "cas-conflict-draft-1536x1024.png");
  await testInfo.attach("T1234 双页 CAS 观察", {
    body: JSON.stringify({
      groupId: groupA.id,
      skillId: SKILL_ID,
      initialRevision: initial.rowRevision,
      winner: { revision: winnerResource.rowRevision, code: winnerApiResponse.status() },
      conflict: {
        code: conflictEnvelope.error?.code,
        domainCode: conflictEnvelope.error?.details?.domainCode,
        status: conflictApiResponse.status(),
        currentRevision: afterConflict.rowRevision,
        retainedDraftMatches: (await pageTwo.systemInput.inputValue()) === losingDraft,
      },
      finalVersionCount: history.length,
    }, null, 2),
    contentType: "application/json",
  });
  await pageTwo.page.close();
});

test("切组 RSC 与原组保存回执迟到时阻止旧写并通过 ABA 保持归属", async (
  { page, context, baseURL },
  testInfo,
) => {
  // 四轮真实关闭/选组/设置RSC均有串行120秒观察；静态helper展开354个await槽位，预算最多720槽。
  test.setTimeout(Math.max((86_400_000), 166500000));
  page.setDefaultTimeout(120_000);
  page.setDefaultNavigationTimeout(120_000);
  expect(baseURL).toBeTruthy();
  const anchor = await createGroup(page, `T1234 延迟锚组 ${randomUUID()}`);
  const groupA = await createGroup(page, `T1234 延迟组 A ${randomUUID()}`);
  const groupB = await createGroup(page, `T1234 延迟组 B ${randomUUID()}`);
  await selectGroupOnHome(page, context, baseURL!, anchor);
  await selectGroupOnHome(page, context, baseURL!, groupA);
  const aOfficial = await getSkill(page, groupA.id);
  const bOfficial = await getSkill(page, groupB.id);
  expect(aOfficial.rowRevision).toBeNull();
  expect(bOfficial.rowRevision).toBeNull();
  const panelA = await openSkillPanel(page, context, baseURL!, groupA.id);
  const unsavedDraft = `T1234 A unsaved draft must not cross to B ${randomUUID()}`;
  await panelA.systemInput.fill(unsavedDraft);
  await expect(panelA.saveButton).toBeEnabled();
  const uiPutRequests: Array<PromptPutRequestObservation | null> = [];
  const observeUiPut = (request: Request) => {
    if (requestDispatchId(request) === "settings.prompts.put") {
      uiPutRequests.push(promptPutObservation(request));
    }
  };
  page.on("request", observeUiPut);

  const rscGate = releaseGate();
  const activeRouteHandlers = new Map<Promise<void>, string>();
  const routeHandlerFailures: Array<{ handler: string; error: string }> = [];
  const trackRouteHandler = (
    name: string,
    handler: (route: Route) => Promise<void>,
  ) => async (route: Route): Promise<void> => {
    const pending = handler(route);
    activeRouteHandlers.set(pending, name);
    try {
      await pending;
    } catch (error) {
      routeHandlerFailures.push({
        handler: name,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      activeRouteHandlers.delete(pending);
    }
  };
  let holdGroupBRsc = true;
  let observedGroupBRsc = 0;
  let completedGroupBRsc = 0;
  const rscObservations: Array<{
    groupId: string;
    status: number;
    contentType: string;
    bodySha256: string;
    delivery: string;
  }> = [];
  let observedGroupARsc = 0;
  let completedGroupARsc = 0;
  const groupRscRoute = async (route: Route) => {
    const request = route.request();
    const headers = await request.allHeaders();
    let url: URL;
    try {
      url = new URL(request.url());
    } catch {
      await route.fallback();
      return;
    }
    const cookie = (headers.cookie ?? "")
      .split(";")
      .map((item) => item.trim());
    const selectedGroup = [groupA, groupB].find((group) =>
      cookie.includes(`${GROUP_COOKIE}=${encodeURIComponent(group.id)}`),
    );
    if (
      url.origin !== new URL(baseURL!).origin ||
      url.pathname !== "/settings" ||
      headers.rsc !== "1" ||
      headers["next-router-prefetch"] === "1" ||
      !selectedGroup
    ) {
      await route.fallback();
      return;
    }
    const response = await route.fetch({ timeout: 120_000 });
    const contentType = response.headers()["content-type"] ?? "";
    const wasHeld = selectedGroup.id === groupB.id && holdGroupBRsc;
    const observation = {
      groupId: selectedGroup.id,
      status: response.status(),
      contentType,
      bodySha256: hashBody(await response.body()),
      delivery: wasHeld ? "held" : "fetched",
    };
    rscObservations.push(observation);
    if (selectedGroup.id === groupB.id) {
      observedGroupBRsc += 1;
    }
    if (selectedGroup.id === groupA.id) observedGroupARsc += 1;
    if (wasHeld) await rscGate.promise;
    try {
      await route.fulfill({ response });
      observation.delivery = wasHeld ? "fulfilled-after-release" : "fulfilled";
      if (selectedGroup.id === groupB.id) completedGroupBRsc += 1;
      if (selectedGroup.id === groupA.id) completedGroupARsc += 1;
    } catch (error) {
      const failure = request.failure();
      if (!failure) throw error;
      observation.delivery = `requestfailed:${failure.errorText}`;
    }
  };

  const putGate = releaseGate();
  let delayedPutSeen = false;
  let delayedPutResponseHeld = false;
  let delayedPutFinished = false;
  let delayedPutError: string | null = null;
  const delayedPutObservation: {
    scope: PromptPutRequestObservation | null;
    status: number | null;
    responseGroupId: string | null;
    rowRevision: number | null;
    responseBodySha256: string | null;
    delivery: string;
  } = {
    scope: null,
    status: null,
    responseGroupId: null,
    rowRevision: null,
    responseBodySha256: null,
    delivery: "not-started",
  };
  const dispatchRoute = async (route: Route) => {
    const observation = promptPutObservation(route.request());
    if (!observation || observation.groupId !== groupA.id || delayedPutSeen) {
      await route.fallback();
      return;
    }
    delayedPutSeen = true;
    delayedPutObservation.scope = observation;
    try {
      const response = await route.fetch({ timeout: 120_000 });
      delayedPutObservation.status = response.status();
      const responseBody = await response.body();
      delayedPutObservation.responseBodySha256 = hashBody(responseBody);
      if (response.ok()) {
        const data = JSON.parse(responseBody.toString("utf8")) as { data: unknown };
        const saved = ENDPOINTS.putPrompt.response.parse(data.data);
        delayedPutObservation.responseGroupId = saved.groupId ?? null;
        delayedPutObservation.rowRevision = saved.rowRevision;
      }
      delayedPutResponseHeld = true;
      delayedPutObservation.delivery = "held-real-service-response";
      await putGate.promise;
      await route.fulfill({ response });
      delayedPutObservation.delivery = "fulfilled-after-group-switch";
    } catch (error) {
      const failure = route.request().failure();
      if (!failure) {
        delayedPutError = error instanceof Error ? error.message : String(error);
        delayedPutObservation.delivery = `handler-error:${delayedPutError}`;
        throw error;
      }
      delayedPutError = failure.errorText;
      delayedPutObservation.delivery = `requestfailed:${failure.errorText}`;
    } finally {
      delayedPutFinished = true;
    }
  };

  const trackedGroupRscRoute = trackRouteHandler("group-rsc", groupRscRoute);
  const trackedDispatchRoute = trackRouteHandler("dispatch", dispatchRoute);
  const settingsDialog = page.locator('[data-slot="settings-dialog"]');
  const staleDetail = page.locator('[data-slot="skill-detail"][data-skill-id="script.draft"]');
  const settingsLink = page
    .getByRole("navigation", { name: "主要导航" })
    .getByRole("link", { name: "设置", exact: true });
  try {
    await page.route("**/*", trackedGroupRscRoute);
    await page.route("**/api/v1/dispatch", trackedDispatchRoute);
    await page.setViewportSize({ width: 1536, height: 1024 });
    await captureViewport(page, testInfo, "a-unsaved-draft-before-switch-1536x1024.png");
    await settingsDialog.getByRole("button", { name: "关闭", exact: true }).click();
    await expect(settingsDialog).toHaveCount(0);
    await expect(staleDetail).toHaveCount(0);
    await expectHomeWorkspace(page, groupA.name);
    await expectGroupMirrors(page, context, baseURL!, groupA.id);
    await selectGroupInUi(page, groupB.id);
    await expectGroupMirrors(page, context, baseURL!, groupB.id);
    await expectHomeWorkspace(page, groupB.name);
    expect(await selectedActiveGroupFromMenu(page)).toBe(groupB.id);
    const priorFirstGroupBRsc = observedGroupBRsc;
    await settingsLink.click();
    await expect
      .poll(() => observedGroupBRsc > priorFirstGroupBRsc, { timeout: 120_000 })
      .toBe(true);
    expect(rscObservations.length).toBeGreaterThan(0);
    expect(rscObservations.every((row) => row.status === 200)).toBe(true);
    expect(rscObservations.every((row) => row.contentType.includes("text/x-component"))).toBe(true);
    expect(rscObservations.at(-1)).toMatchObject({
      groupId: groupB.id,
      status: 200,
      delivery: "held",
    });
    expect(rscObservations.at(-1)?.contentType).toContain("text/x-component");
    expect(completedGroupBRsc).toBe(priorFirstGroupBRsc);
    await expect(settingsDialog).toHaveCount(0);
    await expect(staleDetail).toHaveCount(0);
    expect(delayedPutSeen).toBe(false);
    expect(uiPutRequests).toHaveLength(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await captureViewport(page, testInfo, "b-settings-rsc-held-editor-absent-390x844.png");
    await page.setViewportSize({ width: 1536, height: 1024 });

    holdGroupBRsc = false;
    rscGate.release();
    await expect
      .poll(() => completedGroupBRsc === observedGroupBRsc && completedGroupBRsc > 0, { timeout: 120_000 })
      .toBe(true);
    await expect(page.getByTestId("account-switcher-trigger")).toHaveAttribute(
      "aria-label",
      `当前账号组：${groupB.name}`,
    );
    await expectGroupMirrors(page, context, baseURL!, groupB.id);
    await expect(settingsDialog).toBeVisible();
    const panelB = await openCurrentSkillPanel(page, context, baseURL!, groupB.id);
    await expect(panelB.systemInput).toHaveValue(bOfficial.official.system);
    await expect(panelB.systemInput).not.toHaveValue(unsavedDraft);

    await settingsDialog.getByRole("button", { name: "关闭", exact: true }).click();
    await expect(settingsDialog).toHaveCount(0);
    await expect(staleDetail).toHaveCount(0);
    await expectHomeWorkspace(page, groupB.name);
    await expectGroupMirrors(page, context, baseURL!, groupB.id);
    const priorGroupARsc = observedGroupARsc;
    await selectGroupInUi(page, groupA.id);
    await expectGroupMirrors(page, context, baseURL!, groupA.id);
    await expectHomeWorkspace(page, groupA.name);
    expect(await selectedActiveGroupFromMenu(page)).toBe(groupA.id);
    await settingsLink.click();
    await expect.poll(() => observedGroupARsc > priorGroupARsc, { timeout: 120_000 }).toBe(true);
    await expect.poll(() => completedGroupARsc > priorGroupARsc, { timeout: 120_000 }).toBe(true);
    await expect(settingsDialog).toBeVisible();
    await expectGroupMirrors(page, context, baseURL!, groupA.id);
    await expect(page.getByTestId("account-switcher-trigger")).toHaveAttribute(
      "aria-label",
      `当前账号组：${groupA.name}`,
    );
    const panelAForPut = await openCurrentSkillPanel(page, context, baseURL!, groupA.id);
    const lateAValue = `T1234 original A write completes after B switch ${randomUUID()}`;
    await panelAForPut.systemInput.fill(lateAValue);
    await expect(panelAForPut.saveButton).toBeEnabled();
    await panelAForPut.saveButton.click();
    await expect
      .poll(() => delayedPutResponseHeld, { timeout: 120_000 })
      .toBe(true);
    expect(delayedPutSeen).toBe(true);
    expect(delayedPutObservation.scope).toMatchObject({
      groupId: groupA.id,
      accountId: null,
      expectedRevision: null,
    });
    expect(delayedPutObservation.scope!.patchKeys).toContain("system");
    expect(delayedPutObservation.scope!.patchKeys.every((key) =>
      ["system", "template", "completionPolicy"].includes(key),
    )).toBe(true);
    expect(delayedPutObservation.status).toBe(200);
    expect(delayedPutObservation.responseGroupId).toBe(groupA.id);
    expect(delayedPutObservation.rowRevision).toBe(1);
    expect(delayedPutFinished).toBe(false);
    expect(uiPutRequests).toHaveLength(1);

    await settingsDialog.getByRole("button", { name: "关闭", exact: true }).click();
    await expect(settingsDialog).toHaveCount(0);
    await expect(staleDetail).toHaveCount(0);
    await expectHomeWorkspace(page, groupA.name);
    await expectGroupMirrors(page, context, baseURL!, groupA.id);
    const priorLateGroupBRsc = observedGroupBRsc;
    await selectGroupInUi(page, groupB.id);
    await expectGroupMirrors(page, context, baseURL!, groupB.id);
    await expectHomeWorkspace(page, groupB.name);
    expect(await selectedActiveGroupFromMenu(page)).toBe(groupB.id);
    await settingsLink.click();
    await expect.poll(() => observedGroupBRsc > priorLateGroupBRsc, { timeout: 120_000 }).toBe(true);
    await expect.poll(() => completedGroupBRsc >= observedGroupBRsc, { timeout: 120_000 }).toBe(true);
    await expect(settingsDialog).toBeVisible();
    await expectGroupMirrors(page, context, baseURL!, groupB.id);
    await expect(page.getByTestId("account-switcher-trigger")).toHaveAttribute(
      "aria-label",
      `当前账号组：${groupB.name}`,
    );
    const panelBWhileLate = await openCurrentSkillPanel(page, context, baseURL!, groupB.id);
    await expect(panelBWhileLate.systemInput).toHaveValue(bOfficial.official.system);
    expect(delayedPutFinished).toBe(false);

    await settingsDialog.getByRole("button", { name: "关闭", exact: true }).click();
    await expect(settingsDialog).toHaveCount(0);
    await expect(staleDetail).toHaveCount(0);
    await expectHomeWorkspace(page, groupB.name);
    await expectGroupMirrors(page, context, baseURL!, groupB.id);
    const priorAbaGroupARsc = observedGroupARsc;
    await selectGroupInUi(page, groupA.id);
    await expectGroupMirrors(page, context, baseURL!, groupA.id);
    await expectHomeWorkspace(page, groupA.name);
    expect(await selectedActiveGroupFromMenu(page)).toBe(groupA.id);
    await settingsLink.click();
    await expect.poll(() => observedGroupARsc > priorAbaGroupARsc, { timeout: 120_000 }).toBe(true);
    await expect.poll(() => completedGroupARsc >= observedGroupARsc, { timeout: 120_000 }).toBe(true);
    await expect(settingsDialog).toBeVisible();
    await expectGroupMirrors(page, context, baseURL!, groupA.id);
    await expect(page.getByTestId("account-switcher-trigger")).toHaveAttribute(
      "aria-label",
      `当前账号组：${groupA.name}`,
    );
    const panelAWhileOldResponseHeld = await openCurrentSkillPanel(page, context, baseURL!, groupA.id);
    await expect(panelAWhileOldResponseHeld.systemInput).toHaveValue(lateAValue);
    const aWhileOldResponseHeld = await getSkill(page, groupA.id);
    expect(aWhileOldResponseHeld).toMatchObject({
      groupId: groupA.id,
      accountId: null,
      rowRevision: 1,
    });
    expect(aWhileOldResponseHeld.effective.system).toBe(lateAValue);
    expect(delayedPutFinished).toBe(false);
    expect(uiPutRequests).toHaveLength(1);
    await captureViewport(page, testInfo, "a-aba-while-old-response-held-1536x1024.png");

    holdGroupBRsc = false;
    putGate.release();
    await expect
      .poll(() => delayedPutFinished, { timeout: 120_000 })
      .toBe(true);
    expect(delayedPutError).toBeNull();
    expect(delayedPutObservation.delivery).toBe("fulfilled-after-group-switch");
    expect(delayedPutObservation.scope?.groupId).toBe(groupA.id);
    await expect(panelAWhileOldResponseHeld.systemInput).toHaveValue(lateAValue);
    expect(uiPutRequests).toHaveLength(1);
    expect(uiPutRequests[0]).toMatchObject({
      groupId: groupA.id,
      accountId: null,
      expectedRevision: null,
    });
    expect(observedGroupBRsc).toBeGreaterThan(priorLateGroupBRsc);

    const finalA = await getSkill(page, groupA.id);
    const finalB = await getSkill(page, groupB.id);
    expect(finalA).toMatchObject({ groupId: groupA.id, accountId: null, rowRevision: 1 });
    expect(finalA.effective.system).toBe(lateAValue);
    expect(finalB).toMatchObject({ groupId: groupB.id, accountId: null, rowRevision: null, overlay: null });
    expect(finalB.effective).toEqual(finalB.official);
    await expect(panelAWhileOldResponseHeld.systemInput).toHaveValue(lateAValue);
    await captureViewport(page, testInfo, "a-aba-after-old-response-release-1536x1024.png");
    await testInfo.attach("T1234 延迟 RSC/回执与 ABA scope 观察", {
      body: JSON.stringify({
        anchorGroupId: anchor.id,
        groupAId: groupA.id,
        groupBId: groupB.id,
        skillId: SKILL_ID,
        rsc: rscObservations,
        observedGroupBRscCount: observedGroupBRsc,
        completedRscCount: completedGroupBRsc,
        delayedPut: delayedPutObservation,
        aWhileOldResponseHeld: {
          groupId: aWhileOldResponseHeld.groupId,
          accountId: aWhileOldResponseHeld.accountId,
          rowRevision: aWhileOldResponseHeld.rowRevision,
        },
        delayedPutFinishedBeforeRelease: false,
        delayedPutResponseWasHeld: delayedPutResponseHeld,
        finalA: { groupId: finalA.groupId, accountId: finalA.accountId, rowRevision: finalA.rowRevision },
        finalB: { groupId: finalB.groupId, accountId: finalB.accountId, rowRevision: finalB.rowRevision, overlayPresent: finalB.overlay !== null },
        forbiddenNewPutBeforeBRefresh: delayedPutObservation.scope?.groupId !== groupB.id,
        lateAResponseDidNotContaminateB: finalB.effective.system === finalB.official.system,
        delayedPutError,
        routeHandlerFailures,
      }, null, 2),
      contentType: "application/json",
    });
  } finally {
    holdGroupBRsc = false;
    rscGate.release();
    putGate.release();
    const unrouteResults = await Promise.allSettled([
      page.unroute("**/api/v1/dispatch", trackedDispatchRoute),
      page.unroute("**/*", trackedGroupRscRoute),
    ]);
    const unrouteFailures = unrouteResults.flatMap((result) =>
      result.status === "rejected"
        ? [result.reason instanceof Error ? result.reason.message : String(result.reason)]
        : [],
    );
    let joinFailure: string | null = null;
    try {
      await expect.poll(() => activeRouteHandlers.size, { timeout: 120_000 }).toBe(0);
    } catch (error) {
      joinFailure = error instanceof Error ? error.message : String(error);
    }
    page.off("request", observeUiPut);
    await testInfo.attach("T1234 route handler cleanup", {
      body: JSON.stringify({
        activeHandlerCountAfterJoin: activeRouteHandlers.size,
        activeHandlerNamesAfterJoin: [...activeRouteHandlers.values()],
        routeHandlerFailures,
        unrouteFailures,
        joinFailure,
      }, null, 2),
      contentType: "application/json",
    });
    expect(unrouteFailures).toEqual([]);
    expect(joinFailure).toBeNull();
    expect(activeRouteHandlers.size).toBe(0);
    expect(routeHandlerFailures).toEqual([]);
  }
});


test("组内 Skill 历史回滚与恢复默认通过真实按钮新增版本并刷新保留", async (
  { page, context, baseURL },
  testInfo,
) => {
  // 保留24小时外层；docs中的AST逐项展开本例与既有helper，覆盖串行120秒观察及清理余量。
  test.setTimeout(Math.max((86_400_000), 166500000));
  page.setDefaultTimeout(120_000);
  page.setDefaultNavigationTimeout(120_000);
  await page.setViewportSize({ width: 1536, height: 1024 });
  expect(baseURL).toBeTruthy();
  const anchor = await createGroup(page, `T1234 回滚锚组 ${randomUUID()}`);
  const groupA = await createGroup(page, `T1234 回滚默认组 A ${randomUUID()}`);
  expect(groupA.id).not.toBe(anchor.id);
  expect(groupA).toMatchObject({ status: "active", members: [] });
  await selectGroupOnHome(page, context, baseURL!, anchor);
  await selectGroupOnHome(page, context, baseURL!, groupA);
  const initial = await getSkill(page, groupA.id);
  expect(initial).toMatchObject({
    skillId: SKILL_ID, groupId: groupA.id, accountId: null,
    rowRevision: null, overlay: null, compatibility: "compatible",
  });
  expect(initial.editableFields).toEqual(expect.arrayContaining(["system", "template"]));
  const officialBase = { baseVersion: initial.baseVersion, official: initial.official };
  const writeRequests: Array<{
    operationId: string; groupId: string | null; accountId: string | null;
    input: DispatchInput;
  }> = [];
  const dispatchOperations: string[] = [];
  const recordRequests = (request: Request) => {
    const operationId = requestDispatchId(request);
    if (operationId === null) return;
    dispatchOperations.push(operationId);
    if (operationId !== "settings.prompts.put" && operationId !== "settings.prompts.rollback") return;
    const data = request.postDataJSON() as { input: DispatchInput };
    if (data.input.params?.id !== SKILL_ID) return;
    writeRequests.push({
      operationId,
      groupId: request.headers()["x-group-id"] ?? null,
      accountId: request.headers()["x-account-id"] ?? null,
      input: data.input,
    });
  };
  page.on("request", recordRequests);
  try {
    let panel = await openSkillPanel(page, context, baseURL!, groupA.id);
    await expect(panel.systemInput).toBeEnabled();
    const templateInput = panel.detail.locator('[data-slot="skill-template-input"]');
    await expect(templateInput).toBeEnabled();
    await expect(templateInput).toHaveValue(initial.official.template);
    const r1Text = `T1234 中性第一版方法 ${randomUUID()}`;
    const r1 = await saveSkillThroughUi(
      page, panel.systemInput, panel.saveButton, groupA.id, r1Text, null, testInfo,
    );
    expect(r1).toMatchObject({
      ...officialBase, skillId: SKILL_ID, groupId: groupA.id, accountId: null,
      rowRevision: 1, compatibility: "compatible",
    });
    expect(r1.overlay).toEqual({ system: r1Text, template: initial.official.template });
    expect(r1.effective).toEqual({ ...initial.official, system: r1Text });
    expect(await getSkill(page, groupA.id)).toEqual(r1);
    const historyR1 = await getVersions(page, groupA.id);
    expect(historyR1).toHaveLength(1);
    const v1 = historyR1[0]!;
    expect(v1).toMatchObject({
      skillId: SKILL_ID, groupId: groupA.id, accountId: null,
      rowRevision: 1, overlay: r1.overlay, overlayVersion: r1.overlayVersion,
      observedBaseVersion: initial.baseVersion,
    });
    await expect(panel.systemInput).toHaveValue(r1Text);
    await expect(panel.systemInput).toBeEnabled();
    await expect(panel.saveButton).toHaveText("保存");
    await expect(panel.saveButton).toBeDisabled();

    const r2Text = `T1234 中性第二版方法 ${randomUUID()}`;
    const r2 = await saveSkillThroughUi(
      page, panel.systemInput, panel.saveButton, groupA.id, r2Text, 1, testInfo,
    );
    expect(r2).toMatchObject({
      ...officialBase, skillId: SKILL_ID, groupId: groupA.id, accountId: null,
      rowRevision: 2, compatibility: "compatible",
    });
    expect(r2.overlay).toEqual({ system: r2Text, template: initial.official.template });
    expect(await getSkill(page, groupA.id)).toEqual(r2);
    const historyR2 = await getVersions(page, groupA.id);
    expect(historyR2.map((row) => row.rowRevision)).toEqual([2, 1]);
    expect(historyR2[1]).toEqual(v1);
    const v2 = historyR2[0]!;
    expect(v2.id).not.toBe(v1.id);
    expect(v2.overlay).toEqual(r2.overlay);
    await expect(panel.systemInput).toHaveValue(r2Text);
    await expect(panel.systemInput).toBeEnabled();
    await expect(panel.saveButton).toHaveText("保存");
    await expect(panel.saveButton).toBeDisabled();
    let history = panel.detail.locator('[data-slot="skill-version-history"]');
    if (!(await history.evaluate((element) => (element as HTMLDetailsElement).open))) {
      await history.locator("summary").click();
    }
    await expect(history).toHaveJSProperty("open", true);
    let rows = history.locator('[data-slot="skill-version-row"]');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toHaveAttribute("data-version-id", v2.id);
    await expect(rows.nth(0).locator('[data-slot="skill-version-rollback"]')).toBeDisabled();
    const target = history.locator(`[data-slot="skill-version-row"][data-version-id="${v1.id}"]`);
    await expect(target).toHaveCount(1);
    await expect(target).toContainText("r1");
    const rollbackButton = target.locator('[data-slot="skill-version-rollback"]');
    await expect(rollbackButton).toBeEnabled();
    const rollbackSettlement = page.waitForResponse((response) => {
      const request = response.request();
      if (!response.url().endsWith("/api/v1/dispatch") || requestDispatchId(request) !== "settings.prompts.rollback") return false;
      const data = request.postDataJSON() as { input?: DispatchInput };
      return data.input?.params?.id === SKILL_ID && request.headers()["x-group-id"] === groupA.id;
    }, { timeout: 120_000 }).then(
      (response) => ({ ok: true as const, response }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    let r3: PromptResource;
    try {
      await rollbackButton.click();
      const settled = await rollbackSettlement;
      if (!settled.ok) throw settled.error;
      const response = settled.response;
      expect(response.status()).toBe(200);
      expect(response.request().headers()["x-account-id"]).toBeUndefined();
      const requestBody = response.request().postDataJSON() as { input: DispatchInput };
      expect(requestBody.input.body).toEqual({ versionId: v1.id, expectedRevision: 2 });
      const envelope = await response.json() as DispatchEnvelope<unknown>;
      r3 = ENDPOINTS.rollbackPrompt.response.parse(envelope.data);
      expect(r3).toMatchObject({
        ...officialBase, skillId: SKILL_ID, groupId: groupA.id, accountId: null,
        rowRevision: 3, compatibility: "compatible", overlayVersion: v1.overlayVersion,
      });
      expect(r3.overlay).toEqual(v1.overlay);
      expect(r3.effective).toEqual(r1.effective);
    } finally {
      const settled = await rollbackSettlement;
      await testInfo.attach("T1234 UI rollback response settlement", {
        body: JSON.stringify(settled.ok ? {
          settled: true, status: settled.response.status(),
          request: settled.response.request().postDataJSON(),
          groupId: settled.response.request().headers()["x-group-id"] ?? null,
          hasAccountHeader: Boolean(settled.response.request().headers()["x-account-id"]),
        } : {
          settled: true, responseReceived: false,
          error: settled.error instanceof Error ? settled.error.message : String(settled.error),
        }, null, 2), contentType: "application/json",
      });
    }
    expect(await getSkill(page, groupA.id)).toEqual(r3);
    const historyR3 = await getVersions(page, groupA.id);
    expect(historyR3.map((row) => row.rowRevision)).toEqual([3, 2, 1]);
    expect(historyR3.slice(1)).toEqual(historyR2);
    const v3 = historyR3[0]!;
    expect(new Set(historyR3.map((row) => row.id)).size).toBe(3);
    expect(v3).toMatchObject({
      skillId: SKILL_ID, groupId: groupA.id, accountId: null,
      rowRevision: 3, overlay: v1.overlay, overlayVersion: v1.overlayVersion,
    });
    panel = await openCurrentSkillPanel(page, context, baseURL!, groupA.id);
    await expect(panel.systemInput).toHaveValue(r1Text);
    await expect(panel.systemInput).toBeEnabled();
    await expect(panel.saveButton).toHaveText("保存");
    await expect(panel.saveButton).toBeDisabled();
    const r3SkillRow = page.locator(`[data-slot="skill-row"][data-skill-id="${SKILL_ID}"]`);
    const r3CustomizedBadge = r3SkillRow.locator('[data-slot="skill-customized-badge"]');
    await expect(r3CustomizedBadge).toHaveCount(1);
    await expect(r3CustomizedBadge).toHaveText("已定制");
    await panel.systemInput.scrollIntoViewIfNeeded();
    const r3MethodImage = await captureViewport(page, testInfo, "ui-rollback-r3-method-1536x1024.png");
    history = panel.detail.locator('[data-slot="skill-version-history"]');
    if (!(await history.evaluate((element) => (element as HTMLDetailsElement).open))) {
      await history.locator("summary").click();
    }
    await expect(history).toHaveJSProperty("open", true);
    rows = history.locator('[data-slot="skill-version-row"]');
    await expect(rows).toHaveCount(3);
    for (const [index, version] of historyR3.entries()) {
      await expect(rows.nth(index)).toHaveAttribute("data-version-id", version.id);
      await expect(rows.nth(index)).toContainText(`r${version.rowRevision}`);
      if (index === 0) await expect(rows.nth(index).locator('[data-slot="skill-version-rollback"]')).toBeDisabled();
      else await expect(rows.nth(index).locator('[data-slot="skill-version-rollback"]')).toBeEnabled();
    }
    await history.scrollIntoViewIfNeeded();
    const r3HistoryImage = await captureViewport(page, testInfo, "ui-rollback-r3-three-history-1536x1024.png");
    const restoreButton = panel.detail.locator('[data-slot="skill-restore-default"]');
    await expect(restoreButton).toBeEnabled();
    const expectedRestorePatch = {
      ...(initial.editableFields.includes("system") ? { system: null } : {}),
      ...(initial.editableFields.includes("template") ? { template: null } : {}),
    };
    const restoreSettlement = page.waitForResponse((response) => {
      const request = response.request();
      if (!response.url().endsWith("/api/v1/dispatch") || requestDispatchId(request) !== "settings.prompts.put") return false;
      const data = request.postDataJSON() as { input?: DispatchInput };
      return data.input?.params?.id === SKILL_ID && request.headers()["x-group-id"] === groupA.id;
    }, { timeout: 120_000 }).then(
      (response) => ({ ok: true as const, response }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    let r4: PromptResource;
    try {
      await restoreButton.click();
      const settled = await restoreSettlement;
      if (!settled.ok) throw settled.error;
      const response = settled.response;
      expect(response.status()).toBe(200);
      expect(response.request().headers()["x-account-id"]).toBeUndefined();
      const requestBody = response.request().postDataJSON() as { input: DispatchInput };
      expect(requestBody.input.body).toEqual({ expectedRevision: 3, patch: expectedRestorePatch });
      const envelope = await response.json() as DispatchEnvelope<unknown>;
      r4 = ENDPOINTS.putPrompt.response.parse(envelope.data);
      expect(r4).toMatchObject({
        ...officialBase, skillId: SKILL_ID, groupId: groupA.id, accountId: null,
        rowRevision: 4, overlayVersion: "4", overlay: {}, compatibility: "compatible",
      });
      expect(r4.overlay).toEqual({});
      expect(r4.effective).toEqual(initial.official);
    } finally {
      const settled = await restoreSettlement;
      await testInfo.attach("T1234 UI restore default response settlement", {
        body: JSON.stringify(settled.ok ? {
          settled: true, status: settled.response.status(),
          request: settled.response.request().postDataJSON(),
          groupId: settled.response.request().headers()["x-group-id"] ?? null,
          hasAccountHeader: Boolean(settled.response.request().headers()["x-account-id"]),
        } : {
          settled: true, responseReceived: false,
          error: settled.error instanceof Error ? settled.error.message : String(settled.error),
        }, null, 2), contentType: "application/json",
      });
    }
    expect(await getSkill(page, groupA.id)).toEqual(r4);
    const historyR4 = await getVersions(page, groupA.id);
    expect(historyR4.map((row) => row.rowRevision)).toEqual([4, 3, 2, 1]);
    expect(historyR4.slice(1)).toEqual(historyR3);
    expect(new Set(historyR4.map((row) => row.id)).size).toBe(4);
    expect(historyR4[0]).toMatchObject({
      skillId: SKILL_ID, groupId: groupA.id, accountId: null,
      rowRevision: 4, overlay: {}, overlayVersion: "4",
    });
    panel = await openCurrentSkillPanel(page, context, baseURL!, groupA.id);
    await expect(panel.systemInput).toHaveValue(initial.official.system);
    await expect(panel.systemInput).toBeEnabled();
    await expect(panel.detail.locator('[data-slot="skill-template-input"]')).toHaveValue(initial.official.template);
    await expect(panel.saveButton).toHaveText("保存");
    await expect(panel.saveButton).toBeDisabled();
    await expect(panel.detail.locator('[data-slot="skill-restore-default"]')).toBeDisabled();
    const row = page.locator(`[data-slot="skill-row"][data-skill-id="${SKILL_ID}"]`);
    await expect(row.locator('[data-slot="skill-customized-badge"]')).toHaveCount(0);
    await panel.systemInput.scrollIntoViewIfNeeded();
    const r4MethodImage = await captureViewport(page, testInfo, "ui-default-r4-official-method-1536x1024.png");
    history = panel.detail.locator('[data-slot="skill-version-history"]');
    if (!(await history.evaluate((element) => (element as HTMLDetailsElement).open))) {
      await history.locator("summary").click();
    }
    await expect(history).toHaveJSProperty("open", true);
    rows = history.locator('[data-slot="skill-version-row"]');
    await expect(rows).toHaveCount(4);
    for (const [index, version] of historyR4.entries()) {
      await expect(rows.nth(index)).toHaveAttribute("data-version-id", version.id);
      await expect(rows.nth(index)).toContainText(`r${version.rowRevision}`);
    }
    await history.scrollIntoViewIfNeeded();
    const r4HistoryImage = await captureViewport(page, testInfo, "ui-default-r4-four-history-1536x1024.png");

    await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
    panel = await openCurrentSkillPanel(page, context, baseURL!, groupA.id);
    await expectGroupMirrors(page, context, baseURL!, groupA.id);
    expect(await getSkill(page, groupA.id)).toEqual(r4);
    expect(await getVersions(page, groupA.id)).toEqual(historyR4);
    const catalogEnvelope = await dispatch<unknown>(page, "settings.prompts.list", {}, groupA.id);
    const catalog = ENDPOINTS.listPrompts.response.parse(catalogEnvelope.data);
    expect(catalog.find((entry) => entry.skillId === SKILL_ID)).toEqual(r4);
    await expect(panel.systemInput).toHaveValue(initial.official.system);
    await expect(panel.systemInput).toBeEnabled();
    await expect(panel.detail.locator('[data-slot="skill-template-input"]')).toHaveValue(initial.official.template);
    await expect(panel.saveButton).toHaveText("保存");
    await expect(panel.saveButton).toBeDisabled();
    await expect(panel.detail.locator('[data-slot="skill-restore-default"]')).toBeDisabled();
    await expect(row.locator('[data-slot="skill-customized-badge"]')).toHaveCount(0);
    history = panel.detail.locator('[data-slot="skill-version-history"]');
    if (!(await history.evaluate((element) => (element as HTMLDetailsElement).open))) {
      await history.locator("summary").click();
    }
    await expect(history).toHaveJSProperty("open", true);
    rows = history.locator('[data-slot="skill-version-row"]');
    await expect(rows).toHaveCount(4);
    for (const [index, version] of historyR4.entries()) {
      await expect(rows.nth(index)).toHaveAttribute("data-version-id", version.id);
      await expect(rows.nth(index)).toContainText(`r${version.rowRevision}`);
    }
    await history.scrollIntoViewIfNeeded();
    const reloadHistoryImage = await captureViewport(page, testInfo, "ui-default-r4-reload-four-history-1536x1024.png");
    expect(writeRequests).toEqual([
      { operationId: "settings.prompts.put", groupId: groupA.id, accountId: null,
        input: { params: { id: SKILL_ID }, body: { expectedRevision: null, patch: { system: r1Text, template: initial.official.template } } } },
      { operationId: "settings.prompts.put", groupId: groupA.id, accountId: null,
        input: { params: { id: SKILL_ID }, body: { expectedRevision: 1, patch: { system: r2Text, template: initial.official.template } } } },
      { operationId: "settings.prompts.rollback", groupId: groupA.id, accountId: null,
        input: { params: { id: SKILL_ID }, body: { versionId: v1.id, expectedRevision: 2 } } },
      { operationId: "settings.prompts.put", groupId: groupA.id, accountId: null,
        input: { params: { id: SKILL_ID }, body: { expectedRevision: 3, patch: expectedRestorePatch } } },
    ]);
    await testInfo.attach("T1234 UI rollback default public versions and screenshots", {
      body: JSON.stringify({
        groupId: groupA.id, accountId: null, skillId: SKILL_ID,
        officialBase, r1, r2, r3, r4, historyR1, historyR2, historyR3, historyR4,
        writeRequests, dispatchOperations,
        screenshots: { r3MethodImage, r3HistoryImage, r4MethodImage, r4HistoryImage, reloadHistoryImage },
        boundary: "真实按钮调用 settings；未配置或调用模型，不含真人提示词/密钥；GET数保真实记录，不固定为1。",
      }, null, 2), contentType: "application/json",
    });
  } finally {
    page.off("request", recordRequests);
    await testInfo.attach("T1234 UI rollback default observed requests even on failure", {
      body: JSON.stringify({ groupId: groupA.id, accountId: null, skillId: SKILL_ID,
        writeRequests, dispatchOperations }, null, 2),
      contentType: "application/json",
    });
  }
});

// T-1246 copied-source declaration: original assertions unchanged.
test.describe.configure({ timeout: 166500000 });
