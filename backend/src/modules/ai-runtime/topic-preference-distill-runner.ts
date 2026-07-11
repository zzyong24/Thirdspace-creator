import type { RequestContext } from "@creatoros/contract";
import type { ModelSpec, TopicPreferenceDistillOutput } from "@creatoros/ai-worker";

// [T-212d] 防茧房校准 —— 淘汰原因蒸馏编排(SPEC 2026-07-11 §2.4)。
//
// 用户淘汰选题写原因 → 累积 → AI 蒸馏成结构化「该创作者偏好」信号 → upsert 落库(喂选题评分)。
// 两件事,都住本文件(仿 benchmark-teardown-runner):
//   ① 编排 `runTopicPreferenceDistill(ctx, deps)`:读累积的淘汰原因 → AI 蒸馏聚类 → 逐条 upsert
//      偏好信号(**护栏在 service.upsertTopicPreference 里强制**:±10 封顶 / ≥3 例才升级 active)。
//      全经**注入端口**(listDropReasons / distill / upsertPreference),故纯编排可 fake 测(不碰真 AI/库)。
//   ② AI 蒸馏端口工厂 `createTopicPreferenceDistillPort`:用 **runStructuredNode** 绑 topic.preference
//      的 Zod outputSchema 真跑蒸馏节点。host(persistence-client)用它装 deps.distill;单测注 fake。
//
// 铁律(同 benchmark-teardown-runner):
//   - 结构化输出(generateObject 绑 Zod),**绝不自由文本 parse**(SPEC §3 边界)。
//   - **≥3 例才升级为硬偏好**由 service 护栏强制(此处只把 supportingCount 如实透传 exampleCount);
//     单次淘汰不立即改规则 —— 编排每次都从**全部**累积原因重算,累计到 3 例才被 service 升级。
//   - best-effort:无原因 → 诚实空跑(不调 AI);单条 upsert 失败 → 记日志跳过,不崩整批。
//   - 防灌库:只 upsert keyword 非空的信号;送 AI 的原因数封顶(maxReasons,默认 50)。

/** AI 蒸馏端口:一批淘汰原因原文 → 结构化偏好信号输出。 */
export type TopicPreferenceDistillPort = (
  ctx: RequestContext,
  reasons: string[],
) => Promise<TopicPreferenceDistillOutput>;

export interface TopicPreferenceDistillDeps {
  /** 读该 ctx(含号)全部淘汰原因(非空)。host 绑 candidateService.listDropReasons。 */
  listDropReasons: (ctx: RequestContext) => Promise<string[]>;
  /** AI 蒸馏端口(真件见 createTopicPreferenceDistillPort;测试注 fake)。 */
  distill: TopicPreferenceDistillPort;
  /** upsert 一条偏好信号(护栏在 service 内强制)。host 绑 candidateService.upsertTopicPreference。 */
  upsertPreference: (
    ctx: RequestContext,
    input: {
      keyword: string;
      direction: "avoid" | "prefer";
      signal: string;
      exampleCount: number;
    },
  ) => Promise<unknown>;
  /** 送 AI 的原因条数上限(默认 50,控 token)。 */
  maxReasons?: number;
}

export interface TopicPreferenceDistillResult {
  /** 本次读到的淘汰原因数。 */
  reasonsSeen: number;
  /** 本次成功 upsert 的偏好信号数。 */
  upserted: number;
}

/**
 * 淘汰原因蒸馏编排。无原因 → 直接返回(不调 AI,诚实空跑)。best-effort:单条 upsert 失败跳过、不崩整批。
 */
export async function runTopicPreferenceDistill(
  ctx: RequestContext,
  deps: TopicPreferenceDistillDeps,
): Promise<TopicPreferenceDistillResult> {
  const maxReasons = deps.maxReasons ?? 50;
  const all = await deps.listDropReasons(ctx);
  if (all.length === 0) {
    return { reasonsSeen: 0, upserted: 0 };
  }
  const reasons = all.slice(0, maxReasons);

  const output = await deps.distill(ctx, reasons);
  const signals = output.偏好信号 ?? [];

  let upserted = 0;
  for (const sig of signals) {
    const keyword = (sig.keyword ?? "").trim();
    if (keyword.length === 0) continue; // 防灌库:无 keyword 无法注入评分,弃。
    try {
      await deps.upsertPreference(ctx, {
        keyword,
        direction: sig.direction === "prefer" ? "prefer" : "avoid",
        signal: (sig.signal ?? "").trim() || keyword,
        // supportingCount 如实透传;≥3 才升级 active 由 service 护栏强制(单次不立即改规则)。
        exampleCount: Math.max(0, Math.trunc(sig.supportingCount ?? 0)),
      });
      upserted += 1;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        `[topic-preference] 偏好信号 upsert 失败,跳过(keyword=${keyword}):`,
        err,
      );
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    `[topic-preference] 蒸馏 ${reasons.length} 条淘汰原因 → upsert ${upserted} 条偏好信号`,
  );
  return { reasonsSeen: reasons.length, upserted };
}

/**
 * AI 蒸馏端口真件工厂 —— 用 runStructuredNode 跑 topic.preference 结构化节点(generateObject 绑
 * registry 里该 skill 的 Zod outputSchema)。host 用它装 deps.distill。
 */
export interface AiDistillDeps {
  resolveModelSpec: (
    ctx: RequestContext,
    capability: string,
  ) => Promise<ModelSpec>;
}

export function createTopicPreferenceDistillPort(
  deps: AiDistillDeps,
): TopicPreferenceDistillPort {
  return async (ctx, reasons) => {
    const spec = await deps.resolveModelSpec(ctx, "topic.preference");
    const { modelFor, runStructuredNode, getTemplate } = await import(
      "@creatoros/ai-worker"
    );
    const { object } = await runStructuredNode<TopicPreferenceDistillOutput>({
      model: modelFor(spec),
      template: getTemplate("topic.preference"),
      // dropReasons facet:逐条一行(编号增强可读,模型据以判 supportingCount)。
      facets: {
        dropReasons: reasons.map((r, i) => `${i + 1}. ${r}`).join("\n"),
      },
    });
    return object;
  };
}
