import type { RequestContext } from "@creatoros/contract";

import type { MultimodalSpec } from "./multimodal/resolve";
import { MultimodalConfigError } from "./multimodal/resolve";

// [T-055h SPEC §6.2 第二层] asset.classify runner —— 视觉模型看图打用途标签 +
// 一句话描述(喂素材匹配与稿面弹药检索)。
//
//   - 用户可配(多模态可配铁律):capability "asset.classify" 走 model_configurations,
//     未配置 → 诚实跳过(completeTask + skipped:true,不假装看懂了);
//   - 只对 image 生效(video 首帧抽取是后续增强;非图片诚实跳过);
//   - 产物 = DB 标签(taxonomy,与确定性第一层同库)+ mediaMetadata.aiDescription,
//     不移动文件(SPEC §6.2);
//   - best-effort:任何失败 cancelTask(诚实失败),绝不阻塞上传主链(触发方 void 调用)。

export interface AssetClassifyTask {
  id: string;
  inputData: Record<string, unknown>;
}

export interface AssetClassifyDeps {
  ai: {
    markRunning(ctx: RequestContext, taskId: string): Promise<unknown>;
    /** 过程留痕(跳过原因/归类结果都写 step,任务终态只分成败)。 */
    recordStep(
      ctx: RequestContext,
      taskId: string,
      step: { stepNo: number; kind: string; text: string; toolCalls: unknown[] },
    ): Promise<unknown>;
    markSucceeded(ctx: RequestContext, taskId: string): Promise<unknown>;
    markFailed(ctx: RequestContext, taskId: string, error: string): Promise<unknown>;
  };
  resolveVisionSpec(ctx: RequestContext): Promise<MultimodalSpec>;
  assets: {
    getAssetBytes(
      ctx: RequestContext,
      assetId: string,
    ): Promise<{ bytes: Uint8Array; mimeType: string } | null>;
    mergeAiAnnotation(
      ctx: RequestContext,
      assetId: string,
      patch: Record<string, unknown>,
    ): Promise<void>;
  };
  /** taxonomy 落标签(list/create/assign 封装;composition root 绑 taxonomy service)。 */
  assignTags(
    ctx: RequestContext,
    assetId: string,
    tags: readonly string[],
  ): Promise<void>;
  /** VLM 调用(注入以便单测 fake;host 绑 openai-compatible vision chat)。 */
  describeImage(
    spec: MultimodalSpec,
    input: { bytes: Uint8Array; mimeType: string; prompt: string },
  ): Promise<string>;
}

const CLASSIFY_PROMPT = [
  "你是短视频创作者的素材管理员。看这张图,输出 JSON:",
  '{"tags":["用途标签"],"description":"一句话描述(≤40字,说清画面内容与可用场景)"}',
  "tags 从这个词表里选(可多选,不臆造新词):封面、截图、录屏、实拍、B-roll、图表、人物、产品。",
  "只输出 JSON,不要多余文字。",
].join("\n");

/** 宽容解析 VLM 输出 → {tags, description};不合形 → null(诚实失败)。 */
export function parseClassification(
  raw: string,
): { tags: string[]; description: string } | null {
  const text = raw.replace(/```(?:json)?/g, "").trim();
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]) as { tags?: unknown; description?: unknown };
    const tags = Array.isArray(o.tags)
      ? o.tags.filter((t): t is string => typeof t === "string" && !!t.trim()).slice(0, 5)
      : [];
    const description =
      typeof o.description === "string" ? o.description.trim().slice(0, 80) : "";
    if (tags.length === 0 && !description) return null;
    return { tags, description };
  } catch {
    return null;
  }
}

export async function runAssetClassify(
  ctx: RequestContext,
  task: AssetClassifyTask,
  deps: AssetClassifyDeps,
): Promise<void> {
  try {
    await deps.ai.markRunning(ctx, task.id);
    const assetId =
      typeof task.inputData.assetId === "string" ? task.inputData.assetId : "";
    if (!assetId) throw new Error("asset-classify: inputData.assetId required");

    // 未配置视觉模型 → 诚实跳过(不是失败:第二层是可选增强)。
    let spec: MultimodalSpec;
    try {
      spec = await deps.resolveVisionSpec(ctx);
    } catch (err) {
      if (err instanceof MultimodalConfigError) {
        await deps.ai.recordStep(ctx, task.id, {
          stepNo: 1,
          kind: "skipped",
          text: "未配置视觉模型(设置页可配 asset.classify)—— 只跑确定性第一层。",
          toolCalls: [],
        });
        await deps.ai.markSucceeded(ctx, task.id);
        return;
      }
      throw err;
    }

    const file = await deps.assets.getAssetBytes(ctx, assetId);
    if (!file || !file.mimeType.startsWith("image/")) {
      await deps.ai.recordStep(ctx, task.id, {
        stepNo: 1,
        kind: "skipped",
        text: file ? "非图片素材(视频首帧归类是后续增强)。" : "文件缺失。",
        toolCalls: [],
      });
      await deps.ai.markSucceeded(ctx, task.id);
      return;
    }

    const raw = await deps.describeImage(spec, {
      bytes: file.bytes,
      mimeType: file.mimeType,
      prompt: CLASSIFY_PROMPT,
    });
    const parsed = parseClassification(raw);
    if (!parsed) throw new Error("asset-classify: VLM output unparsable");

    if (parsed.tags.length > 0) {
      await deps.assignTags(ctx, assetId, parsed.tags);
    }
    if (parsed.description) {
      await deps.assets.mergeAiAnnotation(ctx, assetId, {
        aiDescription: parsed.description,
      });
    }
    await deps.ai.recordStep(ctx, task.id, {
      stepNo: 1,
      kind: "classified",
      text: `标签:${parsed.tags.join("、") || "无"};描述:${parsed.description || "无"}`,
      toolCalls: [],
    });
    await deps.ai.markSucceeded(ctx, task.id);
  } catch (err) {
    console.error("[asset-classify] failed:", err);
    await deps.ai
      .markFailed(ctx, task.id, err instanceof Error ? err.message : "classify failed")
      .catch(() => undefined);
  }
}
