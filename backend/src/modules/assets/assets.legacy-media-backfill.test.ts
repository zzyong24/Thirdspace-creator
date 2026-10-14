import { describe, expect, it, vi } from "vitest";
import { createDb } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import {
  createAssetRepository,
  type AssetRepository,
} from "./assets.repository";
import { createAssetsService } from "./assets.service";
import {
  createMockObjectStorage,
  type HeadObjectResult,
} from "./object-storage";

const NOW = "2026-07-24T18:00:00.000Z";
const ctxA: RequestContext = {
  userId: "user-a",
  requestId: "req-a",
  source: "user",
  accountId: "acct-a",
};

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

async function insertVideo(
  repo: AssetRepository,
  input: {
    accountId: string;
    storageKey: string;
    width?: number;
    durationMs?: number;
  },
) {
  const asset = await repo.insertAsset(
    ctxA.userId,
    {
      assetType: "video",
      name: input.storageKey,
      currentFileId: null,
    },
    input.accountId,
  );
  const file = await repo.insertAssetFile(
    ctxA.userId,
    {
      assetId: asset.id,
      storageKey: input.storageKey,
      mimeType: "video/mp4",
      fileSize: 10,
      checksum: "legacy",
      width: input.width ?? 1920,
      height: 1080,
      durationMs: input.durationMs ?? 1000,
      mediaMetadata: {},
    },
    input.accountId,
  );
  await repo.updateAssetStatus(
    ctxA.userId,
    asset.id,
    { currentFileId: file.id },
    input.accountId,
  );
  return { asset, file };
}

function probed(
  durationMs: number,
  width = 1280,
  height = 720,
): HeadObjectResult {
  return {
    mimeType: "video/mp4",
    fileSize: 10,
    checksum: "real",
    width,
    height,
    durationMs,
    mediaMetadata: {},
  };
}

describe("assets.service — [T-298] 存量 local-fs 媒体元信息懒回填", () => {
  it("[T-298] list 不等待 ffprobe；后台回填精确旧签名，重复 list 不重复探测", async () => {
    const { db } = await createDb();
    const deps = deterministicDeps();
    const repo = createAssetRepository(db, deps);
    const legacy = await insertVideo(repo, {
      accountId: "acct-a",
      storageKey: "acct-a/video/legacy.mp4",
    });
    let resolveProbe!: (value: HeadObjectResult) => void;
    const pendingProbe = new Promise<HeadObjectResult>((resolve) => {
      resolveProbe = resolve;
    });
    const baseStorage = createMockObjectStorage({ nextKey: () => "unused" });
    const headObject = vi.fn(() => pendingProbe);
    const storage = {
      ...baseStorage,
      kind: "local-fs" as const,
      headObject,
    };
    const service = createAssetsService(repo, async () => storage, deps);

    // headObject 故意悬而未决；list 仍必须先返回，不能把素材库加载卡在 ffprobe 上。
    await expect(
      service.listAssets(ctxA, { limit: 50, cursor: null }),
    ).resolves.toHaveLength(1);
    await vi.waitFor(() => expect(headObject).toHaveBeenCalledTimes(1),{timeout:180000});

    resolveProbe(probed(12_345));
    await vi.waitFor(async () => {
      const [file] = await repo.listAssetFiles(
        ctxA.userId,
        legacy.asset.id,
        "acct-a",
      );
      expect(file).toMatchObject({
        durationMs: 12_345,
        width: 1280,
        height: 720,
      });
      expect(file?.mediaMetadata).toMatchObject({
        legacyMediaProbeBackfilledAt: NOW,
      });
    },{timeout:180000});

    await service.listAssets(ctxA, { limit: 50, cursor: null });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(headObject).toHaveBeenCalledTimes(1);
  });

  it("[T-298] 每批最多 5 条；只扫当前账号的精确 1000ms+1920 签名，并输出批次计数", async () => {
    const { db } = await createDb();
    const deps = deterministicDeps();
    const repo = createAssetRepository(db, deps);
    const exact = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        insertVideo(repo, {
          accountId: "acct-a",
          storageKey: `acct-a/video/legacy-${i}.mp4`,
        }),
      ),
    );
    const nonLegacy = await insertVideo(repo, {
      accountId: "acct-a",
      storageKey: "acct-a/video/real-one-second.mp4",
      width: 1280,
    });
    const otherAccount = await insertVideo(repo, {
      accountId: "acct-b",
      storageKey: "acct-b/video/legacy.mp4",
    });
    const baseStorage = createMockObjectStorage({ nextKey: () => "unused" });
    const headObject = vi.fn(async (storageKey: string) =>
      probed(
        20_000 +
          Number(storageKey.match(/legacy-(\d+)/)?.[1] ?? 0),
      ),
    );
    const storage = {
      ...baseStorage,
      kind: "local-fs" as const,
      headObject,
    };
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const service = createAssetsService(repo, async () => storage, deps);

    await service.listAssets(ctxA, { limit: 50, cursor: null });
    await vi.waitFor(() => expect(headObject).toHaveBeenCalledTimes(5),{timeout:180000});
    expect(headObject.mock.calls.map(([key]) => key)).not.toContain(
      nonLegacy.file.storageKey,
    );
    expect(headObject.mock.calls.map(([key]) => key)).not.toContain(
      otherAccount.file.storageKey,
    );
    await vi.waitFor(() =>
      expect(info).toHaveBeenCalledWith(
        "[assets][T-298] legacy-media-backfill",
        expect.objectContaining({
          accountId: {kind:"legacy-account",id:"acct-a"},
          eligible: 5,
          updated: 5,
          skipped: 0,
          failed: 0,
        }),
      ),
      {timeout:180000},
    );

    // 第一批留下第 6 条；第二次 list 只补余下 1 条，不重探已完成的 5 条。
    const firstBatch = await Promise.all(
      exact.map(async ({ asset }) => {
        const [file] = await repo.listAssetFiles(
          ctxA.userId,
          asset.id,
          "acct-a",
        );
        return file?.durationMs;
      }),
    );
    expect(firstBatch.filter((duration) => duration !== 1000)).toHaveLength(5);
    await service.listAssets(ctxA, { limit: 50, cursor: null });
    await vi.waitFor(() => expect(headObject).toHaveBeenCalledTimes(6),{timeout:180000});

    const [untouchedWrongSignature] = await repo.listAssetFiles(
      ctxA.userId,
      nonLegacy.asset.id,
      "acct-a",
    );
    expect(untouchedWrongSignature).toMatchObject({
      durationMs: 1000,
      width: 1280,
    });
    const [untouchedOtherAccount] = await repo.listAssetFiles(
      ctxA.userId,
      otherAccount.asset.id,
      "acct-b",
    );
    expect(untouchedOtherAccount).toMatchObject({
      durationMs: 1000,
      width: 1920,
    });
    info.mockRestore();
  });
});
