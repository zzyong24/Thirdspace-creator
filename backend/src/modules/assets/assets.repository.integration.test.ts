import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import {
  createAssetRepository,
  type AssetRepository,
} from "./assets.repository";
import { OwnershipError } from "./assets.errors";

// A2 + B1–B6 — user-scoped repository integration test (pglite-backed). Ownership
// is the sole boundary (foundation §2): user A cannot list/get/update user B's
// assets, files, or upload sessions; a cross-user id is indistinguishable from a
// missing one (null → service raises OwnershipError → 404). Plus: the schema
// round-trips, asset_files.storage_key uniqueness holds, default-scope listing is
// active-only, and versionNumber auto-increments.

const A = "user-a";
const B = "user-b";
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

let db: Db;
let repo: AssetRepository;

beforeEach(async () => {
  ({ db } = await createDb());
  repo = createAssetRepository(db, deterministicDeps());
});

async function makeAsset(userId: string, name = "素材") {
  return repo.insertAsset(userId, {
    assetType: "image",
    name,
    currentFileId: null,
  });
}

describe("assets.repository — schema round-trip + uniqueness (A2)", () => {
  it("inserts an asset + a file and reads them back", async () => {
    const asset = await makeAsset(A, "封面");
    const file = await repo.insertAssetFile(A, {
      assetId: asset.id,
      storageKey: "k/1.png",
      mimeType: "image/png",
      fileSize: 1234,
      checksum: "c1",
      width: 100,
      height: 200,
      durationMs: null,
      mediaMetadata: { foo: "bar" },
    });
    expect(file.versionNumber).toBe(1);
    const readBack = await repo.getAsset(A, asset.id);
    expect(readBack?.name).toBe("封面");
    expect(readBack?.assetType).toBe("image");
    const files = await repo.listAssetFiles(A, asset.id);
    expect(files).toHaveLength(1);
    expect(files[0]!.storageKey).toBe("k/1.png");
    expect(files[0]!.fileSize).toBe(1234);
    expect(files[0]!.mediaMetadata).toEqual({ foo: "bar" });
  });

  it("rejects a duplicate storage_key (unique constraint)", async () => {
    const a1 = await makeAsset(A);
    const a2 = await makeAsset(A);
    await repo.insertAssetFile(A, {
      assetId: a1.id,
      storageKey: "dup/key",
      mimeType: "image/png",
      fileSize: 1,
      checksum: "",
      width: null,
      height: null,
      durationMs: null,
      mediaMetadata: {},
    });
    await expect(
      repo.insertAssetFile(A, {
        assetId: a2.id,
        storageKey: "dup/key",
        mimeType: "image/png",
        fileSize: 1,
        checksum: "",
        width: null,
        height: null,
        durationMs: null,
        mediaMetadata: {},
      }),
    ).rejects.toThrow();
  });
});

describe("assets.repository — ownership enforced (multi-tenant, B1–B5)", () => {
  it("listAssets is user-scoped + active-only", async () => {
    const a1 = await makeAsset(A, "A1");
    await makeAsset(A, "A2");
    await makeAsset(A, "A3");
    const trashed = await makeAsset(A, "A-trashed");
    await repo.updateAssetStatus(A, trashed.id, {
      status: "deleted",
      deletedAt: NOW,
    });
    await makeAsset(B, "B1");
    await makeAsset(B, "B2");

    const aRows = await repo.listAssets(A, { limit: 50, cursor: null });
    expect(aRows).toHaveLength(3);
    expect(aRows.every((r) => r.userId === A)).toBe(true);
    expect(aRows.some((r) => r.id === trashed.id)).toBe(false);
    expect(aRows.some((r) => r.id === a1.id)).toBe(true);
  });

  it("getAsset(B, aId) → null (no existence leak)", async () => {
    const a = await makeAsset(A);
    expect(await repo.getAsset(B, a.id)).toBeNull();
    expect(await repo.getAsset(A, a.id)).not.toBeNull();
  });

  it("insertAsset stamps userId", async () => {
    const a = await makeAsset(A);
    expect(a.userId).toBe(A);
    expect(a.status).toBe("active");
  });

  it("updateAssetStatus under wrong user touches 0 rows → null", async () => {
    const a = await makeAsset(A);
    const wrong = await repo.updateAssetStatus(B, a.id, {
      status: "deleted",
      deletedAt: NOW,
    });
    expect(wrong).toBeNull();
    // A's row is untouched.
    expect((await repo.getAsset(A, a.id))?.status).toBe("active");
  });

  it("insertAssetFile auto-increments versionNumber per asset", async () => {
    const a = await makeAsset(A);
    const f1 = await repo.insertAssetFile(A, {
      assetId: a.id,
      storageKey: "v/1",
      mimeType: "image/png",
      fileSize: 1,
      checksum: "",
      width: null,
      height: null,
      durationMs: null,
      mediaMetadata: {},
    });
    const f2 = await repo.insertAssetFile(A, {
      assetId: a.id,
      storageKey: "v/2",
      mimeType: "image/png",
      fileSize: 1,
      checksum: "",
      width: null,
      height: null,
      durationMs: null,
      mediaMetadata: {},
    });
    expect(f1.versionNumber).toBe(1);
    expect(f2.versionNumber).toBe(2);
    // currentFileId is NOT mutated by the repo (service owns that).
    expect((await repo.getAsset(A, a.id))?.currentFileId).toBeNull();
  });

  it("insertAssetFile on a foreign asset throws OwnershipError", async () => {
    const a = await makeAsset(A);
    await expect(
      repo.insertAssetFile(B, {
        assetId: a.id,
        storageKey: "x/1",
        mimeType: "image/png",
        fileSize: 1,
        checksum: "",
        width: null,
        height: null,
        durationMs: null,
        mediaMetadata: {},
      }),
    ).rejects.toBeInstanceOf(OwnershipError);
  });
});

