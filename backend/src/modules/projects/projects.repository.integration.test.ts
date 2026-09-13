import { describe, it, expect, beforeEach } from "vitest";
import {
  createDb,
  type Db,
  // [T-326 DATA-H05] 删除级联全链路断言要直插/直读的共享 schema 表。
  publications,
  productions,
  productionSegments,
  segmentAssets,
  exportRecords,
  metricSnapshots,
  metricValues,
  retentionPoints,
  audienceSnapshots,
  topicAttributions,
  learnings,
  learningApplications,
  contentCalendarEntries,
  predictions,
  calibrationResults,
  tags,
  entityTags,
  searchDocuments,
  reviews,
  aiTasks,
  audienceSignals,
  sql,
} from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import {
  createProjectRepository,
  type ProjectRepository,
  type ProjectRow,
  type StageRow,
  type ContentOutputRow,
  type OutputStageRow,
  type TaskRow,
  type ActivityRow,
  type TargetPlatformRow,
} from "./projects.repository";
import { OwnershipError } from "./projects.errors";

const NOW = "2026-06-13T10:00:00+08:00";

const ctxA: RequestContext = { userId: "user-a", requestId: "req-a", source: "user", accountId: "acct-a" };
const ctxB: RequestContext = { userId: "user-b", requestId: "req-b", source: "user", accountId: "acct-b" };

function projectRow(over: Partial<ProjectRow> & { id: string; userId: string }): ProjectRow {
  return {
    id: over.id,
    userId: over.userId,
    accountId: over.accountId ?? "acct-a",
    title: over.title ?? "项目",
    brief: over.brief ?? "",
    briefDetail: over.briefDetail ?? {},
    contentCategory: over.contentCategory ?? "",
    source: over.source ?? "manual",
    platformRef: over.platformRef ?? {},
    creationMode: over.creationMode ?? "guided",
    status: over.status ?? "active",
    currentStage: over.currentStage ?? "research",
    progressPct: over.progressPct ?? 0,
    starred: over.starred ?? false,
    startedAt: over.startedAt ?? NOW,
    targetCompletedAt: over.targetCompletedAt ?? null,
    completedAt: over.completedAt ?? null,
    archivedAt: over.archivedAt ?? null,
    createdAt: over.createdAt ?? NOW,
    updatedAt: over.updatedAt ?? NOW,
  };
}

let db: Db;
let repo: ProjectRepository;

beforeEach(async () => {
  ({ db } = await createDb()); // fresh in-memory pglite per test
  repo = createProjectRepository(db);
});

describe("ProjectRepository — round-trip (Task 1)", () => {
  it("inserts and selects back one row per owned entity", async () => {
    await repo.insertProject(ctxA, projectRow({ id: "P_A", userId: "user-a", title: "深度解析" }));

    const stage: StageRow = {
      id: "s1",
      projectId: "P_A",
      stage: "research",
      status: "in_progress",
      progressPct: 0,
      skipped: false,
      startedAt: NOW,
      completedAt: null,
      updatedAt: NOW,
    };
    await repo.insertStages(ctxA, [stage]);

    const platform: TargetPlatformRow = {
      id: "tp1",
      projectId: "P_A",
      platform: "bilibili",
      priority: 1,
      planningNote: "",
      createdAt: NOW,
    };
    await repo.insertTargetPlatforms(ctxA, [platform]);

    const output: ContentOutputRow = {
      id: "o1",
      projectId: "P_A",
      title: "主视频",
      contentType: "video",
      format: "",
      aspectRatio: "",
      targetDurationSeconds: 0,
      status: "drafting",
      contentRole: "traffic",
      primaryAssetId: null,
      createdAt: NOW,
      updatedAt: NOW,
    };
    await repo.insertOutput(ctxA, output);

    const ostage: OutputStageRow = {
      id: "os1",
      contentOutputId: "o1",
      stage: "script",
      status: "in_progress",
      progressPct: 0,
      skipped: false,
      startedAt: NOW,
      completedAt: null,
      updatedAt: NOW,
    };
    await repo.insertOutputStages(ctxA, [ostage]);

    const task: TaskRow = {
      id: "t1",
      projectId: "P_A",
      contentOutputId: "o1",
      stage: "script",
      title: "写大纲",
      description: "",
      status: "todo",
      priority: 3,
      dueAt: null,
      completedAt: null,
    };
    await repo.insertTask(ctxA, task);

    const activity: ActivityRow = {
      id: "a1",
      projectId: "P_A",
      eventType: "project_created",
      entityType: "project",
      entityId: "P_A",
      eventData: { title: "深度解析" },
      occurredAt: NOW,
    };
    await repo.appendActivity(ctxA, activity);

    expect((await repo.get(ctxA, "P_A")).title).toBe("深度解析");
    expect(await repo.listStages(ctxA, "P_A")).toHaveLength(1);
    expect(await repo.listTargetPlatforms(ctxA, "P_A")).toHaveLength(1);
    expect((await repo.getOutput(ctxA, "o1")).title).toBe("主视频");
    expect((await repo.getOutputStage(ctxA, "o1", "script")).status).toBe("in_progress");
    expect((await repo.getTask(ctxA, "t1")).title).toBe("写大纲");
    expect(await repo.listActivity(ctxA, "P_A")).toHaveLength(1);
  });
});

