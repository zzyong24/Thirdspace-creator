import "server-only";
import type { RequestContext } from "@creatoros/contract";

// 导入作品逐字稿 + 重建触发(T-151 / T-037,缺口 A)。
//
// 背景(真机 73 作品导入后发现):`transcribe.douyin`(逐字稿 D3)与 `reconstruct.project`
// (auto-fill 重建)两个 ai_task **从没被任何地方创建** —— 逐字稿因此全无(evidence #1),
// 重建也从不触发。两者的 dispatch 链早已就绪(persistence-client 的 ai transport 拦
// ai.tasks.create → transcribe.douyin/reconstruct.project 分支自动跑 runner),缺的只是**排队**。
//
// 正确依赖链:import(self.metrics 建 imported 作品)→ transcribe.douyin(按 awemeId 取音频+ASR,
// 产逐字稿 D3,绑 output_script transcript artifact)→ reconstruct.project(按 projectId,消费
// 逐字稿+真实指标+定位,反推 research/planning)。**reconstruct 依赖逐字稿存在**(runner 缺逐字稿
// 即 markFailed),故必须先触发 transcribe。本模块把「导入后排这两类任务」抽成纯逻辑(全端口
// 注入,可单测),由 self.metrics 采集器在指标落库后 fire-and-forget 调用。
//
// 铁律:
//   ① 全端口注入 —— 不 import ai/projects/artifacts service,host 在 persistence-client 接真实现;
//   ② 幂等(多闸):
//      - transcribe:一批 awemeId 排**一个** transcribe.douyin 任务(runner 内逐 aweme 幂等:
//        已有 transcript artifact 则跳过 fetch/ASR);createTask 按 (user, taskType, inputData)
//        去重 IN-FLIGHT 重复(同一批 awemeIds 在跑 → 命中既有,不建第二行)。
//      - reconstruct:**已有 reconstructed artifact 的项目跳过**(重建过了不重跑覆盖历史记忆);
//        createTask 再按 (user, taskType, {projectId}) 去重 IN-FLIGHT 重复。
//   ③ fire-and-forget:transcribe(ASR)/reconstruct(LLM)都慢,绝不同步阻塞导入 —— 本函数只
//      **排队**(createTask 立即返回 queued),真正的 runner 由 dispatch 链后台跑;单步失败降级
//      继续(记 failed),绝不抛出拖垮整批(整批 best-effort 兜底在调用方)。

/** 一条 imported 作品的两维锚(projectId 用于 reconstruct;externalId=aweme_id 用于 transcribe)。 */
export interface ImportedWork {
  projectId: string;
  externalId: string;
}

/** 排队一轮的统计。 */
export interface ReconstructEnqueueResult {
  /** imported 作品总数(两个子步骤共用的候选面)。 */
  considered: number;
  /** 是否排了 transcribe.douyin(有 awemeId 时排一个批任务)。 */
  transcribeEnqueued: boolean;
  /** transcribe 批任务里的 awemeId 数(0 = 没有可转写的作品)。 */
  transcribeAwemeCount: number;
  /**
   * 调了 createTask 排 reconstruct 的项目数(闸「已有 reconstructed artifact」未命中)。注:
   * createTask 自身对 IN-FLIGHT(queued/running)重复幂等命中既有(不建第二行),故本计数是
   * 「排队动作数」而非「新建任务数」——真去重在 service 层,重复调用无副作用。
   */
  reconstructEnqueued: number;
  /** 闸命中:已有 reconstructed artifact → 诚实跳过(重建过了不重跑)。 */
  reconstructSkipped: number;
  /** 单步(读 artifact / 排队)失败 → 降级继续,计数(绝不抛出拖垮整批)。 */
  failed: number;
}

export interface ReconstructEnqueuePorts {
  /** 本 user 全部 imported 作品的两维锚(host 绑 projectsService.listImportedWorks)。 */
  listImportedWorks(ctx: RequestContext): Promise<ImportedWork[]>;
  /**
   * 排一个 transcribe.douyin 任务(host 绑 ai transport 的 ai.tasks.create,inputData={awemeIds})。
   * **必须经 ai transport**(dispatch 链只在拦 ai.tasks.create 时触发;直调 service 会死链)。
   * 一批 awemeId 排一个批任务(runner 内逐 aweme 幂等)。awemeIds 空则调用方不调此端口。
   */
  enqueueTranscribe(ctx: RequestContext, awemeIds: string[]): Promise<void>;
  /** 该项目是否已有 origin='reconstructed' 的 artifact(闸;host 绑 listProjectArtifacts 过滤 origin)。 */
  hasReconstructedArtifact(
    ctx: RequestContext,
    projectId: string,
  ): Promise<boolean>;
  /**
   * 排一个 reconstruct.project 任务(host 绑 ai transport 的 ai.tasks.create,inputData={projectId})。
   * **必须经 ai transport**(同上,直调 service 死链)。service 从 inputData.projectId 落 projectId
   * 并派生幂等键去重 IN-FLIGHT 重复(同 projectId 的 queued/running 命中既有、不建第二行)。
   */
  enqueueReconstruct(ctx: RequestContext, projectId: string): Promise<void>;
}

/**
 * 导入后触发逐字稿 + 重建(fire-and-forget 语义:本函数只排队即返回,不等 runner)。
 *   1) 收全 imported 作品的 awemeId → 排一个 transcribe.douyin 批任务(产逐字稿 D3);
 *   2) 逐项目排 reconstruct.project(已重建的跳过;reconstruct 依赖逐字稿存在,故靠后续采集轮次
 *      再排时逐字稿已就绪 —— 本函数每轮采集都调,幂等,直到重建成功)。
 * 单步失败降级继续(③),整批异常由调用方 best-effort 兜底。
 */
export async function enqueueReconstructForImported(
  ports: ReconstructEnqueuePorts,
  ctx: RequestContext,
): Promise<ReconstructEnqueueResult> {
  const result: ReconstructEnqueueResult = {
    considered: 0,
    transcribeEnqueued: false,
    transcribeAwemeCount: 0,
    reconstructEnqueued: 0,
    reconstructSkipped: 0,
    failed: 0,
  };
  let works: ImportedWork[];
  try {
    works = await ports.listImportedWorks(ctx);
  } catch {
    // 连 imported 列表都读不到 → 整批放弃(0 considered),绝不抛(封面/指标主流程不受影响)。
    return result;
  }
  result.considered = works.length;

  // 1) 逐字稿:一批 awemeId 排一个 transcribe.douyin 批任务(runner 逐 aweme 幂等跳已转写)。
  const awemeIds = works.map((w) => w.externalId).filter((x) => x.length > 0);
  if (awemeIds.length > 0) {
    try {
      await ports.enqueueTranscribe(ctx, awemeIds);
      result.transcribeEnqueued = true;
      result.transcribeAwemeCount = awemeIds.length;
    } catch (err) {
      result.failed += 1;
      console.error(
        "[reconstruct-enqueue] 排队 transcribe.douyin 逐字稿任务失败:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  // 2) 重建:逐项目排 reconstruct.project(已有 reconstructed artifact 的跳过)。
  for (const work of works) {
    try {
      if (await ports.hasReconstructedArtifact(ctx, work.projectId)) {
        result.reconstructSkipped += 1;
        continue;
      }
      await ports.enqueueReconstruct(ctx, work.projectId);
      result.reconstructEnqueued += 1;
    } catch (err) {
      result.failed += 1;
      console.error(
        `[reconstruct-enqueue] 项目 ${work.projectId} 排队 reconstruct 失败:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return result;
}
