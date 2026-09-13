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
 *  - 含「明细 / 后台数据 / 完播 / 留存」类词 → `self.metrics`（同一作品数据任务）。
 *  - 含「评论」类词 → `comments`。
 *  - 含「作品 / 指标 / 播放 / 数据」类词 → `self.metrics`。
 *  - 优先级:明细 > 评论 > 作品 —— 明细仍优先，但归入统一的 `self.metrics`。
 *  - 都不含(歧义/空)→ 默认 `self.metrics`,置信度 low(UI 可提示用户改下拉)。
 *
 * 【未来可升级】意图集合扩张后可升级为 schema 约束的 LLM 分类；本片保持确定性。
 *
 * Determinism:纯函数,输入定则输出定;无 I/O、无 Date.now、无随机。
 */

import { scheduledJobSourceKind } from "@creatoros/contract";
import type { Cadence, PeriodCadence } from "./cadence";

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
// 明细词仍最具体，但 T-600 起统一映射到 self.metrics，不再产生 self.detail 调度任务。
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
 * 优先级 明细 > 评论 > 作品；明细和普通作品数据统一进入 self.metrics。
 * 无任何关键词 → 默认 self.metrics + low 置信(让 UI 提示用户校正)。
 */
export function classifyIntent(prompt: string): IntentClassification {
  const text = (prompt ?? "").toLowerCase();
  const detailHits = DETAIL_KEYWORDS.filter((k) => text.includes(k));
  const commentHits = COMMENT_KEYWORDS.filter((k) => text.includes(k));
  const metricHits = METRIC_KEYWORDS.filter((k) => text.includes(k));

  if (detailHits.length > 0) {
    return {
      sourceKind: "self.metrics",
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
  readonly cadence: Cadence;
}

// [T-258] 每天定时的错峰时刻常量。与后端 collection-bootstrap 的 DAILY_COLLECTION_JOB_DEFAULTS
//   cron 一一对齐(单一真源在 backend/src/modules/ai-runtime/collection-bootstrap.ts):
//   self.metrics 9:00 / comments 9:20 / topic.daily 9:40；内容雷达由系统固定每 15 分钟检查。
const CADENCE_DAILY_9: PeriodCadence = {
  mode: "period",
  unit: "daily",
  weekday: 1,
  hour: 9,
  minute: 0,
};
const CADENCE_DAILY_940: PeriodCadence = { ...CADENCE_DAILY_9, minute: 40 };

/**
 * 用户可创建/调整的系统预设。内容雷达 `intelligence.sync` 由系统按账号幂等建立，
 * 不进入通用新建模板；旧 benchmark/favorites 已并入内容雷达来源，不再暴露第二入口。
 * 绑定 T-189a / 启动兜底 T-227 共用)一一对齐,让用户有「手动补建」这些定时采集 job 的入口。
 * `self.metrics/comments/topic.daily` 是用户可管理模板；`self.detail`、benchmark、favorites
 * 只保留历史枚举，均不再形成独立入口。
 */
export const COLLECTION_TEMPLATES: readonly CollectionTemplate[] = [
  {
    id: "daily-self-metrics",
    title: "作品自动同步",
    description: "合并更新指标、评论、流量来源与视频内容，按作品发布时间自动调整频率。",
    sourceKind: "self.metrics",
    prompt: "增量更新作品指标、评论、流量来源及缺失的视频内容",
    cadence: { mode: "interval", unit: "hours", every: 2 },
  },
  {
    // [T-258/T-235a] 每天自动出题:多依据合并(定位+评论信号+知识库+热点)→ 护栏排序 → 候选落
    //   pool(防灌库 ≤N/天)。纯 AI + 库内数据,无 per-job target;未配文本模型时诚实跳过。错峰 9:40。
    id: "daily-topic",
    title: "每日自动生成选题",
    description:
      "每天结合你的定位、评论信号、知识库与当下热点,自动出一批选题进选题池。需配置文本模型。",
    sourceKind: "topic.daily",
    prompt: "每天结合我的定位、评论信号、知识库和当下热点,自动出一批选题进选题池",
    cadence: CADENCE_DAILY_940,
  },
];
