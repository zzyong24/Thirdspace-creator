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
//
// [T-332 S2] 账号全域隔离:owned-root(assets)方法的 accountId 已收紧为必填 string
// (strict 门,无 undefined 退化全量);asset_uploads 保持 user 级(C-08)。

const A = "user-a";
const B = "user-b";
const ACCT = "acct-a"; // 缺省账号(单号场景)
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

async function makeAsset(userId: string, name = "素材", accountId = ACCT) {
  return repo.insertAsset(
    userId,
    {
      assetType: "image",
      name,
      currentFileId: null,
    },
    accountId,
  );
}

describe("assets.repository — schema round-trip + uniqueness (A2)", () => {
  it("inserts an asset + a file and reads them back", async () => {
    const asset = await makeAsset(A, "封面");
    const file = await repo.insertAssetFile(
      A,
      {
        assetId: asset.id,
        storageKey: "k/1.png",
        mimeType: "image/png",
        fileSize: 1234,
        checksum: "c1",
        width: 100,
        height: 200,
        durationMs: null,
        mediaMetadata: { foo: "bar" },
      },
      ACCT,
    );
    expect(file.versionNumber).toBe(1);
    const readBack = await repo.getAsset(A, asset.id, ACCT);
    expect(readBack?.name).toBe("封面");
    expect(readBack?.assetType).toBe("image");
    const files = await repo.listAssetFiles(A, asset.id, ACCT);
    expect(files).toHaveLength(1);
    expect(files[0]!.storageKey).toBe("k/1.png");
    expect(files[0]!.fileSize).toBe(1234);
    expect(files[0]!.mediaMetadata).toEqual({ foo: "bar" });
  });

  it("rejects a duplicate storage_key (unique constraint)", async () => {
    const a1 = await makeAsset(A);
    const a2 = await makeAsset(A);
    await repo.insertAssetFile(
      A,
      {
        assetId: a1.id,
        storageKey: "dup/key",
        mimeType: "image/png",
        fileSize: 1,
        checksum: "",
        width: null,
        height: null,
        durationMs: null,
        mediaMetadata: {},
      },
      ACCT,
    );
    await expect(
      repo.insertAssetFile(
        A,
        {
          assetId: a2.id,
          storageKey: "dup/key",
          mimeType: "image/png",
          fileSize: 1,
          checksum: "",
          width: null,
          height: null,
          durationMs: null,
          mediaMetadata: {},
        },
        ACCT,
      ),
    ).rejects.toThrow();
  });
});

describe("assets.repository — ownership enforced (multi-tenant, B1–B5)", () => {
  it("listAssets is user-scoped + active-only", async () => {
    const a1 = await makeAsset(A, "A1");
    await makeAsset(A, "A2");
    await makeAsset(A, "A3");
    const trashed = await makeAsset(A, "A-trashed");
    await repo.updateAssetStatus(
      A,
      trashed.id,
      {
        status: "deleted",
        deletedAt: NOW,
      },
      ACCT,
    );
    await makeAsset(B, "B1", "acct-b");
    await makeAsset(B, "B2", "acct-b");

    const aRows = await repo.listAssets(A, { limit: 50, cursor: null }, ACCT);
    expect(aRows).toHaveLength(3);
    expect(aRows.every((r) => r.userId === A)).toBe(true);
    expect(aRows.some((r) => r.id === trashed.id)).toBe(false);
    expect(aRows.some((r) => r.id === a1.id)).toBe(true);
  });

  it("getAsset(B, aId) → null (no existence leak)", async () => {
    const a = await makeAsset(A);
    expect(await repo.getAsset(B, a.id, ACCT)).toBeNull();
    expect(await repo.getAsset(A, a.id, ACCT)).not.toBeNull();
  });

  it("insertAsset stamps userId", async () => {
    const a = await makeAsset(A);
    expect(a.userId).toBe(A);
    expect(a.status).toBe("active");
  });

  it("updateAssetStatus under wrong user touches 0 rows → null", async () => {
    const a = await makeAsset(A);
    const wrong = await repo.updateAssetStatus(
      B,
      a.id,
      {
        status: "deleted",
        deletedAt: NOW,
      },
      ACCT,
    );
    expect(wrong).toBeNull();
    // A's row is untouched.
    expect((await repo.getAsset(A, a.id, ACCT))?.status).toBe("active");
  });

  it("insertAssetFile auto-increments versionNumber per asset", async () => {
    const a = await makeAsset(A);
    const f1 = await repo.insertAssetFile(
      A,
      {
        assetId: a.id,
        storageKey: "v/1",
        mimeType: "image/png",
        fileSize: 1,
        checksum: "",
        width: null,
        height: null,
        durationMs: null,
        mediaMetadata: {},
      },
      ACCT,
    );
    const f2 = await repo.insertAssetFile(
      A,
      {
        assetId: a.id,
        storageKey: "v/2",
        mimeType: "image/png",
        fileSize: 1,
        checksum: "",
        width: null,
        height: null,
        durationMs: null,
        mediaMetadata: {},
      },
      ACCT,
    );
    expect(f1.versionNumber).toBe(1);
    expect(f2.versionNumber).toBe(2);
    // currentFileId is NOT mutated by the repo (service owns that).
    expect((await repo.getAsset(A, a.id, ACCT))?.currentFileId).toBeNull();
  });

  it("insertAssetFile on a foreign asset throws OwnershipError", async () => {
    const a = await makeAsset(A);
    await expect(
      repo.insertAssetFile(
        B,
        {
          assetId: a.id,
          storageKey: "x/1",
          mimeType: "image/png",
          fileSize: 1,
          checksum: "",
          width: null,
          height: null,
          durationMs: null,
          mediaMetadata: {},
        },
        ACCT,
      ),
    ).rejects.toBeInstanceOf(OwnershipError);
  });
});

