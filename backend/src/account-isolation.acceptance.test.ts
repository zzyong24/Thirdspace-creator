import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import type { RequestContext } from "@creatoros/contract";
import { createDb, type Db } from "@creatoros/backend";
import { createCandidateRepository } from "./modules/candidate/candidate.repository";
import { createNotificationRepository } from "./modules/notifications/notifications.repository";
import { createNotificationsService } from "./modules/notifications/notifications.service";
import { OwnershipError } from "./modules/notifications/notifications.errors";

/**
 * [T-332 S6 / T-346] 账号全域隔离·双号验收 —— **无 wire 契约的内部表**收口。
 *
 * frontend 的 account-isolation.acceptance.test.ts 走 dispatch 真链覆盖了全部有公开 op
 * 的域;以下三类没有公开写 op(写路径在采集/淘汰蒸馏/组合根 notify seam 内部),在
 * service/repo 层用同一真 pglite 直接验 SPEC §2 不变量:
 *
 *   1. topic_preferences(偏好蒸馏,ISO-05):身份键 ux_topic_preferences_identity_v2
 *      (user, account, keyword, direction)—— 双号同 (keyword, direction) 各自成行,
 *      A 号强化不改写 B 号;listActive 只见本号。
 *   2. audience_signals(采集评论去重,ISO-05/§3.1 用户点名):幂等锚
 *      ux_audience_signals_user_source_external_v2 (user, account, source, external_id)
 *      —— 同一条评论被两个号各自采集,各归其号(T-136 时代「先入库的号吞掉」的设计缺陷
 *      在此关死);同号重采仍幂等去重。
 *   3. notifications(C-02 全仓唯一设计性 OR-NULL):业务通知按号;系统级(account_id
 *      NULL)双号可见;未选号只见系统级;跨号 by-id markRead → 404。
 */

const NOW = "2026-07-15T00:00:00.000Z";
const USER = "user-iso";
const ACC_A = "acct-iso-a";
const ACC_B = "acct-iso-b";

function candidateRepoFor(db: Db, accountId: string) {
  let seq = 0;
  return createCandidateRepository(db, {
    now: () => NOW,
    nextId: (prefix: string) => `${prefix}-${accountId}-${++seq}`,
    userId: USER,
    accountId,
  });
}

describe("[T-332 S6] 偏好 topic_preferences:双号同键各自成行(ISO-05)", () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await createDb());
  });

  const pref = {
    keyword: "口播",
    direction: "avoid" as const,
    signal: "太浅了,不做",
    exampleCount: 1,
    weight: -5,
    status: "active" as const,
  };

  it("A/B 各 upsert 同 (keyword, direction) → 两行独立;A 强化不改写 B", async () => {
    const repoA = candidateRepoFor(db, ACC_A);
    const repoB = candidateRepoFor(db, ACC_B);

    const rowA = await repoA.upsertTopicPreference(pref);
    const rowB = await repoB.upsertTopicPreference(pref);
    // 不撞唯一键:各自成行、各归其号(旧键 (user, keyword, direction) 会把 B 归并进 A)。
    expect(rowA.id).not.toBe(rowB.id);
    expect(rowA.accountId).toBe(ACC_A);
    expect(rowB.accountId).toBe(ACC_B);

    // A 号强化(同键再 upsert)→ 命中 A 行累计;B 行原样。
    const reinforced = await repoA.upsertTopicPreference({
      ...pref,
      exampleCount: 2,
      weight: -8,
    });
    expect(reinforced.id).toBe(rowA.id);
    expect(reinforced.exampleCount).toBe(2);
    const bAfter = await repoB.listActiveTopicPreferences();
    expect(bAfter).toHaveLength(1);
    expect(bAfter[0]!.id).toBe(rowB.id);
    expect(bAfter[0]!.exampleCount).toBe(1); // 未被 A 的强化波及

    // listActive 只见本号(strict 门)。
    const aList = await repoA.listActiveTopicPreferences();
    expect(aList.map((r) => r.id)).toEqual([reinforced.id]);
  });

  it("A 号归档过期偏好,B 号同键 active 行不受影响", async () => {
    const repoA = candidateRepoFor(db, ACC_A);
    const repoB = candidateRepoFor(db, ACC_B);
    await repoA.upsertTopicPreference(pref);
    await repoB.upsertTopicPreference(pref);
    // cutoff 晚于 NOW → A 的行过期归档;门是 per-account 的,B 不动。
    const archived = await repoA.archiveExpiredPreferences(
      "2026-07-16T00:00:00.000Z",
    );
    expect(archived).toBe(1);
    expect(await repoA.listActiveTopicPreferences()).toHaveLength(0);
    expect(await repoB.listActiveTopicPreferences()).toHaveLength(1);
  });
});

