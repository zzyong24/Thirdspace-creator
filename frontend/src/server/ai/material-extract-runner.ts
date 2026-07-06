import type { RequestContext } from "@creatoros/contract";

// [T-146 切片 a SPEC §1] material.extract runner —— 用户上传文档(PDF/Word/MD)的文本抽取链。
// 与 asset-classify-runner 同范式:上传 document 完成后 **void 触发**(best-effort,不阻塞上传
// 主链),端口全注入(单测确定性),诚实降级(不假装成功)。
//
// 两阶段(SPEC §1.2):
//   ① 确定性抽全文(无 AI):按 mimeType 分派 pdf-parse / mammoth / UTF-8 直读 → 落 extracted_text
//      + extract_status。加密/扫描/损坏 → status='failed'(诚实,不产垃圾要点)。
//   ② AI 摘要要点卡:全文(超长按 token 预算截断)喂**现有文本模型**(host 绑 runStructuredNode,
//      不新增 capability)→ materialSummary({ keyPoints, facts, sellingPoints? })落 mediaMetadata。
//      提示铁律:只提炼原文已有的事实/数据/卖点,不补充原文没有的;拿不准留空。未配模型 → 诚实降级
//      (只留全文、要点卡空)。
//
// gate 处置(SPEC §11):
//   [卖点收窄] summarize 的 prompt(host 侧)显式禁止 AI 创造原文未声明的卖点。
//   [大文件兜底] 上传入口后端拒超 20MB(assets.service);此处 AI 摘要输入按 token 预算截断 + 标注。
//   [文件安全] 只取文本层(pdf-parse/mammoth 纯文本,不执行 PDF JS / Word 宏);字节经 presigned
//      storageKey 读取(与原始文件名隔离)。

/** 摘要模型未配置的信号错误(host 侧 resolve 抛此 → runner 诚实降级为「只留全文」)。 */
export class MaterialSummaryModelNotConfiguredError extends Error {
  constructor(message = "material summary model not configured") {
    super(message);
    this.name = "MaterialSummaryModelNotConfiguredError";
  }
}

/** 抽取器家族:确定性抽全文按 mimeType 分派到这几类。 */
export type DocFamily = "pdf" | "docx" | "plaintext" | "unsupported";

/** 「资料要点卡」结构(SPEC §1.1;只提炼原文已有,拿不准留空)。 */
export interface MaterialSummary {
  keyPoints: string[];
  facts: string[];
  sellingPoints?: string[];
}

export interface MaterialExtractTask {
  id: string;
  inputData: Record<string, unknown>;
  /** AI 摘要输入的字符预算(超长截断,诚实标注)。缺省用 DEFAULT_TOKEN_BUDGET_CHARS。 */
  tokenBudgetChars?: number;
}

export interface MaterialExtractDeps {
  ai: {
    markRunning(ctx: RequestContext, taskId: string): Promise<unknown>;
    recordStep(
      ctx: RequestContext,
      taskId: string,
      step: { stepNo: number; kind: string; text: string; toolCalls: unknown[] },
    ): Promise<unknown>;
    markSucceeded(ctx: RequestContext, taskId: string): Promise<unknown>;
    markFailed(ctx: RequestContext, taskId: string, error: string): Promise<unknown>;
  };
  assets: {
    getAssetBytes(
      ctx: RequestContext,
      assetId: string,
    ): Promise<{ bytes: Uint8Array; mimeType: string } | null>;
    /** 落全文 + 状态列(独立列,非 metadata)。 */
    updateExtraction(
      ctx: RequestContext,
      assetId: string,
      patch: { extractedText?: string | null; extractStatus?: string },
    ): Promise<void>;
    /** 落要点卡(materialSummary 进 mediaMetadata jsonb merge)。 */
    mergeSummary(
      ctx: RequestContext,
      assetId: string,
      summary: MaterialSummary,
    ): Promise<void>;
  };
  /** 确定性抽全文(host 绑 pdf-parse/mammoth/UTF-8;family=unsupported 不会走到这)。 */
  extractText(
    family: Exclude<DocFamily, "unsupported">,
    bytes: Uint8Array,
  ): Promise<string>;
  /**
   * AI 摘要(host 绑现有文本模型 + runStructuredNode + materialSummary schema)。未配模型 →
   * 抛 MaterialSummaryModelNotConfiguredError(runner 诚实降级)。
   */
  summarize(fullText: string): Promise<MaterialSummary>;
}

