import "server-only";
import type { RequestContext } from "@creatoros/contract";
import type { AiService } from "@creatoros/backend/modules/ai";
import type { ModelSpec, ScriptReviewOutput } from "@creatoros/ai-worker";

// 文案审核 runner(script.review node,T-086 SPEC §2)。
// [gate-F2] 独立于 review-runner.ts 的理由(SPEC 要求注明):本 runner 与复盘 runner 差异根本 ——
//   ① 读的是「编导产出的待审脚本」(master_script/output_script 当前版本文本)而非复盘对象作品;
//   ② 前置一个确定性 L1 lint 步骤(消费 review_rules active 词表,ai-worker lintScript 纯函数);
//   ③ 产出的是 script_review_reports 一行(绑 artifactVersion),经 markSucceeded 走确定性终态,
//      **不产采纳候选**(改写建议的确认门在报告卡侧走 createArtifactVersion,不在本 runner)。
//   review-runner 是 LLM 单节点 + recordCandidate + 采纳门;两者语义正交,合并只会互相污染,故独立。

// 读脚本文本 + 当前版本号的端口(composition root 用 artifactsService 满足)。
export interface ScriptSource {
  /** 返回项目「脚本」stage 当前版本的 { artifactId, version, text };无脚本 → null。 */
  getLatestScript(
    ctx: RequestContext,
    projectId: string,
  ): Promise<{ artifactId: string; version: number; text: string } | null>;
}

// L1 词表端口(review-gate service 满足:拉 active 规则)。
export interface LintRulesSource {
  listActiveLintRules(ctx: RequestContext): Promise<
    {
      id: string;
      tier: "official_hard" | "empirical" | "doudplus";
      category: string;
      matchType: "word" | "regex";
      pattern: string;
      replacement: string | null;
      note: string;
    }[]
  >;
}

// 报告落库端口(review-gate service 满足)。
export interface ReportSink {
  saveReport(
    ctx: RequestContext,
    input: {
      projectId: string;
      artifactId: string | null;
      artifactVersion: number;
      verdict: "pass" | "risk" | "block";
      summary: string;
      lintFindings: unknown[];
      llmFindings: unknown[];
      modelLabel: string;
    },
  ): Promise<unknown>;
}

// 定位 reader(判语境;可空)。
export interface PositioningReader {
  getPositioningCenter(ctx: RequestContext): Promise<unknown>;
}

export interface ScriptReviewDeps {
  ai: AiService;
  scriptSource: ScriptSource;
  lintRules: LintRulesSource;
  reportSink: ReportSink;
  positioning?: PositioningReader;
  resolveModelSpec: (
    ctx: RequestContext,
    capability: string,
  ) => Promise<ModelSpec>;
  /** 是否配了专用「文案审核模型」(script.review capability 有独立行);false → 报告标「非专用审核模型」。 */
  hasDedicatedReviewModel: (ctx: RequestContext) => Promise<boolean>;
}

export interface ScriptReviewTask {
  id: string;
  projectId: string | null;
  inputData: Record<string, unknown>;
}

// verdict 汇总:任一 block(L1 official_hard 命中 或 L2 block)→ block;有 warn(任何 L1 命中
// 或 L2 warn)→ risk;否则 pass。L1 official_hard 视作 block 级(公约硬规则),其余 L1 视作 warn 级。
function summarizeVerdict(
  lintFindings: { tier: string }[],
  llmFindings: { severity: string }[],
): "pass" | "risk" | "block" {
  const hasBlock =
    lintFindings.some((f) => f.tier === "official_hard") ||
    llmFindings.some((f) => f.severity === "block");
  if (hasBlock) return "block";
  const hasWarn =
    lintFindings.length > 0 || llmFindings.some((f) => f.severity === "warn");
  return hasWarn ? "risk" : "pass";
}

// 从定位中心对象里抽一段简述(best-effort;读不到就通用兜底)。
function positioningBriefOf(pc: unknown): string {
  const o = (pc ?? {}) as Record<string, unknown>;
  const profile = (o.profile ?? o) as Record<string, unknown>;
  const parts = [profile.persona, profile.field, profile.audience]
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .join(" · ");
  return parts || "（未设置定位——按通用合规标准审核）";
}

