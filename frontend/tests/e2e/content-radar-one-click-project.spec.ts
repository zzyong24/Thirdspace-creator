import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import type { Page } from "@playwright/test";
import { expect, test } from "../helpers/test-environment";

const CURRENT_ACCOUNT_KEY = "creatoros:current-account";
const CURRENT_ACCOUNT_COOKIE = "creatoros_current_account";

async function dispatch<T>(
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
  });
  const payload = (await response.json()) as {
    data?: T;
    error?: { message?: string };
  };
  expect(
    response.ok(),
    `${id} 应成功，实得 ${response.status()}：${payload.error?.message ?? "unknown"}`,
  ).toBe(true);
  return payload.data as T;
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
    ([key, id]) => window.localStorage.setItem(key!, id!),
    [CURRENT_ACCOUNT_KEY, accountId],
  );
}

async function waitForRun(
  page: Page,
  accountId: string,
  runId: string,
  timeoutMs = 120_000,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { run } = await dispatch<{
      run: { status: string; errorCode?: string | null };
    }>(
      page,
      "intelligence.runs.get",
      { params: { runId }, query: undefined },
      accountId,
    );
    if (["succeeded_with_items", "succeeded_no_change", "partial"].includes(run.status)) {
      return;
    }
    if (["failed", "blocked"].includes(run.status)) {
      throw new Error(
        `采集 ${runId} ${run.status}: ${run.errorCode ?? ""}`,
      );
    }
    await page.waitForTimeout(250);
  }
  throw new Error(`等待采集 ${runId} 超时`);
}

async function waitForTransform(
  page: Page,
  accountId: string,
  itemId: string,
  transformId: string,
  timeoutMs = 60_000,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const detail = await dispatch<{
      transforms: Array<{
        id: string;
        taskStatus: string | null;
        taskErrorCode: string | null;
        taskErrorMessage: string | null;
      }>;
    }>(
      page,
      "intelligence.items.get",
      { params: { itemId }, query: undefined },
      accountId,
    );
    const transform = detail.transforms.find((row) => row.id === transformId);
    if (transform?.taskStatus === "succeeded") return;
    if (
      transform?.taskStatus &&
      ["failed", "blocked", "cancelled"].includes(transform.taskStatus)
    ) {
      throw new Error(
        `选题生成 ${transform.taskStatus}: ${transform.taskErrorCode ?? ""} ${transform.taskErrorMessage ?? ""}`,
      );
    }
    await page.waitForTimeout(250);
  }
  throw new Error(`等待选题生成 ${transformId} 超时`);
}

function startLocalOpenAiServer() {
  const server = createServer((request, response) => {
    if (request.method !== "POST" || !request.url?.endsWith("/chat/completions")) {
      response.writeHead(404).end();
      return;
    }
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("end", () => {
      const bodyText = Buffer.concat(chunks).toString("utf8");
      let content: string;
      if (bodyText.includes("直接输出主播会念的完整正文")) {
        content =
          "很多人以为内容升级只是多走一步确认，但真正影响创作效率的，是灵感能不能直接进入生产。今天用一条真实来源，把拆解、改写策略和初稿一起带进项目，让创作者从发现到开工只做一次明确选择。";
      } else if (bodyText.includes("只生成属于本账号的新选题")) {
        content = JSON.stringify({
          title: "为什么好选题应该直接进入生产",
          angle: "从创作者减少重复确认的实际工作流切入",
          differentiation: "不复述来源结论，只讨论内容生产链路的效率",
          sourceSummary: "这条来源适合研究如何把复杂流程讲清楚",
          targetAudience: "需要稳定产出短视频的内容创作者",
          audiencePain: "灵感收集后仍需多次搬运和确认",
          coreConflict: "流程完整性与创作效率之间的冲突",
          format: "不露脸口播配真实工作台画面",
          adaptationStrategy: {
            keep: ["问题驱动的开头"],
            replace: ["替换来源案例"],
            add: ["加入真实创作流程"],
            avoid: ["避免复制原句"],
          },
        });
      } else {
        content = JSON.stringify({
          hook: "先指出重复确认正在消耗创作者的注意力",
          structureSteps: ["提出工作流问题", "解释一键立项的价值", "给出可执行路径"],
          coreClaims: ["明确的一次确认足以触发正式立项"],
          reusablePattern: "真实问题开场，再用流程变化给出解决方案",
          factRisks: [],
        });
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          id: `chatcmpl-t870-${Date.now()}`,
          object: "chat.completion",
          created: Math.floor(Date.now() / 1_000),
          model: "creatoros-t870-local",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 100, completion_tokens: 100, total_tokens: 200 },
        }),
      );
    });
  });
  return new Promise<{ baseUrl: string; close: () => Promise<void> }>(
    (resolveServer, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (!address || typeof address === "string") {
          reject(new Error("本地模型服务没有取得端口"));
          return;
        }
        resolveServer({
          baseUrl: `http://127.0.0.1:${address.port}/v1`,
          close: () =>
            new Promise((resolveClose, rejectClose) =>
              server.close((error) =>
                error ? rejectClose(error) : resolveClose(),
              ),
            ),
        });
      });
    },
  );
}

