// [T-387b] 分镜凝固 pass(SPEC 2026-07-17 §2「阶段裁决」的核心)——
//
// 业界铁序 = locked script → storyboard:分镜的**正式生成阶段**不在写稿时(稿未定即返工、
// 写稿时模型可能虚构素材),而在**采纳定稿时刻**。写稿产出的 shots[].visual 只是「视觉意图
// 草稿」;用户点「采纳写入稿面」→ confirmTask 的 artifact_version 分支在物化前跑一次**确定性
// 凝固**:对照**真实素材库**校验每段 visual ——
//   · assetRefs 里不存在的 assetId **剔除并挪进 missing**(诚实:虚构/已删的引用不冒充可拍);
//   · 凝固后的 sections[].visual 即**权威分镜表**(真源),随 contentData 落 artifact 版本
//     (不建新表;稿面结构视图渲染、四决策 storyboard facet 都读它);
//   · 全稿 missing 汇总(missingSummary)供稿面「缺素材清单」条引导补料(搜/传)。
//
// 纯函数、确定性(不调 AI);挂点选择:ai.service confirmTask 是**所有采纳路径的唯一收口**
// (对话整稿卡 ChatScriptDraftCard 与稿面候选卡都走 client.confirmTask → 同一分支),在此
// 凝固 = 改动面最小 + 天然覆盖全部采纳链。

/** 一段凝固后的 visual(与 script.draft 的 ScriptShotVisual 同形)。 */
export interface FrozenSectionVisual {
  description: string;
  assetRefs: string[];
  missing: string[];
}

export interface FreezeResult {
  /** 凝固后的 contentData(sections[].visual 已校验;其余字段原样保留)。 */
  contentData: Record<string, unknown>;
  /** 全稿缺素材汇总(去重,含被剔除的无效 assetRefs)——「缺素材清单」条的数据。 */
  missingSummary: string[];
  /** 本次凝固剔除的无效 assetId(观测/日志用)。 */
  removedRefs: string[];
}

// 宽容读一个 section 的 visual(写侧是 schema 卡过的,但 contentData 是 jsonb 自由形状,
// 读回必须防御;非对象/字段类型不对 → 视为无 visual)。
function readVisual(raw: unknown): FrozenSectionVisual | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const description = typeof o.description === "string" ? o.description.trim() : "";
  const strArr = (v: unknown): string[] =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim())
      : [];
  const assetRefs = strArr(o.assetRefs);
  const missing = strArr(o.missing);
  if (!description && assetRefs.length === 0 && missing.length === 0) return null;
  return { description, assetRefs, missing };
}

/** contentData 是否携带任何待凝固的 visual(没有 → 凝固 pass 整体跳过,零回归)。 */
export function hasStoryboardVisual(
  contentData: Record<string, unknown> | undefined,
): boolean {
  const sections = contentData?.sections;
  if (!Array.isArray(sections)) return false;
  return sections.some((s) => readVisual((s as Record<string, unknown> | null)?.visual) !== null);
}

/**
 * 凝固一份整稿的 sections[].visual:
 *   - assetRefs ∈ existingAssetIds 保留;不存在的剔除并以「素材引用失效:<id>」挪进该段 missing;
 *   - 无 visual 的段原样返回(不补空壳;planning.outline 等其它 sections 形状零影响);
 *   - 汇总全稿 missing(去重)供「缺素材清单」。
 * 纯函数:入参不被修改,返回新 contentData。
 */
export function freezeStoryboardSections(
  contentData: Record<string, unknown>,
  existingAssetIds: ReadonlySet<string>,
): FreezeResult {
  const rawSections = Array.isArray(contentData.sections) ? contentData.sections : [];
  const missingSummary: string[] = [];
  const removedRefs: string[] = [];
  const sections = rawSections.map((raw) => {
    const section = (raw ?? {}) as Record<string, unknown>;
    const visual = readVisual(section.visual);
    if (!visual) return raw; // 无视觉意图的段原样透传(不重塑形状)
    const kept: string[] = [];
    const missing = [...visual.missing];
    for (const ref of visual.assetRefs) {
      if (existingAssetIds.has(ref)) {
        kept.push(ref);
      } else {
        // 诚实剔除:引用了不存在的素材(模型虚构/素材已删)→ 挪进 missing,不冒充可拍。
        removedRefs.push(ref);
        missing.push(`素材引用失效：${ref}`);
      }
    }
    const frozen: FrozenSectionVisual = {
      description: visual.description,
      assetRefs: kept,
      missing,
    };
    for (const m of missing) missingSummary.push(m);
    return { ...section, visual: frozen };
  });
  return {
    contentData: { ...contentData, sections },
    missingSummary: Array.from(new Set(missingSummary)),
    removedRefs,
  };
}
