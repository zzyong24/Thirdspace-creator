import type { RequestContext } from "@creatoros/contract";
import type { ModelSpec, TopicAttributionOutput } from "@creatoros/ai-worker";

// [T-235d] 正向归因回流(选题验证库,复盘→出题闭环;SPEC 2026-07-11 daily-topic-autopilot §2.4)。
//
// 两件事,都住在本文件(仿 benchmark-teardown-runner 形态):
//   ① 归因编排 `runTopicAttribution(ctx, deps)`:读**已发布作品**(publication)→ 逐条判
//      「有新指标 + 有真逐字稿 + 未归因」→ 表现分层(**相对本账号基线**,纯函数)→ AI 归因
//      (枚举化字段)→ saveAttribution 落 topic_attributions(幂等锚 publication_id)→
//      next_experiments ≤3/run 转化进候选池(title 前缀「实验|」,card.attributionId 溯源)。
//      全部经**注入端口**,纯编排可 fake 测(不碰真 AI、真库)。
//   ② AI 归因端口工厂 `createTopicAttributionPort`:用 **runStructuredNode**(generateObject 绑
//      topic.attribution 的 Zod outputSchema)真跑归因节点。host(persistence-client)用它装配
//      deps.attribute;单测注 fake 不走这条。
//
// 铁律:
//   - **无稿不产**(T-224 诚实门同源):作品无真逐字稿 → 跳过 + 诚实计数,绝不让模型脱稿编归因。
//   - **相对本账号基线分层**:播放(回退赞)相对账号均值的倍数 ≥viralMultiple(默认 3)= viral /
//     ≤lowMultiple(默认 0.5)= low / 其余 normal;无基线 → normal + ratio null(诚实中性,不编)。
//     绝不抄 dy-- 的绝对阈值(赞≥100)。
//   - 未配文本模型 → 诚实跳过(message 注明,不空转不编)。
//   - 幂等:publication_id 已有归因 → skip(不重跑、不灌库);重活 best-effort,单条失败跳过不崩整批。
//   - [gate-F1] 零 learnings 接触:本 runner 不读不写 learnings(选题维度 ≠ 脚本级),由发布实绩
//     (self.detail 采集尾)触发,不由复盘触发。
//   - 结构化输出(generateObject 绑 Zod 枚举,gate-F3),绝不自由文本 parse。

/** 表现分层(相对本账号基线)。 */
export type PerformanceTier = "viral" | "normal" | "low";

/** 分层阈值(配置化;host 可经 env 覆盖)。 */
export interface TierThresholds {
  /** 播放/赞相对账号均值 ≥ 此倍数 → viral(默认 3)。 */
  viralMultiple?: number;
  /** ≤ 此倍数 → low(默认 0.5)。 */
  lowMultiple?: number;
}

/** 本账号基线(账号已发布作品的均值;host 从 analytics rollup 算)。null = 无任何快照(无基线)。 */
export interface AccountBaseline {
  avgPlays: number | null;
  avgLikes: number | null;
}

/** 一条作品的关键指标投影(host 从最新 metric_snapshot rawMetrics 抽;plays 归一 views??plays)。 */
export interface WorkMetrics {
  plays: number | null;
  likes: number | null;
  /** 其余原始明细指标(完播/封面点击等),进 workBrief + raw 溯源。 */
  raw: Record<string, number>;
}

/**
 * 表现分层纯函数:播放相对账号平均播放的倍数优先;播放侧无值 → 回退赞相对平均赞;
 * 两侧都算不出(无基线/无指标/基线为 0)→ normal + ratio null(诚实中性,不硬编)。
 */
