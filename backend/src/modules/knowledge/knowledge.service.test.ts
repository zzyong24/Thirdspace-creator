import { describe, it, expect, beforeEach } from "vitest";
import { createDb, AccountRequiredError, platformAccounts, type Db } from "@creatoros/backend";
import { accountGroups } from "../../schema/account-groups";
import type { RequestContext } from "@creatoros/contract";
import { createKnowledgeRepository } from "./knowledge.repository";
import {
  createKnowledgeService,
  type KnowledgeService,
} from "./knowledge.service";
import {
  OwnershipError,
  ConflictError,
  InvalidTransitionError,
} from "./knowledge.errors";

// C1 — service invariants (foundation §5.3, §12). The service takes a
// RequestContext and threads ctx.userId into the user-scoped repo. It enforces:
// items born `active` + currentRevisionId set + sourceType 'manual'; revisions
// append-only with strictly increasing numbers + currentRevisionId follows the
// latest; relations reject self + require both ends owned.

const NOW = "2026-06-21T00:00:00.000Z";

function deterministicDeps() {
  const counters = new Map<string, number>();
  return {
    now: () => NOW,
    nextId: (prefix: string) => {
      const n = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, n);
      return `${prefix}-${n}`;
    },
  };
}

// [T-332 S2] service 入口 requireAccountId:ctx 必须带当前号(未选号 = 引导态禁读写)。
const ctxA: RequestContext = {
  userId: "user-a",
  accountId: "acct-a",
  requestId: "req-a",
  source: "user",
};
const ctxB: RequestContext = {
  userId: "user-b",
  accountId: "acct-b",
  requestId: "req-b",
  source: "user",
};
// 同 user-a 的第二个抖音号(双账号隔离断言用)。
const ctxA2: RequestContext = {
  userId: "user-a",
  accountId: "acct-a2",
  requestId: "req-a2",
  source: "user",
};
// 未选号(引导态)。
const ctxNoAccount: RequestContext = {
  userId: "user-a",
  requestId: "req-na",
  source: "user",
};

let db: Db;
let service: KnowledgeService;

beforeEach(async () => {
  ({ db } = await createDb());
  // 正式归属约束要求真实账号及其旧工作区，不能用不存在的accountId冒充父资料。
  for (const ctx of [ctxA, ctxB, ctxA2]) {
    await db.insert(platformAccounts).values({id:ctx.accountId!,userId:ctx.userId,platform:"douyin",accountHandle:ctx.accountId!,createdAt:NOW,updatedAt:NOW});
    await db.insert(accountGroups).values({id:`grp_legacy_${ctx.accountId}`,userId:ctx.userId,name:ctx.accountId!,createdAt:NOW,updatedAt:NOW});
  }
  const repo = createKnowledgeRepository(db, deterministicDeps());
  service = createKnowledgeService(repo);
});

