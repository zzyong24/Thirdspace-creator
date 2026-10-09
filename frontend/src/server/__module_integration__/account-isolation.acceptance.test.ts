import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { POST } from "@/app/api/v1/dispatch/route";
import { __resetPersistenceForTests } from "@/server/persistence-client";

/**
 * [T-332 S6 / T-346] 账号全域隔离·双号端到端验收(SPEC 2026-07-15 §2 ISO-01~08、§7-S6、§11)。
 *
 * 验收姿势 = **dispatch 真链**:每条断言都走 POST /api/v1/dispatch(header `x-account-id`
 * → verifyAccountSelection 属主硬校验 → composite → backend strict 门 → 真 pglite),
 * 与浏览器端「当前选中号」的调用路径完全一致 —— 不是绕过咽喉的旁路脚本
 * (memory/verify-through-real-call-path)。
 *
 * 结构:同 user 建两个号 A/B(T-046 单机免登录 → 本机主用户),逐域各建**同名**数据再互查:
 *   ① A 建的行,B 的 list 不可见(ISO-02 strict 列表门);
 *   ② A 建的行,B by-id → 404 OwnershipError(ISO-02/§4.5 号一致性门,跨号深链同貌);
 *   ③ B 同名建不撞唯一键(ISO-05 唯一约束含 account 维);
 *   ④ A 删/归档自己的行,B 的同名行不受影响(删除域内闭合)。
 * 边界语义(§4.2/§4.3):伪造号 404、归档号 404+reason、未选号 428、跨号深链与「不存在」同貌。
 *
 * 世界共享一份 pglite(beforeAll 只 reset 一次):每个域用独有 fixture 名/token 自闭合,
 * 域间无共享可变态(publishing 用自己的 project,不复用会被 projects 域删掉的那条)。
 *
 * 无 wire 契约的内部表(topic_preferences 偏好 / audience_signals 采集去重 / notifications
 * 写路径)在 backend/src/account-isolation.acceptance.test.ts 以 service/repo 层收口 ——
 * 两个文件合起来 = §11.1「双号各建同名全域数据,逐域交叉泄漏为 0」的代码层全量。
 */

// ── 基建:与 knowledge 集成测同款 —— 关掉 win-video-tutor 本机 seed(测试不依赖 home 状态)──
const SEED_PATH_OVERRIDE = "/nonexistent/for-integration-test";
let prevSeedEnv: string | undefined;

// 信封形状(dispatch 统一 envelope)。
interface Envelope {
  data?: unknown;
  error?: { code: string; message?: string; details?: { reason?: string } };
}
interface CallResult {
  status: number;
  body: Envelope;
}

/** dispatch 真链调用:header 带 accountId(null = 显式未选号)。 */
async function call(
  accountId: string | null,
  id: string,
  input: unknown,
): Promise<CallResult> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (accountId) headers["x-account-id"] = accountId;
  const res = await POST(
    new Request("http://localhost/api/v1/dispatch", {
      method: "POST",
      headers,
      body: JSON.stringify({ id, input }),
    }),
  );
  return { status: res.status, body: (await res.json()) as Envelope };
}

/** 期望 200,返回 data(泛型仅为调用点可读性,不做运行时校验)。 */
async function ok<T>(
  accountId: string | null,
  id: string,
  input: unknown,
): Promise<T> {
  const res = await call(accountId, id, input);
  expect(
    res.status,
    `${id} 应 200,实得 ${res.status}: ${JSON.stringify(res.body.error)}`,
  ).toBe(200);
  return res.body.data as T;
}

/** 期望 404 OwnershipError(跨号 by-id / 父锚门 —— §4.5 同貌语义)。 */
async function expect404(
  accountId: string | null,
  id: string,
  input: unknown,
): Promise<Envelope> {
  const res = await call(accountId, id, input);
  expect(res.status, `${id} 跨号应 404,实得 ${res.status}`).toBe(404);
  expect(res.body.error?.code).toBe("OwnershipError");
  return res.body;
}

const pageQ = { page: 1, pageSize: 50 };
const listInput = (extra?: Record<string, unknown>) => ({
  params: undefined,
  query: { ...pageQ, ...extra },
  body: undefined,
});

