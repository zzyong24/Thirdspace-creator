import { expect, test } from "../helpers/test-environment";
import type { Page } from "@playwright/test";
import { createServer } from "node:http";

async function dispatch<T>(page: Page, id: string, input: unknown, accountId?: string): Promise<T> {
  const response = await page.request.post("/api/v1/dispatch", {
    headers: { "content-type": "application/json", ...(accountId ? { "x-account-id": accountId } : {}) },
    data: { id, input },
  });
  expect(response.ok(), `${id}: ${response.status()} ${await response.text()}`).toBe(true);
  return ((await response.json()) as { data: T }).data;
}

test("公众号文章从项目目标到手写版本、刷新回读和跨账号隔离", async ({ page, context, baseURL }) => {
  const accountA = await dispatch<{ id: string }>(page, "accounts.create", {
    params: undefined, query: undefined, body: { platform: "xiaohongshu", accountHandle: `article-a-${Date.now()}` },
  });
  const project = await dispatch<{ id: string }>(page, "projects.create", {
    params: undefined, query: undefined,
    body: { title: "公众号长文端到端验收", brief: "介绍多账号数据边界", contentType: "article", targetPlatforms: ["wechatOfficialAccount"] },
  }, accountA.id);
  await context.addCookies([{ name: "creatoros_current_account", value: encodeURIComponent(accountA.id),
    url: baseURL ?? "http://127.0.0.1" }]);
  await page.addInitScript(([key, id]) => window.localStorage.setItem(key!, id!),
    ["creatoros:current-account", accountA.id]);
  await page.goto(`/projects/${project.id}/article`);
  const workbench = page.locator('[data-page="article-workbench"]');
  await expect(workbench).toBeVisible();
  await expect(workbench.getByRole("button", { name: "新建文章" })).toBeEnabled();
  await workbench.getByRole("button", { name: "新建文章" }).click();
  await expect(workbench.getByText("当前稿件")).toBeVisible();
  await workbench.getByLabel("标题", { exact: true }).fill("多账号的数据怎样导入自己的系统");
  await workbench.getByLabel("摘要", { exact: true }).fill("每个账号独立授权，作品与指标按账号归属。 ");
  await workbench.getByRole("button", { name: "添加段落" }).click();
  await workbench.getByLabel("段落标题").fill("先核对账号身份");
  await workbench.getByLabel("正文").fill("扫码后确认平台身份，再按账号采集作品和指标。");
  await workbench.getByRole("button", { name: "保存修改" }).click();
  await expect(workbench.getByText("稿件已保存为新版本。")).toBeVisible();
  await page.reload();
  await expect(workbench.getByLabel("标题", { exact: true })).toHaveValue("多账号的数据怎样导入自己的系统");
  await expect(workbench.getByLabel("正文")).toHaveValue("扫码后确认平台身份，再按账号采集作品和指标。");
  const versions = workbench.getByRole("button", { name: "查看此版" });
  await expect(versions).toHaveCount(2);
  await workbench.locator("li").filter({ hasText: "v2" }).getByRole("button", { name: "查看此版" }).click();
  await expect(workbench.getByTestId("article-history-preview")).toContainText("先核对账号身份");

  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/nxoAAAAASUVORK5CYII=", "base64");
  const upload = await dispatch<{ uploadId: string; uploadUrl: string }>(page, "assets.uploads.create", {
    params: undefined, query: undefined, body: { assetType: "image", mimeType: "image/png", fileSize: png.length,
      fileName: "文章示意图.png", projectId: project.id },
  }, accountA.id);
  const put = await page.request.put(upload.uploadUrl, { headers: { "content-type": "image/png" }, data: png });
  expect(put.ok()).toBe(true);
  const image = await dispatch<{id: string; currentFileId: string}>(page, "assets.uploads.complete", {
    params: {uploadId: upload.uploadId}, query: undefined, body: {name: "文章示意图.png"},
  }, accountA.id);
  await workbench.getByRole("button", {name: "为此段选图"}).click();
  await workbench.getByLabel("选择图片素材").selectOption(image.id);
  await workbench.getByRole("button", {name: "确认选用此图"}).click();
  await workbench.getByRole("button", {name: "保存修改"}).click();
  await expect(workbench.getByText("稿件已保存为新版本。")).toBeVisible();
  await page.reload();
  await expect(workbench.getByText(`文件版本 ${image.currentFileId}`)).toBeVisible();
  await workbench.locator("li").filter({ hasText: "v2" }).getByRole("button", { name: "查看此版" }).click();
  await expect(workbench.getByTestId("article-history-preview")).not.toContainText(`文件版本 ${image.currentFileId}`);

  const outputs = await dispatch<Array<{ id: string; contentType: string }>>(page, "projects.outputs.list", {
    params: { projectId: project.id }, query: undefined, body: undefined,
  }, accountA.id);
  const output = outputs.find((row) => row.contentType === "article");
  expect(output).toBeTruthy();
  const accountB = await dispatch<{ id: string }>(page, "accounts.create", {
    params: undefined, query: undefined, body: { platform: "douyin", accountHandle: `article-b-${Date.now()}` },
  });
  const cross = await page.request.post("/api/v1/dispatch", {
    headers: { "content-type": "application/json", "x-account-id": accountB.id },
    data: { id: "articles.get", input: { params: { outputId: output!.id }, query: undefined, body: undefined } },
  });
  expect(cross.status()).toBe(404);
});

