import {ScheduledFlywheelSuspended} from "./scheduled-flywheel-suspension";
import type { RequestContext } from "@creatoros/contract";
import type { ModelSpec, FavoritesTriageOutput } from "@creatoros/ai-worker";
import type { DistillCandidateItem, DistillVerdict } from "../favorites";
import type { KnowledgeDistillation } from "./knowledge-distill-runner";

// [T-235d-distill] 收藏夹作品蒸馏链 runner(SPEC 2026-07-11 daily-topic-autopilot §2.3,仿 dy--
// `_distill_content_to_asset` 先判库再落)—— 补 T-235c 收尾诚实缺口:收藏候选进池已通,但
// transcribe→判库→分类蒸馏未接。
//
// **origin 隔离铁律(本 runner 的地基)**:他人收藏作品**永不建 imported project / artifact**——
//   逐字稿落在 `favorites_items.transcript`(独立落点),判库/蒸馏产物落 `distill_status/result`。
//   全程**不碰** projectsRepo / artifactsService / ensureTranscriptArtifact(那是 imported 本人
//   作品的路径,origin=reconstructed 会被 creative-context/ChatBox/candidate/SEAM 当已确认前提)。
//   本 runner 的 deps 面里**没有**任何 artifact 绑定端口 —— 结构上就杜绝了污染。
//
// 一条待蒸收藏的流程(≤maxItems/run,防超载):
//   1. transcript 落点:已有则复用(省流);否则 transcribeOne(host 复用 transcribe 原语:
//      iesdouyin 直链 + ffmpeg 抽音 + 云 ASR,与 transcribe-runner 同一套,不重造)→ saveTranscript。
//      transcribeOne 返 null(图集/无口播/空转写)→ 诚实 skip(非失败,不重试)。
//   2. 判库(favorites.triage,capability 经 model-config 解析):knowledge / topic / skip。
//   3. 路由:
//      · knowledge → runKnowledgeDistill(transcript)产知识原子 → **存 distill_result 当确认门候选**
//        (AI 只产候选、人采纳才 knowledge.create,铁律②;本 runner 绝不物化 knowledge 实体)。
//      · topic → 落 status=topic(已有跟拍候选于进池路径,蒸馏链无额外动作,不重复灌库)。
//      · skip → 落 status=skip。
//   best-effort:单条(转写 IO / 判库 AI / 蒸馏 / 落库)任一失败 → 标该条 failed(带 error,移出
//     NULL 批防 FIFO 头阻塞),其余继续,不崩整批。
//
// 端口全注入(listItemsForDistill / transcribeOne / saveTranscript / triage / distillKnowledge /
//   saveVerdict),故 runner 可确定性单测(fake IO/AI,不碰真抖音/真 ASR/真模型)。

/** 判库 AI 端口:一条收藏(标题 + 逐字稿)→ 结构化裁决(knowledge/topic/skip + reason)。 */
export type FavoritesTriagePort = (
  ctx: RequestContext,
  input: { itemId?:string;title: string; transcript: string },
) => Promise<FavoritesTriageOutput>;

/** 取逐字稿端口(host 复用 transcribe 原语)。null = 无口播/图集/空转写(诚实跳过,非失败)。 */
export type FavoritesTranscribePort = (
  ctx: RequestContext,
  awemeId: string,
  itemId?:string,
) => Promise<string | null>;

/** 知识蒸馏端口(host 转发 runKnowledgeDistill)。产不出可用原子会抛(调用方按 failed 处理)。 */
export type FavoritesKnowledgeDistillPort = (
  ctx: RequestContext,
  content: string,
  itemId?:string,
) => Promise<KnowledgeDistillation>;

