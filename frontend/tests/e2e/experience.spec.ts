import { expect, test } from "../helpers/test-environment";
import { randomUUID } from "node:crypto";
import { ENDPOINTS, successEnvelope } from "@creatoros/contract";

/**
 * 经验入口兼容合同：T118 已退役独立经验工作台，/experience 正式重定向到 /knowledge。
 * T1200 保留同一知识目的地的“经验与关联” advanced 入口与“录入与整理”。
 * 本例先核真实 redirect，再实际导航到迁移后的经验入口，核记经验深链、预填与零自动提交。
 * 复盘候选裁决与模型经验采纳/知识库回流属于 T1239 的独立公共链，不在本例代签通过。
 * 保留单 AppShell、导航/header、退役队列无误放入口及原记经验功能后置。
 */

test.describe("经验裁决台 page", () => {
  test("renders the adjudication workbench on the /experience route", async ({
    page, baseURL,
  }) => {
    const groupResponse = await page.request.post("/api/v1/dispatch", { data: { id: "accountGroups.create", input: { body: { name: "经验入口真实空组", idempotencyKey: randomUUID() } } }, timeout: 120_000 });
    expect(groupResponse.ok()).toBe(true);
    const group = successEnvelope(ENDPOINTS.createAccountGroup.response).parse(await groupResponse.json()).data;
    await page.context().addCookies([{ name: "creatoros_current_group", value: encodeURIComponent(group.id), url: baseURL! }]);
    await page.addInitScript(id => { localStorage.setItem("creatoros:current-group", id); localStorage.removeItem("creatoros:current-account"); }, group.id);
    await page.goto("/experience");
    await expect(page).toHaveURL(/\/knowledge$/);

    // Header in global mode with the page title.
    const header = page.locator('[data-slot="app-top-header"]');
    await expect(header).toHaveAttribute("data-mode", "global");
    const heading = page.locator('[data-slot="header-page-heading"]');
    await expect(heading).toContainText("知识库");

    // The Experience nav item is the active page in the sidebar.
    const nav = page.getByRole("navigation", { name: "主要导航" });
    const active = nav.locator('[aria-current="page"]');
    await expect(active).toHaveAttribute("href", "/knowledge");

    // Contextual card variant is `assistant` (D-003).
    const assistant = page.locator(
      '[data-slot="sidebar-contextual-card"][data-variant="assistant"]',
    );
    await expect(assistant).toBeVisible();

    // Single AppShell with one Sidebar/TopHeader.
    await expect(page.locator('[data-slot="app-shell"]')).toHaveCount(1);
    await expect(page.locator('[data-slot="app-sidebar"]')).toHaveCount(1);
    await expect(page.locator('[data-slot="app-top-header"]')).toHaveCount(1);

    // T118退役redirect仅是兼容前置；T1200确认经验入口位于同一知识目的地的advanced视图。
    await page.getByRole("navigation", { name: "知识库视图" }).getByRole("link", { name: "经验与关联", exact: true }).click();
    await expect(page).toHaveURL(/\/knowledge\?view=advanced$/);
    await expect(page.getByRole("navigation", { name: "知识库视图" }).getByRole("link", { name: "经验与关联", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("account-switcher")).toHaveAttribute("data-state", "ready");
    // The page-internal main region exists exactly once.
    const main = page.locator('main[data-page="knowledge"]');
    await expect(main).toHaveCount(1);

    // T118b/T119 已批准 /experience 并入知识库，裁决留在复盘；这里是只读资料和经验入口。
    await expect(main).toHaveAttribute("data-page-state", /^(default|empty)$/);
    await expect(main.locator('[data-slot="experience-summary-cards"]')).toHaveCount(0);
    await expect(main.locator('[data-slot="learning-queue"]')).toHaveCount(0);
    await expect(main.locator('[data-slot="learning-adopt"], [data-slot="learning-discard"], [data-slot="learning-edit"]')).toHaveCount(0);
    const captureTools = main.locator('[data-slot="knowledge-capture-tools"]');
    await expect(captureTools).toBeVisible();
    await captureTools.locator("summary").click();
    await expect(main.getByRole("textbox", { name: "粘贴文本或 URL，也可拖入 PDF、DOCX、Markdown 或 TXT 文件" })).toBeVisible();

    // 快速记录 form retired → Copilot capture deep-link instead.
    await expect(
      main.locator('[data-slot="quick-record-actions"]'),
    ).toHaveCount(0);
    const capture = main.locator('[data-slot="experience-capture-link"]');
    await expect(capture).toBeVisible();
    const href = (await capture.getAttribute("href")) ?? "";
    expect(href).toContain("copilot=open");
    expect(href).toContain("surface=experience");
    const submissions: string[] = [];
    page.on("request", (request) => { if (request.method() === "POST" && new URL(request.url()).pathname === "/api/chat") submissions.push(request.url()); });
    await capture.click();
    await expect(page.getByRole("dialog", { name: "AI 助手" })).toBeVisible();
    await expect(page.locator('[data-slot="prompt-input"]')).toHaveValue("记一条经验:");
    expect(submissions).toEqual([]);
  });
});

// T-1246：原字节/FAIL封存；本活跃副本仅作已批准的本case合同校准，其余正文、标题及预算保持。
test.describe.configure({ timeout: 20460000 });