export function classifyPerformanceTier(
  metrics: Pick<WorkMetrics, "plays" | "likes">,
  baseline: AccountBaseline | null,
  thresholds?: TierThresholds,
): { tier: PerformanceTier; ratio: number | null } {
  const viralAt = thresholds?.viralMultiple ?? 3;
  const lowAt = thresholds?.lowMultiple ?? 0.5;
  let ratio: number | null = null;
  if (baseline) {
    if (
      metrics.plays != null &&
      baseline.avgPlays != null &&
      baseline.avgPlays > 0
    ) {
      ratio = metrics.plays / baseline.avgPlays;
    } else if (
      metrics.likes != null &&
      baseline.avgLikes != null &&
      baseline.avgLikes > 0
    ) {
      ratio = metrics.likes / baseline.avgLikes;
    }
  }
  if (ratio == null) return { tier: "normal", ratio: null };
  if (ratio >= viralAt) return { tier: "viral", ratio };
  if (ratio <= lowAt) return { tier: "low", ratio };
  return { tier: "normal", ratio };
}

const TIER_LABEL: Record<PerformanceTier, string> = {
  viral: "爆款",
  normal: "常规",
  low: "低表现",
};

/** 指标键 → 中文标签(workBrief 可读化;未知键原样透出,诚实)。与 dashboard/复盘同口径。 */
const METRIC_LABELS: Record<string, string> = {
  views: "播放",
  plays: "播放",
  likes: "点赞",
  comments: "评论",
  shares: "转发",
  favorites: "收藏",
  finish_rate: "完播率",
  ctr: "封面点击率",
  follower_gain: "涨粉",
  avg_play_duration: "平均播放时长",
};

/** 作品 brief facet(标题 + 程序算好的表现分层 + 真实明细指标,逐行)。纯函数可单测。 */
export function attributionWorkBrief(
  title: string,
  tier: PerformanceTier,
  ratio: number | null,
  metrics: WorkMetrics,
): string {
  const lines: string[] = [
    `· 标题：${title || "（无标题）"}`,
    `· 表现分层：${TIER_LABEL[tier]}` +
      (ratio != null
        ? `（相对本账号基线 ${ratio.toFixed(1)}x）`
        : "（本账号暂无基线，按常规处理）"),
  ];
  // views/plays 同义归一只呈现一次(views 真采集优先)。
  const raw = { ...metrics.raw };
  if ("views" in raw && "plays" in raw) delete raw.plays;
  for (const [k, v] of Object.entries(raw)) {
    lines.push(`· ${METRIC_LABELS[k] ?? k}：${v}`);
  }
  return lines.join("\n");
}

/** 一条待归因作品(host 从 publication 目录投影;projectId 由 host 解析,缺 → 无逐字稿跳过)。 */
export interface AttributableWork {
  publicationId: string;
  projectId: string | null;
  title: string;
}

/** AI 归因端口:作品材料(brief+真逐字稿+定位)→ 枚举化归因输出。 */
export type TopicAttributionPort = (
  ctx: RequestContext,
  input: { workBrief: string; transcript: string; positioningBrief: string },
) => Promise<TopicAttributionOutput>;

