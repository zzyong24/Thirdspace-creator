import "server-only";

import { client as defaultClient } from "@/lib/contract-client.server";

/**
 * 经验裁决台 读侧装配(T-062a · SPEC §2.1)。
 *
 * `/experience` 的 ViewModel 全部来自真 op:
 *
 *   - `learnings.list`               → candidate 裁决队列(createdAt 倒序)+
 *                                      validated 已验证库 + discarded 折叠区;
 *   - `calibration.suggestions.list` → 已回流校准的 learningId 集合(pending 建议),
 *                                      用于 validated 卡的「已回流」徽章与第三张汇总卡。
 *
 * 诚实规范(SPEC §6.2):
 *   - `learnings.list` 读失败 → `loadError: true`,页面渲染错误态,绝不 fixture 兜底;
 *   - 空 candidate 队列 → 页面渲染诚实空态;
 *   - 「已回流校准」读侧只有 PENDING 建议(采纳/驳回后从 list 消失,见
 *     calibration.service listRuleSuggestions 注释),所以第三张卡计的是
 *     「已回流·待采纳」的真值;该读失败时值为 null → 页面显「—」。
 *
 * contract client 注入为可换 seam,单测不需要真 in-process backend。
 */

// ---------------------------------------------------------------------------
// ViewModel 类型(页面 + 岛共用;experience-page.tsx re-export 给渲染层)
// ---------------------------------------------------------------------------

/** learningType 枚举(同 contract learningResource)。[T-183] 增 edit_delta 改稿信号源。 */
export type LearningTypeKey =
  | "strategy"
  | "hook"
  | "structure"
  | "failure"
  | "process"
  | "editing"
  | "conversion_pattern"
  | "offer_insight"
  | "edit_delta";

