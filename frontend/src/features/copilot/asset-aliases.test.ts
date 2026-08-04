import { describe, expect, it } from "vitest";

import {
  expandGeneratedAssetAliases,
  registerGeneratedAssetAlias,
  type GeneratedAssetAliasRegistry,
} from "./asset-aliases";

describe("生成素材自然语言别名", () => {
  it("图2同时支持 image2、img2、第二张与刚才那组第二张", () => {
    expect(expandGeneratedAssetAliases("图2", "asset-image-2")).toMatchObject({
      图2: "asset-image-2",
      image2: "asset-image-2",
      img2: "asset-image-2",
      第二张: "asset-image-2",
      刚才第二张: "asset-image-2",
      刚才那组第二张: "asset-image-2",
    });
  });

  it("视频别名不与图片序号混用", () => {
    const aliases = expandGeneratedAssetAliases("视频1", "asset-video-1");
    expect(aliases).toMatchObject({
      视频1: "asset-video-1",
      video1: "asset-video-1",
      第一个视频: "asset-video-1",
    });
    expect(aliases).not.toHaveProperty("image1");
  });

  it("新批次替换通用图序号，旧批次晚完成不能抢回 image2", () => {
    const empty: GeneratedAssetAliasRegistry = {
      activeBatchKey: null,
      activeBatchRank: -1,
      aliases: {},
    };
    const oldBatch = registerGeneratedAssetAlias(empty, {
      batchKey: "message-old",
      batchRank: 3,
      alias: "图2",
      assetId: "asset-old-2",
    });
    const newBatch = registerGeneratedAssetAlias(oldBatch, {
      batchKey: "message-new",
      batchRank: 5,
      alias: "图2",
      assetId: "asset-new-2",
    });
    const lateOldResult = registerGeneratedAssetAlias(newBatch, {
      batchKey: "message-old",
      batchRank: 3,
      alias: "图1",
      assetId: "asset-old-1",
    });

    expect(lateOldResult.aliases.image2).toBe("asset-new-2");
    expect(lateOldResult.aliases).not.toHaveProperty("image1");
  });
});
