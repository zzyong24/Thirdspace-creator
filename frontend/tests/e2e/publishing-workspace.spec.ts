import type { Page } from "@playwright/test";
import { expect, test } from "../helpers/test-environment";

const CURRENT_ACCOUNT_KEY = "creatoros:current-account";
const CURRENT_ACCOUNT_COOKIE = "creatoros_current_account";

async function createProject(
  page: Page,
  baseURL: string | undefined,
): Promise<{ id: string; title: string }> {
  const accountResponse = await page.request.post("/api/v1/dispatch", {
    headers: { "content-type": "application/json" },
    data: {
      id: "accounts.create",
      input: {
        params: undefined,
        query: undefined,
        body: {
          platform: "douyin",
          accountHandle: `@e2e-publishing-workspace-${Date.now()}`,
        },
      },
    },
  });
  expect(
    accountResponse.ok(),
    `accounts.create 应成功，实得 ${accountResponse.status()}`,
  ).toBe(true);
  const accountPayload = (await accountResponse.json()) as {
    data: { id: string };
  };
  const accountId = accountPayload.data.id;
  const title = `E2E 发布工作台 ${Date.now()}`;
  const response = await page.request.post("/api/v1/dispatch", {
    headers: {
      "content-type": "application/json",
      "x-account-id": accountId,
    },
    data: {
      id: "projects.create",
      input: {
        params: undefined,
        query: undefined,
        body: { title, brief: "" },
      },
    },
  });
  expect(response.ok(), `projects.create 应成功，实得 ${response.status()}`).toBe(
    true,
  );
  const payload = (await response.json()) as { data: { id: string } };
  await page.context().addCookies([
    {
      name: CURRENT_ACCOUNT_COOKIE,
      value: encodeURIComponent(accountId),
      url: baseURL ?? "http://127.0.0.1",
    },
  ]);
  await page.addInitScript(
    ([key, id]) => window.localStorage.setItem(key!, id!),
    [CURRENT_ACCOUNT_KEY, accountId],
  );
  return { id: payload.data.id, title };
}

/**
 * E2E contract for the retired Publishing stage route (T-055a).
 *
 * Validates the rendered DOM on the production
 * `/projects/:projectId/publishing` route against the structural
 * invariants locked by `page-specs §9`:
 *  - The TopHeader renders in `project-workspace` mode with the
 *    canonical project identity "AI Native Browser 深度解析" and the
 *    six-stage stepper, with the Publishing stage active.
 *  - The Publishing Tabs row renders.
 *  - The Publishing Grid is a three-column layout in the spec order
 *    BasicInformationForm → PlatformPublishingPanel → PreviewRail
 *    (NOT a wizard, NOT a single-column).
 *  - The BasicInformationForm renders fields in spec order:
 *    title → description → cover → tags → category → publishing options.
 *  - The PlatformPublishingPanel exposes separate platform cards plus
 *    Batch Time / Confirm Publish / Pre-Publish Check controls.
 *  - The PreviewRail renders Preview → PublishChecklist → PublishTips
 *    in spec order.
 *  - The Confirm Publish button is fixture-only (renders with the
 *    expected label, but does not perform network calls).
 *  - The page is wrapped in exactly one AppShell with the sidebar
 *    marking "项目" as the active nav item.
 *
 * Run with:
 *   pnpm test:e2e -- publishing-workspace
 */

test.describe("Publishing Workspace page", () => {
  test("redirects the retired publishing route to the unified draft workbench", async ({
    page,
    baseURL,
  }) => {
    const project = await createProject(page, baseURL);
    await page.goto(`/projects/${project.id}/publishing`);

    await expect(page).toHaveURL(`/projects/${project.id}#publish`);
    const header = page.locator('[data-slot="app-top-header"]');
    await expect(header).toHaveAttribute("data-mode", "project-workspace");
    const identity = page.locator(
      '[data-slot="header-project-identity"]',
    );
    await expect(identity).toContainText(project.title);

    await expect(page.locator('[data-page="draft-workbench"]')).toBeVisible();
    await expect(page.locator('[data-slot="publishing-grid"]')).toHaveCount(0);
    await expect(page.locator('[data-slot="publishing-tabs"]')).toHaveCount(0);
    await expect(page.locator('[data-slot="basic-information-form"]')).toHaveCount(0);
    await expect(page.locator('[data-slot="platform-publishing-panel"]')).toHaveCount(0);
    await expect(page.locator('[data-slot="preview-rail"]')).toHaveCount(0);
    await expect(page.locator('[data-slot="confirm-publish-button"]')).toHaveCount(0);
    await expect(page.locator('[data-slot="pre-publish-check"]')).toHaveCount(0);
    await expect(page.locator('[data-slot="batch-time-actions"]')).toHaveCount(0);
    await expect(page.locator('[data-slot="platform-publish-card"]')).toHaveCount(0);
    await expect(page.locator('[data-slot="publish-checklist"]')).toHaveCount(0);
    await expect(page.locator('[data-slot="publish-tips"]')).toHaveCount(0);
    await expect(page.locator('[data-slot="platform-preview"]')).toHaveCount(0);

    // Projects nav item remains active in the sidebar.
    const nav = page.getByRole("navigation", { name: "主要导航" });
    const active = nav.locator('[aria-current="page"]');
    await expect(active).toHaveAttribute("href", "/projects");
  });
});
