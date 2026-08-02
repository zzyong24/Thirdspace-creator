import { describe, expect, it } from "vitest";

import { topicPreviewGenerationOptions } from "./intelligence-topic-preview-config";

describe("[T-633] 内容雷达选题卡生成预算", () => {
  it("来源拆解只生成小结构，不携带选题和长稿", () => {
    expect(
      topicPreviewGenerationOptions({ hasReusableDecomposition: false }),
    ).toEqual({
      maxRetries: 0,
      maxOutputTokens: 3_072,
    });
  });

  it("复用拆解时只生成选题卡和策略，保持零重试", () => {
    expect(
      topicPreviewGenerationOptions({ hasReusableDecomposition: true }),
    ).toEqual({
      maxRetries: 0,
      maxOutputTokens: 2_048,
    });
  });
});
