import { AGENTIC_CONTINUATION_PROMPT } from "./continuation";
// [T-313] 真 Pi 引擎 —— 把 AgenticEngine 循环真接上 `@earendil-works/pi-coding-agent` SDK
// 的 `createAgentSession()`(库级内嵌 sidecar,无 TTY)。执行器/适配器/护栏零改动(engine.ts 契约)。
//
// ── 关键落地事实(装 0.80.7 现场核实,见 docs/research/2026-07-14-pi-engine-impl-notes.md)──────
//   · headless 可嵌:**深导入 `dist/core/sdk.js`**(绕开 barrel `dist/index.js`——它 eager 载
//     modes/interactive TUI + main;深导入只走 core,pi-tui `getCapabilities` 无 TTY 不崩)。
//   · L3 物理排除:`createAgentSession({ noTools:"builtin", excludeTools:[...] })` → 自带
//     read/bash/edit/write 不进工具注册表(getAllTools 只剩 customTools)。**不是** "all"(那会连
//     customTools 一起禁掉)。单测断言(pi-engine.test.ts)。
//   · [RT-H02/H03] 受控 ResourceLoader 隔离:不传 loader 时 pi 用 DefaultResourceLoader 扫 cwd +
//     `~/.pi/agent`,加载项目/用户 extension、custom tool、skill、AGENTS.md/CLAUDE.md,并且**我方
//     systemPrompt 被丢弃**(pi 的 system prompt 由 ResourceLoader 经 buildSystemPrompt 构造,见
//     agent-session.js:708 / system-prompt.js:13)。→ 传一个指向**隔离空目录**、`no{Extensions,
//     Skills,PromptTemplates,Themes,ContextFiles}:true` 的 DefaultResourceLoader,并用
//     `systemPromptOverride` 强注我方 systemPrompt(替换 pi 默认「expert coding assistant」提示):
//     零 extension / 零外部 custom tool / 零 skill / 零 context 文件,仅显式 customTools 生效。
//   · §6.1 回接:走 pi 自己的 custom-provider 机制 `ModelRegistry.registerProvider(name,{api,
//     baseUrl,apiKey,authHeader,models})` + `find()` → `createAgentSession({model,modelRegistry})`。
//     authHeader:true=Authorization Bearer(anthropic relay/MiniMax);falsy=api 默认(anthropic x-api-key)。
//   · LoopController 在 streamFn/工具执行前分别 admission，message_end 结算 usage；
//     已提交的模型请求不整体回退重放，取消与耗尽在下一次调用前拦截。
//   · customTools 参数:zod → `z.toJSONSchema(schema,{io:"input"})`(去 $schema)= 纯 JSON Schema;
//     pi 的 validateToolArguments 走非-TypeBox 分支校验+coerce;**权威校验仍在 execute 内我方 zod safeParse**。
//   · 依赖缺席/打包实拷缺失/无 llmConfig/运行异常 → 退 deterministic 兜底(保留现有全绿默认路径)。
import * as fs from "node:fs/promises";
import * as os from "node:os";
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
import type { LoopController, StopReason } from "./loop-control";

/**
 * [legacy] Pi 未就绪错误 —— 现已改为「退确定性兜底」而非抛错(见 run());保留导出仅为 barrel 兼容。
 */
export class PiNotInstalledError extends Error {
  constructor() {
    super("真 Pi 引擎未就绪(装 @earendil-works/pi-coding-agent + 提供 llmConfig)。");
    this.name = "PiNotInstalledError";
  }
}

