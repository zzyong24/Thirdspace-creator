// [T-313] 真 Pi 引擎 —— 把 AgenticEngine 循环真接上 `@earendil-works/pi-coding-agent` SDK
// 的 `createAgentSession()`(库级内嵌 sidecar,无 TTY)。执行器/适配器/护栏零改动(engine.ts 契约)。
//
// ── 关键落地事实(装 0.80.7 现场核实,见 docs/research/2026-07-14-pi-engine-impl-notes.md)──────
//   · headless 可嵌:**深导入 `dist/core/sdk.js`**(绕开 barrel `dist/index.js`——它 eager 载
//     modes/interactive TUI + main;深导入只走 core,pi-tui `getCapabilities` 无 TTY 不崩)。
//   · L3 物理排除:`createAgentSession({ noTools:"builtin", excludeTools:[...] })` → 自带
//     read/bash/edit/write 不进工具注册表(getAllTools 只剩 customTools)。**不是** "all"(那会连
//     customTools 一起禁掉)。单测断言(pi-engine.test.ts)。
//   · §6.1 回接:走 pi 自己的 custom-provider 机制 `ModelRegistry.registerProvider(name,{api,
//     baseUrl,apiKey,authHeader,models})` + `find()` → `createAgentSession({model,modelRegistry})`。
//     authHeader:true=Authorization Bearer(anthropic relay/MiniMax);falsy=api 默认(anthropic x-api-key)。
//   · LoopController 桥接:`session.subscribe` 的 `turn_end` 事件带 `message.usage{input,output}`
//     → 每 turn `beginStep()`+`chargeTokens()`;超顶 `session.abort()`(abort 异步,≤1 turn 余量)。
//   · customTools 参数:zod → `z.toJSONSchema(schema,{io:"input"})`(去 $schema)= 纯 JSON Schema;
//     pi 的 validateToolArguments 走非-TypeBox 分支校验+coerce;**权威校验仍在 execute 内我方 zod safeParse**。
//   · 依赖缺席/打包实拷缺失/无 llmConfig/运行异常 → 退 deterministic 兜底(保留现有全绿默认路径)。
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import type {
  AgenticEngine,
  AgenticEngineFinal,
  AgenticEngineRunInput,
  AgenticTool,
  RawLlmConfig,
} from "./engine";
import type { StopReason } from "./loop-control";

/**
 * [legacy] Pi 未就绪错误 —— 现已改为「退确定性兜底」而非抛错(见 run());保留导出仅为 barrel 兼容。
 */
export class PiNotInstalledError extends Error {
  constructor() {
    super("真 Pi 引擎未就绪(装 @earendil-works/pi-coding-agent + 提供 llmConfig)。");
    this.name = "PiNotInstalledError";
  }
}

/** [legacy] 旧 streamFn 构造器类型别名 —— 保留仅为 barrel 兼容(新装配用 buildStreamSimple)。 */
export type PiStreamFnBuilder = (input: AgenticEngineRunInput) => unknown;

export interface PiAgenticEngineDeps {
  /**
   * 兜底引擎(确定性)—— 依赖缺席 / 打包实拷缺失 / 无 §6.1 raw config / 运行未预期异常时退它,
   * 保留现有全绿默认路径不被破坏(SPEC §3.1「依赖缺席兜底」)。
   */
  fallback: AgenticEngine;
  /**
   * [测试用] 注入 faux streamSimple(pi-ai providers/faux)—— 不打真网络,验循环机制。
   * production 不传:走 pi 内建 api(anthropic-messages / openai-completions,真烧用户 provider)。
   */
  buildStreamSimple?: (llmConfig: RawLlmConfig) => unknown;
}

// ── §6.1 provider 装配(纯函数,导出供单测)────────────────────────────────────────────────
const PROVIDER_ID = "creatoros-user";
const FAUX_API = "creatoros-faux";
const DEFAULT_ANTHROPIC_BASE_URL = "https://api.anthropic.com";
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
/** L3:显式 denylist(与 noTools:"builtin" 叠加纵深防御)。 */
export const EXCLUDED_BUILTIN_TOOLS = [
  "read",
  "bash",
  "edit",
  "write",
  "ls",
  "grep",
  "find",
] as const;

