import { randomUUID } from "node:crypto";
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { unzipSync } from "fflate";
import type { Page } from "@playwright/test";
import { ENDPOINTS } from "@creatoros/contract";
import { test, expect as baseExpect } from "../helpers/test-environment";
const expect = baseExpect.configure({ timeout: 120_000 });

// These are real manual owner/UI operations in the isolated Playwright database.
// Model proposals and native video preview/apply require the separate integrated real-engine run.
async function dispatch(
  page: Page,
  id: string,
  input: unknown,
  groupId?: string,
) {
  const response = await page.request.post("/api/v1/dispatch", {
    timeout: 120_000,
    headers: {
      "content-type": "application/json",
      ...(groupId ? { "x-group-id": groupId } : {}),
    },
    data: { id, input },
  });
  expect(
    response.ok(),
    `${id}: ${response.status()} ${await response.text()}`,
  ).toBe(true);
  return (await response.json()).data;
}
async function workspace(page: Page, baseURL: string) {
  await page.goto("/");
  const group = await dispatch(page, "accountGroups.create", {
    body: { name: `编导真实UI-${randomUUID()}`, idempotencyKey: randomUUID() },
  });
  const project = await dispatch(
    page,
    "projects.create",
    {
      body: {
        title: "同一项目的文章与图文",
        brief: "手工保存与排版验收",
        contentType: "article",
      },
    },
    group.id,
  );
  // Mirror the existing writeCurrentGroupId switch: the previous account cookie
  // must be removed before SSR, even when the new group has no bound accounts.
  await page.evaluate((id) => {
    localStorage.setItem("creatoros:current-group", id);
    localStorage.removeItem("creatoros:current-account");
  }, group.id);
  await page.context().clearCookies({ name: "creatoros_current_account" });
  await page
    .context()
    .addCookies([
      {
        name: "creatoros_current_group",
        value: encodeURIComponent(group.id),
        url: baseURL,
      },
    ]);
  await page.addInitScript((id) => {
    localStorage.setItem("creatoros:current-group", id);
    localStorage.removeItem("creatoros:current-account");
  }, group.id);
  return { group, project };
}
function evidence(
  info: { outputPath: (name: string) => string },
  name: string,
) {
  const directory = process.env.CREATOROS_T1070_EVIDENCE_DIR;
  if (directory) {
    mkdirSync(directory, { recursive: true });
    return join(directory, name);
  }
  return info.outputPath(name);
}

test("真实文章保存、指定版本刷新、同项目编导窄屏打开、NoteRelay HTML交付", async ({
  page,
  context,
  baseURL,
}, info) => {
  test.setTimeout(1_800_000);
  page.setDefaultTimeout(120_000);
  page.setDefaultNavigationTimeout(120_000);
  context.setDefaultTimeout(120_000);
  const { group, project } = await workspace(page, baseURL!);
  const output = await dispatch(
    page,
    ENDPOINTS.createOutput.id,
    {
      params: { projectId: project.id },
      body: {
        title: "真实文章",
        contentType: "article",
        clientRequestId: randomUUID(),
      },
    },
    group.id,
  );
  await page.goto(`/projects/${project.id}/article?outputId=${output.id}`);
  const workbench = page.locator('[data-page="article-workbench"]');
  await expect(workbench.getByText("当前稿件", { exact: true })).toBeVisible();
  await expect(page.locator('[data-slot="stage-chat-rail"]')).toHaveCount(1);
  await expect(
    workbench.getByRole("button", { name: "根据脚本扩写文章" }),
  ).toHaveCount(0);
  await workbench
    .getByLabel("标题", { exact: true })
    .fill("真实保存后继续微调");
  await workbench.getByRole("button", { name: "添加段落" }).click();
  await workbench.getByLabel("段落标题").fill("先保存当前修改");
  await workbench
    .getByLabel("段落正文")
    .fill("编导读取这个真实段落，候选预览后才采用。");
  await workbench.getByRole("button", { name: "保存修改" }).click();
  await expect(
    workbench.getByText("稿件已保存为新版本并完成指定版本读回。"),
  ).toBeVisible();
  const current = ENDPOINTS.getArticle.response.parse(
    await dispatch(
      page,
      ENDPOINTS.getArticle.id,
      { params: { outputId: output.id } },
      group.id,
    ),
  );
  const exact = ENDPOINTS.getArticleVersion.response.parse(
    await dispatch(
      page,
      ENDPOINTS.getArticleVersion.id,
      { params: { outputId: output.id, versionId: current.currentVersionId } },
      group.id,
    ),
  );
  expect(exact.document).toEqual(current.current);
  expect(exact.document.sections[0]?.sectionId).toBeTruthy();
  await page.reload();
  await expect(workbench.getByLabel("段落正文")).toHaveValue(
    "编导读取这个真实段落，候选预览后才采用。",
  );
  const preview = workbench.getByRole("region", { name: "NoteRelay 排版预览" });
  await expect(
    preview.getByRole("button", { name: "复制公众号文章" }),
  ).toBeEnabled();
  await page.screenshot({
    path: evidence(info, "article-after-desktop.png"),
    fullPage: true,
  });
  await preview.getByText("更多导出", { exact: true }).click();
  const downloadPromise = page.waitForEvent("download", { timeout: 120_000 });
  await preview.getByRole("button", { name: "导出 HTML" }).click();
  const download = await downloadPromise;
  const html = evidence(info, "article-real-export.html");
  await download.saveAs(html);
  expect(readFileSync(html, "utf8")).toContain("编导读取这个真实段落");
  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(page.getByRole("button", { name: "打开编导" })).toBeVisible();
  await page.getByRole("button", { name: "打开编导" }).click();
  const dialog = page.getByRole("dialog", { name: "编导对话" });
  await expect(dialog).toBeVisible();
  await expect(page.locator('[data-slot="stage-chat-rail"]')).toHaveCount(1);
  await expect(dialog).toContainText("同一项目的文章与图文");
  await page.screenshot({
    path: evidence(info, "article-director-narrow.png"),
    fullPage: true,
  });
  await dialog.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "打开编导" })).toBeFocused();
});