// 默认 AI 摘要输入字符预算(OQ2:按模型上下文合理比例;单机默认取 ~24k 字符,长文档截断标注)。
const DEFAULT_TOKEN_BUDGET_CHARS = 24_000;

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * 按 mimeType(+ 文件名扩展兜底,File.type 常为空)分派抽取器家族。纯函数,确定性。
 *   - pdf:  application/pdf | *.pdf
 *   - docx: openxml wordprocessingml | *.docx
 *   - plaintext: text/* | *.md | *.txt(md/txt UTF-8 直读)
 *   - unsupported: 旧 .doc(二进制,mammoth 不吃)、非文档类型 → 诚实标 unsupported,不抽不摘。
 */
export function classifyDocMime(mimeType: string, fileName: string): DocFamily {
  const mime = (mimeType || "").toLowerCase();
  const name = (fileName || "").toLowerCase();
  if (mime === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (mime === DOCX_MIME || name.endsWith(".docx")) return "docx";
  if (
    mime.startsWith("text/") ||
    name.endsWith(".md") ||
    name.endsWith(".markdown") ||
    name.endsWith(".txt")
  ) {
    return "plaintext";
  }
  return "unsupported";
}

/**
 * AI 摘要输入按字符预算截断(纯函数)。超预算 → 截到预算内 + wasTruncated=true(host 据此在
 * prompt 里标「资料过长已截断」)。全文本身不截(存全量落 extracted_text),只截喂 AI 的输入。
 */
export function truncateForSummary(
  text: string,
  budget: number = DEFAULT_TOKEN_BUDGET_CHARS,
): { text: string; wasTruncated: boolean } {
  if (text.length <= budget) return { text, wasTruncated: false };
  return { text: text.slice(0, budget), wasTruncated: true };
}

export async function runMaterialExtract(
  ctx: RequestContext,
  task: MaterialExtractTask,
  deps: MaterialExtractDeps,
): Promise<void> {
  try {
    await deps.ai.markRunning(ctx, task.id);
    const assetId =
      typeof task.inputData.assetId === "string" ? task.inputData.assetId : "";
    if (!assetId) throw new Error("material-extract: inputData.assetId required");

    const fileNameRaw = task.inputData.fileName;
    const fileName = typeof fileNameRaw === "string" ? fileNameRaw : "";

    const file = await deps.assets.getAssetBytes(ctx, assetId);
    if (!file) {
      // 文件缺失 → 诚实标 failed(读不到字节,谈不上抽取)。
      await deps.assets.updateExtraction(ctx, assetId, {
        extractStatus: "failed",
      });
      await deps.ai.recordStep(ctx, task.id, {
        stepNo: 1,
        kind: "skipped",
        text: "文件缺失,无法抽取文本。",
        toolCalls: [],
      });
      await deps.ai.markSucceeded(ctx, task.id);
      return;
    }

    const family = classifyDocMime(file.mimeType, fileName);
    if (family === "unsupported") {
      // 非文档 / 旧 .doc:诚实标 unsupported,不抽不摘(OCR/旧格式列未来)。
      await deps.assets.updateExtraction(ctx, assetId, {
        extractStatus: "unsupported",
      });
      await deps.ai.recordStep(ctx, task.id, {
        stepNo: 1,
        kind: "skipped",
        text: `不支持自动解析的文档类型(${file.mimeType || fileName || "未知"})。`,
        toolCalls: [],
      });
      await deps.ai.markSucceeded(ctx, task.id);
      return;
    }

    // 阶段①:确定性抽全文(无 AI)。失败(加密/扫描/损坏)→ 诚实标 failed,不摘。
    let fullText: string;
    try {
      fullText = await deps.extractText(family, file.bytes);
    } catch (err) {
      await deps.assets.updateExtraction(ctx, assetId, {
        extractStatus: "failed",
      });
      await deps.ai.recordStep(ctx, task.id, {
        stepNo: 1,
        kind: "failed",
        text: `文本抽取失败(可能是扫描件/加密/损坏):${
          err instanceof Error ? err.message : "unknown"
        }。AI 将读不到其内容。`,
        toolCalls: [],
      });
      // 抽取失败是**诚实降级**,不是任务失败:status 已诚实标 failed,任务照常 succeeded。
      await deps.ai.markSucceeded(ctx, task.id);
      return;
    }

    if (!fullText || fullText.trim().length === 0) {
      // 抽到但无文本层(扫描件常见)→ 诚实 failed,不摘。
      await deps.assets.updateExtraction(ctx, assetId, {
        extractStatus: "failed",
      });
      await deps.ai.recordStep(ctx, task.id, {
        stepNo: 1,
        kind: "failed",
        text: "文档无可提取的文本层(可能是扫描件/纯图片 PDF)。AI 将读不到其内容。",
        toolCalls: [],
      });
      await deps.ai.markSucceeded(ctx, task.id);
      return;
    }

    // 抽取成功:全文落库(存全量,不截)+ status done。
    await deps.assets.updateExtraction(ctx, assetId, {
      extractedText: fullText,
      extractStatus: "done",
    });
    await deps.ai.recordStep(ctx, task.id, {
      stepNo: 1,
      kind: "extracted",
      text: `已抽取全文(${fullText.length} 字符)。`,
      toolCalls: [],
    });

    // 阶段②:AI 摘要要点卡。摘要输入按 token 预算截断(全文已存全量)。
    const { text: summaryInput, wasTruncated } = truncateForSummary(
      fullText,
      task.tokenBudgetChars ?? DEFAULT_TOKEN_BUDGET_CHARS,
    );
    try {
      const summary = await deps.summarize(summaryInput);
      await deps.assets.mergeSummary(ctx, assetId, summary);
      await deps.ai.recordStep(ctx, task.id, {
        stepNo: 2,
        kind: "summarized",
        text: `已生成资料要点卡(要点 ${summary.keyPoints.length}/事实 ${summary.facts.length})${
          wasTruncated ? ";资料过长已截断部分内容" : ""
        }。`,
        toolCalls: [],
      });
    } catch (err) {
      if (err instanceof MaterialSummaryModelNotConfiguredError) {
        // 诚实降级②:未配摘要模型 → 只留全文,要点卡空(不崩、不假装有卡)。
        await deps.ai.recordStep(ctx, task.id, {
          stepNo: 2,
          kind: "skipped",
          text: "未配置文本摘要模型 —— 只保留全文,未生成资料要点卡(设置页可配)。",
          toolCalls: [],
        });
      } else {
        // 其它摘要失败(网络/模型端点)→ 不 fail 整链:全文已落库可用,要点卡此次没出。
        await deps.ai.recordStep(ctx, task.id, {
          stepNo: 2,
          kind: "failed",
          text: `资料要点卡生成失败:${
            err instanceof Error ? err.message : "unknown"
          }。全文已保留。`,
          toolCalls: [],
        });
      }
    }

    await deps.ai.markSucceeded(ctx, task.id);
  } catch (err) {
    // 触发方 void 调用:任何未预期错误 markFailed(诚实失败),绝不阻塞上传主链。
    console.error("[material-extract] failed:", err);
    await deps.ai
      .markFailed(ctx, task.id, err instanceof Error ? err.message : "extract failed")
      .catch(() => undefined);
  }
}