export interface FavoritesDistillDeps {
  /** 列该 ctx(含号)待入蒸馏链的收藏(distill_status IS NULL,FIFO),上限 limit。 */
  listItemsForDistill: (
    ctx: RequestContext,
    limit: number,
  ) => Promise<DistillCandidateItem[]>;
  /** 取一条 aweme 逐字稿(host 复用 transcribe 原语)。 */
  transcribeOne: FavoritesTranscribePort;
  /** 落逐字稿(他人作品独立落点,非 project artifact)。 */
  saveTranscript: (
    ctx: RequestContext,
    itemId: string,
    transcript: string,
  ) => Promise<void>;
  /** 判库(AI)。 */
  triage: FavoritesTriagePort;
  /** 知识蒸馏(AI;knowledge verdict 才调)。 */
  distillKnowledge: FavoritesKnowledgeDistillPort;
  /** 落判库裁决 + 蒸馏产物(distill_status + distill_result)。 */
  saveVerdict: (
    ctx: RequestContext,
    itemId: string,
    verdict: DistillVerdict,
  ) => Promise<void>;
  /** 单次处理几条(默认 3,控 token/ASR + 防超载)。 */
  maxItemsPerRun?: number;
}

export interface FavoritesDistillResult {
  /** 本次实际处理(落了终态)的条数。 */
  processed: number;
  /** 判为知识(已产 atoms 存确认门候选)。 */
  knowledge: number;
  /** 判为纯选题(已有跟拍候选,无额外动作)。 */
  topic: number;
  /** 判为无沉淀价值 / 图集无口播(诚实跳过)。 */
  skip: number;
  /** 转写/判库/蒸馏/落库失败(带 error,移出批防阻塞)。 */
  failed: number;
}

// —— [T-235d-distill] 判库 AI 端口真件工厂 —— runStructuredNode 跑 favorites.triage 结构化节点
//   (generateObject 绑 registry 里该 skill 的 Zod outputSchema,每轮 schema 约束 + 跨模型文本兜底)。
//   host 用它装 deps.triage;单测注 fake triage 端口不走这条。

export interface AiTriageDeps {
  /** 按 capability 解析用户配的 model(Vercel SDK)。 */
  resolveModelSpec: (
    ctx: RequestContext,
    capability: string,
  ) => Promise<ModelSpec>;
}

// 判库送模型的逐字稿截断上限(字符)—— 判库只需读一遍判型,截断防 prompt 爆(存库仍全文,
// 截断只影响送模型的 facet);比 knowledge.distill 的 8000 略窄(判型不必吃满全篇)。
// [T-431] 判库主要看开头,但 1M 上下文下放宽逐字稿上限,只挡病态输入。
export const MAX_TRIAGE_TRANSCRIPT_CHARS = 40_000;

/** 截断送模型的逐字稿 facet(超限截断 + 标注,让模型知道后面还有)。 */
export function truncateForTriage(raw: string): string {
  const text = raw.trim();
  if (text.length <= MAX_TRIAGE_TRANSCRIPT_CHARS) return text;
  return `${text.slice(0, MAX_TRIAGE_TRANSCRIPT_CHARS)}\n…(逐字稿过长已截断,以上为开头部分)`;
}

export function createFavoritesTriagePort(deps: AiTriageDeps): FavoritesTriagePort {
  return async (ctx, input) => {
    const spec = await deps.resolveModelSpec(ctx, "favorites.triage");
    // outputSchema 不手传 —— runStructuredNode 从 registry 取(SPEC §4.2 统一防发散入口,还吃
    // JSON Schema 配置覆盖)。getTemplate 取运行时被覆盖后的模板(skill_config_overrides 生效)。
    const { modelFor, runStructuredNode, getTemplate } = await import(
      "@creatoros/ai-worker"
    );
    const { object } = await runStructuredNode<FavoritesTriageOutput>({
      model: modelFor(spec),
      template: getTemplate("favorites.triage"),
      facets: {
        title: input.title || "(无标题)",
        transcript: truncateForTriage(input.transcript),
      },
    });
    return object;
  };
}

/**
 * 蒸馏编排:读待蒸收藏 → 逐条 transcript 落点 → 判库 → 路由(knowledge 蒸馏产候选 / topic / skip)。
 * 返回诊断计数。无待蒸收藏 → 直接返回全 0(诚实空跑,非失败)。best-effort:单条失败标 failed 继续。
 */
