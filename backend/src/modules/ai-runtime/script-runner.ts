import type { RequestContext } from "@creatoros/contract";
import type { AiService } from "@creatoros/backend/modules/ai";
import type { ModelSpec, ScriptShot } from "@creatoros/ai-worker";
import {
  assembleCreativeContext,
  type ContextDeps,
} from "./creative-context";
import {
  formatErrorDiagnostic,
  safeErrorMessage,
} from "./error-diagnostics";

export type { ScriptShot };

// 分镜脚本 runner (script.draft node) —— 写文案的旗舰例子,跑在 **Vercel AI SDK** 上(弃旧 LlmCompleter)。
// 提示词走外置模板 script.draft(脊柱-1 解耦):写文案 = 模板 ⊕ {定位,过往爆款,选题,横竖屏}。
// AI 逻辑在 @creatoros/ai-worker 的 runScriptNode(产 ScriptShot[] + 步骤事件);本 runner 只负责
// 装配上下文 / 解析 model / 落候选(artifact_version,复用既有 confirm 分支 append 新 ArtifactVersion)。

export interface ScriptDeps extends ContextDeps {
  ai: AiService;
  /** 按 capability 解析用户配的 model(Vercel SDK)。 */
  resolveModelSpec: (
    ctx: RequestContext,
    capability: string,
  ) => Promise<ModelSpec>;
}

export interface ScriptTask {
  id: string;
  projectId: string | null;
  inputData: Record<string, unknown>;
}

// The parsed storyboard: a 前3秒 hook, the shot beats, and a CTA.
interface Storyboard {
  hook: string;
  sections: ScriptShot[];
  cta: string;
}

// Serialize the parsed storyboard into a readable Markdown table (the ArtifactVersion's
// contentText) — one row per shot, plus the hook/CTA framing. This is what the editor
// renders after 采纳.
function renderBody(board: Storyboard): string {
  const lines: string[] = ["# 分镜脚本", ""];
  if (board.hook) lines.push(`**前3秒钩子**：${board.hook}`, "");
  lines.push("| # | 口播 | 画面 | 字幕 | 时长 |", "| --- | --- | --- | --- | --- |");
  board.sections.forEach((shot, i) => {
    const cell = (v: string) => v.replace(/\|/g, "\\|").replace(/\n/g, " ");
    lines.push(
      `| ${i + 1} | ${cell(shot.口播)} | ${cell(shot.画面)} | ${cell(shot.字幕)} | ${cell(shot.时长)} |`,
    );
  });
  if (board.cta) lines.push("", `**CTA**：${board.cta}`);
  return lines.join("\n");
}

// Build the editable 分镜 sections the editor renders after 采纳 (Plan: 脚本编辑器做真).
// One section per shot: heading = a short 时长/口播-derived label, body = 口播 + 画面 +
// 字幕. These ride alongside the Markdown `body` as `contentData.sections` so the confirmed
// ArtifactVersion carries editable structure (not only the flat contentText blob).
// [T-387b] shot.visual(结构化视觉意图草稿)原样带进 section(缺省不带字段,旧稿零回归)——
// 采纳时 ai.service confirm 的「分镜凝固 pass」对照真实素材库校验后,它凝固为分镜真源。
function renderSections(
  board: Storyboard,
): Array<{
  heading: string;
  body: string;
  visual?: { description: string; assetRefs: string[]; missing: string[] };
}> {
  return board.sections.map((shot, i) => {
    const label = shot.口播 ? shot.口播.slice(0, 16) : `分镜 ${i + 1}`;
    const heading = shot.时长 ? `${i + 1}. ${label}（${shot.时长}）` : `${i + 1}. ${label}`;
    const bodyLines = [
      shot.口播 && `口播：${shot.口播}`,
      shot.画面 && `画面：${shot.画面}`,
      shot.字幕 && `字幕：${shot.字幕}`,
    ].filter((l): l is string => Boolean(l));
    return {
      heading,
      body: bodyLines.join("\n"),
      ...(shot.visual ? { visual: shot.visual } : {}),
    };
  });
}

function renderSummary(board: Storyboard): string {
  const n = board.sections.length;
  const hook = board.hook ? `钩子「${board.hook}」` : "AI 分镜脚本";
  return `${hook} · ${n} 镜（钩子→痛点→价值→卡点→CTA）`;
}

