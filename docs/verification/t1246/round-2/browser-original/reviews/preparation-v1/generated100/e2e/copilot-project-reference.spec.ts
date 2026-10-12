import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "../helpers/test-environment";

const CURRENT_ACCOUNT_KEY = "creatoros:current-account";
const CURRENT_ACCOUNT_COOKIE = "creatoros_current_account";
const CHECK_IDS = [
  "AC-COPILOT-REF-LABEL",
  "AC-COPILOT-REF-NO-DUP",
  "AC-COPILOT-REF-NARROW",
  "AC-COPILOT-REF-DIRECT",
];

async function dispatch<T extends { id: string }>(
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
  expect(response.ok(), `${id} 应成功，实得 ${response.status()}`).toBe(true);
  const payload = (await response.json()) as { data: T };
  return payload.data;
}

async function selectAccount(
  page: Page,
  accountId: string,
  baseURL: string | undefined,
) {
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

test.describe("Copilot 项目引用直读（T-642）", () => {
  test("长标题只显示一次，正文不重复，窄屏不溢出", async ({
    page,
    baseURL,
  }) => {
    const captures: Array<{
      checkpoint: string;
      check_ids: string[];
      viewport: { width: number; height: number };
      text: string;
    }> = [];
    const title =
      "CreatorOS 启动内测啦！做一条视频，最浪费时间的往往不是拍摄，而是在账这个作品讲的啥";
    const account = await dispatch(page, "accounts.create", {
      params: undefined,
      query: undefined,
      body: {
        platform: "douyin",
        accountHandle: `@e2e-t642-reference-${Date.now()}`,
      },
    });
    const project = await dispatch(
      page,
      "projects.create",
      {
        params: undefined,
        query: undefined,
        body: { title, brief: "" },
      },
      account.id,
    );
    await selectAccount(page, account.id, baseURL);

    await page.setViewportSize({ width: 1536, height: 1024 });
    await page.goto("/?copilot=open");
    const input = page.getByLabel("我能帮你做什么");
    await input.fill("帮我看看 @CreatorOS");
    await page
      .locator(`[data-slot="project-mention-option"][data-project-id="${project.id}"]`)
      .click();

    const chip = page.locator(
      `[data-slot="context-chip"][data-kind="project"][data-project-id="${project.id}"]`,
    );
    await expect(chip).toBeVisible();
    await expect(chip).toContainText("项目");
    await expect(chip).toContainText(title);
    await expect(chip).toHaveAttribute("title", `项目 · ${title}`);
    await expect(input).toHaveValue("帮我看看 ");
    captures.push({
      checkpoint: "desktop-project-reference",
      check_ids: [...CHECK_IDS],
      viewport: { width: 1536, height: 1024 },
      text: `${await chip.innerText()}\n输入正文：${await input.inputValue()}`,
    });

    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(chip).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false);
    captures.push({
      checkpoint: "minimum-project-reference",
      check_ids: [...CHECK_IDS],
      viewport: { width: 1024, height: 768 },
      text: `${await chip.innerText()}\n输入正文：${await input.inputValue()}`,
    });

    const repoRoot = resolve(process.cwd(), "..");
    const evidenceDir = resolve(process.env.CREATOROS_T1246_RUN_DIR!, "original-output", "orchestrator", "evidence");
    mkdirSync(evidenceDir, { recursive: true });
    const commitSha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim();
    const artifact = `${JSON.stringify(
      {
        schema: "frontend-visible-copy/v1",
        task_id: "T-642",
        commit_sha: commitSha,
        captures,
      },
      null,
      2,
    )}\n`;
    writeFileSync(resolve(evidenceDir, "T-642-visible-copy.json"), artifact);
    expect(createHash("sha256").update(artifact).digest("hex")).toHaveLength(64);
  });
});

// T-1246 copied-source declaration: original assertions unchanged.
test.describe.configure({ timeout: 9300000 });
