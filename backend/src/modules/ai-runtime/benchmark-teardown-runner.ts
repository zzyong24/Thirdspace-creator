import type { RequestContext } from "@creatoros/contract";
import type { ModelSpec, BenchmarkTeardownOutput } from "@creatoros/ai-worker";
import type { PendingViralWork } from "../benchmark";

// [T-212c] 对标爆款拆解 → 自动转化进选题池（补 learn-from 缺的闭环，SPEC 2026-07-11 §2.3）。
//
// 两件事，都住在本文件：
//   ① 转化编排 `runBenchmarkTeardown(ctx, deps)`：读**待拆的爆款对标作品**（is_viral=true 且
//      teardown_status=pending）→ 逐条 AI 拆解 → **高适配转化选题** createCandidate（source=benchmark，
//      参考链接=原视频 url + 爆款倍数入 angle）→ 拆完置 teardown_status=done（幂等，不重拆）。
//      全部经**注入端口**（listPendingViralWorks / getPositioningBrief / teardown / createCandidate /
//      markTeardownDone），故纯编排可 fake 测（不碰真 AI、真库）。
//   ② AI 拆解端口工厂 `createBenchmarkTeardownPort`：用 **runStructuredNode**（generateObject 绑
//      benchmark.teardown 的 Zod outputSchema，每轮 schema 约束 + 跨模型文本兜底）真跑拆解节点。
//      host（persistence-client）用它装配 deps.teardown；单测注 fake teardown 端口不走这条。
//
// 铁律（同 benchmark-collector / calibration-score-runner）：
//   - 结构化输出（generateObject 绑 Zod），**绝不自由文本 parse**（SPEC §3 边界）。
//   - 硬约束「不抄袭，同需求换本账号角度」写进 benchmark.teardown 模板 system（模板层保证）。
//   - 防灌库：单次转化 ≤ maxPromotePerRun（默认 3）条候选；单次处理 ≤ maxWorksPerRun（默认 3）条作品。
//   - best-effort：单条作品拆解/转化失败 → 记日志 + 跳过（不标 done，下次重试），不崩整批。
//   - 只**消费** T-212a/b 建的 benchmark 表（读 pending、写 teardown_status），不改表结构。

/** AI 拆解端口：一条待拆爆款作品 + 本账号定位 → 结构化拆解输出（换角度转化选题在内）。 */
export type BenchmarkTeardownPort = (
  ctx: RequestContext,
  input: { work: PendingViralWork; positioningBrief: string },
) => Promise<BenchmarkTeardownOutput>;

export interface BenchmarkTeardownDeps {
  /** 列该 ctx（含号）待拆的爆款作品（is_viral+pending），上限 limit。host 绑 benchmarkService.listPendingViralWorks。 */
  listPendingViralWorks: (
    ctx: RequestContext,
    limit: number,
  ) => Promise<PendingViralWork[]>;
  /** 本账号定位简报（空 → 拆解模板兜底通用逻辑）。host 绑 positioning reader；测试注 fake。 */
  getPositioningBrief: (ctx: RequestContext) => Promise<string>;
  /** AI 拆解端口（真件见 createBenchmarkTeardownPort；测试注 fake）。 */
  teardown: BenchmarkTeardownPort;
  /** 高适配转化选题 → 候选池（source=benchmark）。host 绑 candidateService.createCandidate。 */
  createCandidate: (
    ctx: RequestContext,
    input: { title: string; angle: string; source: "benchmark" },
  ) => Promise<{ id: string }>;
  /** 置一条作品拆解完成（teardown_status=done，幂等防重拆）。host 绑 benchmarkService.markTeardownDone。 */
  markTeardownDone: (ctx: RequestContext, workId: string) => Promise<void>;
  /** 单次处理几条待拆作品（默认 3，控 token + 防灌库）。 */
  maxWorksPerRun?: number;
  /** 单次最多转化几条高适配候选（默认 3，防灌库）。全 run 全局上限。 */
  maxPromotePerRun?: number;
}

export interface BenchmarkTeardownResult {
  /** 本次成功拆解并标 done 的作品数。 */
  worksProcessed: number;
  /** 本次转化进候选池的选题数（source=benchmark）。 */
  promoted: number;
}

