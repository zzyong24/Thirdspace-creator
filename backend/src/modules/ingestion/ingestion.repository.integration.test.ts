import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import {
  createIngestionRepository,
  type IngestionRepository,
  type ExternalSourceRow,
} from "./ingestion.repository";
import { OwnershipError } from "./ingestion.errors";

// Tasks 1+2 — db-schema round-trip + user-scoped repository.
//   - the four tables round-trip (ISO text timestamps, jsonb configuration /
//     rejected_payload survive);
//   - ownership: a run/source owned by user-A is invisible to a user-B repo
//     (getRun/listErrors → OwnershipError 404; user A sees it);
//   - the two UNIQUE indexes reject duplicates at the DB layer;
//   - counters bump correctly and a re-pushed record is a no-op (SPEC §17.2).

const NOW = "2026-06-21T00:00:00.000Z";

function makeRepo(
  db: Db,
  userId: string,
  accountId: string | null = "acct-a", // [T-332 S2] strict 门:默认带号;未选号用例显式传 null
): IngestionRepository {
  let seq = 0;
  return createIngestionRepository(db, {
    now: () => NOW,
    nextId: (prefix: string) => `${prefix}-${userId}-${accountId ?? "u"}-${++seq}`,
    userId,
    accountId,
  });
}

const sourceRow = (userId: string, id: string): ExternalSourceRow => ({
  id,
  userId,
  accountId: "acct-a", // [T-332 S2] NOT NULL:seed 带号
  sourceType: "mock",
  name: "Mock Source",
  sourceIdentifier: "mock://canonical",
  secretReference: "secret-ref",
  configuration: { region: "cn" },
  createdAt: NOW,
});

describe("ingestion repository — round-trip", () => {
  let db: Db;
  let repoA: IngestionRepository;

  beforeEach(async () => {
    ({ db } = await createDb());
    repoA = makeRepo(db, "user-a");
    await repoA.seedExternalSources([sourceRow("user-a", "src-a")]);
  });

  it("external_source / run / error / record round-trip with jsonb + ISO timestamps", async () => {
    const src = await repoA.getExternalSource("src-a");
    expect(src).toBeDefined();
    expect(src!.configuration).toEqual({ region: "cn" });
    expect(src!.createdAt).toBe(NOW);

    const run = await repoA.createRun({
      externalSourceId: "src-a",
      runType: "metrics",
      idempotencyKey: "idem-1",
    });
    expect(run.status).toBe("pending");
    expect(run.startedAt).toBeNull();
    expect(run.recordsReceived).toBe(0);

    const err = await repoA.appendError({
      ingestionRunId: run.id,
      recordKey: "rk-bad",
      errorCode: "SCHEMA_INVALID",
      errorMessage: "missing capturedAt",
      rejectedPayload: { foo: "bar" },
    });
    const errs = await repoA.listErrors(run.id);
    expect(errs).toHaveLength(1);
    expect(errs[0]!.id).toBe(err.id);
    expect(errs[0]!.rejectedPayload).toEqual({ foo: "bar" });

    await repoA.markRecordResult(run.id, "rk-1", "written");
    const reloaded = await repoA.getRun(run.id);
    expect(reloaded.recordsReceived).toBe(1);
    expect(reloaded.recordsWritten).toBe(1);
    expect(reloaded.recordsRejected).toBe(0);
  });

  it("markRunRunning stamps status + startedAt once; counters track written/rejected", async () => {
    const run = await repoA.createRun({
      externalSourceId: "src-a",
      runType: "metrics",
      idempotencyKey: "idem-run",
    });
    const running = await repoA.markRunRunning(run.id);
    expect(running.status).toBe("running");
    expect(running.startedAt).toBe(NOW);

    // markRunRunning a second time is a no-op (already running).
    const again = await repoA.markRunRunning(run.id);
    expect(again.startedAt).toBe(NOW);

    await repoA.markRecordResult(run.id, "rk-1", "written");
    await repoA.markRecordResult(run.id, "rk-2", "rejected");
    const after = await repoA.getRun(run.id);
    expect(after.recordsReceived).toBe(2);
    expect(after.recordsWritten).toBe(1);
    expect(after.recordsRejected).toBe(1);
  });

  it("a re-pushed record_key is a no-op (counters unchanged) — SPEC §17.2", async () => {
    const run = await repoA.createRun({
      externalSourceId: "src-a",
      runType: "metrics",
      idempotencyKey: "idem-dup",
    });
    expect(await repoA.recordExists(run.id, "rk-1")).toBe(false);
    await repoA.markRecordResult(run.id, "rk-1", "written");
    expect(await repoA.recordExists(run.id, "rk-1")).toBe(true);
    // Second push of the same key — no double-count.
    await repoA.markRecordResult(run.id, "rk-1", "written");
    const after = await repoA.getRun(run.id);
    expect(after.recordsReceived).toBe(1);
    expect(after.recordsWritten).toBe(1);
  });

  it("(external_source_id, idempotency_key) UNIQUE — second createRun with same key throws", async () => {
    await repoA.createRun({
      externalSourceId: "src-a",
      runType: "metrics",
      idempotencyKey: "idem-unique",
    });
    await expect(
      repoA.createRun({
        externalSourceId: "src-a",
        runType: "metrics",
        idempotencyKey: "idem-unique",
      }),
    ).rejects.toThrow();
  });

  it("findRunByIdempotency returns the original run; undefined when absent", async () => {
    const created = await repoA.createRun({
      externalSourceId: "src-a",
      runType: "metrics",
      idempotencyKey: "idem-find",
    });
    const found = await repoA.findRunByIdempotency("src-a", "idem-find");
    expect(found!.id).toBe(created.id);
    expect(await repoA.findRunByIdempotency("src-a", "nope")).toBeUndefined();
  });
});

