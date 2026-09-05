// [T-256b] Agentic executor —— 自主任务运行时的「壳」:把 T-255a executor 形状 + 引擎循环 +
// 领域工具适配器注入 缝合起来(SPEC §6:agentic executor = 执行层 executor 一种,dispatch/沙箱/
// 确认卡/步骤流零改动)。
//
// 控制模型(SPEC §4,全在此壳强制,与具体引擎无关):
//   ① 每任务工具白名单:filterToolsToScope 只把在册工具喂引擎(物理隔离,SPEC §4.1);
//   ② 步数/预算硬顶:createLoopController,任务参数只能调低不能调高缺省上限(SPEC §4.2);
//   ③ 检查点续跑:params.checkpoint 注入 → controller 从上次进度起算,续跑不重置预算(SPEC §4.3);
//   ④ 干跑预览:发布/删除类强制干跑,搜索/抓取类按任务级(SPEC §4.4);
//   ⑤ 副作用确认门:最终产物写 out/ **不算落库**,经既有 manifest→awaiting_confirmation→confirm
//      采纳才入库(铁律②,与 T-255a 确认门同一条);
//   ⑦ abort 贯通:opts.signal 透传引擎/工具(T-239c 模式)。
//
// 引擎(deps.engine)= Pi(就绪后)/ deterministic(默认);LLM(deps.resolveLlm)= §6.1 回接
// model-config;工具(deps.resolveTools)= 三适配器(T-256c)。三者都在 persistence-client 装配期绑。
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ExecutionTaskType, RequestContext } from "@creatoros/contract";
import type {
  ExecutionExecutor,
  ExecutorRunOpts,
  ExecutorSandboxView,
} from "../executor-registry";
import type {
  AgenticEngine,
  AgenticTool,
  EngineLlm,
  RawLlmConfig,
} from "./engine";
import { createLoopController, type LoopBudget } from "./loop-control";
import { filterToolsToScope } from "./tool-scopes";

export interface AgenticExecutorDeps {
  /** 自主任务类型(agentic.research | agentic.collect | agentic.material)。 */
  taskType: ExecutionTaskType;
  /** 引擎(Pi 形状):默认确定性;真 Pi 就绪后换此项即可。 */
  engine: AgenticEngine;
  /**
   * [§6.1 硬门] 每请求解析引擎 LLM 端口 —— 回接 model-config 的用户 provider。
   * persistence-client 绑:ctx → 走既有 llmCompleter(resolveLlmConfig)。
   */
  resolveLlm: (ctx: RequestContext) => EngineLlm;
  /**
   * [T-313 §6.1] 每请求解析 raw model-config —— Pi 引擎自建 provider 用(base_url+key+model+
   * api_format+auth_style)。确定性引擎不读此项(走 resolveLlm 文本端口)。未提供 → 引擎收不到
   * llmConfig,Pi 引擎会诚实退回确定性兜底。persistence-client 绑 resolveLlmConfig(同 llmCompleter)。
   */
  resolveLlmConfig?: (
    ctx: RequestContext,
  ) => RawLlmConfig | Promise<RawLlmConfig>;
  /**
   * 每请求解析领域工具集(用户域端口已 ctx-bound;封号限流/登录态/pending 烤在端口里,SPEC §3)。
   * 执行器再经 filterToolsToScope 二次白名单(纵深防御)。
   */
  resolveTools: (ctx: RequestContext,execution?:{taskId:string}) => readonly AgenticTool[];
  /** 步数/预算硬顶缺省(任务参数只能调低)。 */
  defaultBudget: LoopBudget;
  /** 系统提示(角色/护栏)。 */
  systemPrompt?: string;
}

/** 读任务参数里的正整数(缺/非法 → undefined)。 */
function posInt(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) && v > 0
    ? Math.floor(v)
    : undefined;
}

/**
 * 有效预算:任务参数**只能调低不能调高**缺省上限(SPEC §7:硬顶是必需,不给任务把自己
 * 预算无限放大的后门)。
 */
function effectiveBudget(
  params: Record<string, unknown>,
  def: LoopBudget,
): LoopBudget {
  const reqSteps = posInt(params.maxSteps);
  const reqTokens = posInt(params.maxTokens);
  return {
    maxSteps: reqSteps ? Math.min(reqSteps, def.maxSteps) : def.maxSteps,
    maxTokens: reqTokens ? Math.min(reqTokens, def.maxTokens) : def.maxTokens,
  };
}

