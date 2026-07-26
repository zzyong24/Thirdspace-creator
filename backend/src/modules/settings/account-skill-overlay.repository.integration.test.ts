import { beforeEach, describe, expect, it } from "vitest";
import {
  createDb,
  skillConfigOverrides,
  type Db,
  type RequestContext,
} from "@creatoros/backend";
import {
  SkillOverlayRevisionConflictError,
  createSettingsRepository,
} from "./settings.repository";

const ctx = (
  userId: string,
  accountId: string,
  requestId: string,
): RequestContext => ({
  userId,
  accountId,
  requestId,
  source: "user",
});

describe("account skill overlay repository", () => {
  let db: Db;
  let seq = 0;

  beforeEach(async () => {
    ({ db } = await createDb());
    seq = 0;
  });

  function repository(nextId = (prefix: string) => `${prefix}-${++seq}`) {
    return createSettingsRepository(db, {
      now: () => `2026-07-24T00:00:0${Math.min(seq, 9)}.000Z`,
      nextId,
    });
  }

  it("同一用户的两个账号保存同名 skill，读取和历史完全隔离", async () => {
    const repo = repository();
    const a = ctx("user-1", "account-a", "req-a");
    const b = ctx("user-1", "account-b", "req-b");

    await repo.putAccountSkillOverlay(a, {
      skillId: "script.draft",
      expectedRevision: null,
      observedBaseVersion: "v5",
      overlay: { system: "A 的方法" },
    });
    await repo.putAccountSkillOverlay(b, {
      skillId: "script.draft",
      expectedRevision: null,
      observedBaseVersion: "v5",
      overlay: { system: "B 的方法" },
    });

    expect((await repo.getAccountSkillOverlay(a, "script.draft"))?.overlay).toEqual({
      system: "A 的方法",
    });
    expect((await repo.getAccountSkillOverlay(b, "script.draft"))?.overlay).toEqual({
      system: "B 的方法",
    });
    expect(await repo.listAccountSkillOverlayVersions(a, "script.draft")).toHaveLength(1);
    expect(await repo.listAccountSkillOverlayVersions(b, "script.draft")).toHaveLength(1);
  });

  it("旧全局覆盖即使有值，也不会进入账号增量读取链", async () => {
    await db.insert(skillConfigOverrides).values({
      id: "script.draft",
      version: "legacy-global",
      system: "绝不能污染任何账号",
      template: "legacy template",
      updatedAt: "2026-07-23T00:00:00.000Z",
    });
    const repo = repository();
    const account = ctx("user-1", "account-a", "req-a");

    expect(
      await repo.getAccountSkillOverlay(account, "script.draft"),
    ).toBeNull();
    expect(await repo.listAccountSkillOverlays(account)).toEqual([]);
  });

  it("首次创建和同 revision 更新均只有一个竞争者成功", async () => {
    const repo = repository();
    const a = ctx("user-1", "account-a", "req-a");

    const creates = await Promise.allSettled([
      repo.putAccountSkillOverlay(a, {
        skillId: "script.draft",
        expectedRevision: null,
        observedBaseVersion: "v5",
        overlay: { system: "create-1" },
      }),
      repo.putAccountSkillOverlay(a, {
        skillId: "script.draft",
        expectedRevision: null,
        observedBaseVersion: "v5",
        overlay: { system: "create-2" },
      }),
    ]);
    expect(creates.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      creates.filter(
        (r) =>
          r.status === "rejected" &&
          r.reason instanceof SkillOverlayRevisionConflictError,
      ),
    ).toHaveLength(1);

    const updates = await Promise.allSettled([
      repo.putAccountSkillOverlay(a, {
        skillId: "script.draft",
        expectedRevision: 1,
        observedBaseVersion: "v5",
        overlay: { system: "update-1" },
      }),
      repo.putAccountSkillOverlay(a, {
        skillId: "script.draft",
        expectedRevision: 1,
        observedBaseVersion: "v5",
        overlay: { system: "update-2" },
      }),
    ]);
    expect(updates.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      updates.filter(
        (r) =>
          r.status === "rejected" &&
          r.reason instanceof SkillOverlayRevisionConflictError,
      ),
    ).toHaveLength(1);
    expect((await repo.getAccountSkillOverlay(a, "script.draft"))?.rowRevision).toBe(2);
  });

  it("当前行与历史同事务：历史写失败时当前 revision 不前进", async () => {
    const repo = repository(() => "same-history-id");
    const a = ctx("user-1", "account-a", "req-a");

    await repo.putAccountSkillOverlay(a, {
      skillId: "script.draft",
      expectedRevision: null,
      observedBaseVersion: "v5",
      overlay: { system: "before" },
    });

    await expect(
      repo.putAccountSkillOverlay(a, {
        skillId: "script.draft",
        expectedRevision: 1,
        observedBaseVersion: "v5",
        overlay: { system: "must-rollback" },
      }),
    ).rejects.toThrow();

    const current = await repo.getAccountSkillOverlay(a, "script.draft");
    expect(current?.rowRevision).toBe(1);
    expect(current?.overlay).toEqual({ system: "before" });
    expect(await repo.listAccountSkillOverlayVersions(a, "script.draft")).toHaveLength(1);
  });

  it("回滚只接受当前账号历史，并以 CAS 追加新 revision", async () => {
    const repo = repository();
    const a = ctx("user-1", "account-a", "req-a");
    const b = ctx("user-1", "account-b", "req-b");
    await repo.putAccountSkillOverlay(a, {
      skillId: "script.draft",
      expectedRevision: null,
      observedBaseVersion: "v5",
      overlay: { system: "A-v1" },
    });
    const first = (await repo.listAccountSkillOverlayVersions(a, "script.draft"))[0]!;
    await repo.putAccountSkillOverlay(a, {
      skillId: "script.draft",
      expectedRevision: 1,
      observedBaseVersion: "v5",
      overlay: { system: "A-v2" },
    });

    await expect(
      repo.rollbackAccountSkillOverlay(b, {
        skillId: "script.draft",
        versionId: first.id,
        expectedRevision: 2,
        observedBaseVersion: "v5",
      }),
    ).rejects.toMatchObject({
      code: "OwnershipError",
      details: { domainCode: "SKILL_VERSION_NOT_FOUND" },
    });

    const rolled = await repo.rollbackAccountSkillOverlay(a, {
      skillId: "script.draft",
      versionId: first.id,
      expectedRevision: 2,
      observedBaseVersion: "v6",
    });
    expect(rolled.rowRevision).toBe(3);
    expect(rolled.observedBaseVersion).toBe("v6");
    expect(rolled.overlay).toEqual({ system: "A-v1" });
    expect(await repo.listAccountSkillOverlayVersions(a, "script.draft")).toHaveLength(3);
  });
});