export interface TopicAttributionDeps {
  /** 未配文本模型 → false → 整轮诚实跳过(不逐条空转)。host 用 resolveModelSpec try/catch 绑。 */
  isModelConfigured: (ctx: RequestContext) => Promise<boolean>;
  /** 候选作品清单(近期已发布 + 可见,host 绑 publishing 目录读法;上限 scanLimit)。 */
  listWorks: (ctx: RequestContext, limit: number) => Promise<AttributableWork[]>;
  /** 幂等锚:该作品已有归因 → skip(host 绑 topicAttributionService.hasAttribution)。 */
  hasAttribution: (
    ctx: RequestContext,
    publicationId: string,
  ) => Promise<boolean>;
  /** 该作品真逐字稿(output_script contentData.transcript,T-225 管线)。无稿 → 空串 → 跳过。 */
  getTranscript: (ctx: RequestContext, projectId: string) => Promise<string>;
  /** 该作品最新明细指标(最新 metric_snapshot rawMetrics)。无快照 → null → 跳过(无新指标不归因)。 */
  getMetrics: (
    ctx: RequestContext,
    publicationId: string,
  ) => Promise<WorkMetrics | null>;
  /** 本账号基线(已发布作品播放/赞均值,analytics 现成数据)。无快照 → null(分层退 normal)。 */
  getAccountBaseline: (ctx: RequestContext) => Promise<AccountBaseline | null>;
  /** 本账号定位简报(空 → 模板兜底)。 */
  getPositioningBrief: (ctx: RequestContext) => Promise<string>;
  /** AI 归因端口(真件见 createTopicAttributionPort;测试注 fake)。 */
  attribute: TopicAttributionPort;
  /** 归因落库(upsert 幂等)。返回 { id }(实验候选 card.attributionId 溯源锚)。 */
  saveAttribution: (
    ctx: RequestContext,
    input: {
      publicationId: string;
      projectId: string | null;
      performanceTier: PerformanceTier;
      baselineRatio: number | null;
      topicType: string;
      hookType: string;
      structureFormula: string;
      whyWorked: string;
      whyFailed: string;
      reusableFormula: string;
      raw: Record<string, unknown>;
    },
  ) => Promise<{ id: string }>;
  /** 实验候选进池(host 绑 candidateService.createCandidate + card.attributionId patch)。 */
  createExperimentCandidate: (
    ctx: RequestContext,
    input: { title: string; angle: string; attributionId: string },
  ) => Promise<{ id: string }>;
  /**
   * [T-284b G2 / T-284c G3-A] 可复用公式回流:reusable_formula 非空且有逐字稿依据时,capture 成
   * 一条 learning(复用 learnings 管线,不造第二条通道)。host 绑 learningsService.createLearning。
   * evidenceStrength='grounded' → 该 learning 直接 validated 自动进生成(attribution 天然扎在真实
   * 发布数据上:有逐字稿依据 + ≥groundingMinMetrics 条真实指标)。可选(best-effort,不崩批;
   * 未绑 → 不回流,归因照落库)。
   */
  createLearning?: (
    ctx: RequestContext,
    input: {
      title: string;
      insight: string;
      learningType?: string;
      evidenceStrength: "grounded" | null;
    },
  ) => Promise<void>;
  /** [T-284c G3-A] grounded 判据阈值 N:真实指标条数下限(host 经 env 配置化;默认 1)。 */
  groundingMinMetrics?: number;
  /** 单轮最多归因几条作品(默认 3,控 token;host 经 env 配置化)。 */
  maxWorksPerRun?: number;
  /** 单轮最多几条实验候选进池(默认 3,防灌库,SPEC)。全 run 全局上限。 */
  maxExperimentsPerRun?: number;
  /** 候选作品扫描上限(默认 50;已归因/无稿的会被跳过,扫描窗口要比 maxWorks 大)。 */
  scanLimit?: number;
  /** 分层阈值(配置化)。 */
  tierThresholds?: TierThresholds;
}

export interface TopicAttributionResult {
  /** 本轮成功归因落库的作品数。 */
  attributed: number;
  /** 本轮转化进池的实验候选数(title 前缀「实验|」)。 */
  experimentsPromoted: number;
  /** 跳过:已归因(幂等锚命中)。 */
  skippedAttributed: number;
  /** 跳过:无真逐字稿(无稿不产,T-224 诚实门)。 */
  skippedNoTranscript: number;
  /** 跳过:无指标快照(没新数据不归因)。 */
  skippedNoMetrics: number;
  /** 诚实一句话说明(未配模型/空跑等)。 */
  message?: string;
}

/** 实验候选标题:前缀「实验|」(参照 T-235b「🔥跟拍|」先例,复用 title 字段表达,不加列)。 */
export function experimentTitle(title: string): string {
  return `实验|${title.trim()}`;
}

/** 实验候选 angle:实验假设 + 归因引用 provenance(可溯源;详情在 card.attributionId 指向的归因行)。 */
export function experimentAngle(
  angle: string,
  source: { workTitle: string; tier: PerformanceTier; attributionId: string },
): string {
  const ref = `来源:正向归因回流 —— 依据本账号作品「${source.workTitle}」(${TIER_LABEL[source.tier]})的归因结论(归因 ${source.attributionId},点开候选卡可看依据)。`;
  const a = (angle || "").trim();
  return a ? `${a}\n\n${ref}` : ref;
}

/**
 * AI 归因端口真件工厂 —— 用 runStructuredNode 跑 topic.attribution 结构化节点(generateObject 绑
 * registry 里该 skill 的 Zod outputSchema,gate-F3 枚举每轮 schema 约束)。host 用它装 deps.attribute。
 */