/** 对标作品 → 原视频链接（参考链接）。douyin 用标准视频 URL；其它平台暂无规则回退作品 id。 */
export function benchmarkVideoUrl(platform: string, awemeId: string): string {
  if (platform === "douyin") return `https://www.douyin.com/video/${awemeId}`;
  return awemeId;
}

/** [T-235b] 黑马雷达发现的作品(discovery=darkhorse):时效敏感,拆解/转化都要带跟拍语义。 */
function isDarkhorse(work: PendingViralWork): boolean {
  return work.discovery === "darkhorse";
}

/** 转化选题的 angle 附上参考链接 + 爆款倍数（provenance —— 候选表无独立 metadata 字段，落 angle）。
 *  [T-235b] 黑马作品:倍数语义=赞粉比,并注明跟拍窗口(时效敏感,建议今明两天拍)。 */
function buildAngle(angle: string, work: PendingViralWork): string {
  const url = benchmarkVideoUrl(work.platform, work.awemeId);
  const dark = isDarkhorse(work);
  const mult =
    work.viralMultiple != null
      ? dark
        ? `，赞粉比 ${work.viralMultiple.toFixed(1)}`
        : `，爆款倍数 ${work.viralMultiple.toFixed(1)}x`
      : "";
  const ref = `参考对标爆款：${url}${mult}（对标 sec_uid ${work.sourceExternalAccountId}）`;
  const timeliness = dark
    ? `\n🔥跟拍时效：低粉黑马雷达发现（关键词「${work.discoveryKeyword ?? ""}」），跟拍窗口约 48h 正在关闭，建议今明两天拍。`
    : "";
  const a = (angle || "").trim();
  return (a ? `${a}\n\n${ref}` : ref) + timeliness;
}

/** 对标作品 → benchmark.teardown 的 benchmarkBrief facet（标题 + 数据 + 爆款倍数，逐行）。
 *  [T-235b] 黑马作品(discovery=darkhorse)additive 注入:倍数改赞粉比语义 + 作者粉丝 +
 *  发现关键词 + **时效敏感提示**(跟拍窗口关闭中,prompt 层让拆解带跟拍视角,模板不改)。 */
export function benchmarkBrief(work: PendingViralWork): string {
  const dark = isDarkhorse(work);
  const lines: Array<string | null> = [
    `· 标题：${work.description || "（无标题）"}`,
    `· 点赞：${work.diggCount}`,
    work.commentCount != null ? `· 评论：${work.commentCount}` : null,
    work.collectCount != null ? `· 收藏：${work.collectCount}` : null,
    work.shareCount != null ? `· 转发：${work.shareCount}` : null,
    work.duration != null ? `· 时长：${Math.round(work.duration / 1000)}s` : null,
    work.viralMultiple != null
      ? dark
        ? `· 赞粉比：${work.viralMultiple.toFixed(1)}（点赞/粉丝，≥1 = 算法在推内容本身而非账号权重）`
        : `· 爆款倍数：${work.viralMultiple.toFixed(1)}x（相对该源样本中位数越高越突出）`
      : null,
    dark && work.authorFollowerCount != null
      ? `· 作者粉丝：${work.authorFollowerCount}（低粉账号）`
      : null,
    dark
      ? `· 发现方式：低粉黑马雷达（搜索关键词「${work.discoveryKeyword ?? ""}」命中）`
      : null,
    dark
      ? "· ⚠️ 时效敏感：低粉+近 48h+高赞 = 选题/形式刚被算法验证，**跟拍窗口正在关闭**。拆解请给「一个人+手机能当天复刻」的跟拍角度；需要道具/场地/团队的标 fit 从严。"
      : null,
  ];
  return lines.filter((l): l is string => Boolean(l)).join("\n");
}

/** 拆解 facets：positioning（本账号定位，空则兜底）· benchmarkBrief（对标爆款作品）。 */
export function teardownFacets(
  positioningBrief: string,
  work: PendingViralWork,
): Record<string, string | undefined> {
  return {
    positioning:
      positioningBrief ||
      "（本账号尚未设置定位——按通用爆款逻辑拆解，转化选题给通用可迁移角度，fit 从严）",
    benchmarkBrief: benchmarkBrief(work),
  };
}