/** apiFormat → pi-ai api 名。 */
export function piApiForFormat(apiFormat: RawLlmConfig["apiFormat"]): string {
  return apiFormat === "anthropic" ? "anthropic-messages" : "openai-completions";
}

/** 从用户 model-config 的 settings 读正数配置(缺/非法 → 兜底)。模型描述符不再硬编。 */
function numFromSettings(
  settings: Record<string, unknown> | undefined,
  key: string,
  fallback: number,
): number {
  const v = settings?.[key];
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : fallback;
}

export interface PiProviderRegistration {
  name: string;
  config: Record<string, unknown>;
}

/**
 * 据 raw model-config 造 pi `registerProvider` 入参(§6.1)。
 *   - baseUrl 缺(anthropic 官方 x-api-key)→ 补官方默认(registerProvider 定义 models 时必需 baseUrl)。
 *   - authHeader:仅 anthropic + bearer(relay/MiniMax)置 true(注 Authorization: Bearer);
 *     anthropic 官方 x-api-key / openai(默认 Bearer)不置(交给 api 默认,避免双 Authorization)。
 */
export function buildPiProviderRegistration(
  llmConfig: RawLlmConfig,
  opts: { apiName?: string; streamSimple?: unknown } = {},
): PiProviderRegistration {
  const piApi = opts.apiName ?? piApiForFormat(llmConfig.apiFormat);
  const baseUrl =
    llmConfig.baseUrl ??
    (llmConfig.apiFormat === "anthropic"
      ? DEFAULT_ANTHROPIC_BASE_URL
      : DEFAULT_OPENAI_BASE_URL);
  const authHeader =
    llmConfig.apiFormat === "anthropic" && llmConfig.authStyle === "bearer"
      ? true
      : undefined;
  return {
    name: PROVIDER_ID,
    config: {
      name: "CreatorOS User Provider",
      api: piApi,
      baseUrl,
      apiKey: llmConfig.token,
      ...(authHeader ? { authHeader: true } : {}),
      ...(opts.streamSimple ? { streamSimple: opts.streamSimple } : {}),
      models: [
        {
          id: llmConfig.model,
          name: llmConfig.model,
          api: piApi,
          // reasoning/contextWindow/maxTokens 读**用户 model-config 的 settings**(缺则兜底),不硬编。
          reasoning: llmConfig.settings?.reasoning === true,
          input: ["text"],
          // cost 恒 0 = **故意**:预算/计费不走 pi-ai 成本核算,由 LoopController 记你真实 usage token。
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: numFromSettings(
            llmConfig.settings,
            "contextWindow",
            200000,
          ),
          maxTokens: numFromSettings(llmConfig.settings, "maxTokens", 8192),
        },
      ],
    },
  };
}

/** zod schema → pi 工具 parameters(纯 JSON Schema)。io:"input" 让带 default 的字段不进 required。 */
export function zodToPiParameters(
  schema: z.ZodTypeAny,
): Record<string, unknown> {
  try {
    const json = z.toJSONSchema(schema, {
      io: "input",
      unrepresentable: "any",
    }) as Record<string, unknown>;
    delete json.$schema;
    return json;
  } catch {
    // 转换失败(极少见)→ 宽松 object(模型可传任意键);权威校验仍在 execute 内我方 zod。
    return { type: "object", additionalProperties: true };
  }
}

interface PiToolBridgeCtx {
  decideDryRun: (tool: AgenticTool) => boolean;
  signal: AbortSignal;
  onStep: (text: string, kind?: string) => Promise<void>;
  toolLog: Array<{ tool: string; dryRun: boolean; summary: string }>;
  outputs: Record<string, unknown>;
}