/** 单条 Learning 的渲染视图 —— 字段全部来自 learningResource 真值。 */
export interface LearningVm {
  readonly id: string;
  readonly title: string;
  readonly insight: string;
  readonly learningType: LearningTypeKey;
  readonly validationStatus: "candidate" | "validated" | "discarded";
  readonly confidenceScore: number;
  /** 被 N 个项目应用(learningApplications 服务端聚合),0 就显 0。 */
  readonly reuseCount: number;
  /** 非 null ⇒ 来自复盘诊断;null ⇒ 手录/对话录入。 */
  readonly reviewId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ExperienceSummaryVm {
  /** 待裁决 = candidate 数。 */
  readonly candidateCount: number;
  /** 已验证 = validated 数。 */
  readonly validatedCount: number;
  /**
   * 已回流校准(待采纳)= pending CalibrationRuleSuggestion 数;
   * 读侧不可用(op 失败)时为 null → 页面诚实显「—」。
   */
  readonly reflowPendingCount: number | null;
}

export interface ExperienceViewModel {
  /** learnings.list 读失败 → true,页面渲染错误态(不渲染工作台)。 */
  readonly loadError: boolean;
  /** 裁决队列:candidate,createdAt 倒序。 */
  readonly candidates: ReadonlyArray<LearningVm>;
  /** 已验证库:validated,updatedAt 倒序(岛内再按 learningType 分组)。 */
  readonly validated: ReadonlyArray<LearningVm>;
  /** 底部折叠区:discarded,updatedAt 倒序。 */
  readonly discarded: ReadonlyArray<LearningVm>;
  /** 已有 pending 回流建议的 learningId 集合(validated 卡显「已回流」徽章)。 */
  readonly reflowedLearningIds: ReadonlyArray<string>;
  readonly summary: ExperienceSummaryVm;
}

// ---------------------------------------------------------------------------
// 读侧 client seam
// ---------------------------------------------------------------------------

// 最小结构 DTO —— contract client 返回已解析的 resource[];只读用到的字段。
interface LearningDto {
  readonly id: string;
  readonly title: string;
  readonly insight: string;
  readonly learningType: string;
  readonly validationStatus: "candidate" | "validated" | "discarded";
  readonly confidenceScore: number;
  readonly reuseCount?: number;
  readonly reviewId?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface RuleSuggestionDto {
  readonly id: string;
  readonly learningId: string;
}

export interface ExperienceDataClient {
  listLearnings(input: {
    params: undefined;
    query: { page: number; pageSize: number };
    body: undefined;
  }): Promise<unknown>;
  listRuleSuggestions(input: {
    params: undefined;
    query: { page: number; pageSize: number };
    body: undefined;
  }): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// 装配
// ---------------------------------------------------------------------------

const LEARNING_TYPE_KEYS: ReadonlyArray<LearningTypeKey> = [
  "strategy",
  "hook",
  "structure",
  "failure",
  "process",
  "editing",
  "conversion_pattern",
  "offer_insight",
  "edit_delta",
];

function normalizeLearningType(raw: string): LearningTypeKey {
  return (LEARNING_TYPE_KEYS as ReadonlyArray<string>).includes(raw)
    ? (raw as LearningTypeKey)
    : "strategy";
}

function toVm(dto: LearningDto): LearningVm {
  return {
    id: dto.id,
    title: dto.title,
    insight: dto.insight,
    learningType: normalizeLearningType(dto.learningType),
    validationStatus: dto.validationStatus,
    confidenceScore: dto.confidenceScore,
    reuseCount: dto.reuseCount ?? 0,
    reviewId: dto.reviewId ?? null,
    createdAt: dto.createdAt ?? "",
    updatedAt: dto.updatedAt ?? "",
  };
}

function byDesc(key: "createdAt" | "updatedAt") {
  return (a: LearningVm, b: LearningVm) => b[key].localeCompare(a[key]);
}

const EMPTY_ERROR_VM: ExperienceViewModel = {
  loadError: true,
  candidates: [],
  validated: [],
  discarded: [],
  reflowedLearningIds: [],
  summary: { candidateCount: 0, validatedCount: 0, reflowPendingCount: null },
};

/**
 * 装配真值 ViewModel。`learnings.list` 失败 → `loadError: true`(错误态,禁 fixture
 * 兜底);`calibration.suggestions.list` 失败只降级第三张卡为「—」,不拖垮整页。
 */
export async function buildExperienceWorkspaceViewModel(
  client: ExperienceDataClient = defaultClient as unknown as ExperienceDataClient,
): Promise<ExperienceViewModel> {
  let learnings: ReadonlyArray<LearningVm>;
  try {
    const rows = (await client.listLearnings({
      params: undefined,
      query: { page: 1, pageSize: 200 },
      body: undefined,
    })) as ReadonlyArray<LearningDto>;
    learnings = rows.map(toVm);
  } catch {
    return EMPTY_ERROR_VM;
  }

  // 已回流(pending)建议:失败 → null 计数(「—」)+ 空徽章集合,读侧诚实降级。
  let reflowedLearningIds: ReadonlyArray<string> = [];
  let reflowPendingCount: number | null = null;
  try {
    const suggestions = (await client.listRuleSuggestions({
      params: undefined,
      query: { page: 1, pageSize: 200 },
      body: undefined,
    })) as ReadonlyArray<RuleSuggestionDto>;
    reflowedLearningIds = [...new Set(suggestions.map((s) => s.learningId))];
    reflowPendingCount = suggestions.length;
  } catch {
    reflowedLearningIds = [];
    reflowPendingCount = null;
  }

  const candidates = learnings
    .filter((l) => l.validationStatus === "candidate")
    .sort(byDesc("createdAt"));
  const validated = learnings
    .filter((l) => l.validationStatus === "validated")
    .sort(byDesc("updatedAt"));
  const discarded = learnings
    .filter((l) => l.validationStatus === "discarded")
    .sort(byDesc("updatedAt"));

  return {
    loadError: false,
    candidates,
    validated,
    discarded,
    reflowedLearningIds,
    summary: {
      candidateCount: candidates.length,
      validatedCount: validated.length,
      reflowPendingCount,
    },
  };
}