describe("assets.repository — upload sessions user-scoped (B6)", () => {
  it("getUploadSession(B, aUploadId) → null", async () => {
    const session = await repo.createUploadSession(A, {
      assetType: "image",
      mimeType: "image/png",
      fileSize: 100,
      storageKey: "uploads/k1",
      expiresAt: NOW,
    });
    expect(await repo.getUploadSession(B, session.id)).toBeNull();
    expect(await repo.getUploadSession(A, session.id)).not.toBeNull();
  });

  it("markUploadCompleted flips status (scoped)", async () => {
    const session = await repo.createUploadSession(A, {
      assetType: "image",
      mimeType: "image/png",
      fileSize: 100,
      storageKey: "uploads/k2",
      expiresAt: NOW,
    });
    expect(session.status).toBe("created");
    await repo.markUploadCompleted(A, session.id);
    expect((await repo.getUploadSession(A, session.id))?.status).toBe(
      "completed",
    );
  });
});

// [T-136 切片 b] 同一 user 下按号(account_id)隔离门。assets 是 owned-root(OQ1 裁决=按号
// 独立);asset_files 经父门透传、asset_uploads 不按号隔离。owned-root 方法收**可选**
// accountId:设号只见该号 / 不传(undefined)见全部 / create stamp 正确。
describe("assets.repository — per-account isolation (T-136 slice b)", () => {
  it("accountId 设时 listAssets 只返该号的 asset", async () => {
    await repo.insertAsset(A, { assetType: "image", name: "号1图", currentFileId: null }, "acct-1");
    await repo.insertAsset(A, { assetType: "image", name: "号2图", currentFileId: null }, "acct-2");
    const list1 = await repo.listAssets(A, { limit: 50, cursor: null }, "acct-1");
    expect(list1.map((a) => a.name)).toEqual(["号1图"]);
    const list2 = await repo.listAssets(A, { limit: 50, cursor: null }, "acct-2");
    expect(list2.map((a) => a.name)).toEqual(["号2图"]);
  });

  it("accountId 不传(全局视图)时 listAssets 返该 user 全部号的 asset", async () => {
    await repo.insertAsset(A, { assetType: "image", name: "号1图", currentFileId: null }, "acct-1");
    await repo.insertAsset(A, { assetType: "image", name: "号2图", currentFileId: null }, "acct-2");
    await repo.insertAsset(A, { assetType: "image", name: "存量图", currentFileId: null }); // accountId=null
    const all = await repo.listAssets(A, { limit: 50, cursor: null });
    expect(all.map((a) => a.name).sort()).toEqual(["号1图", "号2图", "存量图"]);
  });

  it("accountId 设时 getAsset 拿不到别号的行(→ null,不泄露)", async () => {
    const a2 = await repo.insertAsset(A, { assetType: "image", name: "号2图", currentFileId: null }, "acct-2");
    expect(await repo.getAsset(A, a2.id, "acct-1")).toBeNull();
    expect((await repo.getAsset(A, a2.id, "acct-2"))?.id).toBe(a2.id);
    // 全局视图能拿到。
    expect((await repo.getAsset(A, a2.id))?.id).toBe(a2.id);
  });

  it("accountId 设时 updateAssetStatus 改不到别号的行(→ null no-op)", async () => {
    const a2 = await repo.insertAsset(A, { assetType: "image", name: "号2图", currentFileId: null }, "acct-2");
    const miss = await repo.updateAssetStatus(A, a2.id, { status: "archived" }, "acct-1");
    expect(miss).toBeNull();
    // 本号内可改。
    const hit = await repo.updateAssetStatus(A, a2.id, { status: "archived" }, "acct-2");
    expect(hit?.status).toBe("archived");
  });

  it("create stamp:insertAsset 落库带 accountId(null 兜底)", async () => {
    const a = await repo.insertAsset(A, { assetType: "image", name: "号1图", currentFileId: null }, "acct-1");
    expect(a.accountId).toBe("acct-1");
    const g = await repo.insertAsset(A, { assetType: "image", name: "存量图", currentFileId: null });
    expect(g.accountId).toBeNull();
  });

  // [T-200] 认领存量无号 asset:复现「采集封面落 null 号 → 严格 gate 排除 → 占位」的修复。
  it("claimOrphanAssets:无号 asset(采集落的)被严格 gate 排除 → 认领后按当前号可见", async () => {
    // 采集在无号 ctx 下落的封面/素材(accountId=null)。
    const orphan = await repo.insertAsset(A, { assetType: "image", name: "采集封面", currentFileId: null });
    expect(orphan.accountId).toBeNull();
    // 修复前:webview 带当前号 acct-1 → 严格 eq gate 排除 null 号 → 拿不到(占位根因)。
    expect(await repo.getAsset(A, orphan.id, "acct-1")).toBeNull();

    // 认领:该 user 的无号 asset 归 acct-1(返回 1 行)。
    expect(await repo.claimOrphanAssets(A, "acct-1")).toBe(1);

    // 修复后:acct-1 视角能拿到(封面/素材不再占位)。
    expect((await repo.getAsset(A, orphan.id, "acct-1"))?.id).toBe(orphan.id);
    // 幂等:再认领 → 0 行(已无无号 asset)。
    expect(await repo.claimOrphanAssets(A, "acct-1")).toBe(0);
  });

  it("claimOrphanAssets 只动本 user(不串号)+ 不动已归属的 asset", async () => {
    const bOrphan = await repo.insertAsset(B, { assetType: "image", name: "B 无号图", currentFileId: null });
    const aOwned = await repo.insertAsset(A, { assetType: "image", name: "A 已归属图", currentFileId: null }, "acct-1");
    await repo.claimOrphanAssets(A, "acct-1"); // A 此刻无无号 asset → 不影响 B,也不改 aOwned
    expect((await repo.getAsset(B, bOrphan.id))?.accountId).toBeNull(); // B 未被串号
    expect((await repo.getAsset(A, aOwned.id, "acct-1"))?.accountId).toBe("acct-1"); // 未被改动
  });
});

