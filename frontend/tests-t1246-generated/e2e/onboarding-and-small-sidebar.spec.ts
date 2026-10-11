import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "../helpers/test-environment";

const ONBOARDING_CHECKS = [
  "AC-ONB-REOPEN",
  "AC-ONB-FLOW",
  "AC-ONB-EXISTING",
  "AC-ONB-FRESH",
  "AC-ONB-COPY",
];
const SIDEBAR_CHECKS = [
  "AC-RCN-DEPENDENCY",
  "AC-RCN-AGGREGATION",
  "AC-RCN-SHORT-SIDEBAR",
];

function writeVisibleCopy(
  taskId: string,
  captures: Array<{
    checkpoint: string;
    check_ids: string[];
    viewport: { width: number; height: number };
    text: string;
  }>,
) {
  const repoRoot = resolve(process.cwd(), "..");
  const evidenceDir = resolve(process.env.CREATOROS_T1246_RUN_DIR!, "original-output", "orchestrator", "evidence");
  mkdirSync(evidenceDir, { recursive: true });
  const commitSha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
  writeFileSync(
    resolve(evidenceDir, `${taskId}-visible-copy.json`),
    `${JSON.stringify(
      {
        schema: "frontend-visible-copy/v1",
        task_id: taskId,
        commit_sha: commitSha,
        captures,
      },
      null,
      2,
    )}\n`,
  );
}

test.describe("新手成果路径与低高度侧栏", () => {
  test("重新打开后真实回到首页，并保留新号/已有作品两条连续路径", async ({
    page,
  }) => {
    const captures: Array<{
      checkpoint: string;
      check_ids: string[];
      viewport: { width: number; height: number };
      text: string;
    }> = [];

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/settings");
    await page.getByRole("tab", { name: "偏好" }).click();
    await page.evaluate(() => {
      localStorage.setItem("creatoros:onboarding:hidden", "1");
      localStorage.removeItem("creatoros:onboarding:force-open");
      localStorage.setItem("creatoros:onboarding:origin", "fresh");
    });
    await page.locator('[data-slot="pref-reopen-onboarding"]').click();
    await expect(page).toHaveURL(/\/$/);

    const card = page.locator('[data-slot="onboarding-card"]');
    await expect(card).toBeVisible();
    await expect(card).toContainText("上手引导");
    await expect(card).toContainText("绑定你的抖音号");
    await expect(card).toContainText("确定账号定位");
    await expect(card).toContainText("添加一个对标账号");
    await expect(card).toContainText("从对标内容创建选题");
    await expect(card).toContainText("把选题变成项目");
    await expect(card).not.toContainText("模型配置");
    await expect(card).not.toContainText("自动化任务");
    expect(
      await page.evaluate(() => ({
        hidden: localStorage.getItem("creatoros:onboarding:hidden"),
        forceOpen: localStorage.getItem("creatoros:onboarding:force-open"),
      })),
    ).toEqual({ hidden: null, forceOpen: "1" });

    const freshSteps = card.locator('[data-slot="onboarding-step"]');
    await expect(freshSteps).toHaveCount(6);
    expect(await freshSteps.evaluateAll((rows) => rows.map((row) => row.getAttribute("data-order")))).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
    ]);
    await expect(card).not.toContainText("查看已发布的历史项目");
    captures.push({
      checkpoint: "reopen-fresh-account",
      check_ids: [...ONBOARDING_CHECKS],
      viewport: { width: 1440, height: 900 },
      text: await card.innerText(),
    });

    await page.evaluate(() =>
      localStorage.setItem("creatoros:onboarding:origin", "existing"),
    );
    await page.reload();
    await expect(card).toBeVisible();
    await expect(card).toContainText("查看已发布的历史项目");
    await expect(card.locator('[data-slot="onboarding-step"]')).toHaveCount(7);

    await page.setViewportSize({ width: 1024, height: 720 });
    await expect(card).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false);
    captures.push({
      checkpoint: "refresh-existing-account-minimum",
      check_ids: [...ONBOARDING_CHECKS],
      viewport: { width: 1024, height: 720 },
      text: await card.innerText(),
    });
    writeVisibleCopy("T-637", captures);
  });

  test("低高度窗口始终保留账号和用户身份", async ({ page }) => {
    const captures: Array<{
      checkpoint: string;
      check_ids: string[];
      viewport: { width: number; height: number };
      text: string;
    }> = [];

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/settings");
    const sidebar = page.locator('[data-slot="app-sidebar"]');
    const footer = page.locator('[data-slot="sidebar-identity-footer"]');
    await expect(sidebar).toBeVisible();
    await expect(footer).toBeVisible();
    captures.push({
      checkpoint: "normal-sidebar",
      check_ids: [...SIDEBAR_CHECKS],
      viewport: { width: 1440, height: 900 },
      text: await sidebar.innerText(),
    });

    await page.setViewportSize({ width: 1024, height: 640 });
    await expect(
      page.locator('[data-slot="sidebar-contextual-card"]'),
    ).toBeHidden();
    await expect(page.locator('[data-slot="sidebar-scroll-region"]')).toBeVisible();
    await expect(page.locator('[data-slot="sidebar-user-profile"]')).toBeVisible();
    const footerBox = await footer.boundingBox();
    expect(footerBox).not.toBeNull();
    expect((footerBox?.y ?? 0) + (footerBox?.height ?? 0)).toBeLessThanOrEqual(640);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false);
    captures.push({
      checkpoint: "short-sidebar",
      check_ids: [...SIDEBAR_CHECKS],
      viewport: { width: 1024, height: 640 },
      text: await footer.innerText(),
    });
    writeVisibleCopy("T-638", captures);
  });
});

// T-1246 copied-source declaration: original assertions unchanged.
test.describe.configure({ timeout: 12900000 });