describe("[T-332 S6] 采集信号 audience_signals:同评论双号各归其号(ISO-05)", () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await createDb());
  });

  const signal = {
    source: "comment",
    rawText: "怎么入门?",
    demandTag: "入门",
    payingIntent: null,
    linkedCandidateId: null,
    ingestionRunId: null,
    externalId: "douyin:comment:c-100", // 同一条平台评论
  };

  it("同 external_id:双号各插一行(inserted=true×2);同号重采幂等去重", async () => {
    const repoA = candidateRepoFor(db, ACC_A);
    const repoB = candidateRepoFor(db, ACC_B);

    const a1 = await repoA.createSignal(signal);
    expect(a1.inserted).toBe(true);
    // B 号采同一条评论 → 不再被 A 的先入库吞掉,独立成行归 B。
    const b1 = await repoB.createSignal(signal);
    expect(b1.inserted).toBe(true);
    expect(b1.row.id).not.toBe(a1.row.id);
    expect(b1.row.accountId).toBe(ACC_B);

    // 同号重复采集仍幂等(锚在号内生效)。
    const a2 = await repoA.createSignal(signal);
    expect(a2.inserted).toBe(false);
    expect(a2.row.id).toBe(a1.row.id);

    // strict list:各号只见自己那行。
    const aList = await repoA.listSignals({});
    expect(aList.rows.map((r) => r.id)).toEqual([a1.row.id]);
    const bList = await repoB.listSignals({});
    expect(bList.rows.map((r) => r.id)).toEqual([b1.row.id]);
  });
});