/** list 断言:结果**含/不含**某 id(strict 列表门)。 */
async function expectListMembership(
  accountId: string,
  op: string,
  input: unknown,
  rowId: string,
  present: boolean,
): Promise<void> {
  const data = await ok<Array<{ id: string }>>(accountId, op, input);
  expect(
    data.some((r) => r.id === rowId),
    `${op} @${accountId} ${present ? "应含" : "不应含"} ${rowId}`,
  ).toBe(present);
}

let A = ""; // 号 A
let B = ""; // 号 B

async function createAccount(handle: string): Promise<string> {
  const data = await ok<{ id: string }>(null, "accounts.create", {
    params: undefined,
    query: undefined,
    body: { platform: "douyin", accountHandle: handle, followerBaseline: 100 },
  });
  return data.id;
}

/** 项目 + 成片(多个域的父锚 fixture)。 */
async function createProjectWithOutput(
  accountId: string,
  title: string,
): Promise<{ projectId: string; outputId: string }> {
  const proj = await ok<{ id: string }>(accountId, "projects.create", {
    params: undefined,
    query: undefined,
    body: { title, brief: "" },
  });
  const output = await ok<{ id: string }>(accountId, "projects.outputs.create", {
    params: { projectId: proj.id },
    query: undefined,
    body: { title: `${title}·成片` },
  });
  return { projectId: proj.id, outputId: output.id };
}

beforeAll(async () => {
  prevSeedEnv = process.env.CREATOROS_WIN_VIDEO_TUTOR_SKILL_PATH;
  process.env.CREATOROS_WIN_VIDEO_TUTOR_SKILL_PATH = SEED_PATH_OVERRIDE;
  __resetPersistenceForTests();
  A = await createAccount("@iso-acceptance-a");
  B = await createAccount("@iso-acceptance-b");
});

afterAll(() => {
  if (prevSeedEnv === undefined)
    delete process.env.CREATOROS_WIN_VIDEO_TUTOR_SKILL_PATH;
  else process.env.CREATOROS_WIN_VIDEO_TUTOR_SKILL_PATH = prevSeedEnv;
});

