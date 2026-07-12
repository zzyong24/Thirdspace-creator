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
 *  - 含「明细 / 后台数据 / 完播 / 留存」类词 → `self.detail`(T-030-D8a 后台明细导出)。
 *  - 含「评论」类词 → `comments`。
 *  - 含「作品 / 指标 / 播放 / 数据」类词 → `self.metrics`。
 *  - 优先级:明细 > 评论 > 作品 —— 「明细」最具体(点名后台导出),「评论」次之,「作品/指标」
 *    最泛;一句「拉我作品的后台明细」同时含三类词 → self.detail(意图落在明细导出)。
 *  - 都不含(歧义/空)→ 默认 `self.metrics`,置信度 low(UI 可提示用户改下拉)。
 *
 * 【未来可升级】意图集合扩到 self.detail(本片已加)/ 他人对标(T-031)后,关键词分类器
 * 的边界会变糊;届时可升级为 schema 约束的 LLM 分类(Vercel generateObject 映射到同一
 * intent 枚举,合 §9 铁律)。**本片刻意不上 LLM**,只留此扩展点注释。
 *
 * Determinism:纯函数,输入定则输出定;无 I/O、无 Date.now、无随机。
 */

import { scheduledJobSourceKind } from "@creatoros/contract";
import type { PeriodCadence } from "./cadence";

// [T-258] SourceKind **从 contract 枚举 derive**(单一真值在 contract/src/primitives.ts 的
// scheduledJobSourceKind),避免这里再手抄漂移(历史上只列 3 个,漏了 benchmark/topic.daily/favorites)。
// 结构化取 zod enum 的 `_output`(zod4 里 z.infer<T> 即 T["_output"];同 scheduling.schema.ts 范式,
// 不在这个纯函数模块里直接 import z)。当前为 6 值:
//   self.metrics | comments | self.detail | benchmark | topic.daily | favorites。
export type SourceKind = (typeof scheduledJobSourceKind)["_output"];

/** 分类结果:意图 + 置信度(low 表示走了默认兜底,UI 应提示用户确认下拉)。 */
export interface IntentClassification {
  readonly sourceKind: SourceKind;
  readonly confidence: "high" | "low";
  /** 命中的关键词(可空;调试/可解释性用)。 */
  readonly matched: readonly string[];
}

// 关键词表(小写归一后匹配)。中文无需分词,直接子串包含即可。
// 明细(self.detail):点名「后台明细导出」独有的深度指标 —— 完播/留存/封面点击/跳出 等
// (这些是 D8a 明细导出才有的字段,泛「数据/指标」不算)。放最前、优先级最高。
const DETAIL_KEYWORDS = [
  "明细",
  "后台数据",
  "后台明细",
  "完播",
  "留存",
  "封面点击",
  "跳出",
  "detail",
];
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
 * 优先级 明细 > 评论 > 作品:「明细/完播/留存」最具体(点名后台导出)→ self.detail;其次评论词
 * → comments;再次作品/指标词 → self.metrics。一句「拉我作品的后台明细」三类词都含 → self.detail。
 * 无任何关键词 → 默认 self.metrics + low 置信(让 UI 提示用户校正)。
 */
export function classifyIntent(prompt: string): IntentClassification {
  const text = (prompt ?? "").toLowerCase();
  const detailHits = DETAIL_KEYWORDS.filter((k) => text.includes(k));
  const commentHits = COMMENT_KEYWORDS.filter((k) => text.includes(k));
  const metricHits = METRIC_KEYWORDS.filter((k) => text.includes(k));

  if (detailHits.length > 0) {
    return {
      sourceKind: "self.detail",
      confidence: "high",
      matched: detailHits,
    };
  }
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
}