describe("[T-332 S6] 通知 notifications:业务按号 + 系统级 NULL 双号可见(C-02)", () => {
  let db: Db;
  let service: ReturnType<typeof createNotificationsService>;
  beforeEach(async () => {
    ({ db } = await createDb());
    let seq = 0;
    service = createNotificationsService(createNotificationRepository(db), {
      now: () => NOW,
      nextId: (prefix: string) => `${prefix}-${++seq}`,
    });
  });

  const ctx = (accountId?: string | null): RequestContext =>
    ({
      userId: USER,
      requestId: "req-test",
      source: "user",
      ...(accountId ? { accountId } : {}),
    }) as RequestContext;

  const notif = (title: string) => ({
    notificationType: "task",
    title,
    body: "",
    entityType: "scheduled_job",
    entityId: "job-1",
  });

  it("A 号铃铛 = A 号事件 + 系统级;B 号事件不可见;未选号只见系统级", async () => {
    // 业务通知:A/B ctx 各落一条(stamp 当前号);系统通知:无号 ctx → account_id NULL。
    const nA = await service.create(ctx(ACC_A), notif("A 号采集失败"));
    const nB = await service.create(ctx(ACC_B), notif("B 号任务完成"));
    const nSys = await service.create(ctx(null), {
      notificationType: "system",
      title: "版本更新",
      body: "",
      entityType: "system",
      entityId: "release-1",
    });
    expect(nA.accountId).toBe(ACC_A);
    expect(nB.accountId).toBe(ACC_B);
    expect(nSys.accountId).toBeNull();

    // A 号视角:自己的 + 系统级,绝无 B 的(「A 号铃铛不响 B 号的错」)。
    const inA = await service.list(ctx(ACC_A), { page: 1, pageSize: 50 });
    const idsA = inA.items.map((r) => r.id);
    expect(idsA).toContain(nA.id);
    expect(idsA).toContain(nSys.id);
    expect(idsA).not.toContain(nB.id);

    // B 号视角对称。
    const inB = await service.list(ctx(ACC_B), { page: 1, pageSize: 50 });
    const idsB = inB.items.map((r) => r.id);
    expect(idsB).toContain(nB.id);
    expect(idsB).toContain(nSys.id);
    expect(idsB).not.toContain(nA.id);

    // 未选号(引导态):只见系统级 —— 通知是 user 级表,引导态不禁读(C-02),
    // 但绝不给全量业务通知(否则未选号=全局视图,违反 §4.2)。
    const unselected = await service.list(ctx(null), { page: 1, pageSize: 50 });
    expect(unselected.items.map((r) => r.id)).toEqual([nSys.id]);

    // 未读计数与 list 同一可见集。
    expect(await service.getUnreadCount(ctx(ACC_A))).toBe(2);
    expect(await service.getUnreadCount(ctx(null))).toBe(1);
  });

  it("跨号 markRead → 404 OwnershipError(号一致性门);系统级双号都可标已读", async () => {
    const nA = await service.create(ctx(ACC_A), notif("A 号事件"));
    const nSys = await service.create(ctx(null), {
      notificationType: "system",
      title: "激活到期提醒",
      body: "",
      entityType: "system",
      entityId: "activation",
    });
    // B 号想标 A 号的业务通知 → 可见集外,404 同貌。
    await expect(service.markRead(ctx(ACC_B), nA.id)).rejects.toBeInstanceOf(
      OwnershipError,
    );
    // 系统级在双号可见集内,B 号可标已读。
    const read = await service.markRead(ctx(ACC_B), nSys.id);
    expect(read.readAt).toBe(NOW);
  });
});

describe("[T-332 S6] 迁移 0042 前置 NULL guard:未重置旧库 → 明确中止(§5.3/§11.6)", () => {
  // 新库全量迁移天然无 NULL 行,guard 平时被「隐式路过」—— 这里把 guard 块单独抽出来,
  // 对一个被人为退化出 NULL 行的库重放,证明它真的会拦(而不是永远走不到的死代码)。
  // 完整的「旧库升级中止 + 原库目录未动」属打包真机验收项(DATA-H09 侧已有
  // db.migrate-error.test.ts 盖「迁移失败不隔离不换空库」)。
  function extractGuardBlock(): string {
    const migration = readFileSync(
      join(__dirname, "..", "drizzle", "0042_account_isolation_notnull.sql"),
      "utf8",
    );
    const start = migration.indexOf("DO $$");
    const end = migration.indexOf("END $$;", start);
    expect(start, "0042 里应有前置 guard DO 块").toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    return migration.slice(start, end + "END $$;".length);
  }

  it("库里有 account_id IS NULL 的存量行 → guard 抛可读错误(指向重置工作区),无 NULL 则通过", async () => {
    const { db } = await createDb();
    const guard = extractGuardBlock();

    // 干净库:guard 通过(幂等重跑安全,§5.3)。
    await db.execute(sql.raw(guard));

    // 人为退化:放开 NOT NULL、插入一行 NULL 号(模拟未重置的旧库)。
    await db.execute(
      sql.raw("ALTER TABLE trend_sources ALTER COLUMN account_id DROP NOT NULL"),
    );
    await db.execute(
      sql.raw(
        `INSERT INTO trend_sources (id, user_id, account_id, url, created_at, updated_at)
         VALUES ('ts-legacy-null', 'user-iso', NULL, 'https://legacy.example.com', '${NOW}', '${NOW}')`,
      ),
    );

    await expect(db.execute(sql.raw(guard))).rejects.toThrow(
      /trend_sources\(1\)[\s\S]*重置工作区/,
    );
  });
});