export function createAgenticExecutor(
  deps: AgenticExecutorDeps,
): ExecutionExecutor {
  return {
    taskType: deps.taskType,
    loopType: "agentic", // 判定规则:register 期强制 classifyLoopType(taskType)==="agentic"
    // [RT-H06] 网络姿态:自主循环进程内跑,网络仅经平台受控端口出(resolveLlm/resolveLlmConfig
    // 的模型调用 + resolveTools 的领域工具适配器,均 ctx-bound 平台代码);沙箱内不起子进程、
    // 不执行任意联网代码 —— `network: deny` 的沙箱面语义可满足,编排 network 门降级明示。
    networkPosture: "brain-ports",
    async run(
      sandbox: ExecutorSandboxView,
      params: Record<string, unknown>,
      opts: ExecutorRunOpts,
    ) {
      const { signal, reportStep, ctx } = opts;
      // 自主任务必须有 ctx(解析 model-config + 用户域端口);缺 → 诚实失败(不静默降级)。
      if (!ctx) {
        throw new Error(
          "agentic executor 缺 RequestContext:无法解析 model-config / 用户域领域端口",
        );
      }
      const goal = typeof params.goal === "string" ? params.goal : "";
      if (!goal) throw new Error("agentic 任务缺 goal");

      // ① 工具白名单(SPEC §4.1):只喂在册工具;scope 未知或无可用工具 → 诚实拒跑。
      const allTools = deps.resolveTools(ctx,{taskId:sandbox.taskId});
      const tools = filterToolsToScope(allTools, deps.taskType);
      if (tools.length === 0) {
        throw new Error(
          `agentic 任务无可用领域工具(taskType=${deps.taskType};检查工具白名单 AGENTIC_TASK_TOOL_SCOPES 与端口装配)`,
        );
      }
      await reportStep(
        `装配自主循环:${tools.length} 个领域工具(${tools.map((t) => t.name).join(", ")})`,
      );

      // ② 步数/预算硬顶(SPEC §4.2)+ ③ 检查点续跑(SPEC §4.3,续跑不重置预算)。
      const budget = effectiveBudget(params, deps.defaultBudget);
      const checkpoint =
        params.checkpoint && typeof params.checkpoint === "object"
          ? {
              stepsUsed:
                posInt((params.checkpoint as Record<string, unknown>).stepsUsed) ??
                0,
              tokensUsed:
                posInt(
                  (params.checkpoint as Record<string, unknown>).tokensUsed,
                ) ?? 0,
            }
          : undefined;
      const controller = createLoopController(budget, checkpoint);
      if (checkpoint) {
        await reportStep(
          `续跑:从检查点恢复(已用 步 ${checkpoint.stepsUsed}/${budget.maxSteps}、token ${checkpoint.tokensUsed}/${budget.maxTokens})`,
        );
      }

      // ④ 干跑决策(SPEC §4.4):发布/删除强制干跑;搜索/抓取按任务级 dryRun(缺省 false)。
      const taskDryRun = params.dryRun === true;
      const decideDryRun = (tool: AgenticTool): boolean =>
        tool.effect === "publish" || tool.effect === "delete"
          ? true
          : taskDryRun;

      // §6.1 回接:引擎每步推理烧用户配的模型(persistence-client 绑 llmCompleter→resolveLlmConfig)。
      const llm = deps.resolveLlm(ctx);
      // §6.1 raw config:Pi 引擎自建 provider 用;确定性引擎忽略(无 resolveLlmConfig 时 undefined)。
      const llmConfig = deps.resolveLlmConfig
        ? await deps.resolveLlmConfig(ctx)
        : undefined;

      // 跑引擎循环(⑦ abort 贯通:signal 透传)。
      const final = await deps.engine.run({
        goal,
        systemPrompt:
          deps.systemPrompt ??
          "你是编导的自主任务助手。多步搜集/判断/整理,到步数或预算上限就诚实停止,别无限绕圈。",
        tools,
        llm,
        llmConfig,
        controller,
        decideDryRun,
        onStep: (text) => reportStep(text),
        signal,
      });

      // 只认端口确认的事实，不将登录提示、空搜索或模型“完成”宣称当业务产物。
      signal.throwIfAborted();
      if (final.hasUsableOutput !== true) {
        throw new Error(`自主任务未产生可用结果（${final.stopReason}）`);
      }
      const completeness = final.stopReason === "completed" ? "completed" : "partial";
      const actualEngine = final.actualEngine ?? deps.engine.name;

      // ⑤ 确认门:最终产物写 out/(**不算落库**);经既有 harvest→manifest→confirm 采纳才入库(铁律②)。
      await reportStep("写自主循环产物 out/agentic-result.json(待确认门采纳)");
      const payload = {
        taskType: deps.taskType,
        engine: actualEngine,
        completeness,
        goal,
        budget,
        stopReason: final.stopReason,
        steps: final.steps,
        tokensUsed: controller.tokensUsed(),
        summary: final.summary,
        output: final.output,
      };
      await fs.writeFile(
        path.join(sandbox.outDir, "agentic-result.json"),
        JSON.stringify(payload, null, 2),
        "utf8",
      );

      return {
        summary: final.summary,
        meta: {
          engine: actualEngine,
          completeness,
          stopReason: final.stopReason,
          steps: final.steps,
          maxSteps: budget.maxSteps,
          tokensUsed: controller.tokensUsed(),
          maxTokens: budget.maxTokens,
          toolCount: tools.length,
          dryRun: taskDryRun,
        },
      };
    },
  };
}