// [T-258] 每天定时的错峰时刻常量。与后端 collection-bootstrap 的 DAILY_COLLECTION_JOB_DEFAULTS
//   cron 一一对齐(单一真源在 backend/src/modules/ai-runtime/collection-bootstrap.ts):
//   self.metrics 9:00 / self.detail 9:10 / comments 9:20 / benchmark 9:30 / topic.daily 9:40 /
//   favorites 9:50。友好频率(period/daily/HH:mm)编译回同一 cron,用户仍可在弹窗改时间(T-248)。
const CADENCE_DAILY_9: PeriodCadence = {
  mode: "period",
  unit: "daily",
  weekday: 1,
  hour: 9,
  minute: 0,
};
const CADENCE_DAILY_930: PeriodCadence = { ...CADENCE_DAILY_9, minute: 30 };
const CADENCE_DAILY_940: PeriodCadence = { ...CADENCE_DAILY_9, minute: 40 };
const CADENCE_DAILY_950: PeriodCadence = { ...CADENCE_DAILY_9, minute: 50 };

/**
 * 采集模板(SPEC §8.1)。**六张**全部可用 —— 与后端 DAILY_COLLECTION_JOB_DEFAULTS(单一真源,
 * 绑定 T-189a / 启动兜底 T-227 共用)一一对齐,让用户有「手动补建」这些定时采集 job 的入口。
 * 前三张(self.metrics/comments/self.detail)是「有 per-job 手动 target」的源;后三张
 * (benchmark/topic.daily/favorites,[T-258] 补齐)是**登记源驱动、无 per-job target**的采集器
 * (benchmark 读登记的对标源、topic.daily 纯 AI 出题、favorites 读登记的收藏夹),点卡预填后
 * 直接建 job(target={}),真正的信号靠各自「信号源」登记页配置。原「灰置占位」机制(disabled
 * 字段 + 卡片灰置分支)在 D8a 落地后已整体移除,模板卡一律可点。
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
    // T-030-D8a 已落地 —— 明细导出采集(16 字段)接通复盘核心指标,翻真(去灰置)。
    id: "daily-detail",
    title: "每天拉我的作品明细数据",
    description:
      "创作者后台明细数据(完播率/封面点击率/5s完播/2s跳出/平均时长/主页访问/粉丝增量)导出落库,喂复盘核心指标与漏斗。",
    sourceKind: "self.detail",
    prompt: "每天拉取我作品的后台明细数据(完播、封面点击、留存)",
    cadence: CADENCE_DAILY_9,
  },
  {
    // [T-258/T-212a] 对标他号爆款采集:读登记的对标源 → 抓公开作品 → detectViral 筛爆款落库,
    //   供拆解转化进选题池。信号靠「信号源→对标源」登记,无 per-job target。错峰 9:30。
    id: "daily-benchmark",
    title: "每天抓对标号的爆款作品",
    description:
      "抓你登记的对标博主主页公开作品,筛出爆款拆解后喂选题池。需先在信号源登记对标账号。",
    sourceKind: "benchmark",
    prompt: "每天抓我登记的对标博主主页的公开爆款作品",
    cadence: CADENCE_DAILY_930,
  },
  {
    // [T-258/T-235a] 每天自动出题:多依据合并(定位+评论信号+知识库+热点)→ 护栏排序 → 候选落
    //   pool(防灌库 ≤N/天)。纯 AI + 库内数据,无 per-job target;未配文本模型时诚实跳过。错峰 9:40。
    id: "daily-topic",
    title: "每天自动出题",
    description:
      "每天结合你的定位、评论信号、知识库与当下热点,自动出一批选题进选题池。需配置文本模型。",
    sourceKind: "topic.daily",
    prompt: "每天结合我的定位、评论信号、知识库和当下热点,自动出一批选题进选题池",
    cadence: CADENCE_DAILY_940,
  },
  {
    // [T-258/T-235c] 指定收藏夹采集:读登记的抖音收藏夹 → 拉夹内视频落台账 → 限量进候选池
    //   (source=favorites)作为跟拍选题。信号靠「信号源→收藏夹」登记,无 per-job target。错峰 9:50。
    id: "daily-favorites",
    title: "每天采我的指定收藏夹",
    description:
      "采集你登记的抖音指定收藏夹里的视频,作为跟拍选题候选。需先在信号源登记要采的收藏夹。",
    sourceKind: "favorites",
    prompt: "每天采集我登记的抖音指定收藏夹里的视频,作为跟拍选题候选",
    cadence: CADENCE_DAILY_950,
  },
];