test("公众号文章经独立模型 Worker 生成候选，用户审读采纳后刷新回读", async ({ page, context, baseURL }) => {
  test.setTimeout(120_000);
  let projectRef: {kind: "project"; id: string; versionId: string} | null = null;
  const proposal = () => ({
    proposedTitle: "可核验的创作数据", proposedTitleSourceRefs: projectRef ? [projectRef] : [],
    proposedSummary: "先核验账号，再按账号保存作品与指标。", proposedSummarySourceRefs: projectRef ? [projectRef] : [],
    proposedFactItems: [],
    proposedSections: [{ op: "insert", sectionId: "section-1", afterSectionId: null, order: 0,
      heading: "先核验账号", body: "这是模型给出的待审读正文，采纳后才进入项目文章。", sourceRefs: projectRef ? [projectRef] : [] }],
    proposedVisualBriefs: [{ sectionId: "section-1", brief: "账号与作品归属示意图" }], sourceRefs: [],
  });
  let modelRequests = 0;
  const model = createServer((request, response) => {
    request.resume(); modelRequests++;
    const base = { id: "article-e2e-model", object: "chat.completion.chunk", created: 1, model: "article-e2e" };
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.end(`data: ${JSON.stringify({ ...base, choices: [{ index: 0,
      delta: { role: "assistant", content: JSON.stringify(proposal()) }, finish_reason: null }] })}\n\n` +
      `data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        usage: { prompt_tokens: 20, completion_tokens: 40, total_tokens: 60 } })}\n\n` + "data: [DONE]\n\n");
  });
  await new Promise<void>((done) => model.listen(0, "127.0.0.1", done));
  try {
    const address = model.address();
    if (!address || typeof address === "string") throw new Error("隔离模型服务未取得端口");
    const account = await dispatch<{ id: string }>(page, "accounts.create", {
      params: undefined, query: undefined, body: { platform: "xiaohongshu", accountHandle: `article-model-${Date.now()}` },
    });
    await dispatch(page, "settings.models.put", { params: { capability: "copy.generate" }, query: undefined,
      body: { provider: "openai-compatible", modelName: "article-e2e", baseUrl: `http://127.0.0.1:${address.port}/v1`,
        apiFormat: "openai_chat", settings: { structuredOutputs: true }, secret: "local-article-e2e-only", isDefault: false } }, account.id);
    const project = await dispatch<{ id: string }>(page, "projects.create", { params: undefined, query: undefined,
      body: { title: "模型文章创作验收", brief: "介绍账号核验与作品归属的真实方法", contentType: "article",
        targetPlatforms: ["wechatOfficialAccount"] } }, account.id);
    const projectCurrent = await dispatch<{ updatedAt: string }>(page, "projects.get", {
      params: { projectId: project.id }, query: undefined, body: undefined,
    }, account.id);
    projectRef = {kind: "project", id: project.id, versionId: projectCurrent.updatedAt};
    await context.addCookies([{ name: "creatoros_current_account", value: encodeURIComponent(account.id),
      url: baseURL ?? "http://127.0.0.1" }]);
    await page.addInitScript(([key, id]) => window.localStorage.setItem(key!, id!),
      ["creatoros:current-account", account.id]);
    await page.goto(`/projects/${project.id}/article`);
    const workbench = page.locator('[data-page="article-workbench"]');
    await workbench.getByRole("button", { name: "新建文章" }).click();
    await expect(workbench.getByText("当前稿件")).toBeVisible();
    const outputs = await dispatch<Array<{ id: string; contentType: string }>>(page, "projects.outputs.list", {
      params: { projectId: project.id }, query: undefined, body: undefined,
    }, account.id);
    const output = outputs.find((row) => row.contentType === "article");
    expect(output).toBeTruthy();
    const before = await dispatch<{ currentVersionId: string }>(page, "articles.get", {
      params: { outputId: output!.id }, query: undefined, body: undefined,
    }, account.id);
    await workbench.getByRole("button", { name: "生成长文候选" }).click();
    await expect(workbench.getByRole("heading", { name: "待审读候选" })).toBeVisible({ timeout: 60_000 });
    await expect(workbench.getByText(`版本 ${projectCurrent.updatedAt}`).first()).toBeVisible();
    expect(modelRequests).toBeGreaterThan(0);
    const pending = await dispatch<{ currentVersionId: string }>(page, "articles.get", {
      params: { outputId: output!.id }, query: undefined, body: undefined,
    }, account.id);
    expect(pending.currentVersionId).toBe(before.currentVersionId);
    await workbench.getByRole("checkbox", { name: /待确认事实/ }).uncheck();
    await workbench.getByRole("button", { name: "确认采纳所选内容" }).click();
    await expect(workbench.getByText("已采纳并保存为新版本。", { exact: true })).toBeVisible();
    await page.reload();
    await expect(workbench.getByLabel("标题", { exact: true })).toHaveValue("可核验的创作数据");
    await expect(workbench.getByLabel("正文")).toHaveValue("这是模型给出的待审读正文，采纳后才进入项目文章。");
    await workbench.locator("li").filter({ hasText: "v2" }).getByRole("button", { name: "查看此版" }).click();
    await expect(workbench.getByTestId("article-history-preview")).toContainText(projectCurrent.updatedAt);
    const imageLink = workbench.getByRole("link", { name: "为此段生成图片候选" });
    await expect(imageLink).toHaveAttribute("href", /fn=material\.generate\.image/);
    await expect(imageLink).toHaveAttribute("href", new RegExp(`selOutputId=${output!.id}`));
    await expect(imageLink).toHaveAttribute("href", /selId=section-1/);
    await imageLink.click();
    await expect(page).toHaveURL(/fn=material\.generate\.image/);
    await expect(page.getByRole("textbox", {name: "我能帮你做什么"})).toHaveValue(/账号与作品归属示意图/);
  } finally {
    model.closeAllConnections();
    await new Promise<void>((done) => model.close(() => done()));
  }
});