export class PiModelConfigurationError extends Error {
  constructor() {
    super("模型接口格式配置无效");
    this.name = "PiModelConfigurationError";
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
   * production 不传:走 pi 内建 api(anthropic-messages / openai-completions /
   * openai-responses,真烧用户 provider)。
   */
  buildStreamSimple?: (llmConfig: RawLlmConfig) => unknown;
  wrapStream?: (stream: unknown, input: AgenticEngineRunInput) => unknown;
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
  switch (apiFormat) {
    case "anthropic":
      return "anthropic-messages";
    case "openai_chat":
      return "openai-completions";
    case "openai_responses":
      return "openai-responses";
    default:
      throw new PiModelConfigurationError();
  }
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
  // 即便测试/宿主注入 faux apiName，也必须先验证正式配置，禁止绕过后猜成 OpenAI。
  const configuredApi = piApiForFormat(llmConfig.apiFormat);
  const piApi = opts.apiName ?? configuredApi;
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
  controller?: LoopController;
  onEvidence?: (entry: {callId: string; tool: string; summary: string; data: unknown}) => void;
  decideDryRun: (tool: AgenticTool) => boolean;
  signal: AbortSignal;
  onStep: (text: string, kind?: string) => Promise<void>;
  toolLog: Array<{ tool: string; dryRun: boolean; summary: string }>;
  outputs: Record<string, unknown>;
  /**
   * [RT-M01] 真实(非干跑)工具执行前回调 —— 记一次「已提交副作用」。运行异常时据此判定:
   * 本轮有真实副作用则**禁止**整体回退确定性引擎(否则会重放 = 重复付费/重复落库)。
   */
  onRealExecute?: () => void;
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
    parameters: tool.jsonParameters ?? zodToPiParameters(tool.parameters),
    // 配合限流/防封端口:turn 内工具顺序执行(不并行,SPEC §12 未决④拍板 sequential)。
    executionMode: "sequential",
    async execute(
      _toolCallId: string,
      params: unknown,
    ): Promise<{
      content: Array<{ type: "text"; text: string }>;
      details: Record<string, unknown>;
    }> {
      ctx.signal.throwIfAborted();
      if (ctx.controller && !ctx.controller.beginStep()) {
        throw new Error(`执行已停止：${ctx.controller.terminationReason()}`);
      }
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
      // RT-M01:真实(非干跑)执行**动手前**就记副作用 —— 即便 execute 中途抛错也算「可能已提交」,
      // 异常时据此禁止整体重放(保守:宁可不重放,不可重复付费/重复落库)。
      if (!dryRun) ctx.onRealExecute?.();
      const result = await tool.execute(parsed.data, {
        signal: ctx.signal,
        toolCallId: _toolCallId,
        dryRun,
      });
      if (result.hasEvidence === true) ctx.onEvidence?.({callId: _toolCallId, tool: tool.name, summary: result.summary, data: result.data});
      ctx.toolLog.push({ tool: tool.name, dryRun, summary: result.summary });
      ctx.outputs[tool.name] = result.data ?? result.summary;
      await ctx.onStep(
        `${dryRun ? "[干跑] " : ""}${tool.label}:${result.summary}`,
        dryRun ? "dryrun" : "tool",
      );
      // content 才会进入供应商请求；details 仅是宿主诊断信息。
      const text = JSON.stringify({
        summary: result.summary,
        ...(result.data !== undefined ? { evidence: result.data } : {}),
        ...(dryRun && result.plan ? { plan: result.plan } : {}),
      });
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
  /**
   * [RT-H02/H03] pi 的 DefaultResourceLoader 构造器 —— 用它造**受控/隔离**的 ResourceLoader
   * (指向空目录 + 关掉所有资源发现 + 强注我方 systemPrompt),替代 createAgentSession 默认自建的、
   * 会扫 cwd + `~/.pi/agent` 的那个。
   */
  DefaultResourceLoader: new (opts: Record<string, unknown>) => PiResourceLoader;
}
/**
 * [RT-H02/H03] pi ResourceLoader 契约裁剪 —— createAgentSession 经它取 system prompt / extensions /
 * skills / prompts / context 文件(agent-session.js:708、2002)。受控 loader 让这些全部归零/受控。
 */
interface PiResourceLoader {
  reload: () => Promise<void>;
  getSystemPrompt: () => string | undefined;
  getExtensions: () => { extensions: unknown[] };
  getSkills: () => { skills: unknown[] };
  getPrompts: () => { prompts: unknown[] };
  getAgentsFiles: () => { agentsFiles: unknown[] };
}
interface PiModelRegistry {
  registerProvider: (name: string, config: Record<string, unknown>) => void;
  find: (provider: string, id: string) => unknown;
}
interface PiSession {
  agent?: { streamFn: (...args: unknown[]) => unknown };
  subscribe: (listener: (ev: PiEvent) => void) => (() => void) | void;
  prompt: (text: string) => Promise<void>;
  waitForIdle: () => Promise<void>;
  abort: () => Promise<void>;
  getLastAssistantText?: () => string | undefined;
  getSessionStats?: () => { tokens?: Record<string, number> } | undefined;
  setAutoRetryEnabled?: (enabled: boolean) => void;
  setAutoCompactionEnabled?: (enabled: boolean) => void;
  readonly messages?: ReadonlyArray<{
    role?: string;
    stopReason?: string;
    errorMessage?: string;
  }>;
  dispose?: () => void;
}
interface PiEvent {
  type: string;
  message?: { role?: string; usage?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number } };
}

/** 实际加载同一深层 SDK 依赖；不因包名存在就宣称执行能力。 */
export async function isPiAgenticRuntimeAvailable(): Promise<boolean> {
  return (await loadPiSdk()) !== null;
}

let cachedSdk: PiSdk | null = null;
let testSdkOverride: PiSdk | null | undefined; // undefined = 无 override(走真加载)
async function loadPiSdk(): Promise<PiSdk | null> {
  if (testSdkOverride !== undefined) return testSdkOverride; // null → 强制「未就绪」路径
  if (cachedSdk) return cachedSdk;
  try {
    let loaded: PiSdk;
    const runtimeRoot = process.env.CREATOROS_RUNTIME_ROOT;
    const packagedBundle = runtimeRoot ? path.join(runtimeRoot, "layers/core/pi/pi-bundle.mjs") : null;
    if (packagedBundle && await fs.stat(packagedBundle).then(s => s.isFile()).catch(() => false)) {
      // Windows分层包已把SDK打成单一入口，不再要求开发机node_modules布局。
      loaded = await import(/* webpackIgnore: true */ pathToFileURL(packagedBundle).href) as unknown as PiSdk;
    } else {
    const coreDir = await locatePiCoreDir();
    if (!coreDir) return null;
    const imp = (f: string): Promise<Record<string, unknown>> =>
      import(
        /* webpackIgnore: true */ pathToFileURL(path.join(coreDir, f)).href
      ) as Promise<Record<string, unknown>>;
    const [sdk, mr, as, sm, rl] = await Promise.all([
      imp("sdk.js"),
      imp("model-registry.js"),
      imp("auth-storage.js"),
      imp("session-manager.js"),
      imp("resource-loader.js"), // RT-H02/H03:受控 ResourceLoader 隔离用
    ]);
    loaded = {
      createAgentSession: sdk.createAgentSession,
      ModelRegistry: mr.ModelRegistry,
      AuthStorage: as.AuthStorage,
      SessionManager: sm.SessionManager,
      DefaultResourceLoader: rl.DefaultResourceLoader,
    } as unknown as PiSdk;
    }
    if (
      typeof loaded.createAgentSession !== "function" ||
      !loaded.ModelRegistry ||
      !loaded.AuthStorage ||
      !loaded.SessionManager ||
      typeof loaded.DefaultResourceLoader !== "function"
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

// ── [RT-H02/H03] 受控 ResourceLoader 隔离 ───────────────────────────────────────────────────
let cachedIsolatedDir: string | null = null;
/**
 * 备一个**隔离空目录**当 Pi 会话的 cwd + agentDir —— 让 SettingsManager / DefaultResourceLoader /
 * packageManager 的所有磁盘发现都指向它(空 → 零发现),**绝不扫真实项目 cwd 或 `~/.pi/agent`**。
 * 复用同一目录(memoize):无副作用、幂等。
 */
async function ensureIsolatedResourceDir(): Promise<string> {
  if (cachedIsolatedDir) return cachedIsolatedDir;
  const dir = path.join(os.tmpdir(), "creatoros-pi-isolated");
  await fs.mkdir(dir, { recursive: true });
  cachedIsolatedDir = dir;
  return dir;
}

/**
 * [RT-H02/H03] 造受控 ResourceLoader:
 *   - cwd/agentDir 指向隔离空目录 `isolatedDir` —— 即便有磁盘发现也扫到空;
 *   - no{Extensions,Skills,PromptTemplates,Themes,ContextFiles}:true —— 物理关掉全部资源发现,
 *     确保**零 extension、零外部 custom tool、零 skill、零 AGENTS.md/CLAUDE.md** 进会话;
 *   - `systemPromptOverride: () => systemPrompt` —— **强注**我方 systemPrompt,绕开 pi 的
 *     SYSTEM.md 发现与「把入参当文件路径读」的 resolvePromptInput(RT-H02);buildSystemPrompt 见到
 *     customPrompt 会**整段替换** pi 默认「expert coding assistant」提示(system-prompt.js:13-34)。
 * 导出供单测直接断言(零发现 + systemPrompt 生效)。
 */
export async function buildIsolatedResourceLoader(
  sdk: PiSdk,
  systemPrompt: string | undefined,
  isolatedDir: string,
): Promise<PiResourceLoader> {
  const loader = new sdk.DefaultResourceLoader({
    cwd: isolatedDir,
    agentDir: isolatedDir,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    // override 回调恒返回我方 prompt(无视磁盘发现结果),airtight 注入。
    systemPromptOverride: () => systemPrompt,
  });
  await loader.reload();
  return loader;
}

/**
 * 真 Pi 引擎。装好 `@earendil-works/pi-coding-agent` + 执行器注入 §6.1 llmConfig 后真跑;
 * 任一前置不满足 → 退 deps.fallback(确定性,现有全绿路径)。
 */
export function createPiAgenticEngine(deps: PiAgenticEngineDeps): AgenticEngine {
  return {
    name: "pi",
    async run(input: AgenticEngineRunInput): Promise<AgenticEngineFinal> {
      // §6.1:无 raw config(deterministic-only 装配 / 未接 resolveLlmConfig)→ 诚实退兜底。
      if (input.signal.aborted) input.controller.markAborted();
      if (!input.controller.canContinue()) {
        return { summary: "任务已停止", output: {}, steps: input.controller.stepsUsed(), stopReason: input.controller.terminationReason() ?? "aborted" };
      }
      if (!input.llmConfig) {
        await input.onStep(
          "Pi 引擎未拿到 model-config(§6.1)—— 退确定性兜底",
          "warn",
        );
        return { ...await deps.fallback.run(input), actualEngine: deps.fallback.name };
      }
      // 配置错误不是“依赖缺席”，不得进入确定性 fallback，也不得加载 SDK/发网络。
      piApiForFormat(input.llmConfig.apiFormat);
      const sdk = await loadPiSdk();
      if (!sdk) {
        await input.onStep(
          "Pi SDK 未就绪(依赖缺席 / 打包实拷缺失)—— 退确定性兜底",
          "warn",
        );
        return { ...await deps.fallback.run(input), actualEngine: deps.fallback.name };
      }

      const { controller, signal, llmConfig } = input;
      const outputs: Record<string, unknown> = {};
      const toolLog: Array<{ tool: string; dryRun: boolean; summary: string }> =
        [];
      let stopReason: StopReason = "completed";

      // [RT-M01] 本轮已提交的真实(非干跑)工具副作用计数 —— 异常时>0 则**禁止**整体重放。
      let sideEffectsCommitted = 0;
      let modelCallsStarted = 0;
      let hasUsableOutput = false;
      const evidence: Array<{callId: string; tool: string; summary: string; data: unknown}> = [];
      // [RT-M02] 会话 / 订阅 / abort 监听句柄提到 try 外,单一最外层 finally 统一清理(不泄漏)。
      let session: PiSession | undefined;
      let unsub: (() => void) | void = undefined;
      let onAbort: (() => void) | undefined;

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
          return { ...await deps.fallback.run(input), actualEngine: deps.fallback.name }; // 未创建会话/未动工具 → 零副作用,回退安全
        }

        // L3 物理排除 + customTools(白名单已上游 filterToolsToScope 过;此处只映射在册工具)。
        const customTools = input.tools.map((t) =>
          toPiCustomTool(t, {
            controller,
            onEvidence: (entry) => {hasUsableOutput = true; evidence.push(entry);},
            decideDryRun: input.decideDryRun,
            signal,
            onStep: input.onStep,
            toolLog,
            outputs,
            onRealExecute: () => {
              sideEffectsCommitted += 1; // RT-M01:真实执行 = 已提交副作用
            },
          }),
        );

        // [RT-H02/H03] 受控 ResourceLoader:注我方 systemPrompt + 零 extension/skill/prompt/context;
        // cwd/agentDir 同指隔离空目录 —— SettingsManager / 工具 cwd 也不落到真实项目或 `~/.pi`。
        const isolatedDir = await ensureIsolatedResourceDir();
        const resourceLoader = await buildIsolatedResourceLoader(
          sdk,
          input.systemPrompt,
          isolatedDir,
        );

        const created = await sdk.createAgentSession({
          model,
          modelRegistry,
          noTools: "builtin",
          excludeTools: [...EXCLUDED_BUILTIN_TOOLS],
          customTools,
          sessionManager: sdk.SessionManager.inMemory(),
          resourceLoader, // RT-H02/H03:我方受控 loader 取代默认(默认会扫 cwd + ~/.pi 并吞掉 systemPrompt)
          cwd: isolatedDir,
          agentDir: isolatedDir,
        });
        session = created.session;
        const sess = session; // 收窄:闭包内用非空引用
        // 在真正发 provider 请求之前 admission；turn_end 已晚于模型与工具执行。
        if (sess.agent) {
          if (deps.wrapStream) sess.agent.streamFn = deps.wrapStream(sess.agent.streamFn, input) as typeof sess.agent.streamFn;
          const stream = sess.agent.streamFn;
          sess.agent.streamFn = (...args: unknown[]) => {
            signal.throwIfAborted();
            if (!controller.beginStep()) {
              stopReason = controller.terminationReason() ?? "max_steps";
              throw new Error(`执行已停止：${stopReason}`);
            }
            modelCallsStarted += 1;
            return stream(...args);
          };
        }

        // 暂态重试由持久宿主记录retryAt并续跑；SDK不能另发未记账请求。
        // 上下文窗口由durable stream按同一回执规范缩减，内建compaction会绕开该端口。
        sess.setAutoRetryEnabled?.(false);
        sess.setAutoCompactionEnabled?.(false);

        // abort 贯通(input.signal → session.abort)。
        onAbort = (): void => {
          controller.markAborted();
          stopReason = "aborted";
          void sess.abort();
        };
        if (signal.aborted) onAbort();
        else signal.addEventListener("abort", onAbort, { once: true });

        // 模型完成后、工具开始前结算真实 usage；调用次数在 admission 时记录。
        unsub = sess.subscribe((ev: PiEvent) => {
          try {
            if (ev.type !== "message_end" || ev.message?.role !== "assistant") return;
            const usage = ev.message?.usage;
            const charged = usage
              ? (usage.input ?? 0) + (usage.output ?? 0) + (usage.cacheRead ?? 0) + (usage.cacheWrite ?? 0)
              : 0;
            if (charged > 0 && !controller.chargeTokens(charged)) {
              stopReason = "budget_exhausted";
              void sess.abort();
            }
          } catch {
            // 事件处理异常不打断循环(诚实:控制器状态已尽力更新)。
          }
        });

        if (signal.aborted) signal.throwIfAborted();
        await sess.prompt(input.goal);
        await sess.waitForIdle();
        // 输出窗口耗尽只结束单次生成，同一任务与会话继续；后端预算和用户取消仍有效。
        while (input.continueTruncated && !signal.aborted && controller.canContinue()) {
          const last = sess.messages?.filter(message => message.role === "assistant").at(-1);
          if (last?.stopReason !== "length") break;
          await input.onStep("输出达到单次长度上限，正在继续剩余工作", "info");
          await sess.prompt(AGENTIC_CONTINUATION_PROMPT);
          await sess.waitForIdle();
        }
        stopReason = controller.terminationReason() ?? stopReason;

        // 诚实:LLM 调用报错(未配/凭据错/网络)→ 末条助手消息 stopReason "error" → 记 llm_error,
        // 不假成功(与确定性引擎 llm_error 同口径,SPEC honesty)。
        let llmErrorCategory: "provider_error" | undefined;
        if (stopReason === "completed") {
          const lastAssistant = sess.messages?.filter((m) => m.role === "assistant").at(-1);
          const errored = lastAssistant?.stopReason === "error" ? lastAssistant : undefined;
          if (errored) {
            stopReason = "llm_error";
            llmErrorCategory = "provider_error";
            await input.onStep(
              "Pi 推理报错（provider_error）—— 诚实标记 llm_error",
              "warn",
            );
          }
        }

        if (stopReason === "completed" && controller.terminationReason() == null) {
          controller.markCompleted();
        }
        const finalText = sess.getLastAssistantText?.() ?? "";
        const stats = sess.getSessionStats?.();

        const detail =
          `Pi 自主循环结束(${stopReason}):${toolLog.length} 次工具调用,` +
          `步 ${controller.stepsUsed()}/${controller.budget.maxSteps},` +
          `token ~${controller.tokensUsed()}/${controller.budget.maxTokens}`;
        return {
          hasUsableOutput,
          actualEngine: "pi",
          summary: finalText ? finalText.slice(0, 800) : detail,
          output: {
            goal: input.goal,
            engineDetail: detail,
            finalText,
            outputs,
            evidence,
            toolLog,
            stopReason,
            ...(llmErrorCategory ? { llmError: llmErrorCategory } : {}),
            tokens: stats?.tokens,
          },
          steps: controller.stepsUsed(),
          stopReason,
        };
      } catch {
        if (signal.aborted) controller.markAborted();
        if (controller.terminationReason()) {
          return { actualEngine: "pi", hasUsableOutput, summary: "任务已停止", output: { outputs, evidence, toolLog }, steps: controller.stepsUsed(), stopReason: controller.terminationReason()! };
        }
        // [RT-M01] 仅当**本轮零真实副作用**时,整体回退确定性兜底才安全(保命路径,SPEC §3.1)。
        if (sideEffectsCommitted === 0 && modelCallsStarted === 0) {
          await input.onStep(
            "Pi 引擎运行异常（provider_runtime_error）—— 本轮零副作用，退确定性兜底",
            "warn",
          );
          return { ...await deps.fallback.run(input), actualEngine: deps.fallback.name };
        }
        // 已提交真实副作用 → **绝不**整体重放(否则重复付费/重复落库);诚实返回已完成部分做检查点。
        stopReason = "llm_error";
        await input.onStep(
          `Pi 引擎运行异常（provider_runtime_error）—— 已提交 ${sideEffectsCommitted} 次真实工具副作用，不整体重放；返回部分产物供检查点`,
          "warn",
        );
        const detail =
          `Pi 自主循环异常中断(${stopReason}):${toolLog.length} 次工具调用,` +
          `步 ${controller.stepsUsed()}/${controller.budget.maxSteps},` +
          `token ~${controller.tokensUsed()}/${controller.budget.maxTokens}`;
        return {
          hasUsableOutput,
          actualEngine: "pi",
          summary: detail,
          output: {
            goal: input.goal,
            engineDetail: detail,
            finalText: "",
            outputs,
            evidence,
            toolLog,
            stopReason,
            error: "provider_runtime_error",
            // 检查点:续跑时喂回 params.checkpoint(硬顶跨续跑生效,不重置预算)。
            checkpoint: {
              stepsUsed: controller.stepsUsed(),
              tokensUsed: controller.tokensUsed(),
            },
          },
          steps: controller.stepsUsed(),
          stopReason,
        };
      } finally {
        // [RT-M02] 单一最外层清理:退订事件 → 摘 abort 监听 → dispose 会话(任一句柄可能未建,全防空)。
        if (typeof unsub === "function") unsub();
        if (onAbort) signal.removeEventListener("abort", onAbort);
        session?.dispose?.();
      }
    },
  };
}
