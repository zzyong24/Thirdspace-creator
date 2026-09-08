
import { collectBenchmark, collectDarkhorse, runBenchmarkTeardown, assembleCreativeContext, ScheduledFlywheelSuspended, type Collector as ScheduledCollector } from "../../modules/ai-runtime";
/** 采集业务组合；宿主只注入真实资源读取，模型沿原任务执行权。 */
export function createBenchmarkCollector(ports:{
benchmarkService: Pick<ReturnType<typeof import("../../modules/benchmark").createBenchmarkService>,"listEnabledSources" | "recordWork" | "listPendingViralWorks" | "markTeardownDone">;
intelligenceService: Pick<ReturnType<typeof import("../../modules/intelligence").createIntelligenceService>,"isLegacySignalSourceWriteFenced">;
candidateService: Pick<ReturnType<typeof import("../../modules/candidate").createCandidateService>,"createCandidate" | "patchCandidate">;
positioningService: Pick<ReturnType<typeof import("../../modules/positioning").createPositioningService>,"readPositioningCenter">;
now: () => string;
models: ReturnType<typeof import("../../modules/ai-runtime").createScheduledFlywheelExecutionService>["models"];
fetchSourcePosts: Parameters<typeof collectBenchmark>[1]["fetchSourcePosts"];
searchVideos: Parameters<typeof collectDarkhorse>[1]["searchVideos"];
darkhorseKeywords: string;
checkScheduledSignal: () => void;
}): ScheduledCollector {
const {benchmarkService,intelligenceService,candidateService,positioningService,now,models,fetchSourcePosts,searchVideos,darkhorseKeywords,checkScheduledSignal}=ports;
return async (ctx, _target, report) => {
      if (await intelligenceService.isLegacySignalSourceWriteFenced(ctx)) {
        report({
          stage: "retired",
          processed: 0,
          total: 0,
          message: "旧对标采集已退役；请在内容雷达同步博主与作品。",
        });
        return {
          itemsNew: 0,
          itemsUpdated: 0,
          message: "旧对标采集已退役；来源、作品与转选题统一由内容雷达处理。",
        };
      }
      const result = await collectBenchmark(ctx, {
        listEnabledSources: (c) => benchmarkService.listEnabledSources(c),
        fetchSourcePosts,
        recordWork: (c, input) => {checkScheduledSignal();return benchmarkService.recordWork(c, input);},
        now: now,
        report,
      });
      // [T-235b] 黑马雷达(平台内证据):对标源采集后**串行**跑关键词黑马搜索(共享 gate-F5
      //   串行闸 + douyinGateway 限流预算)。关键词 = 定位 keywords + env
      //   CREATOROS_DARKHORSE_KEYWORDS(逗号分隔)可配;无关键词/未登录/验证码 → 采集器内
      //   诚实降级(0 跑/跳词),**绝不回退对标采集结果**(黑马失败只丢黑马)。
      let darkhorseResult: { itemsNew: number; itemsUpdated: number; message?: string } = { itemsNew: 0, itemsUpdated: 0 };
      try {
        darkhorseResult = await collectDarkhorse(ctx, {
          listKeywords: async (c) => {
            const envKeywords = darkhorseKeywords
              .split(/[,，]/)
              .map((k) => k.trim())
              .filter((k) => k.length > 0);
            let positioningKeywords: string[] = [];
            try {
              const center = await positioningService.readPositioningCenter(c);
              positioningKeywords = center.keywords ?? [];
            } catch {
              positioningKeywords = []; // 定位读失败 → 只用 env(诚实降级)
            }
            return [...positioningKeywords, ...envKeywords];
          },
          searchVideos,
          recordWork: (c, input) => {checkScheduledSignal();return benchmarkService.recordWork(c, input);},
          now: now,
          report,
        });
      } catch (err) {
        checkScheduledSignal();
        // 黑马整体失败(极端)→ 只丢黑马,不影响对标采集结果(诚实记错)。
        console.error("[darkhorse] 黑马雷达失败(不影响对标采集):", err);
      }
      // 合并计数(job_run 的 itemsNew/Updated = 对标 + 黑马;message 注明黑马实绩)。
      const result2 = {
        itemsNew: result.itemsNew + darkhorseResult.itemsNew,
        itemsUpdated: result.itemsUpdated + darkhorseResult.itemsUpdated,
        message: darkhorseResult.message,
      };
      // [T-212c/T-513] 采集落库后 **best-effort** 触发拆解转化；await 保证模型调用不逃出
      // 当前 scheduled task 的 snapshot/lease（失败仍 catch，不影响采集主结果）：
      //   读该号待拆爆款(is_viral+pending)→ AI 拆解(runStructuredNode,不抄袭换角度)→ 高适配
      //   ≤3 条 createCandidate(source=benchmark,参考链接+爆款倍数入 angle)→ 标 teardown_status=done。
      //   拆解走真 AI(慢),故不并进采集的 await;失败只记日志,绝不回退采集结果。
      await runBenchmarkTeardown(ctx, {
        listPendingViralWorks: (c, limit) =>
          benchmarkService.listPendingViralWorks(c, limit),
        getPositioningBrief: async (c) => {
          try {
            const cc = await assembleCreativeContext(
              c,
              { projectId: null, topic: "" },
              {
                positioning: {
                  getPositioningCenter: (c2) =>
                    positioningService.readPositioningCenter(c2),
                },
              },
            );
            return cc.positioningBrief;
          } catch {
            return "";
          }
        },
        teardown: models.teardown,
        createCandidate: async (c, input) => {
          const cand = await candidateService.createCandidate(c, input);
          return { id: cand.id };
        },
        // [T-284a] 复刻补链 G1:给刚建的 benchmark 候选补挂原爆款拆解要素(card.teardown)。绑
        //   candidateService.patchCandidate(card partial 浅合并;pickCardFields 已放行 teardown 对象)。
        patchCandidate: async (c, candidateId, patch) => {
          await candidateService.patchCandidate(c, candidateId, patch);
        },
        markTeardownDone: (c, workId) =>
          benchmarkService.markTeardownDone(c, workId),
      }).catch((err) => {
        if(err instanceof ScheduledFlywheelSuspended)throw err;
        console.error(
          "[benchmark] 拆解转化触发失败(best-effort,不影响采集):",
          err,
        );
      });
      return result2;
    };
}