/** AgenticTool → pi ToolDefinition(customTools)。execute 包我方端口,zod safeParse 权威校验。 */
export function toPiCustomTool(
  tool: AgenticTool,
  ctx: PiToolBridgeCtx,
): Record<string, unknown> {
  return {
    name: tool.name,
    label: tool.label,
    description: tool.description,
    parameters: zodToPiParameters(tool.parameters),
    // 配合限流/防封端口:turn 内工具顺序执行(不并行,SPEC §12 未决④拍板 sequential)。
    executionMode: "sequential",
    async execute(
      _toolCallId: string,
      params: unknown,
    ): Promise<{
      content: Array<{ type: "text"; text: string }>;
      details: Record<string, unknown>;
    }> {
      // 我方 zod 是校验权威(应用 default / transform / strip);不合法 → 回错给模型(可重试)。
      const parsed = tool.parameters.safeParse(params);
      if (!parsed.success) {
        const msg = parsed.error.issues[0]?.message ?? "invalid arguments";
        await ctx.onStep(`跳过 ${tool.label}:入参不合法(${msg})`, "warn");
        return {
          content: [{ type: "text", text: `入参不合法:${msg}` }],
          details: { error: msg },
        };
      }
      const dryRun = ctx.decideDryRun(tool);
      const result = await tool.execute(parsed.data, {
        signal: ctx.signal,
        dryRun,
      });
      ctx.toolLog.push({ tool: tool.name, dryRun, summary: result.summary });
      ctx.outputs[tool.name] = result.data ?? result.summary;
      await ctx.onStep(
        `${dryRun ? "[干跑] " : ""}${tool.label}:${result.summary}`,
        dryRun ? "dryrun" : "tool",
      );
      const text =
        dryRun && result.plan
          ? `${result.summary}\n${result.plan}`
          : result.summary;
      return {
        content: [{ type: "text", text }],
        details: (result.data ?? {}) as Record<string, unknown>,
      };
    },
  };
}

// ── Pi SDK 深文件加载(T-289 确定性 fs 定位,不用 require.resolve —— 混淆 bundle 会返回数字模块 ID)──
const PI_CODING_PKG = ["@earendil-works", "pi-coding-agent"].join("/");
// pnpm 目录名把 scope 的 "/" 编码成 "+":@earendil-works+pi-coding-agent@<ver>_<peers>。
const PI_CODING_PNPM = PI_CODING_PKG.replace("/", "+");

async function locatePiCoreDir(): Promise<string | null> {
  const isFile = (p: string): Promise<boolean> =>
    fs
      .stat(p)
      .then((s) => s.isFile())
      .catch(() => false);
  const anchor = "dist/core/sdk.js";
  const roots = [
    path.join(process.cwd(), "node_modules"),
    path.resolve(process.cwd(), "..", "node_modules"), // sidecar/node_modules(frontend 的父)
  ];
  for (const root of roots) {
    // ① 直连(symlink / hoist / build-sidecar 实拷)。
    const direct = path.join(root, PI_CODING_PKG, anchor);
    if (await isFile(direct)) return path.dirname(direct);
    // ② .pnpm 隔离目录(scope "/"→"+")。
    const pnpm = path.join(root, ".pnpm");
    const entries = await fs.readdir(pnpm).catch(() => [] as string[]);
    for (const e of entries.filter((x) => x.startsWith(`${PI_CODING_PNPM}@`))) {
      const p = path.join(pnpm, e, "node_modules", PI_CODING_PKG, anchor);
      if (await isFile(p)) return path.dirname(p);
    }
  }
  return null;
}

interface PiSdk {
  createAgentSession: (opts: unknown) => Promise<{ session: PiSession }>;
  ModelRegistry: {
    inMemory: (authStorage: unknown) => PiModelRegistry;
  };
  AuthStorage: { inMemory: () => unknown };
  SessionManager: { inMemory: () => unknown };
}
interface PiModelRegistry {
  registerProvider: (name: string, config: Record<string, unknown>) => void;
  find: (provider: string, id: string) => unknown;
}
interface PiSession {
  subscribe: (listener: (ev: PiEvent) => void) => (() => void) | void;
  prompt: (text: string) => Promise<void>;
  waitForIdle: () => Promise<void>;
  abort: () => Promise<void>;
  getLastAssistantText?: () => string | undefined;
  getSessionStats?: () => { tokens?: Record<string, number> } | undefined;
  setAutoRetryEnabled?: (enabled: boolean) => void;
  readonly messages?: ReadonlyArray<{
    role?: string;
    stopReason?: string;
    errorMessage?: string;
  }>;
  dispose?: () => void;
}
interface PiEvent {
  type: string;
  message?: { usage?: { input?: number; output?: number } };
}

