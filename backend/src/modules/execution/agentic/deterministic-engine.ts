// [T-256b] 确定性自主引擎 —— AgenticEngine 的默认实现(Pi 就绪前跑通框架/测试/headless 真机)。
//
// 定位:**不是 Pi 的替身,是同一接口(engine.ts)的确定性实现**。它把 SPEC §4 控制模型全部走一遍
// (工具白名单=只见传入 tools / 每步问 controller 硬顶 / 每步经 llm 端口烧用户模型=§6.1 回接被真触发 /
// decideDryRun 决定副作用干跑 / onStep 落步骤流 / signal 贯通),只是「决策」是确定性的(先观察后行动,
// 轮转工具),而非模型自由决策。真 Pi 换上后:决策交给模型自由循环,护栏/端口/白名单零改动。
//
// 为何保留 llm 调用:验证 §6.1 回接链路真的被走(引擎每步「想」= 一次 model-config 解析出的用户
// provider 调用)—— 测试注 fake llm,真机走真 provider。决策不依赖 llm 输出(确定性),但 token 计入预算。
import type {
  AgenticEngine,
  AgenticEngineFinal,
  AgenticEngineRunInput,
  AgenticTool,
} from "./engine";
import { estimateTokens, type StopReason } from "./loop-control";

/** 据目标 + 已有产出确定性构造工具入参(优先工具自带 planInput,否则退 {query/goal})。 */
function buildToolInput(
  tool: AgenticTool,
  goal: string,
  outputs: Record<string, unknown>,
): unknown {
  if (tool.planInput) return tool.planInput(goal, outputs);
  return { query: goal, goal };
}

export function createDeterministicAgenticEngine(): AgenticEngine {
  return {
    name: "deterministic",
    async run(input: AgenticEngineRunInput): Promise<AgenticEngineFinal> {
      const { goal, tools, llm, controller, decideDryRun, onStep, signal } =
        input;

      const outputs: Record<string, unknown> = {};
      const toolLog: Array<{
        tool: string;
        dryRun: boolean;
        summary: string;
      }> = [];

      // 决策序列(确定性,SPEC §3「先观察后行动」):所有只读工具各一次(搜/读/列),再副作用工具
      // 各一次(写/采集/归类)。真 Pi 换成模型自由决策序列。
      const readTools = tools.filter((t) => t.effect === "none");
      const actTools = tools.filter((t) => t.effect !== "none");
      const plan = [...readTools, ...actTools];

      let stopReason: StopReason = "completed";
      let idx = 0;
      while (idx < plan.length) {
        // abort 贯通:任一点被中止 → 诚实停(SPEC §4.7)。
        if (signal.aborted) {
          controller.markAborted();
          stopReason = "aborted";
          break;
        }
        // 步数硬顶:到顶 controller 拒开步(SPEC §4.2)。
        if (!controller.beginStep()) {
          stopReason = controller.terminationReason() ?? "max_steps";
          break;
        }

        const tool = plan[idx]!;

        // 每步「想」一次:§6.1 回接 model-config(真 provider 解析真被触发);token 计入预算硬顶。
        await onStep(`思考:评估是否调用 ${tool.label}`, "reason");
        let decision: { text: string; tokensUsed: number };
        try {
          decision = await llm(
            `目标:${goal}\n已知产出键:${Object.keys(outputs).join(",") || "(空)"}\n` +
              `下一步是否调用工具「${tool.name}」?给一句理由。`,
            { system: input.systemPrompt, maxTokens: 256 },
          );
        } catch (e) {
          // 推理 LLM 失败(未配模型/凭据/网络)→ 诚实停止,不吞不崩不编(SPEC honesty)。
          const msg = e instanceof Error ? e.message : String(e);
          await onStep(`推理降级:模型调用失败(${msg.slice(0, 120)})—— 诚实停止`, "warn");
          stopReason = "llm_error";
          break;
        }
        const charged =
          decision.tokensUsed > 0
            ? decision.tokensUsed
            : estimateTokens(decision.text);
        if (!controller.chargeTokens(charged)) {
          stopReason = "budget_exhausted";
          break;
        }
        if (signal.aborted) {
          controller.markAborted();
          stopReason = "aborted";
          break;
        }

        // 构造入参 + 校验(不合法 → 诚实跳过,不硬塞)。
        const rawInput = buildToolInput(tool, goal, outputs);
        const parsed = tool.parameters.safeParse(rawInput);
        if (!parsed.success) {
          await onStep(
            `跳过 ${tool.label}:入参不合法(${parsed.error.issues[0]?.message ?? "invalid"})`,
            "warn",
          );
          idx += 1;
          continue;
        }

        // 干跑决策(SPEC §4.4):发布/删除恒干跑,余按任务级。端口内做真副作用/限流/pending(铁律②/防封)。
        const dryRun = decideDryRun(tool);
        const result = await tool.execute(parsed.data, { signal, dryRun });
        toolLog.push({ tool: tool.name, dryRun, summary: result.summary });
        outputs[tool.name] = result.data ?? result.summary;
        await onStep(
          `${dryRun ? "[干跑] " : ""}${tool.label}:${result.summary}`,
          dryRun ? "dryrun" : "tool",
        );
        idx += 1;
      }

      if (idx >= plan.length && stopReason === "completed") {
        controller.markCompleted();
      }

      const summary =
        `自主循环结束(${stopReason}):${toolLog.length} 次工具调用,` +
        `步 ${controller.stepsUsed()}/${controller.budget.maxSteps},` +
        `token ~${controller.tokensUsed()}/${controller.budget.maxTokens}`;

      return {
        summary,
        output: { goal, outputs, toolLog, stopReason },
        steps: controller.stepsUsed(),
        stopReason,
      };
    },
  };
}