// [T-219] pending 出生态 + 确认门 commitPendingAsset(pending→active + stamp 号)。
describe("assets.repository — [T-219] pending 态 + commitPendingAsset 确认门", () => {
  it("insertAsset status='pending' → 素材库 list(active-only)不显示,commit 后才显示", async () => {
    const p = await repo.insertAsset(
      A,
      { assetType: "image", name: "截图", currentFileId: null, status: "pending" },
      "acct-1",
    );
    expect(p.status).toBe("pending");
    // 素材库默认 list 只 active → pending 不在。
    let list = await repo.listAssets(A, { limit: 50, cursor: null }, "acct-1");
    expect(list.some((r) => r.id === p.id)).toBe(false);
    // commit → active → 进 list。
    const committed = await repo.commitPendingAsset(A, p.id, "acct-1");
    expect(committed?.status).toBe("active");
    list = await repo.listAssets(A, { limit: 50, cursor: null }, "acct-1");
    expect(list.some((r) => r.id === p.id)).toBe(true);
  });

  it("commitPendingAsset 给 account_id=NULL 的 pending 补 stamp 当前号", async () => {
    // 未选号时创建的 pending(account_id=NULL)。
    const p = await repo.insertAsset(
      A,
      { assetType: "image", name: "无号截图", currentFileId: null, status: "pending" },
    );
    expect(p.accountId).toBeNull();
    const committed = await repo.commitPendingAsset(A, p.id, "acct-1");
    expect(committed?.status).toBe("active");
    expect(committed?.accountId).toBe("acct-1"); // 确认时补号
  });

  it("commitPendingAsset 只翻 pending:非 pending / 越权 / 不存在 → null(不误动 active/deleted)", async () => {
    // 已 active:commit 幂等返 active(不报错、不重复动)。
    const active = await repo.insertAsset(
      A,
      { assetType: "image", name: "已入库", currentFileId: null, status: "active" },
      "acct-1",
    );
    expect((await repo.commitPendingAsset(A, active.id, "acct-1"))?.status).toBe("active");
    // 越权:B 的 pending A 翻不动 → null。
    const bPending = await repo.insertAsset(
      B,
      { assetType: "image", name: "B 截图", currentFileId: null, status: "pending" },
      "acct-b",
    );
    expect(await repo.commitPendingAsset(A, bPending.id, "acct-1")).toBeNull();
    expect((await repo.getAsset(B, bPending.id))?.status).toBe("pending"); // B 未被翻
    // 不存在 → null。
    expect(await repo.commitPendingAsset(A, "asset-nope", "acct-1")).toBeNull();
  });
});