describe("[T-332 S6] 双号全域交叉泄漏 = 0(ISO-08,dispatch 真链)", () => {
  it("定位:profile 每号一份;statement 同名各建不撞,跨号 list 不可见 + by-id 404", async () => {
    // profile:A/B 各 upsert 自己的人设(UNIQUE(user_id, account_id) → 同 user 两行并存)。
    await ok(A, "positioning.profile.upsert", {
      params: undefined,
      query: undefined,
      body: { persona: "A 号人设", field: "", audience: "", differentiation: "", capabilities: [] },
    });
    await ok(B, "positioning.profile.upsert", {
      params: undefined,
      query: undefined,
      body: { persona: "B 号人设", field: "", audience: "", differentiation: "", capabilities: [] },
    });
    const profA = await ok<{ persona: string }>(A, "positioning.profile.get", {
      params: undefined,
      query: undefined,
      body: undefined,
    });
    const profB = await ok<{ persona: string }>(B, "positioning.profile.get", {
      params: undefined,
      query: undefined,
      body: undefined,
    });
    expect(profA.persona).toBe("A 号人设"); // B 的 upsert 没改写 A(否则这里读到 B 号人设)
    expect(profB.persona).toBe("B 号人设");

    // statements:同名各建。
    const stmtBody = {
      oneLiner: "同名一句话定位",
      keywords: ["k1", "k2", "k3"],
      productAnchorIds: [],
    };
    const stA = await ok<{ id: string }>(A, "positioning.statements.create", {
      params: undefined,
      query: undefined,
      body: stmtBody,
    });
    const stB = await ok<{ id: string }>(B, "positioning.statements.create", {
      params: undefined,
      query: undefined,
      body: stmtBody,
    });
    await expectListMembership(B, "positioning.statements.list", listInput(), stA.id, false);
    await expectListMembership(A, "positioning.statements.list", listInput(), stB.id, false);
    await expectListMembership(A, "positioning.statements.list", listInput(), stA.id, true);
    await expect404(B, "positioning.statements.get", {
      params: { statementId: stA.id },
      query: undefined,
      body: undefined,
    });
  });

  it("选题:同名候选各归其号;A 淘汰(dropped+dropReason)不影响 B 的同名候选", async () => {
    const body = { title: "同名选题", angle: "同一个切角", source: "idea" };
    const cA = await ok<{ id: string }>(A, "candidates.create", {
      params: undefined,
      query: undefined,
      body,
    });
    const cB = await ok<{ id: string }>(B, "candidates.create", {
      params: undefined,
      query: undefined,
      body,
    });
    await expectListMembership(B, "candidates.list", listInput(), cA.id, false);
    await expectListMembership(A, "candidates.list", listInput(), cB.id, false);
    await expect404(B, "candidates.get", {
      params: { candidateId: cA.id },
      query: undefined,
      body: undefined,
    });
    // A 淘汰自己的(顺带蒸馏 A 号偏好 —— 偏好行本身的号隔离在 backend 验收文件断言)。
    await ok(A, "candidates.patch", {
      params: { candidateId: cA.id },
      query: undefined,
      body: { status: "dropped", dropReason: "太浅了,不做" },
    });
    const stillB = await ok<{ status: string }>(B, "candidates.get", {
      params: { candidateId: cB.id },
      query: undefined,
      body: undefined,
    });
    expect(stillB.status).toBe("pool"); // B 的同名候选不被 A 的淘汰波及
  });

  it("项目/成片:跨号 list/by-id/父锚全 404;A 删项目不影响 B 的同名项目", async () => {
    const { projectId: pA, outputId: oA } = await createProjectWithOutput(A, "同名项目");
    const { projectId: pB } = await createProjectWithOutput(B, "同名项目");
    await expectListMembership(B, "projects.list", listInput(), pA, false);
    await expectListMembership(A, "projects.list", listInput(), pB, false);
    await expect404(B, "projects.get", {
      params: { projectId: pA },
      query: undefined,
      body: undefined,
    });
    // 父锚继承(§3.1):B 摸 A 的项目子资源 / 成片,同貌 404。
    await expect404(B, "projects.outputs.list", {
      params: { projectId: pA },
      query: undefined,
      body: undefined,
    });
    await expect404(B, "outputs.get", {
      params: { outputId: oA },
      query: undefined,
      body: undefined,
    });
    // A 物理删除自己的项目 → B 的同名项目原样。
    await ok(A, "projects.delete", {
      params: { projectId: pA },
      query: undefined,
      body: undefined,
    });
    await ok(B, "projects.get", {
      params: { projectId: pB },
      query: undefined,
      body: undefined,
    });
  });

  it("知识库(C-01 A 案 per-account):同名各建;跨号不可见;A 归档不影响 B", async () => {
    const body = { title: "同名知识", knowledgeType: "note", content: "正文" };
    const kA = await ok<{ id: string }>(A, "knowledge.create", {
      params: undefined,
      query: undefined,
      body,
    });
    const kB = await ok<{ id: string }>(B, "knowledge.create", {
      params: undefined,
      query: undefined,
      body,
    });
    await expectListMembership(B, "knowledge.list", listInput(), kA.id, false);
    await expectListMembership(A, "knowledge.list", listInput(), kB.id, false);
    await expect404(B, "knowledge.get", {
      params: { knowledgeId: kA.id },
      query: undefined,
      body: undefined,
    });
    await ok(A, "knowledge.archive", {
      params: { knowledgeId: kA.id },
      query: undefined,
      body: undefined,
    });
    await expectListMembership(B, "knowledge.list", listInput(), kB.id, true);
  });

  it("素材:同名各建;跨号 list/by-id 404;A 回收不影响 B", async () => {
    async function createAsset(acc: string): Promise<string> {
      const up = await ok<{ uploadId: string }>(acc, "assets.uploads.create", {
        params: undefined,
        query: undefined,
        body: { assetType: "image", mimeType: "image/png", fileSize: 1024 },
      });
      const done = await ok<{ id: string }>(acc, "assets.uploads.complete", {
        params: { uploadId: up.uploadId },
        query: undefined,
        body: { name: "同名素材" },
      });
      return done.id;
    }
    const aA = await createAsset(A);
    const aB = await createAsset(B);
    await expectListMembership(B, "assets.list", listInput(), aA, false);
    await expectListMembership(A, "assets.list", listInput(), aB, false);
    await expect404(B, "assets.get", {
      params: { assetId: aA },
      query: undefined,
      body: undefined,
    });
    await ok(A, "assets.trash", {
      params: { assetId: aA },
      query: undefined,
      body: undefined,
    });
    const bStill = await ok<{ status: string }>(B, "assets.get", {
      params: { assetId: aB },
      query: undefined,
      body: undefined,
    });
    expect(bStill.status).toBe("active");
  });

  it("发布/修订:跨号 pub/revision/父锚 404;账号事实锚独立且同号不同项目不能抢占", async () => {
    // 各自独立项目(不复用会被「项目域」删除的 fixture)。
    const { outputId: outA } = await createProjectWithOutput(A, "发布域项目");
    const { outputId: outB } = await createProjectWithOutput(B, "发布域项目");
    const pubA = await ok<{ id: string }>(A, "outputs.publications.register", {
      params: { outputId: outA },
      query: undefined,
      body: { platform: "douyin", externalId: "iso-ext-a", title: "同名作品" },
    });
    const pubB = await ok<{ id: string }>(B, "outputs.publications.register", {
      params: { outputId: outB },
      query: undefined,
      body: { platform: "douyin", externalId: "iso-ext-b", title: "同名作品" },
    });
    // 修订:A 给自己的 pub 追加一版。
    const revA = await ok<{ id: string }>(A, "publications.revisions.create", {
      params: { publicationId: pubA.id },
      query: undefined,
      body: { title: "同名作品 v2", description: "" },
    });
    expect(revA.id).toBeTruthy();
    // 跨号:by-id / 修订 list / 修订 create / 父锚 output 的 pub list,全 404。
    await expect404(B, "publications.get", {
      params: { publicationId: pubA.id },
      query: undefined,
      body: undefined,
    });
    await expect404(B, "publications.revisions.list", {
      params: { publicationId: pubA.id },
      query: { ...pageQ },
      body: undefined,
    });
    await expect404(B, "publications.revisions.create", {
      params: { publicationId: pubA.id },
      query: undefined,
      body: { title: "越权修订", description: "" },
    });
    await expect404(B, "outputs.publications.list", {
      params: { outputId: outA },
      query: { ...pageQ },
      body: undefined,
    });
    // B 自己的 pub 自己可读(隔离不是把 B 也关掉)。
    await ok(B, "publications.get", {
      params: { publicationId: pubB.id },
      query: undefined,
      body: undefined,
    });
    // T1062已确认事实锚含真实账号：两个账号可登记同一外部ID，不能改A原锚。
    const beforeA = await ok(A, "publications.get", {params:{publicationId:pubA.id}});
    const independentB = await ok<{id:string;contentOutputId:string;accountId:string;externalId:string}>(B, "outputs.publications.register", {
      params: { outputId: outB }, query: undefined,
      body: { platform: "douyin", externalId: "iso-ext-a" },
    });
    expect(independentB.id).not.toBe(pubA.id);
    expect(independentB.contentOutputId).toBe(outB);
    expect(independentB.accountId).toBe(B);
    expect(independentB.externalId).toBe("iso-ext-a");
    expect(await ok(A,"publications.get",{params:{publicationId:pubA.id}})).toEqual(beforeA);
    await expect404(A,"publications.get",{params:{publicationId:independentB.id}});
    // 同一账号的另一个真实项目不能抢占这个事实锚，失败也不改现归属。
    const beforeB=await ok(B,"publications.get",{params:{publicationId:independentB.id}});
    const {outputId:anotherB}=await createProjectWithOutput(B,"另一个发布项目");
    const conflict=await call(B,"outputs.publications.register",{
      params:{outputId:anotherB},query:undefined,body:{platform:"douyin",externalId:"iso-ext-a"},
    });
    expect(conflict.status).toBe(409);
    expect(conflict.body.data).toBeUndefined();
    expect(conflict.body.error?.code).toBe("ConflictError");
    expect(conflict.body.error?.details?.reason).toBe("external_work_owned_by_another_project");
    expect(await ok(B,"publications.get",{params:{publicationId:independentB.id}})).toEqual(beforeB);

  });

  it("复盘/经验:review 经父锚跨号 404;learning 同名各建互不可见", async () => {
    const { projectId: pA } = await createProjectWithOutput(A, "复盘域项目");
    const rA = await ok<{ id: string }>(A, "reviews.create", {
      params: { projectId: pA },
      query: undefined,
      body: { reviewType: "project" },
    });
    await expect404(B, "reviews.list", {
      params: { projectId: pA },
      query: undefined,
      body: undefined,
    });
    await expect404(B, "reviews.get", {
      params: { reviewId: rA.id },
      query: undefined,
      body: undefined,
    });
    // 经验:同名各建。
    const body = { title: "同名经验", insight: "钩子前 3 秒给结论" };
    const lA = await ok<{ id: string }>(A, "learnings.create", {
      params: undefined,
      query: undefined,
      body,
    });
    const lB = await ok<{ id: string }>(B, "learnings.create", {
      params: undefined,
      query: undefined,
      body,
    });
    await expectListMembership(B, "learnings.list", listInput(), lA.id, false);
    await expectListMembership(A, "learnings.list", listInput(), lB.id, false);
    await expect404(B, "learnings.get", {
      params: { learningId: lA.id },
      query: undefined,
      body: undefined,
    });
  });

  it("校准:rubric 同名各建;prediction 跨号 list 不可见 + by-id 404", async () => {
    // rubric 校验规则(§2.0):必须含至少一个变现加权维度(cta 等)且权重和 = 1.0。
    const dims = [
      { key: "hook", label: "钩子", weight: 0.5 },
      { key: "cta", label: "CTA 清晰度", weight: 0.5 },
    ];
    const rubA = await ok<{ id: string; currentVersionId: string }>(
      A,
      "calibration.rubrics.create",
      { params: undefined, query: undefined, body: { name: "同名口径", dimensions: dims } },
    );
    const rubB = await ok<{ id: string; currentVersionId: string }>(
      B,
      "calibration.rubrics.create",
      { params: undefined, query: undefined, body: { name: "同名口径", dimensions: dims } },
    );
    await expect404(B, "calibration.rubrics.get", {
      params: { rubricId: rubA.id },
      query: undefined,
      body: undefined,
    });
    // 预测:各挂自己的成片 + 自己的 rubric 版本。
    const { outputId: outA } = await createProjectWithOutput(A, "校准域项目");
    const predA = await ok<{ id: string }>(A, "calibration.predictions.create", {
      params: undefined,
      query: undefined,
      body: {
        subjectType: "content_output",
        subjectId: outA,
        rubricVersionId: rubA.currentVersionId,
        predictedMetrics: {},
        predictedConversion: {},
        confidence: "med",
      },
    });
    await expectListMembership(B, "calibration.predictions.list", listInput(), predA.id, false);
    await expectListMembership(A, "calibration.predictions.list", listInput(), predA.id, true);
    await expect404(B, "calibration.predictions.get", {
      params: { predictionId: predA.id },
      query: undefined,
      body: undefined,
    });
    expect(rubB.id).not.toBe(rubA.id);
  });

  it("AI 会话(T-136 OQ2「切号=换对话桶」):同名会话各归其号;跨号消息读写 404", async () => {
    const convA = await ok<{ id: string }>(A, "ai.conversations.create", {
      params: undefined,
      query: undefined,
      body: { title: "同名会话" },
    });
    const convB = await ok<{ id: string }>(B, "ai.conversations.create", {
      params: undefined,
      query: undefined,
      body: { title: "同名会话" },
    });
    await expectListMembership(B, "ai.conversations.list", listInput(), convA.id, false);
    await expectListMembership(A, "ai.conversations.list", listInput(), convB.id, false);
    await expect404(B, "ai.conversations.messages.list", {
      params: { conversationId: convA.id },
      query: undefined,
      body: undefined,
    });
    await expect404(B, "ai.conversations.messages.create", {
      params: { conversationId: convA.id },
      query: undefined,
      body: { content: "越权发言" },
    });
  });

  it("收藏夹(DATA-H02 键含号维):同名各建不撞;跨号 toggle/remove 404;A 删不影响 B", async () => {
    const fA = await ok<{ id: string }>(A, "favorites.folders.create", {
      params: undefined,
      query: undefined,
      body: { name: "同名收藏夹" },
    });
    const fB = await ok<{ id: string }>(B, "favorites.folders.create", {
      params: undefined,
      query: undefined,
      body: { name: "同名收藏夹" }, // ISO-05:同名跨号合法,唯一键含 account 维
    });
    await expectListMembership(B, "favorites.folders.list", listInput(), fA.id, false);
    await expect404(B, "favorites.folders.toggle", {
      params: { folderId: fA.id },
      query: undefined,
      body: { enabled: false },
    });
    await expect404(B, "favorites.folders.remove", {
      params: { folderId: fA.id },
      query: undefined,
      body: undefined,
    });
    await ok(A, "favorites.folders.remove", {
      params: { folderId: fA.id },
      query: undefined,
      body: undefined,
    });
    await expectListMembership(B, "favorites.folders.list", listInput(), fB.id, true);
  });

  it("自动化(§6.3 用户点名):job 同名各建;跨号 get/update/run 历史全 404", async () => {
    const jobBody = {
      name: "同名采集任务",
      prompt: "",
      sourceKind: "self.metrics",
      target: {},
      schedule: "50 9 * * *",
      toolGrants: [],
    };
    const jA = await ok<{ id: string }>(A, "scheduledJobs.create", {
      params: undefined,
      query: undefined,
      body: jobBody,
    });
    const jB = await ok<{ id: string }>(B, "scheduledJobs.create", {
      params: undefined,
      query: undefined,
      body: jobBody,
    });
    await expectListMembership(B, "scheduledJobs.list", listInput(), jA.id, false);
    await expectListMembership(A, "scheduledJobs.list", listInput(), jB.id, false);
    await expect404(B, "scheduledJobs.get", {
      params: { jobId: jA.id },
      query: undefined,
      body: undefined,
    });
    await expect404(B, "scheduledJobs.update", {
      params: { jobId: jA.id },
      query: undefined,
      body: { name: "越权改名" },
    });
    await expect404(B, "jobRuns.listByJob", {
      params: { jobId: jA.id },
      query: { ...pageQ },
      body: undefined,
    });
  });

  it("搜索(MAJOR-4「跨号搜到别号内容=串味」):A 的独有词 B 搜不到", async () => {
    const token = "ISOTOKEN甲七";
    await ok(A, "knowledge.create", {
      params: undefined,
      query: undefined,
      body: { title: `${token} 独有知识`, knowledgeType: "note", content: "只属于 A 号" },
    });
    interface SearchPage {
      knowledge: ReadonlyArray<{ id: string }>;
      projects: ReadonlyArray<{ id: string }>;
      videos: ReadonlyArray<{ id: string }>;
      resultTabs: ReadonlyArray<{ id: string; count: number }>;
    }
    const searchIn = (acc: string) =>
      ok<SearchPage>(acc, "pages.search.get", {
        params: undefined,
        query: { q: token },
        body: undefined,
      });
    const inA = await searchIn(A);
    expect(inA.knowledge.length).toBeGreaterThan(0); // A 自己能搜到
    const inB = await searchIn(B);
    const totalHitsB =
      inB.knowledge.length + inB.projects.length + inB.videos.length;
    expect(totalHitsB, "B 号搜 A 的独有词必须 0 命中").toBe(0);
    for (const tab of inB.resultTabs) expect(tab.count).toBe(0);
  });

  it("日历:entry 各归其号;params 号 ≠ ctx 号 → 404(号一致性门);A 删不影响 B", async () => {
    const win = { from: "2026-07-01T00:00:00.000Z", to: "2026-07-31T00:00:00.000Z" };
    const eA = await ok<{ id: string }>(A, "accounts.calendar.entries.create", {
      params: { accountId: A },
      query: undefined,
      body: { plannedAt: "2026-07-20T10:00:00.000Z", note: "同名排期" },
    });
    const eB = await ok<{ id: string }>(B, "accounts.calendar.entries.create", {
      params: { accountId: B },
      query: undefined,
      body: { plannedAt: "2026-07-20T10:00:00.000Z", note: "同名排期" },
    });
    await expectListMembership(
      B,
      "accounts.calendar.list",
      { params: { accountId: B }, query: { ...win, ...pageQ }, body: undefined },
      eA.id,
      false,
    );
    // 显式 accountId 参数与 ctx 当前号不一致 → 404(同 user 名下的另一个号也不行,
    // §4.5「从 A 号页面读 B 号日历」堵死;user 级属主门挡不住这个,必须号一致性门)。
    const crossParam = await call(B, "accounts.calendar.list", {
      params: { accountId: A },
      query: { ...win, ...pageQ },
      body: undefined,
    });
    expect(crossParam.status).toBe(404);
    // 跨号 entry 改写/删除 → 404;A 删自己的,B 的还在。
    await expect404(B, "calendar.entries.delete", {
      params: { entryId: eA.id },
      query: undefined,
      body: undefined,
    });
    await ok(A, "calendar.entries.delete", {
      params: { entryId: eA.id },
      query: undefined,
      body: undefined,
    });
    await expectListMembership(
      B,
      "accounts.calendar.list",
      { params: { accountId: B }, query: { ...win, ...pageQ }, body: undefined },
      eB.id,
      true,
    );
  });

  it("发布节奏(cadence):每号一份,互不串读", async () => {
    await ok(A, "accounts.cadence.upsert", {
      params: { accountId: A },
      query: undefined,
      body: { frequency: "daily", preferredSlots: [] },
    });
    const bCadence = await ok<{ frequency: string } | null>(
      B,
      "accounts.cadence.get",
      { params: { accountId: B }, query: undefined, body: undefined },
    );
    expect(bCadence).toBeNull(); // A 的 cadence 不会变成 B 的
    const aCadence = await ok<{ frequency: string } | null>(
      A,
      "accounts.cadence.get",
      { params: { accountId: A }, query: undefined, body: undefined },
    );
    expect(aCadence?.frequency).toBe("daily");
  });

  it("热点源(S1 唯一键升级):同 URL 双号各登记一份不撞 ux_trend_sources_identity", async () => {
    const body = { url: "https://example.com/iso-feed.xml", name: "同名源" };
    const tA = await ok<{ id: string }>(A, "trend.sources.create", {
      params: undefined,
      query: undefined,
      body,
    });
    const tB = await ok<{ id: string }>(B, "trend.sources.create", {
      params: undefined,
      query: undefined,
      body, // ISO-05:两个号盯同一个源合法(旧唯一键 (user, url) 会在这里炸)
    });
    expect(tB.id).not.toBe(tA.id);
    await expectListMembership(B, "trend.sources.list", listInput(), tA.id, false);
    await expectListMembership(A, "trend.sources.list", listInput(), tB.id, false);
  });
});