export async function runScriptReview(
  ctx: RequestContext,
  task: ScriptReviewTask,
  deps: ScriptReviewDeps,
): Promise<void> {
  try {
    await deps.ai.markRunning(ctx, task.id);
    const projectId =
      typeof task.inputData.projectId === "string"
        ? task.inputData.projectId
        : task.projectId;
    if (!projectId) {
      throw new Error("script-review-runner: 缺 projectId");
    }

    const script = await deps.scriptSource.getLatestScript(ctx, projectId);
    if (!script || !script.text.trim()) {
      throw new Error("script-review-runner: 项目暂无可审脚本");
    }

    // ── L1:确定性违禁词/模式 lint(纯函数,消费 active 词表)──
    const rules = await deps.lintRules.listActiveLintRules(ctx);
    const { lintScript } = await import("@creatoros/ai-worker");
    const lintFindings = lintScript(script.text, rules);
    await deps.ai.recordStep(ctx, task.id, {
      stepNo: 1,
      kind: "step",
      text: `L1 违禁词 lint 完成(命中 ${lintFindings.length} 条）`,
      toolCalls: [],
    });

    // ── L2:LLM 语义审(resolveModelSpec 按 script.review capability 解析;未配回退默认)──
    const spec = await deps.resolveModelSpec(ctx, "script.review");
    // 诚实标注:未配专用审核模型(script.review 无独立配置行,resolve 落回退链)时,报告标
    // 「非专用审核模型」(model_label 字段承载,SPEC §2 诚实数据原则)。
    const isDedicated = await deps.hasDedicatedReviewModel(ctx);
    const modelLabel = isDedicated
      ? `${spec.model}`
      : `${spec.model}(非专用审核模型——建议在设置中配置豆包等审核模型)`;

    let positioningBrief = "（未设置定位——按通用合规标准审核）";
    if (deps.positioning) {
      try {
        positioningBrief = positioningBriefOf(
          await deps.positioning.getPositioningCenter(ctx),
        );
      } catch {
        /* 定位读失败不阻断审核 */
      }
    }

    const { modelFor, runStructuredNode, getTemplate, DEFAULT_OFFICIAL_RULES } =
      await import("@creatoros/ai-worker");

    // L1 命中注入 L2(让语义审不复述已报条目、可交叉确认)。
    const lintBlock =
      lintFindings.length > 0
        ? lintFindings
            .map(
              (f) =>
                `· [${f.tier}/${f.category}] 「${f.quote}」${
                  f.replacement ? ` → 建议:${f.replacement}` : ""
                }`,
            )
            .join("\n")
        : "（L1 无命中）";

    let llmFindings: ScriptReviewOutput["findings"] = [];
    let llmVerdict: "pass" | "risk" | "block" = "pass";
    let summary = "";
    try {
      const { object } = await runStructuredNode<ScriptReviewOutput>({
        model: modelFor(spec),
        template: getTemplate("script.review"),
        facets: {
          script: script.text,
          lintFindings: lintBlock,
          officialRules: DEFAULT_OFFICIAL_RULES,
          positioning: positioningBrief,
        },
      });
      // quote 必为原文子串(防幻觉命中):滤掉不在原文里的 finding(诚实数据)。
      llmFindings = (object.findings ?? []).filter(
        (f) => typeof f.quote === "string" && script.text.includes(f.quote),
      );
      llmVerdict = object.verdict ?? "pass";
      summary = object.summary ?? "";
    } catch (err) {
      // L2 失败(模型不可用/超时)不让整次审核崩:降级为「仅 L1」报告,summary 如实标注。
      // eslint-disable-next-line no-console
      console.error(`[script-review-runner] L2 语义审失败 ${task.id}:`, err);
      summary = "L2 语义审未完成(模型不可用),本报告仅含 L1 违禁词 lint 结果。";
    }
    await deps.ai.recordStep(ctx, task.id, {
      stepNo: 2,
      kind: "step",
      text: `L2 语义审完成(命中 ${llmFindings.length} 条,模型 ${modelLabel}）`,
      toolCalls: [],
    });

    // ── verdict 汇总 + 落报告(绑 artifactVersion)──
    const lintVerdict = summarizeVerdict(lintFindings, []);
    const verdict = ([lintVerdict, llmVerdict] as const).includes("block")
      ? "block"
      : [lintVerdict, llmVerdict].includes("risk")
        ? "risk"
        : "pass";

    await deps.reportSink.saveReport(ctx, {
      projectId,
      artifactId: script.artifactId,
      artifactVersion: script.version,
      verdict,
      summary:
        summary ||
        (verdict === "pass"
          ? "未发现明显合规风险。"
          : "发现合规风险,详见命中列表。"),
      lintFindings,
      llmFindings,
      modelLabel,
    });

    // 确定性终态(报告已落库,无采纳候选)。
    await deps.ai.markSucceeded(ctx, task.id);
  } catch (err) {
    try {
      await deps.ai.markFailed(
        ctx,
        task.id,
        err instanceof Error ? err.message : String(err),
      );
    } catch {
      /* already terminal */
    }
    // eslint-disable-next-line no-console
    console.error(`[script-review-runner] review failed for task ${task.id}:`, err);
  }
}
