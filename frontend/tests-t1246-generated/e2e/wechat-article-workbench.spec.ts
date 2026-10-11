import { expect, test } from "../helpers/test-environment";
import type { Page } from "@playwright/test";
import { createServer } from "node:http";
import { ENDPOINTS } from "@creatoros/contract";

type RequestScope = string | { groupId: string };
async function dispatch<T>(page: Page, id: string, input: unknown, scope?: RequestScope): Promise<T> {
  const response = await page.request.post("/api/v1/dispatch", {
    headers: { "content-type": "application/json", ...(typeof scope === "string" ? { "x-account-id": scope } : scope?.groupId ? { "x-group-id": scope.groupId } : {}) },
    data: { id, input },
  timeout: 120000});
  expect(response.ok(), `${id}: ${response.status()} ${await response.text()}`).toBe(true);
  return ((await response.json()) as { data: T }).data;
}

// 先用公开真实成员关系完成账号组初始化，避免点击创建后切换器才归一范围。
async function selectAccountGroup(page: Page, accountId: string, baseURL?: string): Promise<string> {
  type Group = { id: string; status: string; members: Array<{ accountId: string; leftAt: string | null }> };
  const groups: Group[] = [];
  let complete = false;
  for (let pageNumber = 1; pageNumber <= 20; pageNumber++) {
    const rows = await dispatch<Group[]>(page, "accountGroups.list", {
      params: undefined, query: { page: pageNumber, pageSize: 100 }, body: undefined,
    });
    groups.push(...rows);
    if (rows.length < 100) { complete = true; break; }
  }
  expect(complete, "账号组公开列表必须完整，不能从截断列表猜归属").toBe(true);
  const matching = groups.filter(group => group.status === "active" &&
    group.members.some(member => member.accountId === accountId && member.leftAt === null));
  expect(matching, "创作账号必须有唯一真实活动成员组").toHaveLength(1);
  const groupId = matching[0]!.id;
  await page.context().addCookies([{ name: "creatoros_current_group", value: encodeURIComponent(groupId),
    url: baseURL ?? "http://127.0.0.1" }]);
  await page.addInitScript(id => window.localStorage.setItem("creatoros:current-group", id), groupId);
  return groupId;
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
  const groupId = await selectAccountGroup(page, accountA.id, baseURL);
  await page.goto(`/projects/${project.id}/article`);
  const workbench = page.locator('[data-page="article-workbench"]');
  await expect(workbench).toBeVisible();
  await expect(workbench.getByRole("button", { name: "新建文章" })).toBeEnabled();
  await workbench.getByRole("button", { name: "新建文章" }).click();
  await expect(workbench.getByText("当前稿件")).toBeVisible();
  await workbench.getByLabel("标题", { exact: true }).fill("多账号的数据怎样导入自己的系统");
  await workbench.getByRole("textbox", { name: "摘要", exact: true }).fill("每个账号独立授权，作品与指标按账号归属。 ");
  await workbench.getByRole("button", { name: "添加段落" }).click();
  await workbench.getByLabel("段落标题").fill("先核对账号身份");
  await workbench.getByLabel("段落正文").fill("扫码后确认平台身份，再按账号采集作品和指标。");
  await workbench.getByRole("button", { name: "保存修改" }).click();
  await expect(workbench.getByText("稿件已保存为新版本并完成指定版本读回。")).toBeVisible();
  await page.reload();
  await expect(workbench.getByLabel("标题", { exact: true })).toHaveValue("多账号的数据怎样导入自己的系统");
  await expect(workbench.getByLabel("段落正文")).toHaveValue("扫码后确认平台身份，再按账号采集作品和指标。");
  await workbench.getByText("历史版本", { exact: true }).click();
  const versions = workbench.getByRole("button", { name: "查看此版" });
  await expect(versions).toHaveCount(2);
  await workbench.locator("li").filter({ hasText: "v2" }).getByRole("button", { name: "查看此版" }).click();
  await expect(workbench.getByTestId("article-history-preview")).toContainText("先核对账号身份");

  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/nxoAAAAASUVORK5CYII=", "base64");
  const upload = await dispatch<{ uploadId: string; uploadUrl: string }>(page, "assets.uploads.create", {
    params: undefined, query: undefined, body: { assetType: "image", mimeType: "image/png", fileSize: png.length,
      fileName: "文章示意图.png", projectId: project.id },
  }, {groupId});
  const put = await page.request.put(upload.uploadUrl, { headers: { "content-type": "image/png" }, data: png , timeout: 120000});
  expect(put.ok()).toBe(true);
  const image = await dispatch<{id: string; currentFileId: string}>(page, "assets.uploads.complete", {
    params: {uploadId: upload.uploadId}, query: undefined, body: {name: "文章示意图.png"},
  }, {groupId});
  await workbench.getByText("段落操作", { exact: true }).click();
  await workbench.getByRole("button", {name: "为此段选图"}).click();
  await workbench.getByLabel("选择图片素材").selectOption(image.id);
  await workbench.getByRole("button", {name: "确认选用此图"}).click();
  await workbench.getByRole("button", {name: "保存修改"}).click();
  await expect(workbench.getByText("稿件已保存为新版本并完成指定版本读回。")).toBeVisible();
  await page.reload();
  const savedWithImage = await dispatch<{current:{imageUses:Array<{assetId:string;assetFileId:string}>};versions:Array<{id:string;versionNumber:number}>}>(page, "articles.get", {
    params: {outputId: new URL(page.url()).searchParams.get("outputId")!}, query: undefined, body: undefined,
  }, {groupId});
  expect(savedWithImage.current.imageUses).toContainEqual({assetId:image.id,assetFileId:image.currentFileId,sectionId:expect.any(String),sourceKind:"existing",reviewState:"selected"});
  await expect(workbench.getByRole("img", {name:"先核对账号身份 的已选配图"})).toBeVisible();
  await workbench.getByText("历史版本", { exact: true }).click();
  await workbench.locator("li").filter({ hasText: "v2" }).getByRole("button", { name: "查看此版" }).click();
  const version2=savedWithImage.versions.find(version=>version.versionNumber===2);
  expect(version2).toBeTruthy();
  const version2Readback=await dispatch<{document:{imageUses:unknown[]}}>(page,"articles.versions.get",{params:{outputId:new URL(page.url()).searchParams.get("outputId")!,versionId:version2!.id},query:undefined,body:undefined},{groupId});
  expect(version2Readback.document.imageUses).toEqual([]);
  await expect(workbench.getByTestId("article-history-preview").getByRole("img", {name:/已选配图/})).toHaveCount(0);

  const outputs = await dispatch<Array<{ id: string; contentType: string }>>(page, "projects.outputs.list", {
    params: { projectId: project.id }, query: undefined, body: undefined,
  }, {groupId});
  const output = outputs.find((row) => row.contentType === "article");
  expect(output).toBeTruthy();
  const accountB = await dispatch<{ id: string }>(page, "accounts.create", {
    params: undefined, query: undefined, body: { platform: "douyin", accountHandle: `article-b-${Date.now()}` },
  });
  const cross = await page.request.post("/api/v1/dispatch", {
    headers: { "content-type": "application/json", "x-account-id": accountB.id },
    data: { id: "articles.get", input: { params: { outputId: output!.id }, query: undefined, body: undefined } },
  timeout: 120000});
  expect(cross.status()).toBe(404);
});

