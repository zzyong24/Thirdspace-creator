import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "../helpers/test-environment";

const TASK_ID = "T-664";
const CHECK_IDS = [
  "AC-COURSE-HOME",
  "AC-COURSE-LESSON",
  "AC-COURSE-PROGRESS",
  "AC-COURSE-RESPONSIVE",
  "AC-COURSE-SOURCE",
];
const PROGRESS_KEY =
  "xuehui-ip-practical-course:2026.08.02.3:progress";

interface VisibleCopyCapture {
  readonly checkpoint: string;
  readonly check_ids: ReadonlyArray<string>;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly text: string;
}

function writeVisibleCopy(captures: ReadonlyArray<VisibleCopyCapture>): void {
  const repoRoot = resolve(process.cwd(), "..");
  const evidenceDir = resolve(process.env.CREATOROS_T1246_RUN_DIR!, "original-output", "orchestrator", "evidence");
  mkdirSync(evidenceDir, { recursive: true });
  const commitSha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
  writeFileSync(
    resolve(evidenceDir, `${TASK_ID}-visible-copy.json`),
    `${JSON.stringify(
      {
        schema: "frontend-visible-copy/v1",
        task_id: TASK_ID,
        commit_sha: commitSha,
        captures,
      },
      null,
      2,
    )}\n`,
  );
}

test("内置 IP 课程从目录到学习进度形成连续真实旅程", async ({ page }) => {
  const captures: VisibleCopyCapture[] = [];

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/knowledge?view=course");
  await page.evaluate((key) => window.localStorage.removeItem(key), PROGRESS_KEY);
  await page.reload();

  const home = page.locator('[data-slot="built-in-course-home"]');
  await expect(home).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "创作实战课" }),
  ).toBeVisible();
  await expect(home).toContainText("6");
  await expect(home).toContainText("22");
  await expect(home).toContainText("119");
  await expect(home).toContainText("22 讲走通定位、选题、脚本、拍摄、运营与变现");
  await expect(page.locator('[data-slot="built-in-course-attribution"]')).toContainText(
    "基于已获授权的短视频实战课程整理",
  );

  await page.getByRole("link", { name: /从第一课开始/ }).click();
  await expect(page).toHaveURL(/lesson=lesson-01/);
  const lesson = page.locator('[data-slot="built-in-course-lesson"]');
  await expect(lesson).toBeVisible();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "粉丝经济的核心公式：产品满足需求，人物制造偏好",
    }),
  ).toBeVisible();
  await expect(lesson).toContainText("先自测，再看提示");
  await expect(lesson).toContainText("现在就做");
  await expect(lesson).toContainText("掌握标准");
  await expect(lesson).toContainText("学完你会");
  await expect(lesson).toContainText("这一节要交付");

  await page.getByRole("button", { name: "标记本节完成" }).click();
  await expect(page.getByRole("button", { name: "本节已完成" })).toBeDisabled();
  captures.push({
    checkpoint: "course-lesson-completed-normal",
    check_ids: CHECK_IDS,
    viewport: { width: 1440, height: 900 },
    text: await lesson.innerText(),
  });

  await page.reload();
  await expect(page.getByRole("button", { name: "本节已完成" })).toBeDisabled();
  await page.getByRole("link", { name: "返回课程目录" }).click();
  await expect(home).toBeVisible();
  await expect(home).toContainText("1/22 节");
  await expect(home).toContainText("5%");

  await page.setViewportSize({ width: 1024, height: 720 });
  await expect(home).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false);
  await page.getByRole("link", { name: /继续学习/ }).click();
  await expect(lesson).toBeVisible();
  await page.getByRole("link", { name: "下一节" }).click();
  await expect(page).toHaveURL(/lesson=lesson-02/);
  await expect(
    page.getByRole("heading", { level: 1, name: "商业定位先于个人特点" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "上一节" })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false);
  captures.push({
    checkpoint: "course-next-lesson-minimum-window",
    check_ids: CHECK_IDS,
    viewport: { width: 1024, height: 720 },
    text: await page.locator('[data-slot="built-in-course-lesson"]').innerText(),
  });

  writeVisibleCopy(captures);
});

// T-1246 copied-source declaration: original assertions unchanged.
test.describe.configure({ timeout: 30660000 });