describe("[T-332 S6] 边界语义(§4.2/§4.3:拒绝而非降级,未选号=引导态)", () => {
  it("伪造/不存在的 x-account-id → 404 OwnershipError(不降级全量,关 GAP-02)", async () => {
    const res = await call("acct-forged-not-exist", "projects.list", listInput());
    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe("OwnershipError");
  });

  it("已归档号 → 404 + details.reason=account_archived(属主已验实,允许诚实文案)", async () => {
    const cId = await createAccount("@iso-to-archive");
    await ok(null, "accounts.archive", {
      params: { accountId: cId },
      query: undefined,
      body: undefined,
    });
    const res = await call(cId, "projects.list", listInput());
    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe("OwnershipError");
    expect(res.body.error?.details?.reason).toBe("account_archived");
  });

  it("未选号打 per-account op → 428 AccountRequiredError(引导态,不静默全量)", async () => {
    const res = await call(null, "candidates.list", listInput());
    expect(res.status).toBe(428);
    expect(res.body.error?.code).toBe("AccountRequiredError");
  });

  it("跨号深链与「id 不存在」同貌:同 404 同 code,不泄露存在性(§4.5)", async () => {
    const { projectId: pA } = await createProjectWithOutput(A, "同貌验证项目");
    const cross = await call(B, "projects.get", {
      params: { projectId: pA },
      query: undefined,
      body: undefined,
    });
    const ghost = await call(B, "projects.get", {
      params: { projectId: "proj-does-not-exist" },
      query: undefined,
      body: undefined,
    });
    expect(cross.status).toBe(404);
    expect(ghost.status).toBe(404);
    expect(cross.body.error?.code).toBe(ghost.body.error?.code); // 同貌:分不出「存在但不属于你」
  });
});