export async function runScriptDraft(
  ctx: RequestContext,
  task: ScriptTask,
  deps: ScriptDeps,
): Promise<void> {
  try {
    await deps.ai.markRunning(ctx, task.id);
    const artifactId =
      typeof task.inputData.artifactId === "string"
        ? task.inputData.artifactId
        : "";
    if (!artifactId) {
      // The confirm path appends a NEW ArtifactVersion onto this artifact; without it the
      // candidate cannot be materialized. Fail loud (caught below → cancelTask).
      throw new Error("script-runner: inputData.artifactId is required");
    }
    const topic =
      typeof task.inputData.topic === "string" ? task.inputData.topic : "";
    const context = await assembleCreativeContext(
      ctx,
      { projectId: task.projectId, topic },
      deps,
    );
    // Vercel AI SDK 路径:解析 model(按 capability) + 跑 ai-worker 写文案节点(外置 script.draft 模板),
    // 步骤事件落 ai_task_steps(窗口步骤日志)。弃旧 LlmCompleter。
    const spec = await deps.resolveModelSpec(ctx, "script.draft");
    console.info(
      `[script-runner] task=${task.id} capability=script.draft apiFormat=${spec.apiFormat} ` +
        `model=${spec.model} endpoint=${spec.baseUrl ? "custom" : "official"}`,
    );
    const { modelFor, runScriptNode } = await import("@creatoros/ai-worker");
    const { shots } = await runScriptNode({
      model: modelFor(spec),
      positioningBrief: context.positioningBrief,
      learningsBrief: context.learningsBrief,
      // [T-182a 已接] 知识库沉淀喂进写文案 prompt:组合根 runScriptDraft dispatch 已绑 knowledge
      //   reader(persistence-client.ts,与 topic.generate 同一 reader)→ assembleCreativeContext
      //   产出 context.knowledgeBrief(库空/读失败降级空)→ 此处真喂进写脚本节点。
      knowledgeBrief: context.knowledgeBrief || undefined,
      // [T-270] 立项 Brief 硬锚(项目态):核心信息=钦定主张 / 内容目标含避免X / 内容形式 / 目标观众。
      // creative-context 已按 projectId 决定是否装配(账号态为空,整段省略)。
      projectBriefHardBrief: context.projectBriefHard || undefined,
      // [T-284a] 复刻补链 G1:复刻项目携带的原爆款拆解要素(对标参照·复刻用,段头带诚实门)。
      // creative-context 已按 projectId + briefDetail.benchmarkRef 决定是否装配(非复刻/账号态空,整段省略)。
      benchmarkRefBrief: context.benchmarkRefBrief || undefined,
      topicTitle: context.topic.title,
      topicAngle: context.topic.angle,
      orientation: context.orientationHint || undefined,
      // SEAM-01:把策划产物(论点树/内容合同/结构方案)注入写文案上下文,和 positioning+learnings 并列。
      // 经 reader 端口装配(creative-context),非跨模块直连 repo;脚本据此铺策划的结构与论点。
      thesisBrief: context.thesisBrief || undefined,
      contractBrief: context.contractBrief || undefined,
      outlineBrief: context.outlineBrief || undefined,
      // [T-146c] 用户上传素材主权:高优先(用户第一手)进「必须遵守」硬约束段,normal(AI 找的)进
      // 参考段。creative-context 已按 material_link.priority 分流 + 装配好段头(硬约束 + 事实地基)。
      userMaterialHardBrief: context.userMaterialHardBrief || undefined,
      userMaterialRefBrief: context.userMaterialRefBrief || undefined,
      // [T-387b] 项目素材库清单(assets reader 装配「· id | 名称 (类型)」行)—— visual.assetRefs
      // 点名真实 assetId 的唯一可选集;库空/未装配 → undefined(模板整段省略,missing 承接诚实缺)。
      assetsBrief: context.assetsBrief || undefined,
      onStep: async (e) => {
        await deps.ai.recordStep(ctx, task.id, {
          stepNo: e.stepNo,
          kind: e.toolCalls.length > 0 ? "tool_call" : "step",
          text: e.text,
          toolCalls: e.toolCalls,
        });
      },
    });
    const board: Storyboard = {
      hook: shots[0]?.字幕 || shots[0]?.口播 || "",
      sections: shots,
      cta: shots[shots.length - 1]?.口播 || shots[shots.length - 1]?.字幕 || "",
    };
    if (board.sections.length === 0) {
      throw new Error("script-runner: agent returned no parseable shots");
    }
    await deps.ai.recordCandidate(ctx, task.id, {
      resultType: "artifact_version",
      artifactId,
      resultData: {
        body: renderBody(board),
        summary: renderSummary(board),
        // Raw shots — kept so the 采纳 card preview (ScriptDraftIsland.parseShots)
        // still renders 口播/画面/字幕/时长.
        sections: board.sections,
        hook: board.hook,
        cta: board.cta,
        // Structured editable payload forwarded by the AI confirm branch to
        // createVersion as `contentData` (round-trips into the 脚本 editor).
        contentData: {
          sections: renderSections(board),
          hook: board.hook,
          cta: board.cta,
        },
      },
    });
  } catch (err) {
    const failureMessage = safeErrorMessage(err);
    try {
      await deps.ai.cancelTask(ctx, task.id, failureMessage);
    } catch {
      /* already terminal */
    }
    // eslint-disable-next-line no-console
    console.error(
      `[script-runner] draft failed task=${task.id} ${formatErrorDiagnostic(err)}`,
    );
  }
}