function writeVisibleCopy(
  captures: ReadonlyArray<{
    checkpoint: string;
    check_ids: ReadonlyArray<string>;
    viewport: { width: number; height: number };
    text: string;
  }>,
) {
  const repoRoot = resolve(process.cwd(), "..");
  const evidenceDir = resolve(repoRoot, "orchestrator", "evidence");
  mkdirSync(evidenceDir, { recursive: true });
  const commitSha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
  writeFileSync(
    resolve(evidenceDir, "T-870-visible-copy.json"),
    `${JSON.stringify(
      {
        schema: "frontend-visible-copy/v1",
        task_id: "T-870",
        commit_sha: commitSha,
        captures,
      },
      null,
      2,
    )}\n`,
  );
}

function stableVisibleText(text: string) {
  return text.replace(/最近采集[^\n]*/g, "最近采集时间已记录");
}

test("内容雷达转写选题一键升级项目，并可幂等回读同一项目", async ({
  page,
  baseURL,
}) => {
  test.setTimeout(300_000);
  const localModel = await startLocalOpenAiServer();
  try {
    const account = await dispatch<{ id: string }>(page, "accounts.create", {
      params: undefined,
      query: undefined,
      body: {
        platform: "douyin",
        accountHandle: `@e2e-radar-upgrade-${Date.now()}`,
      },
    });
    await dispatch(
      page,
      "settings.models.put",
      {
        params: { capability: "topic.generate" },
        query: undefined,
        body: {
          provider: "openai-compatible",
          modelName: "creatoros-t870-local",
          baseUrl: localModel.baseUrl,
          apiFormat: "openai_chat",
          settings: { structuredOutputs: true },
          secret: "t870-local-test-key",
          isDefault: false,
        },
      },
      account.id,
    );
    await dispatch(
      page,
      "positioning.profile.upsert",
      {
        params: undefined,
        query: undefined,
        body: {
          persona: "内容工作流产品创作者",
          field: "AI 内容生产",
          audience: "需要稳定产出短视频的创作者",
          differentiation: "只讲真实工作流验证",
          capabilities: ["内容策划", "短视频生产"],
        },
      },
      account.id,
    );
    const positioning = await dispatch<{ id: string }>(
      page,
      "positioning.statements.create",
      {
        params: undefined,
        query: undefined,
        body: {
          oneLiner: "帮助创作者把内容灵感直接变成可生产的项目",
          keywords: ["内容雷达", "创作效率", "项目生产"],
          productAnchorIds: [],
          changeReason: "T-870 隔离验收",
        },
      },
      account.id,
    );
    const source = await dispatch<{
      source: { id: string };
      run: { id: string } | null;
    }>(
      page,
      "intelligence.sources.create",
      {
        params: undefined,
        query: undefined,
        body: {
          accountId: account.id,
          collectionId: null,
          type: "rss",
          config: { type: "rss", url: "https://www.w3.org/blog/news/feed/" },
          displayName: "T-870 代表性公开信源",
          monitorEnabled: false,
          runInitial: true,
          idempotencyKey: `t870-source-${Date.now()}`,
        },
      },
      account.id,
    );
    expect(source.run).not.toBeNull();
    await waitForRun(page, account.id, source.run!.id);

    const items = await dispatch<
      Array<{ item: { id: string; title: string } }>
    >(
      page,
      "intelligence.items.list",
      {
        params: undefined,
        query: {
          accountId: account.id,
          sourceId: source.source.id,
          sort: "newest",
          page: 1,
          pageSize: 20,
        },
      },
      account.id,
    );
    expect(items.length).toBeGreaterThan(0);
    const itemId = items[0]!.item.id;
    let detail = await dispatch<{
      snapshots: Array<{ id: string }>;
      transforms: Array<{
        id: string;
        targetTopicId: string | null;
        outputSnapshot: unknown;
      }>;
    }>(
      page,
      "intelligence.items.get",
      { params: { itemId }, query: undefined },
      account.id,
    );
    expect(detail.snapshots.length).toBeGreaterThan(0);
    await dispatch(
      page,
      "intelligence.transcripts.uploadManual",
      {
        params: undefined,
        query: undefined,
        body: {
          itemId,
          inputMode: "paste",
          text:
            "很多创作者收集到一个好选题以后，还要先保存到选题池，再打开选题中心确认，最后才能创建项目。每多一次搬运，注意力就会被打断。更合理的做法，是在来源、逐字稿、拆解和初稿都准备好以后，让用户的一次明确点击直接完成确认和立项，同时保留来源证据，失败时也能安全重试。",
        },
      },
      account.id,
    );
    const preview = await dispatch<{ transform: { id: string } }>(
      page,
      "intelligence.transforms.previewTopic",
      {
        params: undefined,
        query: undefined,
        body: {
          itemId,
          sourceSnapshotId: detail.snapshots[0]!.id,
          positioningVersionId: positioning.id,
          idempotencyKey: `t870-preview-${Date.now()}`,
        },
      },
      account.id,
    );
    await waitForTransform(page, account.id, itemId, preview.transform.id);
    detail = await dispatch(
      page,
      "intelligence.items.get",
      { params: { itemId }, query: undefined },
      account.id,
    );
    expect(detail.transforms[0]?.outputSnapshot).not.toBeNull();

    await selectAccount(page, account.id, baseURL);
    const captures: Array<{
      checkpoint: string;
      check_ids: ReadonlyArray<string>;
      viewport: { width: number; height: number };
      text: string;
    }> = [];
    const checkIds = [
      "AC-RADAR-UPGRADE-ACTION",
      "AC-RADAR-UPGRADE-NO-SECOND-CONFIRM",
      "AC-RADAR-UPGRADE-READBACK",
    ];

    await page.setViewportSize({ width: 1536, height: 1024 });
    await page.goto("/intelligence");
    await page.waitForLoadState("networkidle");
    const targetTitle = items[0]!.item.title;
    const detailLoaded = page.waitForResponse((response) => {
      if (!response.url().endsWith("/api/v1/dispatch")) return false;
      try {
        return (
          (response.request().postDataJSON() as { id?: string }).id ===
          "intelligence.items.get"
        );
      } catch {
        return false;
      }
    });
    await page.locator("main button").filter({ hasText: targetTitle }).click();
    await detailLoaded;
    const detailPanel = page.getByTestId("intelligence-detail");
    await expect(
      detailPanel.getByRole("heading", { name: targetTitle, exact: true }),
    ).toBeVisible();
    const upgrade = detailPanel.getByRole("button", { name: "一键升级项目" });
    await expect(upgrade).toBeVisible();
    await expect(upgrade).toBeEnabled();
    captures.push({
      checkpoint: "radar-topic-ready",
      check_ids: checkIds,
      viewport: { width: 1536, height: 1024 },
      text: stableVisibleText(await detailPanel.innerText()),
    });

    await page.setViewportSize({ width: 1024, height: 720 });
    await expect(upgrade).toBeVisible();
    await expect(upgrade).toBeEnabled();
    captures.push({
      checkpoint: "radar-topic-ready-minimum-window",
      check_ids: checkIds,
      viewport: { width: 1024, height: 720 },
      text: stableVisibleText(await detailPanel.innerText()),
    });

    await upgrade.click();
    await page.waitForURL(/\/projects\/project-[^/?#]+$/, { timeout: 30_000 });
    const projectId = new URL(page.url()).pathname.split("/").at(-1)!;
    const project = await dispatch<{ id: string; title: string }>(
      page,
      "projects.get",
      { params: { projectId }, query: undefined },
      account.id,
    );
    expect(project.id).toBe(projectId);
    expect(project.title).toBe("为什么好选题应该直接进入生产");

    detail = await dispatch(
      page,
      "intelligence.items.get",
      { params: { itemId }, query: undefined },
      account.id,
    );
    const topicId = detail.transforms[0]?.targetTopicId;
    expect(topicId).toBeTruthy();
    const replay = await dispatch<{ projectId: string }>(
      page,
      "candidates.promote",
      { params: { candidateId: topicId }, query: undefined, body: {} },
      account.id,
    );
    expect(replay.projectId).toBe(projectId);
    captures.push({
      checkpoint: "project-created-and-replayed",
      check_ids: checkIds,
      viewport: { width: 1024, height: 720 },
      text: `项目已创建：${project.title}；重复立项返回同一项目。`,
    });
    writeVisibleCopy(captures);
  } finally {
    await localModel.close();
  }
});