describe("ProjectRepository — multi-tenant ownership (Task 2)", () => {
  beforeEach(async () => {
    await repo.insertProject(ctxA, projectRow({ id: "P_A", userId: "user-a" }));
    await repo.insertProject(ctxB, projectRow({ id: "P_B", userId: "user-b" }));
    // A child output + task under P_A, owned (transitively) by user A.
    await repo.insertOutput(ctxA, {
      id: "o_A",
      projectId: "P_A",
      title: "A output",
      contentType: "video",
      format: "",
      aspectRatio: "",
      targetDurationSeconds: 0,
      status: "drafting",
      contentRole: null,
      primaryAssetId: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await repo.insertTask(ctxA, {
      id: "t_A",
      projectId: "P_A",
      contentOutputId: null,
      stage: "research",
      title: "A task",
      description: "",
      status: "todo",
      priority: 3,
      dueAt: null,
      completedAt: null,
    });
  });

  it("list returns only the caller's projects", async () => {
    const a = await repo.list(ctxA);
    expect(a.map((p) => p.id)).toEqual(["P_A"]);
    const b = await repo.list(ctxB);
    expect(b.map((p) => p.id)).toEqual(["P_B"]);
  });

  it("cross-user get → OwnershipError (no existence leak)", async () => {
    await expect(repo.get(ctxB, "P_A")).rejects.toBeInstanceOf(OwnershipError);
  });

  it("cross-user listTasks → OwnershipError (parent owned by A)", async () => {
    await expect(repo.listTasks(ctxB, "P_A")).rejects.toBeInstanceOf(OwnershipError);
  });

  it("cross-user listActivity → OwnershipError", async () => {
    await expect(repo.listActivity(ctxB, "P_A")).rejects.toBeInstanceOf(OwnershipError);
  });

  it("cross-user getOutput → OwnershipError (join filters on userId)", async () => {
    await expect(repo.getOutput(ctxB, "o_A")).rejects.toBeInstanceOf(OwnershipError);
  });

  it("cross-user getTask → OwnershipError (join filters on userId)", async () => {
    await expect(repo.getTask(ctxB, "t_A")).rejects.toBeInstanceOf(OwnershipError);
  });

  it("cross-user updateProjectRow → OwnershipError (re-asserts before write)", async () => {
    await expect(
      repo.updateProjectRow(ctxB, "P_A", { title: "hijack" }),
    ).rejects.toBeInstanceOf(OwnershipError);
  });
});

// [T-332 S2] 同一 user 下的按号(account_id)strict 隔离门。projects 是 owned-root(有
// 自身 account_id NOT NULL 列)。语义:有号只见该号行;未选号(null)→ AccountRequiredError
// (引导态禁读写,不存在「全局视图」);by-id 跨号 → OwnershipError 404(§4.5)。
describe("ProjectRepository — per-account strict isolation (T-332 S2)", () => {
  const ctxA1: RequestContext = {
    userId: "user-a",
    requestId: "r-a1",
    source: "user",
    accountId: "acct-1",
  };
  const ctxA2: RequestContext = {
    userId: "user-a",
    requestId: "r-a2",
    source: "user",
    accountId: "acct-2",
  };
  const ctxNoAcct: RequestContext = {
    userId: "user-a",
    requestId: "r-ag",
    source: "user",
    accountId: null,
  };

  beforeEach(async () => {
    // 同 user-a、两个号各一 project(双账号隔离样本)。
    await repo.insertProject(
      ctxA1,
      projectRow({ id: "P1", userId: "user-a", accountId: "acct-1", title: "号1项目" }),
    );
    await repo.insertProject(
      ctxA2,
      projectRow({ id: "P2", userId: "user-a", accountId: "acct-2", title: "号2项目" }),
    );
  });

  it("list 只返当前号的行(双账号互不泄漏,ISO-08)", async () => {
    const rows1 = await repo.list(ctxA1);
    expect(rows1.map((p) => p.id)).toEqual(["P1"]);
    const rows2 = await repo.list(ctxA2);
    expect(rows2.map((p) => p.id)).toEqual(["P2"]);
  });

  it("[T-521] 批量 project→output 窄读一次返回本号映射，不泄漏混入的别号项目", async () => {
    await repo.insertOutput(ctxA1, {
      id: "o_P1",
      projectId: "P1",
      title: "号1 output",
      contentType: "video",
      format: "",
      aspectRatio: "",
      targetDurationSeconds: 0,
      status: "drafting",
      contentRole: null,
      primaryAssetId: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await repo.insertOutput(ctxA2, {
      id: "o_P2_batch",
      projectId: "P2",
      title: "号2 output",
      contentType: "video",
      format: "",
      aspectRatio: "",
      targetDurationSeconds: 0,
      status: "drafting",
      contentRole: null,
      primaryAssetId: null,
      createdAt: NOW,
      updatedAt: NOW,
    });

    const bounded = await repo.listOutputRefsByOutputIds(ctxA1, ["o_P1", "o_P2_batch", "missing"]);
    expect(bounded).toHaveLength(1);
    expect(bounded[0]).toMatchObject({outputId: "o_P1", projectId: "P1", title: (await repo.get(ctxA1,"P1")).title});
    expect(await repo.listOutputRefsByOutputIds(ctxB, ["o_P1"])).toEqual([]);
    await expect(repo.listOutputRefsByOutputIds(ctxNoAcct, [])).rejects.toMatchObject({name:"AccountRequiredError"});
    await expect(
      repo.listOutputRefsByProjects(ctxA1, ["P1", "P2"]),
    ).resolves.toEqual([
      {
        projectId: "P1",
        outputId: "o_P1",
        title: "号1 output",
        contentType: "video",
        status: "drafting",
      },
    ]);
  });

  it("未选号(accountId null)→ 读写一律 AccountRequiredError(引导态,无全局视图)", async () => {
    await expect(repo.list(ctxNoAcct)).rejects.toMatchObject({
      name: "AccountRequiredError",
    });
    await expect(repo.get(ctxNoAcct, "P1")).rejects.toMatchObject({
      name: "AccountRequiredError",
    });
    await expect(
      repo.insertProject(
        ctxNoAcct,
        projectRow({ id: "P_NULL", userId: "user-a", title: "无号项目" }),
      ),
    ).rejects.toMatchObject({ name: "AccountRequiredError" });
    await expect(
      repo.updateProjectRow(ctxNoAcct, "P1", { title: "hijack" }),
    ).rejects.toMatchObject({ name: "AccountRequiredError" });
  });

  it("by-id 跨号 get → OwnershipError 404(号一致性门,不泄露存在性,§4.5)", async () => {
    await expect(repo.get(ctxA1, "P2")).rejects.toBeInstanceOf(OwnershipError);
    // 本号内可正常拿到。
    expect((await repo.get(ctxA1, "P1")).id).toBe("P1");
    expect((await repo.get(ctxA2, "P2")).id).toBe("P2");
  });

  it("create stamp:insertProject 只信 ctx.accountId(调用方行值被覆盖,§4.6 防绕过)", async () => {
    const p1 = await repo.get(ctxA1, "P1");
    expect(p1.accountId).toBe("acct-1");
    // 行值谎报 acct-2、ctx 是 acct-1 → 落库仍是 acct-1。
    await repo.insertProject(
      ctxA1,
      projectRow({ id: "P_SPOOF", userId: "user-a", accountId: "acct-2", title: "谎报号" }),
    );
    expect((await repo.get(ctxA1, "P_SPOOF")).accountId).toBe("acct-1");
  });

  it("updateProjectRow 改不到别号的行 → OwnershipError", async () => {
    await expect(
      repo.updateProjectRow(ctxA1, "P2", { title: "hijack" }),
    ).rejects.toBeInstanceOf(OwnershipError);
  });

  it("子表反查(getOutput/getTask)父门透传账号维度:别号项目下的 output/task 拿不到", async () => {
    // 在号2项目 P2 下建 output + task。
    await repo.insertOutput(ctxA2, {
      id: "o_P2",
      projectId: "P2",
      title: "号2 output",
      contentType: "video",
      format: "",
      aspectRatio: "",
      targetDurationSeconds: 0,
      status: "drafting",
      contentRole: null,
      primaryAssetId: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await repo.insertTask(ctxA2, {
      id: "t_P2",
      projectId: "P2",
      contentOutputId: null,
      stage: "research",
      title: "号2 task",
      description: "",
      status: "todo",
      priority: 3,
      dueAt: null,
      completedAt: null,
    });
    // 号1 ctx 反查号2 的 output/task → OwnershipError(父 project 账号门挡住)。
    await expect(repo.getOutput(ctxA1, "o_P2")).rejects.toBeInstanceOf(OwnershipError);
    await expect(repo.getTask(ctxA1, "t_P2")).rejects.toBeInstanceOf(OwnershipError);
    // 号2 ctx 自己能拿到。
    expect((await repo.getOutput(ctxA2, "o_P2")).id).toBe("o_P2");
    expect((await repo.getTask(ctxA2, "t_P2")).id).toBe("t_P2");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// [T-326 DATA-H05] deleteProjectCascade 全链路无孤儿 + 隔离断言。
// 建一个带全链路数据的项目(production/analytics/attribution/learning/日历/校准/
// 标签/搜索索引各来一行)→ 删除 → 断言各软引用表无孤儿;同 user 另一项目的数据不受伤。
// ─────────────────────────────────────────────────────────────────────────────
describe("ProjectRepository — deleteProjectCascade 补全 (T-326 DATA-H05)", () => {
  // 给两个项目(P_DEL 被删 / P_KEEP 留存)各铺一条全链路:output → publication →
  // production 链 + analytics 事实 + 归因 + 经验/应用 + 日历槽 + 预测/校准 + 标签 + 索引。
  async function seedChain(suffix: "del" | "keep", projectId: string) {
    const oId = `o-${suffix}`;
    const pubId = `pub-${suffix}`;
    await repo.insertProject(
      ctxA,
      projectRow({ id: projectId, userId: "user-a", title: `链路-${suffix}` }),
    );
    await repo.insertOutput(ctxA, {
      id: oId,
      projectId,
      title: `产出-${suffix}`,
      contentType: "video",
      format: "",
      aspectRatio: "",
      targetDurationSeconds: 0,
      status: "drafting",
      contentRole: "traffic",
      primaryAssetId: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.insert(publications).values({
      id: pubId,
      userId: "user-a",
      accountId: "acct-a",
      contentOutputId: oId,
      platform: "douyin",
      accountReference: "acct-ref",
      createdAt: NOW,
      updatedAt: NOW,
    });
    // production 链:production → segment → segment_asset;export_record 挂 production。
    await db.insert(productions).values({
      id: `prod-${suffix}`,
      userId: "user-a",
      contentOutputId: oId,
      updatedAt: NOW,
    });
    await db.insert(productionSegments).values({
      id: `seg-${suffix}`,
      userId: "user-a",
      productionId: `prod-${suffix}`,
      title: "开场",
    });
    await db.insert(segmentAssets).values({
      id: `sa-${suffix}`,
      userId: "user-a",
      productionSegmentId: `seg-${suffix}`,
      assetId: `asset-${suffix}`,
      usageType: "broll",
    });
    await db.insert(exportRecords).values({
      id: `exp-${suffix}`,
      userId: "user-a",
      productionId: `prod-${suffix}`,
      format: "mp4",
      resolution: "1080p",
      aspectRatio: "9:16",
      createdAt: NOW,
    });
    // analytics 事实:snapshot → value;retention/audience 直挂 publication。
    await db.insert(metricSnapshots).values({
      id: `ms-${suffix}`,
      userId: "user-a",
      accountId: "acct-a",
      publicationId: pubId,
      capturedAt: NOW,
      source: "douyin_export",
      createdAt: NOW,
    });
    await db.insert(metricValues).values({
      id: `mv-${suffix}`,
      userId: "user-a",
      accountId: "acct-a",
      metricSnapshotId: `ms-${suffix}`,
      metricKey: "play_count",
      numericValue: 100,
    });
    await db.insert(retentionPoints).values({
      id: `rp-${suffix}`,
      userId: "user-a",
      accountId: "acct-a",
      publicationId: pubId,
      capturedAt: NOW,
      positionMs: 1000,
      retentionRate: 0.8,
      viewerCount: 80,
    });
    await db.insert(audienceSnapshots).values({
      id: `as-${suffix}`,
      userId: "user-a",
      accountId: "acct-a",
      publicationId: pubId,
      capturedAt: NOW,
      dimensionType: "age",
      dimensionValue: "18-23",
      percentage: 0.4,
      audienceCount: 40,
    });
    // 选题归因(publication 幂等锚 + project 溯源锚)。
    await db.insert(topicAttributions).values({
      id: `ta-${suffix}`,
      userId: "user-a",
      accountId: "acct-a",
      publicationId: pubId,
      projectId,
      topicType: "教程",
      hookType: "具体数字",
      structureFormula: "三步教程",
      createdAt: NOW,
      updatedAt: NOW,
    });
    // 经验(project 锚)+ 应用(project 锚)。
    await db.insert(learnings).values({
      id: `L-${suffix}`,
      userId: "user-a",
      accountId: "acct-a",
      projectId,
      title: `经验-${suffix}`,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.insert(learningApplications).values({
      id: `app-${suffix}`,
      userId: "user-a",
      accountId: "acct-a",
      learningId: `L-${suffix}`,
      projectId,
      appliedAt: NOW,
    });
    // 内容日历槽(output 锚)。
    await db.insert(contentCalendarEntries).values({
      id: `ce-${suffix}`,
      userId: "user-a",
      accountId: "acct-a",
      plannedAt: NOW,
      plannedDate: NOW.slice(0, 10),
      contentOutputId: oId,
      createdAt: NOW,
      updatedAt: NOW,
    });
    // 校准链:prediction(subject=publication)→ calibration_result。
    await db.insert(predictions).values({
      id: `pred-${suffix}`,
      userId: "user-a",
      accountId: "acct-a",
      subjectType: "publication",
      subjectId: pubId,
      rubricVersionId: "rv-1",
      confidence: "high",
      createdAt: NOW,
    });
    await db.insert(calibrationResults).values({
      id: `cr-${suffix}`,
      userId: "user-a",
      accountId: "acct-a",
      predictionId: `pred-${suffix}`,
      ingestionRunId: "run-1",
      createdAt: NOW,
    });
    // 标签指派(project 实体)+ 搜索索引(project 实体)。
    await db.insert(entityTags).values({
      id: `et-${suffix}`,
      userId: "user-a",
      tagId: "tg-1",
      entityType: "project",
      entityId: projectId,
      createdAt: NOW,
    });
    await db.insert(searchDocuments).values({
      id: `sd-${suffix}`,
      userId: "user-a",
      accountId: "acct-a",
      entityType: "project",
      entityId: projectId,
      title: `链路-${suffix}`,
      searchText: `链路-${suffix}`,
      indexedAt: NOW,
    });
    return { oId, pubId };
  }

  it("删除清空 production/analytics/attribution/learning/日历/校准/标签/索引,另一项目不受伤", async () => {
    // 共享 tag(usage_count=2:P_DEL + P_KEEP 各一次指派)。
    await db.insert(tags).values({
      id: "tg-1",
      userId: "user-a",
      name: "干货",
      usageCount: 2,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const delChain = await seedChain("del", "P_DEL");
    await seedChain("keep", "P_KEEP");
    // 解锚样本:手录经验(project 归属为 NULL)后来挂上 P_DEL 的 review —— 知识不删,解锚。
    await db.insert(reviews).values({
      id: "rev-del",
      userId: "user-a",
      accountId: "acct-a",
      projectId: "P_DEL",
      reviewType: "output",
      status: "draft",
      periodStart: NOW,
      periodEnd: NOW,
      createdAt: NOW,
    });
    await db.insert(learnings).values({
      id: "L-manual",
      userId: "user-a",
      accountId: "acct-a",
      projectId: null,
      reviewId: "rev-del",
      title: "手录经验",
      createdAt: NOW,
      updatedAt: NOW,
    });
    // 派生引用样本:P_KEEP 复用了 P_DEL 产的经验(learning_id 指向被删经验)→ 应用行须清。
    await db.insert(learningApplications).values({
      id: "app-cross",
      userId: "user-a",
      accountId: "acct-a",
      learningId: "L-del",
      projectId: "P_KEEP",
      appliedAt: NOW,
    });
    // output-scoped AI 任务(project_id 为 NULL,只带 content_output_id)→ 收敛键补维后应删。
    await db.insert(aiTasks).values({
      id: "ait-output-scoped",
      userId: "user-a",
      accountId: "acct-a",
      projectId: null,
      contentOutputId: delChain.oId,
      taskType: "script_polish",
      idempotencyKey: "idem-1",
      requestedAt: NOW,
    });

    await repo.deleteProjectCascade(ctxA, "P_DEL");

    // ── 全链路无孤儿(*-del 行全没了),*-keep 行全在(隔离) ──────────────
    const ids = (rows: Array<{ id: string }>) => rows.map((r) => r.id).sort();
    expect(ids(await db.select().from(productions))).toEqual(["prod-keep"]);
    expect(ids(await db.select().from(productionSegments))).toEqual(["seg-keep"]);
    expect(ids(await db.select().from(segmentAssets))).toEqual(["sa-keep"]);
    expect(ids(await db.select().from(exportRecords))).toEqual(["exp-keep"]);
    expect(ids(await db.select().from(metricSnapshots))).toEqual(["ms-keep"]);
    expect(ids(await db.select().from(metricValues))).toEqual(["mv-keep"]);
    expect(ids(await db.select().from(retentionPoints))).toEqual(["rp-keep"]);
    expect(ids(await db.select().from(audienceSnapshots))).toEqual(["as-keep"]);
    expect(ids(await db.select().from(topicAttributions))).toEqual(["ta-keep"]);
    expect(ids(await db.select().from(contentCalendarEntries))).toEqual(["ce-keep"]);
    expect(ids(await db.select().from(predictions))).toEqual(["pred-keep"]);
    expect(ids(await db.select().from(calibrationResults))).toEqual(["cr-keep"]);
    expect(ids(await db.select().from(entityTags))).toEqual(["et-keep"]);
    expect(ids(await db.select().from(searchDocuments))).toEqual(["sd-keep"]);
    // 经验:P_DEL 产的删;P_KEEP 的留;手录经验留但 review 锚已解。
    expect(ids(await db.select().from(learnings))).toEqual(["L-keep", "L-manual"]);
    const manual = (await db.select().from(learnings)).find((r) => r.id === "L-manual");
    expect(manual?.reviewId).toBeNull();
    // 应用行:P_DEL 自己的(app-del)按 project 清;P_KEEP 引用被删经验的(app-cross)
    // 按 learning_id 清;P_KEEP 自己的留。
    expect(ids(await db.select().from(learningApplications))).toEqual(["app-keep"]);
    // output-scoped AI 任务(project_id NULL)也被收敛删除。
    expect(ids(await db.select().from(aiTasks))).toEqual([]);
    // 标签 usage_count 回补:2 → 1(P_DEL 的指派没了,P_KEEP 的还在)。
    const tag = (await db.select().from(tags)).find((r) => r.id === "tg-1");
    expect(tag?.usageCount).toBe(1);
    // 项目根行:P_DEL 没了,P_KEEP 完好。
    await expect(repo.get(ctxA, "P_DEL")).rejects.toBeInstanceOf(OwnershipError);
    expect((await repo.get(ctxA, "P_KEEP")).title).toBe("链路-keep");
  });
});

describe("ProjectRepository — T-595 手工项目只清平台发布子树", () => {
  it("在一个事务中归一 publication 与 project 的公开兼容标记", async () => {
    await repo.insertProject(
      ctxA,
      projectRow({
        id: "P_VISIBLE",
        userId: "user-a",
        source: "imported",
        platformRef: {
          platform: "douyin",
          externalId: "aweme-visible",
          hidden: true,
        },
      }),
    );
    await repo.insertOutput(ctxA, {
      id: "O_VISIBLE",
      projectId: "P_VISIBLE",
      title: "恢复公开",
      contentType: "video",
      format: "",
      aspectRatio: "",
      targetDurationSeconds: 0,
      status: "published",
      contentRole: "traffic",
      primaryAssetId: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.insert(publications).values({
      id: "PUB_VISIBLE",
      userId: "user-a",
      accountId: "acct-a",
      contentOutputId: "O_VISIBLE",
      platform: "douyin",
      accountReference: "acct-ref",
      status: "published",
      externalId: "aweme-visible",
      hiddenAt: NOW,
      platformStatus: "自见",
      createdAt: NOW,
      updatedAt: NOW,
    });

    expect(
      await repo.normalizeVisiblePlatformWork(ctxA, {
        platform: "douyin",
        externalId: "aweme-visible",
        updatedAt: "2026-07-28T11:00:00.000Z",
      }),
    ).toEqual({ publicationId: "PUB_VISIBLE", projectId: "P_VISIBLE" });
    const [publication] = await db.select().from(publications);
    expect(publication?.hiddenAt).toBeNull();
    expect(publication?.platformStatus).toBe("已通过");
    expect(
      ((await repo.get(ctxA, "P_VISIBLE")).platformRef as { hidden?: boolean })
        .hidden,
    ).toBe(false);
  });

  it("原子删除 publication/指标/归因/搜索，保留手工 project 与 output", async () => {
    await repo.insertProject(
      ctxA,
      projectRow({
        id: "P_MANUAL",
        userId: "user-a",
        source: "manual",
        title: "我的原创项目",
      }),
    );
    await repo.insertOutput(ctxA, {
      id: "O_MANUAL",
      projectId: "P_MANUAL",
      title: "原创脚本",
      contentType: "video",
      format: "",
      aspectRatio: "",
      targetDurationSeconds: 0,
      status: "published",
      contentRole: "traffic",
      primaryAssetId: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.insert(publications).values({
      id: "PUB_HIDDEN",
      userId: "user-a",
      accountId: "acct-a",
      contentOutputId: "O_MANUAL",
      platform: "douyin",
      accountReference: "acct-ref",
      status: "published",
      externalId: "aweme-hidden",
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.insert(metricSnapshots).values({
      id: "MS_HIDDEN",
      userId: "user-a",
      accountId: "acct-a",
      publicationId: "PUB_HIDDEN",
      capturedAt: NOW,
      source: "ingestion",
      createdAt: NOW,
    });
    await db.insert(topicAttributions).values({
      id: "TA_HIDDEN",
      userId: "user-a",
      accountId: "acct-a",
      publicationId: "PUB_HIDDEN",
      projectId: "P_MANUAL",
      topicType: "教程",
      hookType: "痛点直击",
      structureFormula: "三步教程",
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.insert(searchDocuments).values({
      id: "SD_HIDDEN",
      userId: "user-a",
      accountId: "acct-a",
      entityType: "publication",
      entityId: "PUB_HIDDEN",
      title: "不应再命中",
      body: "",
      searchText: "不应再命中",
      indexedAt: NOW,
    });
    await db.insert(audienceSignals).values({
      id: "SIG_HIDDEN",
      userId: "user-a",
      accountId: "acct-a",
      source: "comment",
      rawText: "隐藏作品评论",
      publicationId: "PUB_HIDDEN",
      createdAt: NOW,
    });

    expect(
      await repo.deletePlatformPublicationCascade(ctxA, {
        platform: "douyin",
        externalId: "aweme-hidden",
      }),
    ).toEqual({ publicationId: "PUB_HIDDEN" });

    expect(await db.select().from(publications)).toHaveLength(0);
    expect(await db.select().from(metricSnapshots)).toHaveLength(0);
    expect(await db.select().from(topicAttributions)).toHaveLength(0);
    expect(await db.select().from(searchDocuments)).toHaveLength(0);
    expect(await db.select().from(audienceSignals)).toHaveLength(0);
    expect((await repo.get(ctxA, "P_MANUAL")).title).toBe("我的原创项目");
    expect((await repo.getOutput(ctxA, "O_MANUAL")).title).toBe("原创脚本");
  });

  it.each([
    "metric_snapshots",
    "topic_attributions",
    "search_documents",
    "publications",
  ])("删除阶段 %s 失败时整笔回滚，不留下半清理状态", async (failTable) => {
    await repo.insertProject(
      ctxA,
      projectRow({
        id: "P_ROLLBACK",
        userId: "user-a",
        source: "manual",
      }),
    );
    await repo.insertOutput(ctxA, {
      id: "O_ROLLBACK",
      projectId: "P_ROLLBACK",
      title: "事务回滚",
      contentType: "video",
      format: "",
      aspectRatio: "",
      targetDurationSeconds: 0,
      status: "published",
      contentRole: "traffic",
      primaryAssetId: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.insert(publications).values({
      id: "PUB_ROLLBACK",
      userId: "user-a",
      accountId: "acct-a",
      contentOutputId: "O_ROLLBACK",
      platform: "douyin",
      accountReference: "acct-ref",
      status: "published",
      externalId: "aweme-rollback",
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.insert(metricSnapshots).values({
      id: "MS_ROLLBACK",
      userId: "user-a",
      accountId: "acct-a",
      publicationId: "PUB_ROLLBACK",
      capturedAt: NOW,
      source: "ingestion",
      createdAt: NOW,
    });
    await db.insert(topicAttributions).values({
      id: "TA_ROLLBACK",
      userId: "user-a",
      accountId: "acct-a",
      publicationId: "PUB_ROLLBACK",
      projectId: "P_ROLLBACK",
      topicType: "教程",
      hookType: "痛点直击",
      structureFormula: "三步教程",
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.insert(searchDocuments).values({
      id: "SD_ROLLBACK",
      userId: "user-a",
      accountId: "acct-a",
      entityType: "publication",
      entityId: "PUB_ROLLBACK",
      title: "事务回滚",
      body: "",
      searchText: "事务回滚",
      indexedAt: NOW,
    });

    await db.execute(
      sql.raw(`
        CREATE FUNCTION fail_visible_cleanup() RETURNS trigger AS $$
        BEGIN
          RAISE EXCEPTION 'forced visible cleanup rollback';
        END;
        $$ LANGUAGE plpgsql
      `),
    );
    await db.execute(
      sql.raw(`
        CREATE TRIGGER fail_visible_cleanup_trigger
        BEFORE DELETE ON ${failTable}
        FOR EACH ROW EXECUTE FUNCTION fail_visible_cleanup()
      `),
    );

    await expect(
      repo.deletePlatformPublicationCascade(ctxA, {
        platform: "douyin",
        externalId: "aweme-rollback",
      }),
    ).rejects.toThrow("forced visible cleanup rollback");

    expect(await db.select().from(publications)).toHaveLength(1);
    expect(await db.select().from(metricSnapshots)).toHaveLength(1);
    expect(await db.select().from(topicAttributions)).toHaveLength(1);
    expect(await db.select().from(searchDocuments)).toHaveLength(1);
  });
});