export async function runFavoritesDistill(
  ctx: RequestContext,
  deps: FavoritesDistillDeps,
): Promise<FavoritesDistillResult> {
  const maxItems = deps.maxItemsPerRun ?? 3;
  const items = await deps.listItemsForDistill(ctx, maxItems);
  const result: FavoritesDistillResult = {
    processed: 0,
    knowledge: 0,
    topic: 0,
    skip: 0,
    failed: 0,
  };
  if (items.length === 0) return result;

  for (const item of items) {
    try {
      // 1) transcript 落点(已有则复用,省流;他人作品落 favorites_items,不建 project artifact)。
      let transcript = (item.transcript ?? "").trim();
      if (!transcript) {
        const text = await deps.transcribeOne(ctx, item.awemeId,item.id);
        if (!text || !text.trim()) {
          // 图集/无口播/空转写 → 诚实 skip(终态,非失败,不重试;下轮不再入 NULL 批)。
          await deps.saveVerdict(ctx, item.id, {
            status: "skip",
            result: { reason: "无口播音频或转写为空(图集/纯画面),无可蒸内容" },
          });
          result.skip += 1;
          result.processed += 1;
          continue;
        }
        transcript = text.trim();
        await deps.saveTranscript(ctx, item.id, transcript);
      }

      // 2) 判库(AI):knowledge / topic / skip。
      const triage = await deps.triage(ctx, { itemId:item.id,title: item.title, transcript });
      const reason = (triage.reason ?? "").trim().slice(0, 120);

      // 3) 路由。
      if (triage.verdict === "knowledge") {
        try {
          const distillation = await deps.distillKnowledge(ctx, transcript,item.id);
          // atoms 存确认门候选 —— **不物化 knowledge 实体**(铁律②:AI 只产候选,人采纳才落库)。
          await deps.saveVerdict(ctx, item.id, {
            status: "knowledge",
            result: {
              reason,
              atoms: distillation.atoms,
              suggestedTags: distillation.suggestedTags,
            },
          });
          result.knowledge += 1;
        } catch (distillErr) {
          if(distillErr instanceof ScheduledFlywheelSuspended)throw distillErr;
          // 判为知识但蒸不出可用原子(模型产空/不可用)→ failed(带 error,可后续重试/人工补录)。
          const msg =
            distillErr instanceof Error
              ? distillErr.message
              : String(distillErr ?? "unknown error");
          await deps.saveVerdict(ctx, item.id, {
            status: "failed",
            result: { reason, error: `知识蒸馏失败: ${msg}` },
          });
          result.failed += 1;
        }
      } else if (triage.verdict === "topic") {
        // 纯选题:已有跟拍候选(进池路径 source=favorites),蒸馏链无额外动作,不重复灌库。
        await deps.saveVerdict(ctx, item.id, {
          status: "topic",
          result: { reason },
        });
        result.topic += 1;
      } else {
        // skip:无沉淀价值,也无跟拍增量。
        await deps.saveVerdict(ctx, item.id, {
          status: "skip",
          result: { reason },
        });
        result.skip += 1;
      }
      result.processed += 1;
    } catch (err) {
      if(err instanceof ScheduledFlywheelSuspended)throw err;
      // 单条失败(转写 IO / 判库 AI / 落库任一)→ 标 failed(移出 NULL 批防 FIFO 头阻塞),
      // 其余继续,不崩整批。标记本身再失败也吞掉(不让台账写挂拖垮整轮)。
      const msg = err instanceof Error ? err.message : String(err ?? "unknown error");
      try {
        await deps.saveVerdict(ctx, item.id, {
          status: "failed",
          result: { error: msg },
        });
      } catch {
        /* 落库都失败:下轮该条仍在 NULL 批,会重试 */
      }
      result.failed += 1;
      result.processed += 1;
      // eslint-disable-next-line no-console
      console.error(
        `[favorites-distill] 收藏 ${item.id}(${item.awemeId}) 蒸馏失败,跳过:`,
        err,
      );
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    `[favorites-distill] 处理 ${result.processed}/${items.length} 条:知识 ${result.knowledge} · 选题 ${result.topic} · 跳过 ${result.skip} · 失败 ${result.failed}`,
  );
  return result;
}