describe("assets.repository — upload sessions user-scoped (B6)", () => {
  it("getUploadSession(B, aUploadId) → null", async () => {
    const session = await repo.createUploadSession(A, {
      accountId: "acct-a",
      assetId: "asset-upload-a",
      assetType: "image",
      mimeType: "image/png",
      fileSize: 100,
      storageKey: "uploads/k1",
      expiresAt: NOW,
    });
    expect(await repo.getUploadSession(B, session.id, "acct-a")).toBeNull();
    expect(await repo.getUploadSession(A, session.id, "acct-b")).toBeNull();
    expect(await repo.getUploadSession(A, session.id, "acct-a")).not.toBeNull();
  });

  it("completeUploadSession atomically materializes and is idempotent", async () => {
    const session = await repo.createUploadSession(A, {
      accountId: "acct-a",
      assetId: "asset-upload-complete",
      assetType: "image",
      mimeType: "image/png",
      fileSize: 100,
      storageKey: "uploads/k2",
      expiresAt: NOW,
    });
    expect(session.status).toBe("created");
    const input = {
      name: "upload.png",
      head: {
        mimeType: "image/png",
        fileSize: 100,
        checksum: "checksum-upload",
        width: 1920,
        height: 1080,
        durationMs: null,
        mediaMetadata: {},
      },
    };
    const first = await repo.completeUploadSession(
      A,
      session.id,
      "acct-a",
      input,
    );
    const replay = await repo.completeUploadSession(
      A,
      session.id,
      "acct-a",
      input,
    );
    expect(first?.id).toBe("asset-upload-complete");
    expect(replay?.id).toBe(first?.id);
    expect(
      (await repo.getUploadSession(A, session.id, "acct-a"))?.status,
    ).toBe(
      "completed",
    );
  });

  it("reuses a byte-identical active asset instead of creating a duplicate", async () => {
    const firstSession = await repo.createUploadSession(A, {
      accountId: "acct-a",
      assetId: "asset-original",
      assetType: "document",
      mimeType: "application/pdf",
      fileSize: 321,
      storageKey: "uploads/original.pdf",
      expiresAt: NOW,
    });
    const duplicateSession = await repo.createUploadSession(A, {
      accountId: "acct-a",
      assetId: "asset-duplicate-candidate",
      assetType: "document",
      mimeType: "application/pdf",
      fileSize: 321,
      storageKey: "uploads/renamed.pdf",
      expiresAt: NOW,
    });
    const head = {
      mimeType: "application/pdf",
      fileSize: 321,
      checksum: "sha256-same-bytes",
      width: null,
      height: null,
      durationMs: null,
      mediaMetadata: {},
    };

    const original = await repo.completeUploadSession(
      A,
      firstSession.id,
      "acct-a",
      { name: "原名.pdf", head },
    );
    const reused = await repo.completeUploadSession(
      A,
      duplicateSession.id,
      "acct-a",
      { name: "改名后再次上传.pdf", head },
    );

    expect(reused?.id).toBe(original?.id);
    expect(
      (await repo.getUploadSession(A, duplicateSession.id, "acct-a"))?.assetId,
    ).toBe(original?.id);
    expect(
      await repo.listAssets(A, { limit: 50, cursor: null }, "acct-a"),
    ).toHaveLength(1);
  });

  it("never deduplicates identical checksums across accounts", async () => {
    const head = {
      mimeType: "application/pdf",
      fileSize: 50,
      checksum: "sha256-private-bytes",
      width: null,
      height: null,
      durationMs: null,
      mediaMetadata: {},
    };
    const first = await repo.createUploadSession(A, {
      accountId: "acct-a",
      assetId: "asset-a-private",
      assetType: "document",
      mimeType: "application/pdf",
      fileSize: 50,
      storageKey: "acct-a/private.pdf",
      expiresAt: NOW,
    });
    const second = await repo.createUploadSession(A, {
      accountId: "acct-b",
      assetId: "asset-b-private",
      assetType: "document",
      mimeType: "application/pdf",
      fileSize: 50,
      storageKey: "acct-b/private.pdf",
      expiresAt: NOW,
    });
    const a = await repo.completeUploadSession(A, first.id, "acct-a", {
      name: "a.pdf",
      head,
    });
    const b = await repo.completeUploadSession(A, second.id, "acct-b", {
      name: "b.pdf",
      head,
    });
    expect(a?.id).not.toBe(b?.id);
  });
});