export interface AiAttributionDeps {
  /** 按 capability 解析用户配的 model(Vercel SDK)。 */
  resolveModelSpec: (
    ctx: RequestContext,
    capability: string,
  ) => Promise<ModelSpec>;
}

export function createTopicAttributionPort(
  deps: AiAttributionDeps,
): TopicAttributionPort {
  return async (ctx, input) => {
    const spec = await deps.resolveModelSpec(ctx, "topic.attribution");
    // outputSchema 不手传 —— runStructuredNode 从 registry 取(SPEC §4.2 统一防发散入口)。
    // getTemplate 取运行时被覆盖后的模板(skill_config_overrides 生效)。
    const { modelFor, runStructuredNode, getTemplate } = await import(
      "@creatoros/ai-worker"
    );
    const { object } = await runStructuredNode<TopicAttributionOutput>({
      model: modelFor(spec),
      template: getTemplate("topic.attribution"),
      facets: {
        positioning:
          input.positioningBrief ||
          "（本账号尚未设置定位——按通用短视频逻辑归因，实验选题给通用可迁移角度）",
        workBrief: input.workBrief,
        transcript: input.transcript,
      },
    });
    return object;
  };
}

/**
 * 归因编排:列近期已发布作品 → 逐条(未归因 + 有指标 + 有真逐字稿)→ 分层 → AI 归因 →
 * 落库 → 实验候选 ≤3/run 进池。返回诚实计数。best-effort:单条失败跳过不崩整批(不落库,下轮重试)。
 */
