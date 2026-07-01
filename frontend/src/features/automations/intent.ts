/**
 * 采集意图解析 + 模板(T-030-D7,SPEC §8.2「指令 → 采集意图」)。
 *
 * 采集动作是**固定小集合**(本期 self.metrics / comments;他人对标 = T-031)。SPEC D-f 定案:
 * 模板 + 自然语言 prompt 都做,但**不引 LLM**(避 T-007 死链坑 + MiniMax 下 flaky):
 *
 *  - **模板 / 显式下拉 = 主路径**:直接带 sourceKind(0 LLM,0 歧义)。
 *  - **freeform prompt 无模板时** → `classifyIntent(prompt)`:鉴于只有 2 个固定意图,用
 *    **确定性关键词分类器**映射到 sourceKind。可靠优先、可单测、不 flaky。
 *
 * 规则(确定性):
 *  - 含「评论」类词 → `comments`。
 *  - 含「作品 / 指标 / 播放 / 数据」类词 → `self.metrics`。
 *  - 「评论」优先级高于「作品」:一句「抓我作品的评论」同时含两类词 → comments(意图落在评论)。
 *  - 都不含(歧义/空)→ 默认 `self.metrics`,置信度 low(UI 可提示用户改下拉)。
 *
 * 【未来可升级】当意图集合扩大到 self.detail(D8a)/ 他人对标(T-031)后,关键词分类器
 * 的边界会变糊;届时可升级为 schema 约束的 LLM 分类(Vercel generateObject 映射到同一
 * intent 枚举,合 §9 铁律)。**本片刻意不上 LLM**,只留此扩展点注释。
 *
 * Determinism:纯函数,输入定则输出定;无 I/O、无 Date.now、无随机。
 */

import type { PeriodCadence } from "./cadence";

// 与 contract `scheduledJobSourceKind` 枚举保持一致(唯一真值在 contract/src/primitives.ts)。
export type SourceKind = "self.metrics" | "comments";

/** 分类结果:意图 + 置信度(low 表示走了默认兜底,UI 应提示用户确认下拉)。 */
export interface IntentClassification {
  readonly sourceKind: SourceKind;
  readonly confidence: "high" | "low";
  /** 命中的关键词(可空;调试/可解释性用)。 */
  readonly matched: readonly string[];
}

// 关键词表(小写归一后匹配)。中文无需分词,直接子串包含即可。
const COMMENT_KEYWORDS = ["评论", "留言", "comment"];
const METRIC_KEYWORDS = [
  "作品",
  "指标",
  "播放",
  "数据",
  "视频",
  "主页",
  "点赞",
  "涨粉",
  "粉丝",
  "metric",
];

/**
 * freeform prompt → 采集意图(确定性关键词分类)。
 *
 * 「评论」优先:一句同时含评论词与作品词(如「抓我作品的最新评论」)时,意图落在评论。
 * 无任何关键词 → 默认 self.metrics + low 置信(让 UI 提示用户校正)。
 */
export function classifyIntent(prompt: string): IntentClassification {
  const text = (prompt ?? "").toLowerCase();
  const commentHits = COMMENT_KEYWORDS.filter((k) => text.includes(k));
  const metricHits = METRIC_KEYWORDS.filter((k) => text.includes(k));

  if (commentHits.length > 0) {
    return { sourceKind: "comments", confidence: "high", matched: commentHits };
  }
  if (metricHits.length > 0) {
    return {
      sourceKind: "self.metrics",
      confidence: "high",
      matched: metricHits,
    };
  }
  // 歧义 / 空 → 默认 self.metrics,低置信(UI 提示用户从下拉确认)。
  return { sourceKind: "self.metrics", confidence: "low", matched: [] };
}

// ── 从模板入手(SPEC §8.1「从模板入手」)────────────────────────────────────────

/** 一张模板卡:点它 → 打开新建弹窗并预填 {name, prompt, sourceKind, cadence}。 */
export interface CollectionTemplate {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly sourceKind: SourceKind;
  /** 预填的自然语言提示词(承接 scheduled_job.prompt)。 */
  readonly prompt: string;
  /** 预填的友好频率(编译成 cron 存 schedule)。 */
  readonly cadence: PeriodCadence;
  /** 灰置(如 D8a 明细模板未落地),点了不打开弹窗。 */
  readonly disabled?: boolean;
}

const CADENCE_DAILY_9: PeriodCadence = {
  mode: "period",
  unit: "daily",
  weekday: 1,
  hour: 9,
  minute: 0,
};

/**
 * 采集模板(SPEC §8.1)。前两张真做;明细数据模板(D8a)先灰置占位(点不动),
 * 待 D8a 落地后翻真。
 */
export const COLLECTION_TEMPLATES: readonly CollectionTemplate[] = [
  {
    id: "daily-self-metrics",
    title: "每天抓我的新作品指标",
    description: "每天定时刷新主页作品与播放/点赞/评论等指标快照,喂 Dashboard 与选题。",
    sourceKind: "self.metrics",
    prompt: "每天抓我主页的新作品和最新指标",
    cadence: CADENCE_DAILY_9,
  },
  {
    id: "daily-comments",
    title: "每天抓我作品的最新评论",
    description: "每天定时拉取作品最新评论,落库供复盘与受众洞察消费。",
    sourceKind: "comments",
    prompt: "每天抓我所有作品的最新评论",
    cadence: CADENCE_DAILY_9,
  },
  {
    // D8a(明细数据导出采集)后补 —— 先灰置占位,点不动。
    id: "daily-detail",
    title: "每天拉我的作品明细数据",
    description: "创作者后台明细数据(完播/CTR/留存等)—— 采集接线中,敬请期待(D8a)。",
    sourceKind: "self.metrics",
    prompt: "每天拉取我作品的后台明细数据",
    cadence: CADENCE_DAILY_9,
    disabled: true,
  },
];