describe("ingestion repository — multi-tenant ownership", () => {
  let db: Db;
  let repoA: IngestionRepository;
  let repoB: IngestionRepository;

  beforeEach(async () => {
    ({ db } = await createDb());
    repoA = makeRepo(db, "user-a");
    repoB = makeRepo(db, "user-b");
    await repoA.seedExternalSources([sourceRow("user-a", "src-a")]);
  });

  it("user B cannot getRun / listErrors a run owned by user A (OwnershipError 404)", async () => {
    const run = await repoA.createRun({
      externalSourceId: "src-a",
      runType: "metrics",
      idempotencyKey: "idem-own",
    });
    await repoA.appendError({
      ingestionRunId: run.id,
      recordKey: "rk-x",
      errorCode: "SCHEMA_INVALID",
      errorMessage: "x",
      rejectedPayload: {},
    });
    // User A sees it.
    await expect(repoA.getRun(run.id)).resolves.toMatchObject({ id: run.id });
    await expect(repoA.listErrors(run.id)).resolves.toHaveLength(1);
    // User B does not (404, not an existence leak).
    await expect(repoB.getRun(run.id)).rejects.toBeInstanceOf(OwnershipError);
    await expect(repoB.listErrors(run.id)).rejects.toBeInstanceOf(
      OwnershipError,
    );
  });

  it("getExternalSource is user-scoped — user B cannot read user A's source", async () => {
    await expect(repoB.getExternalSource("src-a")).resolves.toBeUndefined();
    await expect(repoA.getExternalSource("src-a")).resolves.toBeDefined();
  });

  it("(ingestion_run_id, record_key) UNIQUE index is enforced at the DB layer", async () => {
    const run = await repoA.createRun({
      externalSourceId: "src-a",
      runType: "metrics",
      idempotencyKey: "idem-rec",
    });
    await repoA.markRecordResult(run.id, "rk-1", "written");
    // The ledger row exists; a second onConflictDoNothing insert is silent.
    await expect(
      repoA.markRecordResult(run.id, "rk-1", "rejected"),
    ).resolves.toBeUndefined();
    const after = await repoA.getRun(run.id);
    expect(after.recordsReceived).toBe(1); // not double-counted
  });
});

