// executor 可插拔注册表(T-255a)。每个 executionTaskType 注册一个 executor:
//   - A 型 = 确定性脚本(本切片;video.render 归 T-254a);
//   - B 型 = 开源引擎子进程/进程内 agent loop(T-255b 条件触发)—— 接口按 B 案形状建
//     (run 收 sandbox + params + {signal, reportStep}),将来零改动注册。
//
// executor **只见沙箱文件面**:输入=input/ 只读物化文件,输出=写 out/;绝不直连
// PGlite/资产库/网络配置(数据壁垒留脑侧,SPEC §2)。
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { z } from "zod";
import type { ExecutionTaskType, RequestContext } from "@creatoros/contract";
import type { MaterializedInput, SandboxPaths } from "./sandbox";
import {
  createVideoRenderExecutor,
  createDefaultVideoRenderEngine,
  type ChromiumDownloader,
} from "./video-render/executor";
import { assertLoopType, classifyLoopType, type LoopType } from "./agentic/loop-type";

export interface ExecutorRunOpts {
  /** 超时/丢弃中止贯通(T-239c 模式):executor 应尽早响应 abort。 */
  signal: AbortSignal;
  /** 步骤流上报(落 ai_task_steps,喂前端步骤日志)。 */
  reportStep: (text: string) => Promise<void>;
  /**
   * [T-256b] 请求上下文 —— agentic executor 用它解析 model-config(§6.1 回接)与用户域领域端口
   * (buildLlm(ctx)/buildTools(ctx))。确定性 executor(echo/video.render)不需要,可忽略。
   * 编排 runExecutionTask 已持 ctx,additive 透传。
   */
  ctx?: RequestContext;
}

export interface ExecutorSandboxView extends SandboxPaths {
  /** 已物化的输入清单(mountAs 相对 input/)。 */
  inputs: readonly MaterializedInput[];
}

export interface ExecutionExecutor {
  taskType: ExecutionTaskType;
  /**
   * [T-256b] 声明的循环类型(判定规则 SPEC §8 gate-m1)。缺省 deterministic(A 型脚本);
   * agentic executor 声明 "agentic"。register 期强制 classifyLoopType(taskType)===此值(结构门:
   * 命名与循环类型不一致的 executor 装配就被拒,防「什么都塞 agent」/「agentic 名挂确定性壳」)。
   */
  loopType?: LoopType;
  /** per-taskType params 细化校验(可选);编排在执行前 parse,失败 → 任务 failed。 */
  paramsSchema?: z.ZodTypeAny;
  /**
   * 执行:读 input/,写 out/;返回 manifest 附加字段(summary/meta)。
   * 产物清单由编排收割 out/ 生成,executor 不自报清单(防谎报)。
   */
  run(
    sandbox: ExecutorSandboxView,
    params: Record<string, unknown>,
    opts: ExecutorRunOpts,
  ): Promise<{ summary?: string; meta?: Record<string, unknown> }>;
}

export interface ExecutorRegistry {
  register(executor: ExecutionExecutor): void;
  get(taskType: string): ExecutionExecutor | null;
  has(taskType: string): boolean;
  types(): string[];
  /** [T-256b] 某 taskType 的声明循环类型(建任务端 gate 用;未注册 → null)。 */
  loopTypeOf(taskType: string): LoopType | null;
}

export function createExecutorRegistry(): ExecutorRegistry {
  const executors = new Map<string, ExecutionExecutor>();
  return {
    register(executor) {
      if (executors.has(executor.taskType)) {
        throw new Error(`executor already registered: ${executor.taskType}`);
      }
      // [T-256b] 判定规则结构门:声明循环类型必须与 taskType 命名判定一致(SPEC §8 gate-m1)。
      assertLoopType(executor.taskType, executor.loopType ?? "deterministic");
      executors.set(executor.taskType, executor);
    },
    get(taskType) {
      return executors.get(taskType) ?? null;
    },
    has(taskType) {
      return executors.has(taskType);
    },
    types() {
      return [...executors.keys()];
    },
    loopTypeOf(taskType) {
      const e = executors.get(taskType);
      if (!e) return null;
      return e.loopType ?? classifyLoopType(taskType);
    },
  };
}

/**
 * demo executor `echo.manifest`(框架自检):把任务 goal + 已物化输入清单 + params
 * 原样写进 out/manifest.json —— 给沙箱物化/编排/收割/确认卡整条链一个可测可验的
 * 最小真实产物。video.render 归 T-254a。
 */
export function createEchoManifestExecutor(): ExecutionExecutor {
  return {
    taskType: "echo.manifest",
    async run(sandbox, params, { signal, reportStep }) {
      if (signal.aborted) throw new Error("aborted");
      await reportStep("echo.manifest:写入输入清单");
      const payload = {
        goal: typeof params.goal === "string" ? params.goal : "",
        inputs: sandbox.inputs.map((i) => ({
          assetId: i.assetId,
          mountAs: i.mountAs,
          size: i.size,
          mimeType: i.mimeType,
        })),
        params,
      };
      await fs.writeFile(
        path.join(sandbox.outDir, "manifest.json"),
        JSON.stringify(payload, null, 2),
        "utf8",
      );
      return {
        summary: `已回显 ${sandbox.inputs.length} 项输入清单`,
        meta: { inputCount: sandbox.inputs.length },
      };
    },
  };
}

/** 内置 executor 一次性登记(composition 层调用)。 */
export function registerBuiltinExecutors(
  registry: ExecutorRegistry,
  // [T-281] video.render 的 Chromium 下载器由组合根(frontend)注入 —— playwright CLI 定位
  //   只能在 frontend 上下文做(见 executor.ts ChromiumDownloader 注释)。缺省不注入 →
  //   未装 Chromium 时诚实报错引导(不自动下载)。
  opts?: { videoDownloadChromium?: ChromiumDownloader },
): void {
  registry.register(createEchoManifestExecutor());
  // [T-254a] video.render(HyperFrames 确定性渲染)。构造零 IO(工具链检测在 run 内)。
  registry.register(
    createVideoRenderExecutor(
      createDefaultVideoRenderEngine({
        downloadChromium: opts?.videoDownloadChromium,
      }),
    ),
  );
}
