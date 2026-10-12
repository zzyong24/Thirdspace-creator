import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import type { Page } from "@playwright/test";
import {
  ENDPOINTS,
  ErrorCode,
  type AccountGroupResource,
} from "@creatoros/contract";
import { expect, test } from "../helpers/test-environment";

const CURRENT_ACCOUNT_KEY = "creatoros:current-account";
const CURRENT_ACCOUNT_COOKIE = "creatoros_current_account";
const CURRENT_GROUP_KEY = "creatoros:current-group";
const CURRENT_GROUP_COOKIE = "creatoros_current_group";
const FIXTURE_BODY =
  "验收正文第一段：这段中性示例用于验证改写初稿从公开预览进入雷达编辑框与项目稿面。\n验收正文第二段：保留本段与来源快照，用于核对完整正文和段落顺序。它只用于隔离验收，不是实际创作建议。";
const FIXTURE_PARAGRAPHS = FIXTURE_BODY.split("\n");
const rewriteOnlyAdaptedDraftSeedSchema =
  ENDPOINTS.getProject.response.shape.briefDetail
    .removeDefault()
    .shape.contentRadarEvidence.unwrap()
    .options[0].shape.adaptedDraftSeed;

type LocalModelRequestObservation = {
  method: string;
  path: string;
  stream: boolean | null;
  responseFormatPresent: boolean;
  includeUsageRequested: boolean;
  responseProtocol: "application/json" | "text/event-stream" | null;
  outcome: "responded" | "rejected" | "not_chat_completions";
  errorCode?: string;
};

type LocalModelProtocolObservation = {
  requestCount: number;
  requests: LocalModelRequestObservation[];
  protocolErrors: string[];
};