let cachedSdk: PiSdk | null = null;
let testSdkOverride: PiSdk | null | undefined; // undefined = 无 override(走真加载)
async function loadPiSdk(): Promise<PiSdk | null> {
  if (testSdkOverride !== undefined) return testSdkOverride; // null → 强制「未就绪」路径
  if (cachedSdk) return cachedSdk;
  try {
    const coreDir = await locatePiCoreDir();
    if (!coreDir) return null;
    const imp = (f: string): Promise<Record<string, unknown>> =>
      import(
        /* webpackIgnore: true */ pathToFileURL(path.join(coreDir, f)).href
      ) as Promise<Record<string, unknown>>;
    const [sdk, mr, as, sm] = await Promise.all([
      imp("sdk.js"),
      imp("model-registry.js"),
      imp("auth-storage.js"),
      imp("session-manager.js"),
    ]);
    const loaded = {
      createAgentSession: sdk.createAgentSession,
      ModelRegistry: mr.ModelRegistry,
      AuthStorage: as.AuthStorage,
      SessionManager: sm.SessionManager,
    } as unknown as PiSdk;
    if (
      typeof loaded.createAgentSession !== "function" ||
      !loaded.ModelRegistry ||
      !loaded.AuthStorage ||
      !loaded.SessionManager
    ) {
      return null;
    }
    cachedSdk = loaded;
    return cachedSdk;
  } catch {
    return null;
  }
}

/**
 * [测试用] 覆盖 SDK 加载:
 *   - 真 SDK 句柄 → 用它(单测直接喂 faux-friendly 真 SDK,不走 fs/import 二次解析);
 *   - null → 强制走「SDK 未就绪 → 退兜底」路径;
 *   - undefined → 清除 override(恢复真加载)。
 */
export function __setPiSdkForTest(sdk: PiSdk | null | undefined): void {
  testSdkOverride = sdk;
  cachedSdk = null;
}
/** [测试用] pi-engine 内部 SDK 句柄类型(测试注入真 SDK 时用)。 */
export type PiSdkHandle = PiSdk;

/**
 * 真 Pi 引擎。装好 `@earendil-works/pi-coding-agent` + 执行器注入 §6.1 llmConfig 后真跑;
 * 任一前置不满足 → 退 deps.fallback(确定性,现有全绿路径)。
 */
