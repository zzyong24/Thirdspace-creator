import { describe, expect, it, vi } from "vitest";

import type { RequestContext } from "@creatoros/contract";

import {
  classifyDocMime,
  truncateForSummary,
  runMaterialExtract,
  type MaterialExtractDeps,
  MaterialSummaryModelNotConfiguredError,
} from "./material-extract-runner";

// [T-146 切片 a] material-extract runner —— 文档抽取链单测(端口全注入,确定性)。
// 覆盖:mimeType 分派(pdf/docx/md·txt/unsupported)、token 预算截断、三类诚实降级
// (抽取失败 / 未配摘要模型 / 超长截断)、正常两阶段全链。

const ctx = { userId: "u1", requestId: "r1" } as unknown as RequestContext;

function makeDeps(over: Partial<MaterialExtractDeps> = {}): {
  deps: MaterialExtractDeps;
  calls: Record<string, ReturnType<typeof vi.fn>>;
} {
  const calls = {
    markRunning: vi.fn(async () => undefined),
    recordStep: vi.fn(async () => undefined),
    markSucceeded: vi.fn(async () => undefined),
    markFailed: vi.fn(async () => undefined),
    getAssetBytes: vi.fn(async () => ({
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: "application/pdf",
    })),
    extractText: vi.fn(async () => "这是一份产品资料。续航 20 小时。售价 199 元。"),
    updateExtraction: vi.fn(async () => undefined),
    mergeSummary: vi.fn(async () => undefined),
    summarize: vi.fn(async () => ({
      keyPoints: ["主打长续航"],
      facts: ["续航 20 小时", "售价 199 元"],
      sellingPoints: ["续航 20 小时"],
    })),
  };
  const deps: MaterialExtractDeps = {
    ai: {
      markRunning: calls.markRunning,
      recordStep: calls.recordStep,
      markSucceeded: calls.markSucceeded,
      markFailed: calls.markFailed,
    },
    assets: {
      getAssetBytes: calls.getAssetBytes,
      updateExtraction: calls.updateExtraction,
      mergeSummary: calls.mergeSummary,
    },
    extractText: calls.extractText,
    summarize: calls.summarize,
    ...over,
  };
  return { deps, calls };
}

describe("classifyDocMime — mimeType 分派", () => {
  it("PDF → pdf", () => {
    expect(classifyDocMime("application/pdf", "a.pdf")).toBe("pdf");
  });
  it("docx → docx", () => {
    expect(
      classifyDocMime(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "a.docx",
      ),
    ).toBe("docx");
    // 空 mime 靠扩展名兜底
    expect(classifyDocMime("application/octet-stream", "note.docx")).toBe("docx");
  });
  it("md / txt / 纯文本 → plaintext", () => {
    expect(classifyDocMime("text/markdown", "a.md")).toBe("plaintext");
    expect(classifyDocMime("text/plain", "a.txt")).toBe("plaintext");
    expect(classifyDocMime("application/octet-stream", "readme.md")).toBe(
      "plaintext",
    );
    expect(classifyDocMime("", "notes.txt")).toBe("plaintext");
  });
  it("旧 .doc / 未知类型 → unsupported", () => {
    expect(classifyDocMime("application/msword", "a.doc")).toBe("unsupported");
    expect(classifyDocMime("image/png", "a.png")).toBe("unsupported");
  });
});

describe("truncateForSummary — token 预算截断", () => {
  it("未超预算 → 原样 + wasTruncated=false", () => {
    const r = truncateForSummary("短文本", 1000);
    expect(r.text).toBe("短文本");
    expect(r.wasTruncated).toBe(false);
  });
  it("超预算 → 截断到预算内 + wasTruncated=true", () => {
    const long = "字".repeat(5000);
    const r = truncateForSummary(long, 100);
    expect(r.text.length).toBeLessThanOrEqual(100);
    expect(r.wasTruncated).toBe(true);
  });
});

