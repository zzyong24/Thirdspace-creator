// [T-256b/T-256d] 真 Pi 引擎适配 seam —— **引擎接口按 Pi(@earendil-works/pi-agent-core `Agent`)
// 形状预留**(用户 2026-07-12 拍板选 Pi)。默认执行路径走确定性引擎(deterministic-engine.ts);
// 本文件是「差最后一步真跑」的落点:装好 Pi 依赖 + 提供 streamFn 后,把 deps.engine 换成
// createPiAgenticEngine(...) 即真跑,执行器/适配器/护栏零改动。
//
// ── 为何不在本轮直接装 Pi 依赖(诚实记录)────────────────────────────────────────
// @earendil-works/pi-agent-core@0.80.6 → pi-ai@0.80.6 依赖树重(openai/@aws-sdk client-bedrock-runtime/
// @google/genai/@mistralai/mistralai/typebox 等),且 @anthropic-ai/sdk 版本与本仓(^0.105.0 vs 0.91.1)
// 不一;本轮 4 agent 并行、共享 pnpm-lock.yaml,重装依赖有打断其他 agent 构建 + dedupe 风险(MEMORY:
// ai 须 pin 7.0.4 dedupe)。真跑还需用户真 provider 凭证(§6.1)。故本轮:框架跑确定性引擎(测试/headless
// 真机全绿),Pi 形状接口 + 本 seam 预留,安装/回接/真跑步骤见文末 + 交付报告。
//
// ── Pi 契约映射(逐项对齐,凭 .d.ts 蒸馏)───────────────────────────────────────
//   本模块 AgenticTool[]          → Pi `AgentTool[]`(name/label/description/parameters/execute)
//   input.tools(白名单)          → `Agent` 构造的 initialState.tools(物理只暴露这些,SPEC §4.1)
//   input.llm / buildStreamFn     → `Agent.streamFn`(§6.1 回接 model-config:pi-ai OpenAI-compatible
//                                   provider ← resolveLlmConfig 的 base_url+key+model;minimax 原生在册)
//   input.controller(步数/预算)  → `AgentLoopConfig.shouldStopAfterTurn`(到顶 return true 诚实停)
//   input.decideDryRun            → `beforeToolCall`(发布/删除干跑;本模块在 execute 内已判 dryRun)
//   input.onStep                  → `Agent.subscribe`(tool_execution_start/end / turn_end 事件→步骤流)
//   input.signal                  → `Agent.abort()`(signal.abort → agent.abort,T-239c 贯通)
import type {
  AgenticEngine,
  AgenticEngineFinal,
  AgenticEngineRunInput,
} from "./engine";

/** Pi 依赖未安装(默认路径不会碰到;真跑前先按 message 装依赖 + 提供 streamFn)。 */
export class PiNotInstalledError extends Error {
  constructor() {
    super(
      "真 Pi 引擎未就绪。差最后一步真跑:\n" +
        "  1) 装依赖:pnpm --filter @creatoros/backend add @earendil-works/pi-agent-core @earendil-works/pi-ai\n" +
        "  2) 提供 buildStreamFn:用 pi-ai 构造 OpenAI-compatible provider(base_url/key/model ← resolveLlmConfig,§6.1),\n" +
        "     minimax 在 pi-ai KnownProvider 原生在册;headless 冒烟可先用 pi-ai providers/faux.ts 假 provider。\n" +
        "  3) persistence-client 把 agentic executor 的 engine 换成 createPiAgenticEngine({ buildStreamFn })。",
    );
    this.name = "PiNotInstalledError";
  }
}

/**
 * streamFn 构造器(由调用方注入,**不在本模块 import pi-ai** —— 保持本模块在无依赖时也 tsc 绿)。
 * 真跑时:用 pi-ai 把 input.llm 背后的用户 provider 包成 Pi 的 StreamFn(streamSimple 形状)。
 */
export type PiStreamFnBuilder = (input: AgenticEngineRunInput) => unknown;

export interface PiAgenticEngineDeps {
  /** 提供 Pi StreamFn(§6.1 回接);未提供 → run 抛 PiNotInstalledError。 */
  buildStreamFn?: PiStreamFnBuilder;
}

// 动态 specifier(非字面量)避开构建期静态解析 —— 依赖缺席时 tsc/bundler 不报「找不到模块」
// (video-render resolveHyperframesCli 同款手法);装好后运行时正常解析。
const PI_AGENT_CORE = ["@earendil-works", "pi-agent-core"].join("/");

async function loadPiAgentCore(): Promise<any | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (await import(/* webpackIgnore: true */ PI_AGENT_CORE)) as any;
  } catch {
    return null;
  }
}

/**
 * 真 Pi 引擎(Pi 形状)。默认不启用(执行器用确定性引擎);装好依赖 + 提供 buildStreamFn 后启用。
 * run 内把本模块的 AgenticEngineRunInput 映射到 Pi `Agent`(见文件头契约映射),跑 Pi 真 agent loop。
 */
export function createPiAgenticEngine(
  deps: PiAgenticEngineDeps = {},
): AgenticEngine {
  return {
    name: "pi",
    async run(input: AgenticEngineRunInput): Promise<AgenticEngineFinal> {
      const pi = await loadPiAgentCore();
      if (!pi || !deps.buildStreamFn) {
        // 依赖缺席 / streamFn 未接 —— 诚实抛(默认路径不会走到这;真跑前按 message 补齐)。
        throw new PiNotInstalledError();
      }

      // ── 差最后一步(装好依赖后在此落地,凭 .d.ts 映射)─────────────────────────
      // const streamFn = deps.buildStreamFn(input);                    // §6.1 回接
      // const tools = input.tools.map(toPiAgentTool);                  // zod→typebox + execute 包装
      // const agent = new pi.Agent({ streamFn, initialState: { tools, systemPrompt: input.systemPrompt } });
      // const unsub = agent.subscribe((ev, sig) => onPiEvent(ev, input));  // 事件→onStep 步骤流
      // input.signal.addEventListener("abort", () => agent.abort(), { once: true });
      // // shouldStopAfterTurn 走 input.controller(步数/预算硬顶);beforeToolCall 走 decideDryRun。
      // await agent.prompt(input.goal); await agent.waitForIdle();
      // return collectFinal(agent.state, input.controller);
      //
      // 未落地字段(装好 pi-ai 后核实其 Model 构造 API):streamFn/Model 的确切构造、zod→typebox 转换。
      throw new PiNotInstalledError();
    },
  };
}