// [T-332 S2] 同一 user 下按号(account_id)strict 隔离:双账号数据互不可见;by-id
// 跨号 → null(service 层翻 404);create stamp 必填。claimOrphanAssets 已退役(§4.4)。
describe("assets.repository — per-account strict isolation (T-332 S2)", () => {
  it("listAssets 只返当前号的 asset(双账号互不泄漏,ISO-08)", async () => {
    await makeAsset(A, "号1图", "acct-1");
    await makeAsset(A, "号2图", "acct-2");
    const list1 = await repo.listAssets(A, { limit: 50, cursor: null }, "acct-1");
    expect(list1.map((a) => a.name)).toEqual(["号1图"]);
    const list2 = await repo.listAssets(A, { limit: 50, cursor: null }, "acct-2");
    expect(list2.map((a) => a.name)).toEqual(["号2图"]);
  });

  it("getAsset 拿不到别号的行(by-id 跨号 → null,不泄露存在性,§4.5)", async () => {
    const a2 = await makeAsset(A, "号2图", "acct-2");
    expect(await repo.getAsset(A, a2.id, "acct-1")).toBeNull();
    expect((await repo.getAsset(A, a2.id, "acct-2"))?.id).toBe(a2.id);
  });

  it("updateAssetStatus 改不到别号的行(→ null no-op)", async () => {
    const a2 = await makeAsset(A, "号2图", "acct-2");
    const miss = await repo.updateAssetStatus(
      A,
      a2.id,
      { status: "archived" },
      "acct-1",
    );
    expect(miss).toBeNull();
    // 本号内可改。
    const hit = await repo.updateAssetStatus(
      A,
      a2.id,
      { status: "archived" },
      "acct-2",
    );
    expect(hit?.status).toBe("archived");
  });

  it("create stamp:insertAsset 落库带必填 accountId(出生即带号,ISO-03)", async () => {
    const a = await makeAsset(A, "号1图", "acct-1");
    expect(a.accountId).toBe("acct-1");
  });

  it("listAssetFiles / insertAssetFile 经父锚叠号:跨号 asset 的文件不可达", async () => {
    const a2 = await makeAsset(A, "号2图", "acct-2");
    await repo.insertAssetFile(
      A,
      {
        assetId: a2.id,
        storageKey: "iso/f1",
        mimeType: "image/png",
        fileSize: 1,
        checksum: "",
        width: null,
        height: null,
        durationMs: null,
        mediaMetadata: {},
      },
      "acct-2",
    );
    // 号1 视角读/写号2 asset 的文件 → OwnershipError(父锚 by-id 门叠号)。
    await expect(repo.listAssetFiles(A, a2.id, "acct-1")).rejects.toBeInstanceOf(
      OwnershipError,
    );
    await expect(
      repo.insertAssetFile(
        A,
        {
          assetId: a2.id,
          storageKey: "iso/f2",
          mimeType: "image/png",
          fileSize: 1,
          checksum: "",
          width: null,
          height: null,
          durationMs: null,
          mediaMetadata: {},
        },
        "acct-1",
      ),
    ).rejects.toBeInstanceOf(OwnershipError);
    // 本号内正常。
    expect(await repo.listAssetFiles(A, a2.id, "acct-2")).toHaveLength(1);
  });
});