test("公众号文章经独立模型 Worker 生成候选，用户审读采纳后刷新回读", async ({ page, context, baseURL }) => {
  test.setTimeout(Math.max((120_000), 50580000));
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
    const groupId = await selectAccountGroup(page, account.id, baseURL);
    await page.goto(`/projects/${project.id}/article`);
    const workbench = page.locator('[data-page="article-workbench"]');
    await workbench.getByRole("button", { name: "新建文章" }).click();
    await expect(workbench.getByText("当前稿件")).toBeVisible();
    const outputs = await dispatch<Array<{ id: string; contentType: string }>>(page, "projects.outputs.list", {
      params: { projectId: project.id }, query: undefined, body: undefined,
    }, {groupId});
    const output = outputs.find((row) => row.contentType === "article");
    expect(output).toBeTruthy();
    // 先把页面已预填的项目标题/brief通过真实保存链冻结；generate不应再隐式改变基线。
    const saveResponsePromise = page.waitForResponse(response => {
      if (!response.url().includes("/api/v1/dispatch")) return false;
      try { return response.request().postDataJSON()?.id === "articles.versions.create"; } catch { return false; }
    });
    await workbench.getByRole("button", { name: "保存修改" }).click();
    const saveResponse = await saveResponsePromise;
    const saveEnvelope = await saveResponse.json() as { data: unknown };
    expect(saveResponse.status(), JSON.stringify(saveEnvelope)).toBe(200);
    const saved = ENDPOINTS.createArticleVersion.response.parse(saveEnvelope.data);
    const exactSaved = await dispatch<{ versionId: string; document: unknown }>(page, "articles.versions.get", {
      params: { outputId: output!.id, versionId: saved.versionId }, query: undefined, body: undefined,
    }, {groupId});
    expect(exactSaved).toEqual(saved);
    await expect(workbench.getByText("稿件已保存为新版本并完成指定版本读回。")).toBeVisible();
    const before = await dispatch<{ currentVersionId: string; current: {
      title: string; titleSourceRefs?: unknown[]; summary: string; summarySourceRefs?: unknown[];
    } }>(page, "articles.get", {
      params: { outputId: output!.id }, query: undefined, body: undefined,
    }, {groupId});
    expect(before.currentVersionId).toBe(saved.versionId);
    expect(before.current).toEqual(saved.document);
    await workbench.getByText("AI 辅助生成与内容扩展", { exact: true }).click();
    const generatedResponsePromise=page.waitForResponse(response=>{
      if(!response.url().includes("/api/v1/dispatch"))return false;
      try{return response.request().postDataJSON()?.id==="articles.candidates.generate";}catch{return false;}
    });
    await workbench.getByRole("button", { name: "根据脚本扩写文章" }).click();
    const generatedEnvelope=await (await generatedResponsePromise).json() as {data:{candidateId:string}};
    await expect(workbench.getByRole("heading", { name: "待审读候选" })).toBeVisible({ timeout: 120000 });
    await expect(workbench.getByText("来源：项目资料").first()).toBeVisible();
    const generatedCandidate=await dispatch<{proposedTitle:string;proposedTitleSourceRefs:unknown[];proposedSummary:string;proposedSummarySourceRefs:unknown[];proposedSections:Array<{sourceRefs:unknown[]}>}>(page,"articles.candidates.get",{params:{candidateId:generatedEnvelope.data.candidateId},query:undefined,body:undefined},{groupId});
    // fixture模型确实返回projectRef；既有人工标题/摘要必须由Worker保留，不能被模型覆盖或伪造出处。
    expect(proposal().proposedTitleSourceRefs).toEqual([projectRef]);
    expect(proposal().proposedSummarySourceRefs).toEqual([projectRef]);
    expect(generatedCandidate).toMatchObject({
      proposedTitle: before.current.title,
      proposedTitleSourceRefs: before.current.titleSourceRefs ?? [],
      proposedSummary: before.current.summary,
      proposedSummarySourceRefs: before.current.summarySourceRefs ?? [],
    });
    expect(generatedCandidate.proposedSections[0]?.sourceRefs).toEqual([projectRef]);
    expect(modelRequests).toBeGreaterThan(0);
    const pending = await dispatch<{ currentVersionId: string }>(page, "articles.get", {
      params: { outputId: output!.id }, query: undefined, body: undefined,
    }, {groupId});
    expect(pending.currentVersionId).toBe(before.currentVersionId);
    await workbench.getByRole("checkbox", { name: /候选事实清单/ }).uncheck();
    await workbench.getByRole("button", { name: "确认采纳所选内容" }).click();
    await expect(workbench.getByText("已采纳并保存为新版本。", { exact: true })).toBeVisible();
    await page.reload();
    await expect(workbench.getByLabel("标题", { exact: true })).toHaveValue(before.current.title);
    await expect(workbench.getByLabel("段落正文")).toHaveValue("这是模型给出的待审读正文，采纳后才进入项目文章。");
    const adopted=await dispatch<{currentVersionId:string;current:{title:string;titleSourceRefs?:unknown[];summary:string;summarySourceRefs?:unknown[];sections:Array<{sourceRefs:unknown[]}>};versions:Array<{id:string;versionNumber:number}>}>(page,"articles.get",{params:{outputId:output!.id},query:undefined,body:undefined},{groupId});
    expect(adopted.current.title).toBe(before.current.title);
    expect(adopted.current.summary).toBe(before.current.summary);
    expect(adopted.current.titleSourceRefs ?? []).toEqual(before.current.titleSourceRefs ?? []);
    expect(adopted.current.summarySourceRefs ?? []).toEqual(before.current.summarySourceRefs ?? []);
    expect(adopted.current.sections[0]?.sourceRefs).toEqual([projectRef]);
    const adoptedVersion = adopted.versions.find(version => version.id === adopted.currentVersionId);
    expect(adoptedVersion, "公开文章资源必须列出当前采纳版本").toBeTruthy();
    const exactAdopted = await dispatch<{versionId:string;document:unknown}>(page, "articles.versions.get", {
      params: {outputId: output!.id, versionId: adopted.currentVersionId}, query: undefined, body: undefined,
    }, {groupId});
    expect(exactAdopted).toEqual({versionId: adopted.currentVersionId, document: adopted.current});
    await workbench.getByText("历史版本", { exact: true }).click();
    await workbench.locator("li").filter({hasText: new RegExp(`^v${adoptedVersion!.versionNumber} ·`)})
      .getByRole("button", {name: "查看此版"}).click();
    const adoptedPreview = workbench.getByTestId("article-history-preview");
    await expect(adoptedPreview.getByText("这是模型给出的待审读正文，采纳后才进入项目文章。", {exact:true})).toBeVisible();
    await expect(adoptedPreview.getByText("来源：项目资料").first()).toBeVisible();
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

// T-1246 copied-source declaration: original assertions unchanged.
test.describe.configure({ timeout: 50580000 });
