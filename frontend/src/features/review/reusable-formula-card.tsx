"use client";

/**
 * [T-284b G2] 「本账号可复用公式」明细卡 —— 归因回流的可见性入口。
 *
 * `topic.attribution` 的 reusable_formula / why_worked / structure_formula 此前落
 * `topic_attributions` 表,唯一读 op `topics.attributions.list` 零 FE 调用 = 写完即沉、用户
 * 看不见。本卡挂在复盘页(归因发生地的对照面),接线该只读 op:
 *   - `topics.attributions.list` → 拉本账号归因行,按当前项目(projectId)客户端过滤;
 *   - 渲 reusable_formula(标题)+ 表现分层 + topic/hook/structure 枚举 + why_worked 依据 +
 *     next_experiments(raw.output 里,归因产出的实验方向)。
 * 纯只读展示(归因资产由系统沉淀,人只消费,无写侧 op)。读失败 → 整卡不渲(辅助区诚实降级);
 * 本项目 0 条归因 → 也不渲(不摆空卡,复盘页保持干净)。
 */

import * as React from "react";
import { Sparkles } from "lucide-react";

import { SectionCard } from "@/components/project/section-card";
import { client } from "@/lib/contract-client";

interface AttributionDto {
  readonly id: string;
  readonly projectId: string | null;
  readonly publicationId: string;
  readonly performanceTier: string;
  readonly baselineRatio: number | null;
  readonly topicType: string;
  readonly hookType: string;
  readonly structureFormula: string;
  readonly whyWorked: string;
  readonly reusableFormula: string;
  readonly raw: Record<string, unknown>;
}

const TIER_LABEL: Record<string, string> = {
  viral: "爆款",
  normal: "常规",
  low: "低表现",
};

/** raw.output.next_experiments(归因产出的实验方向;防御式抽,缺则空)。 */
function nextExperiments(raw: Record<string, unknown>): string[] {
  const output = (raw?.output ?? {}) as Record<string, unknown>;
  const exps = output?.next_experiments;
  if (!Array.isArray(exps)) return [];
  return exps
    .map((e) => {
      const m = (e ?? {}) as Record<string, unknown>;
      return typeof m.title === "string" ? m.title.trim() : "";
    })
    .filter((t) => t.length > 0);
}

export function ReusableFormulaCard({ projectId }: { readonly projectId: string }) {
  const [rows, setRows] = React.useState<ReadonlyArray<AttributionDto> | null>(
    null,
  );

  React.useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const all = (await client.listTopicAttributions({
          params: undefined,
          query: { page: 1, pageSize: 50 },
          body: undefined,
        })) as unknown as ReadonlyArray<AttributionDto>;
        // 按当前项目过滤(归因行带 projectId 溯源锚);只留有可复用公式的行(诚实:无据不摆)。
        const mine = (Array.isArray(all) ? all : []).filter(
          (a) => a.projectId === projectId && a.reusableFormula.trim().length > 0,
        );
        if (alive) setRows(mine);
      } catch {
        // 读失败 → 整卡不渲(辅助区诚实降级,不拖垮复盘页)。
        if (alive) setRows([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [projectId]);

  // 未加载完 / 本项目 0 条 → 不渲(不摆空卡)。
  if (rows === null || rows.length === 0) return null;

  return (
    <SectionCard
      title="本账号可复用公式"
      description={`${rows.length} 条来自正向归因的可复用公式——本作品被验证过的选题/钩子/结构套路`}
    >
      <div
        data-slot="reusable-formula-card"
        data-count={rows.length}
        className="flex flex-col gap-2"
      >
        {rows.map((a) => {
          const exps = nextExperiments(a.raw);
          return (
            <article
              key={a.id}
              data-slot="reusable-formula-row"
              data-attribution-id={a.id}
              className="flex flex-col gap-1.5 rounded-control border border-border/70 p-3"
            >
              <div className="flex items-center gap-2">
                <Sparkles
                  className="size-3.5 shrink-0 text-brand"
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 text-sm font-medium text-foreground">
                  {a.reusableFormula}
                </span>
                <span className="shrink-0 rounded-full bg-surface-subtle px-2 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                  {TIER_LABEL[a.performanceTier] ?? a.performanceTier}
                  {a.baselineRatio != null
                    ? ` ${a.baselineRatio.toFixed(1)}x`
                    : ""}
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {[a.topicType, a.hookType, a.structureFormula]
                  .filter((s) => s && s.length > 0)
                  .map((chip, i) => (
                    <span
                      key={`${a.id}-chip-${i}`}
                      className="rounded-full border border-border/70 px-2 py-0.5 text-[10px] text-muted-foreground"
                    >
                      {chip}
                    </span>
                  ))}
              </div>
              {a.whyWorked ? (
                <p className="text-[12px] leading-relaxed text-muted-foreground">
                  {a.whyWorked}
                </p>
              ) : null}
              {exps.length > 0 ? (
                <p
                  data-slot="reusable-formula-experiments"
                  className="text-[12px] leading-relaxed text-muted-foreground"
                >
                  <span className="font-medium text-foreground/80">
                    可试方向:
                  </span>
                  {exps.join("、")}
                </p>
              ) : null}
            </article>
          );
        })}
      </div>
    </SectionCard>
  );
}