describe("runMaterialExtract — 两阶段全链", () => {
  it("正常:抽全文 → done + materialSummary 要点卡落库", async () => {
    const { deps, calls } = makeDeps();
    await runMaterialExtract(
      ctx,
      { id: "t1", inputData: { assetId: "a1" } },
      deps,
    );
    // 阶段①:全文落库 + status done
    expect(calls.updateExtraction).toHaveBeenCalledWith(
      ctx,
      "a1",
      expect.objectContaining({ extractStatus: "done" }),
    );
    // 阶段②:要点卡落 mediaMetadata.materialSummary
    expect(calls.mergeSummary).toHaveBeenCalledWith(
      ctx,
      "a1",
      expect.objectContaining({
        keyPoints: expect.any(Array),
        facts: expect.any(Array),
      }),
    );
    expect(calls.markSucceeded).toHaveBeenCalled();
    expect(calls.markFailed).not.toHaveBeenCalled();
  });

  it("非文档类型(unsupported)→ status unsupported,不抽不摘,诚实跳过", async () => {
    const { deps, calls } = makeDeps({
      assets: {
        getAssetBytes: vi.fn(async () => ({
          bytes: new Uint8Array([1]),
          mimeType: "image/png",
        })),
        updateExtraction: vi.fn(async () => undefined),
        mergeSummary: vi.fn(async () => undefined),
      },
    });
    await runMaterialExtract(
      ctx,
      { id: "t2", inputData: { assetId: "a1" } },
      deps,
    );
    expect(deps.assets.updateExtraction).toHaveBeenCalledWith(
      ctx,
      "a1",
      expect.objectContaining({ extractStatus: "unsupported" }),
    );
    expect(deps.summarize).not.toHaveBeenCalled();
    expect(deps.assets.mergeSummary).not.toHaveBeenCalled();
    expect(calls.markSucceeded).toHaveBeenCalled();
  });

  it("诚实降级①:抽取失败(加密/扫描/损坏)→ status failed,不摘,不假装成功", async () => {
    const { deps, calls } = makeDeps({
      extractText: vi.fn(async () => {
        throw new Error("encrypted/corrupt");
      }),
    });
    await runMaterialExtract(
      ctx,
      { id: "t3", inputData: { assetId: "a1" } },
      deps,
    );
    expect(deps.assets.updateExtraction).toHaveBeenCalledWith(
      ctx,
      "a1",
      expect.objectContaining({ extractStatus: "failed" }),
    );
    expect(deps.summarize).not.toHaveBeenCalled();
    expect(deps.assets.mergeSummary).not.toHaveBeenCalled();
    // 抽取失败是诚实降级,不是任务失败:task 仍 succeeded(status 已诚实标 failed)。
    expect(calls.markSucceeded).toHaveBeenCalled();
  });

  it("空文本(抽到但无内容)→ status failed,不摘", async () => {
    const { deps } = makeDeps({
      extractText: vi.fn(async () => "   \n  "),
    });
    await runMaterialExtract(
      ctx,
      { id: "t3b", inputData: { assetId: "a1" } },
      deps,
    );
    expect(deps.assets.updateExtraction).toHaveBeenCalledWith(
      ctx,
      "a1",
      expect.objectContaining({ extractStatus: "failed" }),
    );
    expect(deps.summarize).not.toHaveBeenCalled();
  });

  it("诚实降级②:未配摘要模型 → 全文落库 done,materialSummary 留空(不崩不假装)", async () => {
    const { deps, calls } = makeDeps({
      summarize: vi.fn(async () => {
        throw new MaterialSummaryModelNotConfiguredError("no model");
      }),
    });
    await runMaterialExtract(
      ctx,
      { id: "t4", inputData: { assetId: "a1" } },
      deps,
    );
    // 全文仍落库 + done(抽取成功);要点卡不落(未配模型)。
    expect(deps.assets.updateExtraction).toHaveBeenCalledWith(
      ctx,
      "a1",
      expect.objectContaining({ extractStatus: "done" }),
    );
    expect(deps.assets.mergeSummary).not.toHaveBeenCalled();
    expect(calls.markSucceeded).toHaveBeenCalled();
    expect(calls.markFailed).not.toHaveBeenCalled();
  });

  it("诚实降级③:全文超长 → 摘要输入截断 + 标注,全文仍存全量", async () => {
    const long = "长文".repeat(100_000);
    const summarize = vi.fn(async (_fullText: string) => ({
      keyPoints: ["x"],
      facts: [] as string[],
    }));
    const { deps } = makeDeps({
      extractText: vi.fn(async () => long),
      summarize,
    });
    await runMaterialExtract(
      ctx,
      { id: "t5", inputData: { assetId: "a1" }, tokenBudgetChars: 500 },
      deps,
    );
    // 全文存全量(不截),摘要输入按预算截断。
    const fullTextCall = (deps.assets.updateExtraction as ReturnType<typeof vi.fn>)
      .mock.calls[0]!;
    expect(fullTextCall[2].extractedText).toBe(long);
    // summarize 收到的输入被截断到预算内。
    const summarizeArg = summarize.mock.calls[0]?.[0] ?? "";
    expect(summarizeArg.length).toBeLessThanOrEqual(600);
  });

  it("assetId 缺失 → markFailed(诚实失败,不静默)", async () => {
    const { deps, calls } = makeDeps();
    await runMaterialExtract(ctx, { id: "t6", inputData: {} }, deps);
    expect(calls.markFailed).toHaveBeenCalled();
  });
});