// [T-251] findAssetBySourceUrl —— web.read「重读同 URL 不重新抓取」的读点:按 current file
// mediaMetadata.sourceUrl 反查 document 类 asset,pending/active 都算,user-scoped。
describe("assets.repository — findAssetBySourceUrl ([T-251])", () => {
  async function makeDocWithSource(
    userId: string,
    sourceUrl: string,
    status: "pending" | "active" = "pending",
  ) {
    const asset = await repo.insertAsset(userId, {
      assetType: "document",
      name: `正文·${sourceUrl}`,
      currentFileId: null,
      status,
    });
    await repo.insertAssetFile(userId, {
      assetId: asset.id,
      storageKey: `doc/${asset.id}.txt`,
      mimeType: "text/plain",
      fileSize: 10,
      checksum: "c",
      width: null,
      height: null,
      durationMs: null,
      mediaMetadata: { sourceUrl },
    });
    return asset;
  }

  it("pending 的 document asset 也命中(已抓到全文、未点存入素材库)", async () => {
    const asset = await makeDocWithSource(A, "https://chatgpt.com/share/x", "pending");
    const hit = await repo.findAssetBySourceUrl(A, "https://chatgpt.com/share/x");
    expect(hit?.id).toBe(asset.id);
  });

  it("active 命中;URL 不匹配 / 其他 user → null(user-scoped,不泄漏)", async () => {
    const asset = await makeDocWithSource(A, "https://example.com/a", "active");
    expect(
      (await repo.findAssetBySourceUrl(A, "https://example.com/a"))?.id,
    ).toBe(asset.id);
    expect(await repo.findAssetBySourceUrl(A, "https://example.com/other")).toBeNull();
    expect(await repo.findAssetBySourceUrl(B, "https://example.com/a")).toBeNull();
  });

  it("非 document 类(截图 image 也带 sourceUrl)不命中 —— 只复用正文素材", async () => {
    const img = await repo.insertAsset(A, {
      assetType: "image",
      name: "截图·页",
      currentFileId: null,
      status: "pending",
    });
    await repo.insertAssetFile(A, {
      assetId: img.id,
      storageKey: `img/${img.id}.png`,
      mimeType: "image/png",
      fileSize: 10,
      checksum: "c",
      width: 1,
      height: 1,
      durationMs: null,
      mediaMetadata: { sourceUrl: "https://example.com/shot" },
    });
    expect(await repo.findAssetBySourceUrl(A, "https://example.com/shot")).toBeNull();
  });

  it("同 URL 多条 → 命中其一(生产按 createdAt 最新;测试钟固定只锚定命中);deleted 不算", async () => {
    const first = await makeDocWithSource(A, "https://example.com/dup", "active");
    const second = await makeDocWithSource(A, "https://example.com/dup", "pending");
    const hit = await repo.findAssetBySourceUrl(A, "https://example.com/dup");
    expect([first.id, second.id]).toContain(hit?.id);
    // 两条都翻 deleted → 不再命中(pending/active 之外的状态不算)。
    await repo.updateAssetStatus(A, first.id, { status: "deleted" });
    await repo.updateAssetStatus(A, second.id, { status: "deleted" });
    expect(await repo.findAssetBySourceUrl(A, "https://example.com/dup")).toBeNull();
  });
});