test("真实图文三卡保存刷新，NoteRelay翻页与ZIP可用，旧图片入口与历史保留", async ({
  page,
  context,
  baseURL,
}, info) => {
  test.setTimeout(1_800_000);
  page.setDefaultTimeout(120_000);
  page.setDefaultNavigationTimeout(120_000);
  context.setDefaultTimeout(120_000);
  const { group, project } = await workspace(page, baseURL!);
  const output = await dispatch(
    page,
    ENDPOINTS.createOutput.id,
    {
      params: { projectId: project.id },
      body: {
        title: "真实图文",
        contentType: "image",
        clientRequestId: randomUUID(),
      },
    },
    group.id,
  );
  const baseline = ENDPOINTS.getGraphicPost.response.parse(
    await dispatch(
      page,
      ENDPOINTS.getGraphicPost.id,
      { params: { outputId: output.id } },
      group.id,
    ),
  );
  const document = {
    ...baseline.current,
    title: "真实图文分页",
    body: "这是手工输入的完整图文配文。",
    cardBriefs: [1, 2, 3].map((number) => ({
      cardId: randomUUID(),
      title: `第${number}个要点`,
      body: `第${number}页内容：保存真实ID，分页只影响预览。`,
      sourceRefs: [],
    })),
  };
  await dispatch(
    page,
    ENDPOINTS.createGraphicPostVersion.id,
    {
      params: { outputId: output.id },
      body: {
        expectedCurrentVersionId: baseline.currentVersionId,
        document,
        clientRequestId: randomUUID(),
      },
    },
    group.id,
  );
  await page.goto(`/projects/${project.id}/outputs/${output.id}/image`);
  const workbench = page.locator('[data-page="graphic-post-workbench"]');
  await expect(
    workbench.getByRole("textbox", { name: "正文", exact: true }),
  ).toHaveValue(document.body);
  await expect(page.locator('[data-slot="stage-chat-rail"]')).toHaveCount(1);
  await expect(
    workbench.getByRole("button", { name: "根据脚本生成图文" }),
  ).toHaveCount(0);
  await workbench
    .getByRole("textbox", { name: "正文", exact: true })
    .fill("手工修改仍可保存与刷新。");
  await workbench.getByRole("button", { name: "保存作品" }).click();
  await expect(
    workbench.getByText("作品已保存。", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    workbench.getByRole("textbox", { name: "正文", exact: true }),
  ).toHaveValue("手工修改仍可保存与刷新。");
  const current = ENDPOINTS.getGraphicPost.response.parse(
    await dispatch(
      page,
      ENDPOINTS.getGraphicPost.id,
      { params: { outputId: output.id } },
      group.id,
    ),
  );
  expect(current.current.cardBriefs?.map((card) => card.cardId)).toEqual(
    document.cardBriefs.map((card) => card.cardId),
  );
  const preview = workbench.getByRole("region", { name: "NoteRelay 排版预览" });
  await expect(
    preview.getByRole("button", { name: "导出分页 ZIP" }),
  ).toBeEnabled();
  await expect(preview.getByRole("button", { name: "下一页" })).toBeEnabled();
  await preview.getByRole("button", { name: "下一页" }).click();
  await expect(preview.getByRole("button", { name: "上一页" })).toBeEnabled();
  await page.screenshot({
    path: evidence(info, "graphic-after-desktop.png"),
    fullPage: true,
  });
  const downloadPromise = page.waitForEvent("download", { timeout: 120_000 });
  await preview.getByRole("button", { name: "导出分页 ZIP" }).click();
  const download = await downloadPromise;
  const archive = evidence(info, "graphic-real-pages.zip");
  await download.saveAs(archive);
  const pages = unzipSync(readFileSync(archive));
  expect(
    Object.keys(pages).filter((name) => name.endsWith(".png")).length,
  ).toBeGreaterThanOrEqual(3);
  await workbench.getByText("历史版本", { exact: true }).click();
  await expect(workbench.getByRole("button", { name: /v2/ })).toBeVisible();
  await expect(
    workbench.getByText("手动选图与封面", { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.getByRole("button", { name: "打开编导" }).click();
  await expect(page.getByRole("dialog", { name: "编导对话" })).toBeVisible();
  await page.screenshot({
    path: evidence(info, "graphic-director-narrow.png"),
    fullPage: true,
  });
});