export async function runTopicAttribution(
  ctx: RequestContext,
  deps: TopicAttributionDeps,
): Promise<TopicAttributionResult> {
  const maxWorks = deps.maxWorksPerRun ?? 3;
  const maxExperiments = deps.maxExperimentsPerRun ?? 3;
  const scanLimit = deps.scanLimit ?? 50;

  const result: TopicAttributionResult = {
    attributed: 0,
    experimentsPromoted: 0,
    skippedAttributed: 0,
    skippedNoTranscript: 0,
    skippedNoMetrics: 0,
  };

  // 未配文本模型 → 整轮诚实跳过(不逐条空转、不编)。
  if (!(await deps.isModelConfigured(ctx))) {
    result.message = "未配文本模型,跳过归因";
    console.log(`[topic-attribution] ${result.message}`);
    return result;
  }

  const works = await deps.listWorks(ctx, scanLimit);
  if (works.length === 0) {
    result.message = "无已发布作品,无可归因";
    return result;
  }

  // 基线读一次(全批共用);读失败降级 null(分层退 normal + ratio null,诚实不编)。
  let baseline: AccountBaseline | null = null;
  try {
    baseline = await deps.getAccountBaseline(ctx);
  } catch {
    baseline = null;
  }
  // 定位读一次(全批共用);读失败降级空串(模板有通用兜底)。
  let positioningBrief = "";
  try {
    positioningBrief = await deps.getPositioningBrief(ctx);
  } catch {
    positioningBrief = "";
  }

  for (const work of works) {
    if (result.attributed >= maxWorks) break; // 单轮上限(省 token)
    try {
      // 幂等锚:已归因 → skip(不重跑)。
      if (await deps.hasAttribution(ctx, work.publicationId)) {
        result.skippedAttributed += 1;
        continue;
      }
      // 无新指标(一条快照都没有)→ 不归因(数据没到,下轮采集后再来)。
      const metrics = await deps.getMetrics(ctx, work.publicationId);
      if (!metrics) {
        result.skippedNoMetrics += 1;
        continue;
      }
      // 无稿不产(T-224 诚实门):无项目锚 / 无真逐字稿 → 跳过 + 诚实计数。
      const transcript = work.projectId
        ? (await deps.getTranscript(ctx, work.projectId)).trim()
        : "";
      if (!transcript) {
        result.skippedNoTranscript += 1;
        continue;
      }

      // 表现分层(相对本账号基线,纯函数)。
      const { tier, ratio } = classifyPerformanceTier(
        metrics,
        baseline,
        deps.tierThresholds,
      );
      const workBrief = attributionWorkBrief(work.title, tier, ratio, metrics);

      // AI 归因(runStructuredNode 绑 gate-F3 枚举 schema;抛错 → 本条跳过,不落库,下轮重试)。
      const out = await deps.attribute(ctx, {
        workBrief,
        transcript,
        positioningBrief,
      });

      // 落库(upsert 幂等;raw 带完整产出 + 分层依据 + 指标快照,溯源)。
      const saved = await deps.saveAttribution(ctx, {
        publicationId: work.publicationId,
        projectId: work.projectId,
        performanceTier: tier,
        baselineRatio: ratio,
        topicType: out.topic_type,
        hookType: out.hook_type,
        structureFormula: out.structure_formula,
        whyWorked: out.why_it_worked,
        whyFailed: out.why_it_failed,
        reusableFormula: out.reusable_formula,
        raw: {
          output: out,
          metrics: metrics.raw,
          baseline,
          tierRatio: ratio,
        },
      });
      result.attributed += 1;

      // [T-284b G2 / T-284c G3-A] 可复用公式回流成 learning(复用 learnings 管线,不造第二条通道)。
      // reusable_formula 非空且有逐字稿依据(transcript 到此必非空)才产;来源尾注拼进 insight
      // (learnings 无 sourceNote 字段,仿 captureEditDelta 惯例)。attribution 天然 grounded:
      // 有逐字稿依据 + ≥N 条真实指标 → evidenceStrength='grounded' → 该 learning 直接 validated 自动
      // 进生成。best-effort:创建失败只丢该条经验(归因已落库是真的),不崩整批。
      if (deps.createLearning) {
        const formula = (out.reusable_formula ?? "").trim();
        if (formula) {
          const minMetrics = deps.groundingMinMetrics ?? 1;
          const metricCount = Object.keys(metrics.raw).length;
          const grounded = transcript.length > 0 && metricCount >= minMetrics;
          const why = (out.why_it_worked ?? "").trim();
          try {
            await deps.createLearning(ctx, {
              title: formula.slice(0, 120),
              insight: `${why ? `${why}\n` : ""}(来源:归因 attributionId=${saved.id})`,
              // 可复用公式 = 本账号被验证过的转化/复用模式,归 conversion_pattern 枚举。
              learningType: "conversion_pattern",
              evidenceStrength: grounded ? "grounded" : null,
            });
          } catch (err) {
            console.error(
              `[topic-attribution] 可复用公式回流 learning 失败(跳过该条,归因已落库):${formula}`,
              err,
            );
          }
        }
      }

      // next_experiments → 候选池(≤maxExperiments/run 全局防灌库;空 title 不进池)。
      // 单条进池失败只丢该条(归因已落是真的),不崩整批。
      for (const exp of out.next_experiments) {
        if (result.experimentsPromoted >= maxExperiments) break;
        const title = exp.title.trim();
        if (!title) continue;
        try {
          await deps.createExperimentCandidate(ctx, {
            title: experimentTitle(title),
            angle: experimentAngle(exp.angle, {
              workTitle: work.title,
              tier,
              attributionId: saved.id,
            }),
            attributionId: saved.id,
          });
          result.experimentsPromoted += 1;
        } catch (err) {
          console.error(
            `[topic-attribution] 实验候选进池失败(跳过该条):${title}`,
            err,
          );
        }
      }
    } catch (err) {
      // 单条失败(读稿/指标/AI/落库任一)→ 跳过,不崩整批;未落库的下轮自然重试。
      console.error(
        `[topic-attribution] 作品 ${work.publicationId} 归因失败,跳过:`,
        err,
      );
    }
  }

  result.message =
    `归因 ${result.attributed} 条(实验候选进池 ${result.experimentsPromoted})` +
    `;跳过:已归因 ${result.skippedAttributed}、无逐字稿 ${result.skippedNoTranscript}、无指标 ${result.skippedNoMetrics}`;
  console.log(`[topic-attribution] ${result.message}`);
  return result;
}