// [T-136 §D 切片 c] 按号隔离 repo 门 —— external_sources / ingestion_runs 加 account_id,
//   读点条件过滤(选号只见该号,未选号见该 user 全部),create stamp accountId,跨号不串。
describe("ingestion repository — account gate (T-136)", () => {
  let db: Db;

  beforeEach(async () => {
    ({ db } = await createDb());
  });

  it("createRun stamps account_id from deps; a run created under acct-1 is invisible to an acct-2 repo", async () => {
    const repoAcct1 = makeRepo(db, "user-a", "acct-1");
    const repoAcct2 = makeRepo(db, "user-a", "acct-2");
    // 两号各自源(同 user、不同 account)。
    await repoAcct1.seedExternalSources([
      { ...sourceRow("user-a", "src-1"), accountId: "acct-1" },
    ]);
    const run = await repoAcct1.createRun({
      externalSourceId: "src-1",
      runType: "metrics",
      idempotencyKey: "idem-acct",
    });
    // acct-1 repo 看得到自己的 run(号门命中)。
    await expect(repoAcct1.getRun(run.id)).resolves.toMatchObject({
      id: run.id,
    });
    // acct-2 repo 看不到 acct-1 的 run(号门不命中 → OwnershipError 404,跨号隔离)。
    await expect(repoAcct2.getRun(run.id)).rejects.toBeInstanceOf(
      OwnershipError,
    );
  });

  it("未选号 repo(accountId=null)读写一律 AccountRequiredError(引导态,无全局视图退化)", async () => {
    const repoAcct1 = makeRepo(db, "user-a", "acct-1");
    const repoNoAcct = makeRepo(db, "user-a", null);
    await repoAcct1.seedExternalSources([
      { ...sourceRow("user-a", "src-1"), accountId: "acct-1" },
    ]);
    const run = await repoAcct1.createRun({
      externalSourceId: "src-1",
      runType: "metrics",
      idempotencyKey: "idem-null",
    });
    // [T-332 S2] strict:未选号 → 抛(不再是「门忽略见全部」)。
    await expect(repoNoAcct.getRun(run.id)).rejects.toMatchObject({
      name: "AccountRequiredError",
    });
    await expect(repoNoAcct.getExternalSource("src-1")).rejects.toMatchObject({
      name: "AccountRequiredError",
    });
    await expect(
      repoNoAcct.createRun({
        externalSourceId: "src-1",
        runType: "metrics",
        idempotencyKey: "idem-null-2",
      }),
    ).rejects.toMatchObject({ name: "AccountRequiredError" });
  });

  it("getExternalSource is account-scoped: acct-2 repo cannot see acct-1's source", async () => {
    const repoAcct1 = makeRepo(db, "user-a", "acct-1");
    const repoAcct2 = makeRepo(db, "user-a", "acct-2");
    await repoAcct1.seedExternalSources([
      { ...sourceRow("user-a", "src-1"), accountId: "acct-1" },
    ]);
    expect(await repoAcct1.getExternalSource("src-1")).toBeDefined();
    expect(await repoAcct2.getExternalSource("src-1")).toBeUndefined();
  });

  it("findRunByIdempotency: same idempotencyKey in different accounts are independent runs", async () => {
    const repoAcct1 = makeRepo(db, "user-a", "acct-1");
    const repoAcct2 = makeRepo(db, "user-a", "acct-2");
    await repoAcct1.seedExternalSources([
      { ...sourceRow("user-a", "src-1"), accountId: "acct-1" },
    ]);
    await repoAcct2.seedExternalSources([
      { ...sourceRow("user-a", "src-2"), accountId: "acct-2" },
    ]);
    const run1 = await repoAcct1.createRun({
      externalSourceId: "src-1",
      runType: "metrics",
      idempotencyKey: "shared-key",
    });
    // acct-1 命中自己的 run;acct-2 用同 key 查自己的源 → 无命中(不同号独立)。
    expect(
      await repoAcct1.findRunByIdempotency("src-1", "shared-key"),
    ).toMatchObject({ id: run1.id });
    expect(
      await repoAcct2.findRunByIdempotency("src-2", "shared-key"),
    ).toBeUndefined();
  });
});

// [T-136 §9 MINOR-3] external_sources 去重 —— 同 (user, account, name) 多条 douyin 源 →
//   保留最新其余标 deprecated;不同 account 相同 name 视独立源各留。
describe("ingestion repository — deduplicateDouyinSources (T-136 MINOR-3)", () => {
  let db: Db;

  beforeEach(async () => {
    ({ db } = await createDb());
  });

  const douyinSrc = (
    id: string,
    accountId: string,
    createdAt: string,
  ): ExternalSourceRow => ({
    id,
    userId: "user-a",
    accountId,
    sourceType: "douyin",
    name: "我的抖音",
    sourceIdentifier: "",
    secretReference: "",
    configuration: {},
    createdAt,
  });

  it("keeps the newest, marks older same-(account,name) douyin sources deprecated", async () => {
    const repo = makeRepo(db, "user-a", "acct-1");
    await repo.seedExternalSources([
      douyinSrc("d-old", "acct-1", "2026-01-01T00:00:00.000Z"),
      douyinSrc("d-new", "acct-1", "2026-06-01T00:00:00.000Z"),
    ]);
    const marked = await repo.deduplicateDouyinSources();
    expect(marked).toBe(1); // 旧的那条被标 deprecated
    const oldSrc = await repo.getExternalSource("d-old");
    const newSrc = await repo.getExternalSource("d-new");
    expect((oldSrc!.configuration as Record<string, unknown>).deprecated).toBe(
      true,
    );
    expect(
      (newSrc!.configuration as Record<string, unknown>).deprecated,
    ).toBeUndefined();
  });

  it("different accounts with the same name are independent — never deduped", async () => {
    // [T-332 S2] strict 门:各号 repo 只看自己号的源;两号各一条同名源互不干扰。
    const repo1 = makeRepo(db, "user-a", "acct-1");
    const repo2 = makeRepo(db, "user-a", "acct-2");
    await repo1.seedExternalSources([
      douyinSrc("d-a1", "acct-1", "2026-01-01T00:00:00.000Z"),
      douyinSrc("d-a2", "acct-2", "2026-01-01T00:00:00.000Z"),
    ]);
    expect(await repo1.deduplicateDouyinSources()).toBe(0); // 各组只有一条,不去重
    expect(await repo2.deduplicateDouyinSources()).toBe(0);
  });

  it("is idempotent — a second run marks nothing new", async () => {
    const repo = makeRepo(db, "user-a", "acct-1");
    await repo.seedExternalSources([
      douyinSrc("d-old", "acct-1", "2026-01-01T00:00:00.000Z"),
      douyinSrc("d-new", "acct-1", "2026-06-01T00:00:00.000Z"),
    ]);
    expect(await repo.deduplicateDouyinSources()).toBe(1);
    expect(await repo.deduplicateDouyinSources()).toBe(0); // 幂等
  });
});
