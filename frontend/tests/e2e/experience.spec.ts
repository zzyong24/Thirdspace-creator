import { expect, test } from "../helpers/test-environment";

/**
 * E2E contract for the 经验裁决台 page (T-062a · SPEC 2026-07-03 §2.1).
 *
 *  - Direct visit to `/experience` renders the two-column adjudication
 *    workbench (裁决队列 + 已验证经验库) distinct from per-project pages.
 *  - The TopHeader is in `global` mode with page title "经验沉淀"
 *    and the Sidebar marks "经验沉淀" as the active nav item.
 *  - The contextual card variant is `assistant` (D-003).
 *  - The page exposes 3 truth summary cards (待裁决 / 已验证 / 已回流校准),
 *    the candidate queue (or its honest empty state), the validated
 *    library with a discarded fold, and the Copilot capture deep-link
 *    (the retired 快速记录 form must NOT render).
 *  - The page is wrapped in exactly one AppShell.
 */

test.describe("经验裁决台 page", () => {
  test("renders the adjudication workbench on the /experience route", async ({
    page,
  }) => {
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