// [T-219] pending 出生态 + 确认门 commitPendingAsset(pending→active)。
// [T-332 S2] pending 出生即带号;确认门 WHERE 叠号(跨号确认 → null,§4.6 二次校验)。
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

  it("commitPendingAsset 跨号确认 → null(确认门二次校验,§4.6):不把 A 号 pending 确认进 B 号", async () => {
    const p = await repo.insertAsset(
      A,
      { assetType: "image", name: "号1截图", currentFileId: null, status: "pending" },
      "acct-1",
    );
    // 换号(acct-2)确认号1 的 pending → 不命中 → null,行保持 pending 且归属不变。
    expect(await repo.commitPendingAsset(A, p.id, "acct-2")).toBeNull();
    const still = await repo.getAsset(A, p.id, "acct-1");
    expect(still?.status).toBe("pending");
    expect(still?.accountId).toBe("acct-1");
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
    expect(await repo.commitPendingAsset(A, bPending.id, "acct-b")).toBeNull();
    expect((await repo.getAsset(B, bPending.id, "acct-b"))?.status).toBe("pending"); // B 未被翻
    // 不存在 → null。
    expect(await repo.commitPendingAsset(A, "asset-nope", "acct-1")).toBeNull();
  });
});

// [T-251] findAssetBySourceUrl —— web.read「重读同 URL 不重新抓取」的读点:按 current file
// mediaMetadata.sourceUrl 反查 document 类 asset,pending/active 都算,user+account-scoped。
describe("assets.repository — findAssetBySourceUrl ([T-251])", () => {
  async function makeDocWithSource(
    userId: string,
    sourceUrl: string,
    status: "pending" | "active" = "pending",
    accountId = ACCT,
  ) {
    const asset = await repo.insertAsset(
      userId,
      {
        assetType: "document",
        name: `正文·${sourceUrl}`,
        currentFileId: null,
        status,
      },
      accountId,
    );
    await repo.insertAssetFile(
      userId,
      {
        assetId: asset.id,
        storageKey: `doc/${asset.id}.txt`,
        mimeType: "text/plain",
        fileSize: 10,
        checksum: "c",
        width: null,
        height: null,
        durationMs: null,
        mediaMetadata: { sourceUrl },
      },
      accountId,
    );
    return asset;
  }

  it("pending 的 document asset 也命中(已抓到全文、未点存入素材库)", async () => {
    const asset = await makeDocWithSource(A, "https://chatgpt.com/share/x", "pending");
    const hit = await repo.findAssetBySourceUrl(A, "https://chatgpt.com/share/x", ACCT);
    expect(hit?.id).toBe(asset.id);
  });

  it("active 命中;URL 不匹配 / 其他 user / 其他号 → null(不泄漏)", async () => {
    const asset = await makeDocWithSource(A, "https://example.com/a", "active");
    expect(
      (await repo.findAssetBySourceUrl(A, "https://example.com/a", ACCT))?.id,
    ).toBe(asset.id);
    expect(
      await repo.findAssetBySourceUrl(A, "https://example.com/other", ACCT),
    ).toBeNull();
    expect(
      await repo.findAssetBySourceUrl(B, "https://example.com/a", "acct-b"),
    ).toBeNull();
    // [T-332 S2] 同 user 换号 → 不命中(素材按号隔离,重抓而不是复用别号的正文)。
    expect(
      await repo.findAssetBySourceUrl(A, "https://example.com/a", "acct-2"),
    ).toBeNull();
  });

  it("非 document 类(截图 image 也带 sourceUrl)不命中 —— 只复用正文素材", async () => {
    const img = await repo.insertAsset(
      A,
      {
        assetType: "image",
        name: "截图·页",
        currentFileId: null,
        status: "pending",
      },
      ACCT,
    );
    await repo.insertAssetFile(
      A,
      {
        assetId: img.id,
        storageKey: `img/${img.id}.png`,
        mimeType: "image/png",
        fileSize: 10,
        checksum: "c",
        width: 1,
        height: 1,
        durationMs: null,
        mediaMetadata: { sourceUrl: "https://example.com/shot" },
      },
      ACCT,
    );
    expect(
      await repo.findAssetBySourceUrl(A, "https://example.com/shot", ACCT),
    ).toBeNull();
  });

  it("同 URL 多条 → 命中其一(生产按 createdAt 最新;测试钟固定只锚定命中);deleted 不算", async () => {
    const first = await makeDocWithSource(A, "https://example.com/dup", "active");
    const second = await makeDocWithSource(A, "https://example.com/dup", "pending");
    const hit = await repo.findAssetBySourceUrl(A, "https://example.com/dup", ACCT);
    expect([first.id, second.id]).toContain(hit?.id);
    // 两条都翻 deleted → 不再命中(pending/active 之外的状态不算)。
    await repo.updateAssetStatus(A, first.id, { status: "deleted" }, ACCT);
    await repo.updateAssetStatus(A, second.id, { status: "deleted" }, ACCT);
    expect(
      await repo.findAssetBySourceUrl(A, "https://example.com/dup", ACCT),
    ).toBeNull();
  });
});