async function dispatch<T>(
  page: Page,
  id: string,
  input: unknown,
  accountId?: string,
  groupId?: string,
): Promise<T> {
  const response = await page.request.post("/api/v1/dispatch", {
    timeout: 120_000,
    headers: {
      "content-type": "application/json",
      ...(accountId ? { "x-account-id": accountId } : {}),
      ...(groupId ? { "x-group-id": groupId } : {}),
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

async function listAccountGroups(page: Page): Promise<AccountGroupResource[]> {
  const groups: AccountGroupResource[] = [];
  for (let pageNumber = 1; ; pageNumber += 1) {
    const response = await page.request.post("/api/v1/dispatch", {
      timeout: 120_000,
      headers: { "content-type": "application/json" },
      data: {
        id: "accountGroups.list",
        input: { query: { page: pageNumber, pageSize: 100 } },
      },
    });
    const payload = (await response.json()) as {
      data?: unknown;
      meta?: { total?: number };
      error?: { message?: string };
    };
    expect(
      response.ok(),
      `accountGroups.list 应成功，实得 ${response.status()}：${payload.error?.message ?? "unknown"}`,
    ).toBe(true);
    expect(Number.isInteger(payload.meta?.total)).toBe(true);
    const total = payload.meta!.total!;
    const pageGroups = ENDPOINTS.listAccountGroups.response
      .array()
      .parse(payload.data ?? []);
    groups.push(...pageGroups);
    expect(groups.length).toBeLessThanOrEqual(total);
    if (groups.length === total) return groups;
    expect(pageGroups.length).toBeGreaterThan(0);
  }
}

function uniqueActiveGroupForAccount(
  groups: ReadonlyArray<AccountGroupResource>,
  accountId: string,
): AccountGroupResource {
  const matches = groups.filter(
    (group) =>
      group.status === "active" &&
      group.members.some(
        (member) =>
          member.accountId === accountId &&
          member.status === "active" &&
          member.leftAt === null,
      ),
  );
  expect(matches).toHaveLength(1);
  return matches[0]!;
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
    ({ accountKey, groupKey, id }) => {
      if (!window.localStorage.getItem(groupKey)) {
        window.localStorage.setItem(accountKey, id);
      }
    },
    { accountKey: CURRENT_ACCOUNT_KEY, groupKey: CURRENT_GROUP_KEY, id: accountId },
  );
}

async function expectGroupMirrors(page: Page, groupId: string) {
  await expect
    .poll(() => page.evaluate((key) => window.localStorage.getItem(key), CURRENT_GROUP_KEY))
    .toBe(groupId);
  await expect
    .poll(() => page.evaluate((key) => window.localStorage.getItem(key), CURRENT_ACCOUNT_KEY))
    .toBeNull();
  const cookies = await page.context().cookies();
  expect(cookies.find((cookie) => cookie.name === CURRENT_GROUP_COOKIE)?.value).toBe(
    encodeURIComponent(groupId),
  );
  expect(cookies.find((cookie) => cookie.name === CURRENT_ACCOUNT_COOKIE)).toBeUndefined();
  return {
    current_group_local_storage_matches: true,
    current_account_local_storage_empty: true,
    current_group_cookie_matches: true,
    current_account_cookie_absent: true,
  };
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
  timeoutMs = 120_000,
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
  const requests: LocalModelRequestObservation[] = [];
  const protocolErrors: string[] = [];
  const server = createServer((request, response) => {
    const observation: LocalModelRequestObservation = {
      method: request.method ?? "",
      path: request.url?.split("?")[0] ?? "",
      stream: null,
      responseFormatPresent: false,
      includeUsageRequested: false,
      responseProtocol: null,
      outcome: "not_chat_completions",
    };
    requests.push(observation);
    if (request.method !== "POST" || observation.path !== "/v1/chat/completions") {
      protocolErrors.push("UNEXPECTED_ENDPOINT");
      response.writeHead(404).end();
      return;
    }
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("end", () => {
      const bodyText = Buffer.concat(chunks).toString("utf8");
      let body: unknown;
      try {
        body = JSON.parse(bodyText);
      } catch {
        observation.outcome = "rejected";
        observation.errorCode = "INVALID_JSON";
        protocolErrors.push(observation.errorCode);
        response.writeHead(400, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: { message: "Invalid local model request JSON" } }));
        return;
      }
      if (!isRecord(body)) {
        observation.outcome = "rejected";
        observation.errorCode = "REQUEST_SHAPE_INVALID";
        protocolErrors.push(observation.errorCode);
        response.writeHead(400, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: { message: "Invalid local model request shape" } }));
        return;
      }
      const stream = body.stream;
      observation.stream = typeof stream === "boolean" ? stream : null;
      observation.responseFormatPresent = Object.prototype.hasOwnProperty.call(body, "response_format");
      const streamOptions = isRecord(body.stream_options) ? body.stream_options : null;
      observation.includeUsageRequested = streamOptions?.include_usage === true;
      if (stream !== undefined && typeof stream !== "boolean") {
        observation.outcome = "rejected";
        observation.errorCode = "STREAM_FLAG_INVALID";
        protocolErrors.push(observation.errorCode);
        response.writeHead(400, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: { message: "Invalid local model stream flag" } }));
        return;
      }
      if (observation.responseFormatPresent) {
        observation.outcome = "rejected";
        observation.errorCode = "UNEXPECTED_RESPONSE_FORMAT";
        protocolErrors.push(observation.errorCode);
        response.writeHead(400, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: { message: "Unexpected structured response format" } }));
        return;
      }

      const id = "chatcmpl-t1233-" + requests.length;
      const created = Math.floor(Date.now() / 1000);
      const model = "creatoros-t870-local";
      const usage = { prompt_tokens: 100, completion_tokens: 100, total_tokens: 200 };
      if (stream === true) {
        observation.responseProtocol = "text/event-stream";
        observation.outcome = "responded";
        response.writeHead(200, {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache",
          connection: "keep-alive",
        });
        const writeChunk = (chunk: Record<string, unknown>) => {
          response.write("data: " + JSON.stringify(chunk) + "\n\n");
        };
        writeChunk({
          id,
          object: "chat.completion.chunk",
          created,
          model,
          choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
        });
        writeChunk({
          id,
          object: "chat.completion.chunk",
          created,
          model,
          choices: [{ index: 0, delta: { content: FIXTURE_BODY }, finish_reason: null }],
        });
        writeChunk({
          id,
          object: "chat.completion.chunk",
          created,
          model,
          choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        });
        if (observation.includeUsageRequested) {
          writeChunk({ id, object: "chat.completion.chunk", created, model, choices: [], usage });
        }
        response.end("data: [DONE]\n\n");
        return;
      }

      observation.responseProtocol = "application/json";
      observation.outcome = "responded";
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          id,
          object: "chat.completion",
          created,
          model,
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: FIXTURE_BODY },
              finish_reason: "stop",
            },
          ],
          usage,
        }),
      );
    });
  });
  return new Promise<{
    baseUrl: string;
    protocol: () => LocalModelProtocolObservation;
    close: () => Promise<void>;
  }>((resolveServer, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("本地模型服务没有取得端口"));
        return;
      }
      resolveServer({
        baseUrl: "http://127.0.0.1:" + address.port + "/v1",
        protocol: () => ({
          requestCount: requests.length,
          requests: requests.map((row) => ({ ...row })),
          protocolErrors: [...protocolErrors],
        }),
        close: () =>
          new Promise((resolveClose, rejectClose) =>
            server.close((error) =>
              error ? rejectClose(error) : resolveClose(),
            ),
          ),
      });
    });
  });
}
function writeVisibleCopy(
  taskId: string,
  captures: ReadonlyArray<{
    checkpoint: string;
    check_ids: ReadonlyArray<string>;
    viewport: { width: number; height: number };
    text: string;
  }>,
  evidence?: Readonly<Record<string, unknown>>,
) {
  const repoRoot = resolve(process.cwd(), "..");
  const configuredEvidenceDir = resolve(process.env.CREATOROS_T1246_RUN_DIR!, "original-output", "orchestrator", "evidence");
  const evidenceDir = configuredEvidenceDir
    ? resolve(repoRoot, configuredEvidenceDir)
    : resolve(process.env.CREATOROS_T1246_RUN_DIR!, "original-output", "orchestrator", "evidence");
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
        ...(evidence ? { evidence } : {}),
      },
      null,
      2,
    )}\n`,
  );
}

function stableVisibleText(text: string) {
  return text.replace(/最近采集[^\n]*/g, "最近采集时间已记录");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function readVisibleScriptParagraphs(editor: HTMLElement) {
  return Array.from(editor.children)
    .filter((child): child is HTMLParagraphElement => child instanceof HTMLParagraphElement)
    .map((paragraph) => paragraph.innerText.trim());
}

function assertProjectBodyEvidence(
  input: unknown,
  expected: {
    projectId: string;
    title: string;
    itemId: string;
    sourceUrl: string;
    platform: string;
    sourceSnapshotId: string;
    transcriptHash: string;
    taskId: string;
    templateVersion: string;
  },
) {
  const project = ENDPOINTS.getProject.response.parse(input);
  expect(project.id).toBe(expected.projectId);
  expect(project.title).toBe(expected.title);
  const evidenceValue: unknown = project.briefDetail.contentRadarEvidence;
  expect(isRecord(evidenceValue)).toBe(true);
  const evidence = evidenceValue as Record<string, unknown>;
  expect(evidence.generationMode).toBe("rewrite_only");
  expect(evidence).toMatchObject({
    sourceSnapshotId: expected.sourceSnapshotId,
    generatedFromTranscriptHash: expected.transcriptHash,
    aiTaskId: expected.taskId,
  });
  expect(evidence.sourceReferences).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        intelligenceItemId: expected.itemId,
        url: expected.sourceUrl,
        platform: expected.platform,
      }),
    ]),
  );
  const seed = rewriteOnlyAdaptedDraftSeedSchema.parse(evidence.adaptedDraftSeed);
  expect(seed).toMatchObject({
    generationMode: "rewrite_only",
    contentText: FIXTURE_BODY,
    sourceSnapshotId: expected.sourceSnapshotId,
    generatedFromTranscriptHash: expected.transcriptHash,
    aiTaskId: expected.taskId,
  });
  expect(seed.templateVersion).toBe(expected.templateVersion);
  return { project, evidence, seed };
}

test("内容雷达只有改写初稿和局部选题字段时仍可一键升级项目", async ({
  page,
  baseURL,
}, info) => {
  page.setDefaultTimeout(120_000);
  page.setDefaultNavigationTimeout(120_000);
  const localModel = await startLocalOpenAiServer();
  const bodyCaptures: Array<{
    checkpoint: string;
    check_ids: ReadonlyArray<string>;
    viewport: { width: number; height: number };
    text: string;
  }> = [];
  const bodyEvidence: Record<string, unknown> = {
    fixture_body_sha256: sha256(FIXTURE_BODY),
    fixture_paragraph_count: FIXTURE_PARAGRAPHS.length,
    body_chain_assertions_completed: false,
  };
  try {
    const account = await dispatch<{ id: string }>(page, "accounts.create", {
      params: undefined,
      query: undefined,
      body: {
        platform: "douyin",
        accountHandle: `@e2e-radar-upgrade-${Date.now()}`,
      },
    });
    const sourceGroup = uniqueActiveGroupForAccount(
      await listAccountGroups(page),
      account.id,
    );
    bodyEvidence.account_id = account.id;
    bodyEvidence.source_group_id = sourceGroup.id;
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
    const detail = await dispatch<{
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
    const targetTitle = items[0]!.item.title;
    const transcriptDialogCaptures: Array<{
      checkpoint: string;
      check_ids: ReadonlyArray<string>;
      viewport: { width: number; height: number };
      text: string;
    }> = [];
    const transcriptDialogCheckIds = ["AC-TRANSCRIPT-DIALOG-SAVE"];
    await selectAccount(page, account.id, baseURL);
    await page.setViewportSize({ width: 1536, height: 1024 });
    await page.goto("/intelligence");
    await page.waitForLoadState("networkidle");
    await expectGroupMirrors(page, sourceGroup.id);
    const manualDetailLoaded = page.waitForResponse((response) => {
      if (!response.url().endsWith("/api/v1/dispatch")) return false;
      try {
        return (
          (response.request().postDataJSON() as { id?: string }).id ===
          "intelligence.items.get"
        );
      } catch {
        return false;
      }
    }, { timeout: 300000 });
    await page.locator("main button").filter({ hasText: targetTitle }).click();
    await manualDetailLoaded;
    await page.getByRole("button", { name: "添加逐字稿" }).click();
    const longTranscript = Array.from(
      { length: 120 },
      () =>
        "很多创作者收集到一个好选题以后，还要先保存到选题池，再打开选题中心确认，最后才能创建项目。每多一次搬运，注意力就会被打断。更合理的做法，是在来源、逐字稿、拆解和初稿都准备好以后，让用户的一次明确点击直接完成确认和立项，同时保留来源证据，失败时也能安全重试。",
    ).join("\n");
    const transcriptTextarea = page.getByLabel("逐字稿正文");
    await transcriptTextarea.fill(longTranscript);
    const saveTranscript = page.getByRole("button", { name: "保存逐字稿" });
    await expect(saveTranscript).toBeVisible();
    const transcriptDialog = page.getByRole("dialog");
    transcriptDialogCaptures.push({
      checkpoint: "long-transcript-regular-window",
      check_ids: transcriptDialogCheckIds,
      viewport: { width: 1536, height: 1024 },
      text: await transcriptDialog.innerText(),
    });
    await page.setViewportSize({ width: 1024, height: 720 });
    await expect(saveTranscript).toBeVisible();
    const saveBox = await saveTranscript.boundingBox();
    expect(saveBox).not.toBeNull();
    expect(saveBox!.y + saveBox!.height).toBeLessThanOrEqual(720);
    expect(
      await transcriptTextarea.evaluate(
        (element) => element.scrollHeight > element.clientHeight,
      ),
    ).toBe(true);
    transcriptDialogCaptures.push({
      checkpoint: "long-transcript-minimum-window",
      check_ids: transcriptDialogCheckIds,
      viewport: { width: 1024, height: 720 },
      text: await transcriptDialog.innerText(),
    });
    const manualTranscriptSaved = page.waitForResponse((response) => {
      if (!response.url().endsWith("/api/v1/dispatch")) return false;
      try {
        return (
          (response.request().postDataJSON() as { id?: string }).id ===
          "intelligence.transcripts.uploadManual"
        );
      } catch {
        return false;
      }
    }, { timeout: 300000 });
    await saveTranscript.click();
    await manualTranscriptSaved;
    await expect(page.getByRole("dialog")).toBeHidden();
    writeVisibleCopy("T-893", transcriptDialogCaptures);
    const expectedTranscriptHash = "sha256:" + sha256(longTranscript.trim());
    bodyEvidence.item_id = itemId;
    bodyEvidence.source_snapshot_id = detail.snapshots[0]!.id;
    bodyEvidence.transcript_hash = expectedTranscriptHash;
    const preview = ENDPOINTS.previewIntelligenceTopic.response.parse(
      await dispatch<unknown>(
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
      ),
    );
    bodyEvidence.preview_task_id = preview.task.id;
    bodyEvidence.transform_id = preview.transform.id;
    await waitForTransform(page, account.id, itemId, preview.transform.id);
    const completedDetail = ENDPOINTS.getIntelligenceItem.response.parse(
      await dispatch<unknown>(
      page,
      "intelligence.items.get",
      { params: { itemId }, query: undefined },
      account.id,
      ),
    );
    const completedTransform = completedDetail.transforms.find(
      (transform) => transform.id === preview.transform.id,
    );
    expect(completedTransform).toBeDefined();
    expect(completedTransform?.taskStatus).toBe("succeeded");
    expect(completedTransform?.aiTaskId).toBe(preview.task.id);
    expect(completedTransform?.outputSnapshot).not.toBeNull();
    expect(isRecord(completedTransform?.outputSnapshot)).toBe(true);
    const transformSnapshot = completedTransform?.outputSnapshot as Record<string, unknown>;
    expect(transformSnapshot.generationMode).toBe("rewrite_only");
    expect(transformSnapshot.transcriptHash).toBe(expectedTranscriptHash);
    const transformDraft = rewriteOnlyAdaptedDraftSeedSchema.parse(
      transformSnapshot.adaptedDraft,
    );
    expect(transformDraft).toMatchObject({
      generationMode: "rewrite_only",
      contentText: FIXTURE_BODY,
      sourceSnapshotId: detail.snapshots[0]!.id,
      generatedFromTranscriptHash: expectedTranscriptHash,
      aiTaskId: preview.task.id,
    });
    expect(transformDraft.templateVersion.trim()).not.toBe("");
    bodyEvidence.transform_body_readback = {
      generation_mode: transformDraft.generationMode,
      source_snapshot_id: transformDraft.sourceSnapshotId,
      transcript_hash: transformDraft.generatedFromTranscriptHash,
      template_version: transformDraft.templateVersion,
      ai_task_id: transformDraft.aiTaskId,
      content_matches_fixture: transformDraft.contentText === FIXTURE_BODY,
    };
    const modelProtocol = localModel.protocol();
    expect(modelProtocol.protocolErrors).toEqual([]);
    expect(modelProtocol.requestCount).toBe(1);
    expect(modelProtocol.requests).toHaveLength(1);
    expect(modelProtocol.requests[0]).toMatchObject({
      method: "POST",
      path: "/v1/chat/completions",
      stream: true,
      responseFormatPresent: false,
      responseProtocol: "text/event-stream",
      outcome: "responded",
    });
    bodyEvidence.model_protocol = modelProtocol;

    await expectGroupMirrors(page, sourceGroup.id);
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
    await expectGroupMirrors(page, sourceGroup.id);
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
    }, { timeout: 300000 });
    await page.locator("main button").filter({ hasText: targetTitle }).click();
    await detailLoaded;
    const detailPanel = page.getByTestId("intelligence-detail");
    await expect(
      detailPanel.getByRole("heading", { name: targetTitle, exact: true }),
    ).toBeVisible();
    const upgrade = detailPanel.getByRole("button", { name: "一键升级项目" });
    const confirmOnly = detailPanel.getByRole("button", {
      name: "确认写入选题池",
    });
    const radarDraft = detailPanel.getByRole("textbox", {
      name: "我的改写初稿",
    });
    await expect(radarDraft).toHaveValue(FIXTURE_BODY);
    await radarDraft.scrollIntoViewIfNeeded();
    await expect(radarDraft).toBeVisible();
    await expect(radarDraft).toBeInViewport();
    const radarDraftLayout = await radarDraft.evaluate((element) => {
      const textarea = element as HTMLTextAreaElement;
      return {
        scrollTop: textarea.scrollTop,
        scrollHeight: textarea.scrollHeight,
        clientHeight: textarea.clientHeight,
      };
    });
    expect(radarDraftLayout.scrollTop).toBe(0);
    expect(radarDraftLayout.scrollHeight).toBeLessThanOrEqual(
      radarDraftLayout.clientHeight,
    );
    await expect(confirmOnly).toBeVisible();
    await expect(confirmOnly).toBeEnabled();
    await expect(upgrade).toBeVisible();
    await expect(upgrade).toBeEnabled();
    captures.push({
      checkpoint: "radar-topic-ready",
      check_ids: checkIds,
      viewport: { width: 1536, height: 1024 },
      text: stableVisibleText(await detailPanel.innerText()),
    });
    bodyCaptures.push({
      checkpoint: "radar-draft-body-visible",
      check_ids: ["AC-RADAR-REWRITE-BODY-VISIBLE"],
      viewport: { width: 1536, height: 1024 },
      text: await radarDraft.inputValue(),
    });
    await page.screenshot({
      path: info.outputPath("radar-ready-1536x1024.png"),
      fullPage: false,
    timeout: 120000});

    await page.setViewportSize({ width: 1024, height: 720 });
    await expect(confirmOnly).toBeVisible();
    await expect(confirmOnly).toBeEnabled();
    await expect(upgrade).toBeVisible();
    await expect(upgrade).toBeEnabled();
    captures.push({
      checkpoint: "radar-topic-ready-minimum-window",
      check_ids: checkIds,
      viewport: { width: 1024, height: 720 },
      text: stableVisibleText(await detailPanel.innerText()),
    });

    const promoteRequestPromise = page.waitForRequest((request) => {
      if (!request.url().endsWith("/api/v1/dispatch")) return false;
      try {
        return (
          (request.postDataJSON() as { id?: string }).id === "candidates.promote"
        );
      } catch {
        return false;
      }
    });
    await upgrade.click();
    const promoteRequest = await promoteRequestPromise;
    const promoteHeaders = promoteRequest.headers();
    expect(promoteHeaders["x-group-id"]).toBe(sourceGroup.id);
    expect(promoteHeaders["x-account-id"]).toBeUndefined();
    bodyEvidence.promote_headers = {
      x_group_id: promoteHeaders["x-group-id"],
      x_account_id: promoteHeaders["x-account-id"] ?? null,
    };
    await page.waitForURL(/\/projects\/project-[^/?#]+$/, { timeout: 120_000 });
    const projectId = new URL(page.url()).pathname.split("/").at(-1)!;
    bodyEvidence.project_id = projectId;
    const draftWorkbench = page.locator('main[data-page="draft-workbench"]');
    await expect(draftWorkbench).toBeVisible();
    await expect(
      draftWorkbench
        .locator('[data-slot="draft-script-section"]')
        .getByRole("heading", { name: "口播脚本", exact: true }),
    ).toBeVisible();
    const projectHeader = page.locator('[data-slot="header-project-identity"]');
    await expect(projectHeader.getByText(targetTitle, { exact: true })).toBeVisible();
    await expectGroupMirrors(page, sourceGroup.id);
    const projectBodyProvenance = {
      projectId,
      title: targetTitle,
      itemId,
      sourceUrl: completedDetail.item.canonicalUrl,
      platform: completedDetail.item.platform,
      sourceSnapshotId: detail.snapshots[0]!.id,
      transcriptHash: expectedTranscriptHash,
      taskId: preview.task.id,
      templateVersion: transformDraft.templateVersion,
    };
    const scriptEditor = draftWorkbench.locator('[data-slot="script-prosemirror"]');
    await scriptEditor.scrollIntoViewIfNeeded();
    await expect(scriptEditor).toBeVisible();
    await expect(scriptEditor).toBeInViewport();
    const createdParagraphs = await scriptEditor.evaluate(readVisibleScriptParagraphs);
    expect(createdParagraphs).toEqual(FIXTURE_PARAGRAPHS);
    const createdParagraphLocators = scriptEditor.locator(":scope > p");
    await expect(createdParagraphLocators.first()).toBeInViewport();
    await expect(createdParagraphLocators.last()).toBeInViewport();
    bodyCaptures.push({
      checkpoint: "project-created-script-body-visible",
      check_ids: ["AC-RADAR-PROJECT-SEED-VISIBLE"],
      viewport: { width: 1024, height: 720 },
      text: createdParagraphs.join("\n"),
    });
    await page.screenshot({
      path: info.outputPath("project-created-1024x720.png"),
      fullPage: false,
    timeout: 120000});

    const firstProjectReadback = assertProjectBodyEvidence(
      await dispatch<unknown>(
        page,
        "projects.get",
        { params: { projectId }, query: undefined },
        undefined,
        sourceGroup.id,
      ),
      projectBodyProvenance,
    );
    bodyEvidence.project_seed_readback = {
      generation_mode: firstProjectReadback.seed.generationMode,
      source_snapshot_id: firstProjectReadback.seed.sourceSnapshotId,
      transcript_hash: firstProjectReadback.seed.generatedFromTranscriptHash,
      template_version: firstProjectReadback.seed.templateVersion,
      ai_task_id: firstProjectReadback.seed.aiTaskId,
      content_matches_fixture: firstProjectReadback.seed.contentText === FIXTURE_BODY,
      source_references: firstProjectReadback.evidence.sourceReferences,
    };

    const promotedDetail = ENDPOINTS.getIntelligenceItem.response.parse(
      await dispatch<unknown>(
        page,
        "intelligence.items.get",
        { params: { itemId }, query: undefined },
        account.id,
      ),
    );
    const topicId = promotedDetail.transforms.find(
      (transform) => transform.id === preview.transform.id,
    )?.targetTopicId;
    expect(topicId).toBeTruthy();
    const replay = await dispatch<{ projectId: string }>(
      page,
      "candidates.promote",
      { params: { candidateId: topicId }, query: undefined, body: {} },
      undefined,
      sourceGroup.id,
    );
    expect(replay.projectId).toBe(projectId);
    bodyEvidence.replay_project_id = replay.projectId;

    const wrongGroup = await dispatch<{ id: string }>(page, "accountGroups.create", {
      params: undefined,
      query: undefined,
      body: {
        name: `T-1231 错组隔离 ${Date.now()}`,
        idempotencyKey: `t1231-wrong-group-${Date.now()}`,
      },
    });
    expect(wrongGroup.id).not.toBe(sourceGroup.id);
    const deniedScopes: ReadonlyArray<{
      header: "x-group-id" | "x-account-id";
      id: string;
    }> = [
      { header: "x-group-id", id: wrongGroup.id },
      { header: "x-account-id", id: account.id },
    ];
    const deniedReads: Array<{
      scope: "wrong_group" | "legacy_account";
      status: number;
      code: string | undefined;
    }> = [];
    for (const [index, scope] of deniedScopes.entries()) {
      const denied = await page.request.post("/api/v1/dispatch", {
        timeout: 120_000,
        headers: { "content-type": "application/json", [scope.header]: scope.id },
        data: {
          id: "projects.get",
          input: { params: { projectId }, query: undefined },
        },
      });
      expect(denied.status()).toBe(404);
      const deniedBody = (await denied.json()) as {
        error?: { code?: string };
      };
      expect(deniedBody.error?.code).toBe(ErrorCode.OwnershipError);
      deniedReads.push({
        scope: index === 0 ? "wrong_group" : "legacy_account",
        status: denied.status(),
        code: deniedBody.error?.code,
      });
    }
    assertProjectBodyEvidence(
      await dispatch<unknown>(
        page,
        "projects.get",
        { params: { projectId }, query: undefined },
        undefined,
        sourceGroup.id,
      ),
      projectBodyProvenance,
    );
    bodyEvidence.wrong_group_id = wrongGroup.id;
    bodyEvidence.denied_reads = deniedReads;

    await page.reload();
    await page.waitForLoadState("networkidle");
    const reloadGroupMirror = await expectGroupMirrors(page, sourceGroup.id);
    await expect(draftWorkbench).toBeVisible();
    await expect(
      draftWorkbench
        .locator('[data-slot="draft-script-section"]')
        .getByRole("heading", { name: "口播脚本", exact: true }),
    ).toBeVisible();
    await expect(projectHeader.getByText(targetTitle, { exact: true })).toBeVisible();
    const reloadReadback = assertProjectBodyEvidence(
      await dispatch<unknown>(
        page,
        "projects.get",
        { params: { projectId }, query: undefined },
        undefined,
        sourceGroup.id,
      ),
      projectBodyProvenance,
    );
    await scriptEditor.scrollIntoViewIfNeeded();
    await expect(scriptEditor).toBeVisible();
    await expect(scriptEditor).toBeInViewport();
    const reloadedParagraphs = await scriptEditor.evaluate(readVisibleScriptParagraphs);
    expect(reloadedParagraphs).toEqual(FIXTURE_PARAGRAPHS);
    const reloadedParagraphLocators = scriptEditor.locator(":scope > p");
    await expect(reloadedParagraphLocators.first()).toBeInViewport();
    await expect(reloadedParagraphLocators.last()).toBeInViewport();
    bodyCaptures.push({
      checkpoint: "project-reloaded-script-body-visible",
      check_ids: ["AC-RADAR-PROJECT-SEED-RELOAD"],
      viewport: { width: 1024, height: 720 },
      text: reloadedParagraphs.join("\n"),
    });
    bodyEvidence.reload_seed_readback = {
      project_id: reloadReadback.project.id,
      generation_mode: reloadReadback.seed.generationMode,
      source_snapshot_id: reloadReadback.seed.sourceSnapshotId,
      transcript_hash: reloadReadback.seed.generatedFromTranscriptHash,
      template_version: reloadReadback.seed.templateVersion,
      ai_task_id: reloadReadback.seed.aiTaskId,
      content_matches_fixture: reloadReadback.seed.contentText === FIXTURE_BODY,
    };
    bodyEvidence.body_chain_assertions_completed = true;
    await page.screenshot({
      path: info.outputPath("project-reloaded-1024x720.png"),
      fullPage: false,
    timeout: 120000});
    bodyEvidence.reload_body_dom_matches_fixture =
      reloadedParagraphs.join("\n") === FIXTURE_BODY;
    bodyEvidence.reload_group_mirror = reloadGroupMirror;
    captures.push({
      checkpoint: "project-created-and-reloaded",
      check_ids: checkIds,
      viewport: { width: 1024, height: 720 },
      text: stableVisibleText(await page.locator("body").innerText()),
    });
    writeVisibleCopy("T-870", captures);
    writeVisibleCopy(
      "T-900",
      captures.map((capture) => ({
        ...capture,
        check_ids: [
          "AC-RADAR-PARTIAL-ACTION",
          "AC-RADAR-PARTIAL-SOURCE-TITLE",
          "AC-RADAR-PARTIAL-READBACK",
        ],
      })),
    );
    writeVisibleCopy("T-1231", [], {
      account_id: account.id,
      source_group_id: sourceGroup.id,
      wrong_group_id: wrongGroup.id,
      project_id: projectId,
      group_mirror_after_reload: reloadGroupMirror,
      promote_headers: {
        x_group_id: promoteHeaders["x-group-id"],
        x_account_id: promoteHeaders["x-account-id"] ?? null,
      },
      replay_project_id: replay.projectId,
      denied_reads: deniedReads,
      reload_readback: {
        id: reloadReadback.project.id,
        title: reloadReadback.project.title,
      },
    });
  } finally {
    await localModel.close();
    const finalProtocol = localModel.protocol();
    bodyEvidence.local_model_protocol = finalProtocol;
    bodyEvidence.screenshot_files = [
      "radar-ready-1536x1024.png",
      "project-created-1024x720.png",
      "project-reloaded-1024x720.png",
    ];
    writeVisibleCopy("T-1233", bodyCaptures, bodyEvidence);
    if (bodyEvidence.body_chain_assertions_completed === true) {
      expect(finalProtocol.protocolErrors).toEqual([]);
      expect(finalProtocol.requestCount).toBe(1);
      expect(finalProtocol.requests).toHaveLength(1);
      expect(finalProtocol.requests[0]).toMatchObject({
        method: "POST",
        path: "/v1/chat/completions",
        stream: true,
        responseFormatPresent: false,
        responseProtocol: "text/event-stream",
        outcome: "responded",
      });
    }
  }
});

// T-1246 copied-source declaration: original assertions unchanged.
test.describe.configure({ timeout: 90060000 });
