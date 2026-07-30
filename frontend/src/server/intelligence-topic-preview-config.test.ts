import { describe, expect, it } from "vitest";

import { topicPreviewGenerationOptions } from "./intelligence-topic-preview-config";

describe("[T-633] 内容雷达选题卡生成预算", () => {
  it("首次拆解给推理模型保留完整 JSON 的输出空间，同时不放大失败重试", () => {
    expect(
      topicPreviewGenerationOptions({ hasReusableDecomposition: false }),
    ).toEqual({
      maxRetries: 0,
      maxOutputTokens: 4_096,
    });
  });

  it("复用拆解只生成四个字段，但仍给推理内容和最终 JSON 留出空间", () => {
    expect(
      topicPreviewGenerationOptions({ hasReusableDecomposition: true }),
    ).toEqual({
      maxRetries: 0,
      maxOutputTokens: 2_400,
    });
  });
});