export function createPiAgenticEngine(deps: PiAgenticEngineDeps): AgenticEngine {
  return {
    name: "pi",
    async run(input: AgenticEngineRunInput): Promise<AgenticEngineFinal> {
      // §6.1:无 raw config(deterministic-only 装配 / 未接 resolveLlmConfig)→ 诚实退兜底。
      if (!input.llmConfig) {
        await input.onStep(
          "Pi 引擎未拿到 model-config(§6.1)—— 退确定性兜底",
          "warn",
        );
        return deps.fallback.run(input);
      }
      const sdk = await loadPiSdk();
      if (!sdk) {
        await input.onStep(
          "Pi SDK 未就绪(依赖缺席 / 打包实拷缺失)—— 退确定性兜底",
          "warn",
        );
        return deps.fallback.run(input);
      }

      const { controller, signal, llmConfig } = input;
      const outputs: Record<string, unknown> = {};
      const toolLog: Array<{ tool: string; dryRun: boolean; summary: string }> =
        [];
      let stopReason: StopReason = "completed";

      try {
        // §6.1 provider 装配(pi custom-provider;测试注 faux streamSimple 不打网络)。
        const streamSimple = deps.buildStreamSimple?.(llmConfig);
        const reg = buildPiProviderRegistration(llmConfig, {
          apiName: streamSimple ? FAUX_API : undefined,
          streamSimple,
        });
        const authStorage = sdk.AuthStorage.inMemory();
        const modelRegistry = sdk.ModelRegistry.inMemory(authStorage);
        modelRegistry.registerProvider(reg.name, reg.config);
        const model = modelRegistry.find(reg.name, llmConfig.model);
        if (!model) {
          await input.onStep(
            "Pi provider 装配失败(model 未解析)—— 退确定性兜底",
            "warn",
          );
          return deps.fallback.run(input);
        }

        // L3 物理排除 + customTools(白名单已上游 filterToolsToScope 过;此处只映射在册工具)。
        const customTools = input.tools.map((t) =>
          toPiCustomTool(t, {
            decideDryRun: input.decideDryRun,
            signal,
            onStep: input.onStep,
            toolLog,
            outputs,
          }),
        );

        const { session } = await sdk.createAgentSession({
          model,
          modelRegistry,
          noTools: "builtin",
          excludeTools: [...EXCLUDED_BUILTIN_TOOLS],
          customTools,
          sessionManager: sdk.SessionManager.inMemory(),
        });

        // 关 pi 自带 auto-retry:retry/backoff 由我方层(端口 + LoopController 预算)掌控;
        // 放任 pi 自动重试会不受预算约束地绕圈 + 报错不及时浮现(诚实原则:fail fast)。
        session.setAutoRetryEnabled?.(false);

        // abort 贯通(input.signal → session.abort)。
        const onAbort = (): void => {
          controller.markAborted();
          stopReason = "aborted";
          void session.abort();
        };
        if (signal.aborted) onAbort();
        else signal.addEventListener("abort", onAbort, { once: true });

        // 事件流 → LoopController 桥接(每 turn 记步 + 记真 token;超顶 abort 诚实停)。
        const unsub = session.subscribe((ev: PiEvent) => {
          try {
            if (ev.type !== "turn_end") return;
            if (!controller.beginStep()) {
              stopReason = controller.terminationReason() ?? "max_steps";
              void session.abort();
              return;
            }
            const usage = ev.message?.usage;
            const charged = usage
              ? (usage.input ?? 0) + (usage.output ?? 0)
              : 0;
            if (charged > 0 && !controller.chargeTokens(charged)) {
              stopReason = "budget_exhausted";
              void session.abort();
            }
          } catch {
            // 事件处理异常不打断循环(诚实:控制器状态已尽力更新)。
          }
        });

        try {
          await session.prompt(input.goal);
          await session.waitForIdle();
        } finally {
          if (typeof unsub === "function") unsub();
        }

        // 诚实:LLM 调用报错(未配/凭据错/网络)→ 末条助手消息 stopReason "error" → 记 llm_error,
        // 不假成功(与确定性引擎 llm_error 同口径,SPEC honesty)。
        let llmErrorMsg: string | undefined;
        if (stopReason === "completed") {
          const errored = session.messages?.find(
            (m) => m.stopReason === "error",
          );
          if (errored) {
            stopReason = "llm_error";
            llmErrorMsg = errored.errorMessage;
            await input.onStep(
              `Pi 推理报错(${(errored.errorMessage ?? "error").slice(0, 120)})—— 诚实标记 llm_error`,
              "warn",
            );
          }
        }

        if (stopReason === "completed" && controller.terminationReason() == null) {
          controller.markCompleted();
        }
        const finalText = session.getLastAssistantText?.() ?? "";
        const stats = session.getSessionStats?.();
        session.dispose?.();

        const detail =
          `Pi 自主循环结束(${stopReason}):${toolLog.length} 次工具调用,` +
          `步 ${controller.stepsUsed()}/${controller.budget.maxSteps},` +
          `token ~${controller.tokensUsed()}/${controller.budget.maxTokens}`;
        return {
          summary: finalText ? finalText.slice(0, 800) : detail,
          output: {
            goal: input.goal,
            engineDetail: detail,
            finalText,
            outputs,
            toolLog,
            stopReason,
            ...(llmErrorMsg ? { llmError: llmErrorMsg } : {}),
            tokens: stats?.tokens,
          },
          steps: controller.stepsUsed(),
          stopReason,
        };
      } catch (err) {
        // 运行中未预期错误 → 诚实退确定性兜底(不假成功;记真因)。
        const msg = err instanceof Error ? err.message : String(err);
        await input.onStep(
          `Pi 引擎运行异常(${msg.slice(0, 160)})—— 退确定性兜底`,
          "warn",
        );
        return deps.fallback.run(input);
      }
    },
  };
}