/**
 * AI 拆解端口真件工厂 —— 用 runStructuredNode 跑 benchmark.teardown 结构化节点（generateObject 绑
 * registry 里该 skill 的 Zod outputSchema，每轮 schema 约束 + 跨模型文本兜底）。host 用它装 deps.teardown。
 */
export interface AiTeardownDeps {
  /** 按 capability 解析用户配的 model（Vercel SDK）。 */
  resolveModelSpec: (
    ctx: RequestContext,
    capability: string,
  ) => Promise<ModelSpec>;
}

export function createBenchmarkTeardownPort(
  deps: AiTeardownDeps,
): BenchmarkTeardownPort {
  return async (ctx, input) => {
    const spec = await deps.resolveModelSpec(ctx, "benchmark.teardown");
    // outputSchema 不手传 —— runStructuredNode 从 registry 取（SPEC §4.2 统一防发散入口，还吃
    // JSON Schema 配置覆盖）。getTemplate 取运行时被覆盖后的模板（skill_config_overrides 生效）。
    const { modelFor, runStructuredNode, getTemplate } = await import(
      "@creatoros/ai-worker"
    );
    const { object } = await runStructuredNode<BenchmarkTeardownOutput>({
      model: modelFor(spec),
      template: getTemplate("benchmark.teardown"),
      facets: teardownFacets(input.positioningBrief, input.work),
    });
    return object;
  };
}

/**
 * 转化编排：读待拆爆款 → 逐条拆解 → 高适配转化进选题池 → 标 done（幂等）。返回诊断计数。
 * 无待拆作品 → 直接返回 0（诚实空跑，非失败）。best-effort：单条失败跳过、不崩整批、不标 done（重试）。
 */
export async function runBenchmarkTeardown(
  ctx: RequestContext,
  deps: BenchmarkTeardownDeps,
): Promise<BenchmarkTeardownResult> {
  const maxWorks = deps.maxWorksPerRun ?? 3;
  const maxPromote = deps.maxPromotePerRun ?? 3;

  const works = await deps.listPendingViralWorks(ctx, maxWorks);
  if (works.length === 0) {
    return { worksProcessed: 0, promoted: 0 };
  }

  // 定位读一次（全批共用）；读失败降级空串（拆解模板有通用兜底，不阻塞）。
  let positioningBrief = "";
  try {
    positioningBrief = await deps.getPositioningBrief(ctx);
  } catch {
    positioningBrief = "";
  }

  let worksProcessed = 0;
  let promoted = 0;

  // works 已按爆款倍数降序（最突出的先拆、先占转化名额）。
  for (const work of works) {
    try {
      const teardown = await deps.teardown(ctx, { work, positioningBrief });
      // 只转化 fit=high 且有标题的选题（medium/low 仅在拆解里记录，不进池 —— 防灌库 + 保质）。
      const highFit = teardown.转化选题.filter(
        (t) => t.fit === "high" && t.title.trim().length > 0,
      );
      for (const topic of highFit) {
        if (promoted >= maxPromote) break; // 全局转化上限（防灌库）
        // [T-235b] 黑马转化候选标注跟拍时效:title 前缀「🔥跟拍|」(darkhorse.py 同款,复用现有
        // title 字段表达,不加列);详情(窗口/赞粉比)在 angle 的 provenance 段。
        const title = isDarkhorse(work)
          ? `🔥跟拍|${topic.title.trim()}`
          : topic.title.trim();
        await deps.createCandidate(ctx, {
          title,
          angle: buildAngle(topic.angle, work),
          source: "benchmark",
        });
        promoted += 1;
      }
      // 拆完置 done（即便 0 高适配也标 —— 已分析过，不重拆）。幂等。
      await deps.markTeardownDone(ctx, work.id);
      worksProcessed += 1;
    } catch (err) {
      // 单条失败（AI 拆解/转化/标记任一）→ 跳过，不标 done（下次重试），不崩整批。
      // eslint-disable-next-line no-console
      console.error(
        `[benchmark-teardown] 作品 ${work.id}(${work.awemeId}) 拆解转化失败,跳过:`,
        err,
      );
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    `[benchmark-teardown] 处理 ${worksProcessed}/${works.length} 条待拆作品,转化 ${promoted} 条选题进池`,
  );
  return { worksProcessed, promoted };
}