describe("knowledge.service — invariants", () => {
  it("createKnowledge returns status:'active', currentRevisionId set, sourceType:'manual'", async () => {
    const item = await service.createKnowledge(ctxA, {
      title: "笔记",
      content: "v1",
    });
    expect(item.status).toBe("active");
    expect(item.sourceType).toBe("manual");
    expect(item.currentRevisionId).toBeTruthy();
    expect(item.knowledgeType).toBe("note");
  });

  it("createRevision twice → numbers 1,2 and currentRevisionId follows the latest", async () => {
    const item = await service.createKnowledge(ctxA, { title: "笔记", content: "v1" });
    const rev2 = await service.createRevision(ctxA, item.id, { content: "v2" });
    expect(rev2.revisionNumber).toBe(2);
    const after = await service.getKnowledge(ctxA, item.id);
    expect(after.currentRevisionId).toBe(rev2.id);
  });

  it("createRevision asserts a strictly increasing revisionNumber", async () => {
    const item = await service.createKnowledge(ctxA, { title: "笔记", content: "v1" });
    const r2 = await service.createRevision(ctxA, item.id, { content: "v2" });
    const r3 = await service.createRevision(ctxA, item.id, { content: "v3" });
    expect(r3.revisionNumber).toBeGreaterThan(r2.revisionNumber);
  });

  it("updateSourceMetadata 只更新来源锚,不伪造正文 revision", async () => {
    const item = await service.createKnowledge(ctxA, {
      title: "内置课程",
      content: "正文 v1",
      sourceType: "import",
      sourceMetadata: { courseVersion: "v1", contentHash: "h1" },
    });
    const before = await service.listRevisions(ctxA, item.id);
    const updated = await service.updateSourceMetadata(ctxA, item.id, {
      courseVersion: "v2",
      contentHash: "h2",
    });
    const after = await service.listRevisions(ctxA, item.id);
    expect(updated.sourceMetadata).toEqual({
      courseVersion: "v2",
      contentHash: "h2",
    });
    expect(after).toHaveLength(before.length);
    await expect(
      service.updateSourceMetadata(ctxA2, item.id, { contentHash: "越权" }),
    ).rejects.toBeInstanceOf(OwnershipError);
  });

  it("createRelation with target === source throws ConflictError", async () => {
    const item = await service.createKnowledge(ctxA, { title: "笔记" });
    await expect(
      service.createRelation(ctxA, item.id, {
        targetKnowledgeId: item.id,
        relationType: "references",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("getKnowledge for a non-owned id throws OwnershipError", async () => {
    const item = await service.createKnowledge(ctxA, { title: "A 的" });
    await expect(service.getKnowledge(ctxB, item.id)).rejects.toBeInstanceOf(
      OwnershipError,
    );
  });

  it("createRelation to a non-owned id throws OwnershipError", async () => {
    const a = await service.createKnowledge(ctxA, { title: "A" });
    const b = await service.createKnowledge(ctxB, { title: "B" });
    await expect(
      service.createRelation(ctxA, a.id, {
        targetKnowledgeId: b.id,
        relationType: "references",
      }),
    ).rejects.toBeInstanceOf(OwnershipError);
  });

  it("listKnowledge is user-scoped", async () => {
    await service.createKnowledge(ctxA, { title: "A 的" });
    await service.createKnowledge(ctxB, { title: "B 的" });
    const aList = await service.listKnowledge(ctxA);
    expect(aList).toHaveLength(1);
    expect(aList[0]!.userId).toBe("user-a");
  });
});

// [T-332 S2] 账号全域隔离:strict 号门 + 未选号引导态(SPEC §4.1/§4.2/§4.5)。
describe("knowledge.service — account isolation (T-332 S2)", () => {
  it("双账号隔离:A 号知识 B 号不可见(同 user 两个号,双向零泄漏)", async () => {
    const a = await service.createKnowledge(ctxA, { title: "号a 的知识" });
    const a2 = await service.createKnowledge(ctxA2, { title: "号a2 的知识" });
    expect(a.accountId).toBe("acct-a");
    expect(a2.accountId).toBe("acct-a2");

    const listA = await service.listKnowledge(ctxA);
    expect(listA.map((r) => r.id)).toEqual([a.id]);
    const listA2 = await service.listKnowledge(ctxA2);
    expect(listA2.map((r) => r.id)).toEqual([a2.id]);
  });

  it("by-id 跨号 → OwnershipError 404(号一致性门,§4.5,不泄露存在)", async () => {
    const a = await service.createKnowledge(ctxA, { title: "号a 的知识" });
    await expect(service.getKnowledge(ctxA2, a.id)).rejects.toBeInstanceOf(
      OwnershipError,
    );
    await expect(
      service.createRevision(ctxA2, a.id, { content: "跨号篡改" }),
    ).rejects.toBeInstanceOf(OwnershipError);
    await expect(service.archiveKnowledge(ctxA2, a.id)).rejects.toBeInstanceOf(
      OwnershipError,
    );
  });

  it("未选号 → AccountRequiredError(引导态禁读写,不隐式全量/不隐式填号)", async () => {
    await expect(service.listKnowledge(ctxNoAccount)).rejects.toBeInstanceOf(
      AccountRequiredError,
    );
    await expect(
      service.createKnowledge(ctxNoAccount, { title: "无号写入" }),
    ).rejects.toBeInstanceOf(AccountRequiredError);
    await expect(
      service.listAllRelations(ctxNoAccount),
    ).rejects.toBeInstanceOf(AccountRequiredError);
  });
});

describe("knowledge.service — soft-delete (GAP-RES-1)", () => {
  it("archiveKnowledge flips status active→archived and stamps archivedAt", async () => {
    const item = await service.createKnowledge(ctxA, { title: "笔记" });
    expect(item.status).toBe("active");
    const archived = await service.archiveKnowledge(ctxA, item.id);
    expect(archived.status).toBe("archived");
    expect(archived.archivedAt).toBe(NOW);
  });

  it("archiveKnowledge on an already-archived item throws InvalidTransitionError", async () => {
    const item = await service.createKnowledge(ctxA, { title: "笔记" });
    await service.archiveKnowledge(ctxA, item.id);
    await expect(
      service.archiveKnowledge(ctxA, item.id),
    ).rejects.toBeInstanceOf(InvalidTransitionError);
  });

  it("archiveKnowledge for a non-owned id throws OwnershipError", async () => {
    const item = await service.createKnowledge(ctxA, { title: "A 的" });
    await expect(
      service.archiveKnowledge(ctxB, item.id),
    ).rejects.toBeInstanceOf(OwnershipError);
  });

  it("removeRelation drops the matching relation and echoes it back", async () => {
    const a = await service.createKnowledge(ctxA, { title: "A" });
    const b = await service.createKnowledge(ctxA, { title: "B" });
    await service.createRelation(ctxA, a.id, {
      targetKnowledgeId: b.id,
      relationType: "supports",
    });
    const removed = await service.removeRelation(ctxA, a.id, {
      targetKnowledgeId: b.id,
      relationType: "supports",
    });
    expect(removed.sourceKnowledgeId).toBe(a.id);
    expect(removed.targetKnowledgeId).toBe(b.id);
    const after = await service.listRelations(ctxA, a.id);
    expect(after).toHaveLength(0);
  });

  it("removeRelation for an unknown relation throws OwnershipError (no leak)", async () => {
    const a = await service.createKnowledge(ctxA, { title: "A" });
    const b = await service.createKnowledge(ctxA, { title: "B" });
    await expect(
      service.removeRelation(ctxA, a.id, {
        targetKnowledgeId: b.id,
        relationType: "supports",
      }),
    ).rejects.toBeInstanceOf(OwnershipError);
  });

  it("removeRelation on a non-owned source throws OwnershipError", async () => {
    const a = await service.createKnowledge(ctxA, { title: "A" });
    await expect(
      service.removeRelation(ctxB, a.id, {
        targetKnowledgeId: "knowledge-x",
        relationType: "supports",
      }),
    ).rejects.toBeInstanceOf(OwnershipError);
  });
});

// ---------------------------------------------------------------------------
// [T-091/T-092] 知识库二期:全量边读 / AI 建边 provenance+幂等 / 评论回流锚
// ---------------------------------------------------------------------------

describe("knowledge.service — T-091 graph data ops", () => {
  it("listAllRelations returns every edge of the ctx user only (user-scoped)", async () => {
    const a = await service.createKnowledge(ctxA, { title: "A" });
    const b = await service.createKnowledge(ctxA, { title: "B" });
    const c = await service.createKnowledge(ctxA, { title: "C" });
    await service.createRelation(ctxA, a.id, {
      targetKnowledgeId: b.id,
      relationType: "supports",
    });
    await service.createRelation(ctxA, b.id, {
      targetKnowledgeId: c.id,
      relationType: "references",
    });
    // 另一租户的边不可见。
    const x = await service.createKnowledge(ctxB, { title: "X" });
    const y = await service.createKnowledge(ctxB, { title: "Y" });
    await service.createRelation(ctxB, x.id, {
      targetKnowledgeId: y.id,
      relationType: "supports",
    });

    const mine = await service.listAllRelations(ctxA);
    expect(mine).toHaveLength(2);
    expect(new Set(mine.map((r) => r.relationType))).toEqual(
      new Set(["supports", "references"]),
    );
    const theirs = await service.listAllRelations(ctxB);
    expect(theirs).toHaveLength(1);
  });

  it("createRelation stamps createdByType:'ai' when the confirm gate adopts an AI candidate", async () => {
    const a = await service.createKnowledge(ctxA, { title: "A" });
    const b = await service.createKnowledge(ctxA, { title: "B" });
    const rel = await service.createRelation(ctxA, a.id, {
      targetKnowledgeId: b.id,
      relationType: "supports",
      createdByType: "ai",
    });
    expect(rel.createdByType).toBe("ai");
  });

  it("createRelation is idempotent per (source,target,relationType) — duplicate adopt returns the existing edge", async () => {
    const a = await service.createKnowledge(ctxA, { title: "A" });
    const b = await service.createKnowledge(ctxA, { title: "B" });
    const first = await service.createRelation(ctxA, a.id, {
      targetKnowledgeId: b.id,
      relationType: "supports",
      createdByType: "ai",
    });
    const dup = await service.createRelation(ctxA, a.id, {
      targetKnowledgeId: b.id,
      relationType: "supports",
      createdByType: "ai",
    });
    expect(dup.id).toBe(first.id);
    const all = await service.listAllRelations(ctxA);
    expect(all).toHaveLength(1);
  });
});

describe("knowledge.service — T-092 comment backflow anchors", () => {
  it("createKnowledge passes through sourceType:'import' + sourceMetadata anchors", async () => {
    const item = await service.createKnowledge(ctxA, {
      title: "怎么配置本地模型?",
      knowledgeType: "qa",
      sourceType: "import",
      sourceNote: "抖音评论 ×2,最高赞 57",
      sourceMetadata: {
        origin: "comment_backflow",
        signalIds: ["sig-1", "sig-2"],
        signalExternalIds: ["douyin:comment:c1", "douyin:comment:c2"],
      },
    });
    expect(item.sourceType).toBe("import");
    expect(item.knowledgeType).toBe("qa");
    expect(
      (item.sourceMetadata as { origin?: string }).origin,
    ).toBe("comment_backflow");
  });

  it("re-adopting any already-backflowed anchor throws ConflictError (回流层幂等,整组视为已回流)", async () => {
    await service.createKnowledge(ctxA, {
      title: "怎么配置本地模型?",
      knowledgeType: "qa",
      sourceType: "import",
      sourceMetadata: {
        origin: "comment_backflow",
        signalExternalIds: ["douyin:comment:c1", "douyin:comment:c2"],
      },
    });
    await expect(
      service.createKnowledge(ctxA, {
        title: "本地模型怎么装?",
        knowledgeType: "qa",
        sourceType: "import",
        sourceMetadata: {
          origin: "comment_backflow",
          // 同义合并组任一锚已回流 → 整组拒。
          signalExternalIds: ["douyin:comment:c2", "douyin:comment:c9"],
        },
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("backflow anchors are tenant-scoped — another user can adopt the same cid", async () => {
    await service.createKnowledge(ctxA, {
      title: "Q",
      knowledgeType: "qa",
      sourceType: "import",
      sourceMetadata: {
        origin: "comment_backflow",
        signalExternalIds: ["douyin:comment:shared"],
      },
    });
    const other = await service.createKnowledge(ctxB, {
      title: "Q",
      knowledgeType: "qa",
      sourceType: "import",
      sourceMetadata: {
        origin: "comment_backflow",
        signalExternalIds: ["douyin:comment:shared"],
      },
    });
    expect(other.userId).toBe("user-b");
  });

  it("plain creates (no anchors) are unaffected by the backflow guard", async () => {
    const item = await service.createKnowledge(ctxA, {
      title: "普通笔记",
      sourceMetadata: { origin: "somewhere-else" },
    });
    expect(item.sourceType).toBe("manual");
  });
});


describe("资料书架创建目标守卫", () => {
  it("拒绝不存在和其他账号的文件夹且没有落库", async () => {
    const foreign = await service.createFolder(ctxA2, {name:"另一账号文件夹"});
    for(const folderId of ["missing-folder", foreign.id]) {
      await expect(service.createKnowledge(ctxA,{title:"越界资料",content:"原文",folderId})).rejects.toThrow();
    }
    expect(await service.listKnowledge(ctxA)).toHaveLength(0);
    const own=await service.createFolder(ctxA,{name:"本账号"});
    expect((await service.createKnowledge(ctxA,{title:"有效资料",content:"完整正文",folderId:own.id})).folderId).toBe(own.id);
  });
  it("没有素材读取端口不能盲存assetId，普通手录仍可保存", async () => {
    await expect(service.createKnowledge(ctxA,{title:"无效原文件",assetId:"missing-asset"})).rejects.toThrow();
    expect(await service.listKnowledge(ctxA)).toHaveLength(0);
    expect((await service.createKnowledge(ctxA,{title:"手录",content:"原文"})).assetId).toBeNull();
  });
});
