import { ENDPOINTS, type Transport } from "@creatoros/contract";

/**
 * [T-374] 自己作品单条立抓逐字稿(composition-only op):wrap projects transport,拦
 * projects.transcribe(module transport 不认它 —— 触发要 ai transport 的 transcribe.douyin
 * 排队 + live dispatch,在 composition 层才可见,同 benchmarkWithTranscribe 约定)。其余 op 透传。
 *
 * 链路:projects.get 解析该项目 platformRef(douyin + 非空 externalId;无锚 → ValidationError
 * 400 诚实拒绝)→ ai.tasks.create 排 transcribe.douyin(awemeIds=[externalId];create 拦截链
 * live dispatch → runTranscribe:幂等已有稿跳过,落 ensureTranscriptArtifact —— 与每日
 * 自动链同源落点,绝不另造)。返回 taskId(转写分钟级后台跑,前端不轮询到完成)。
 *
 * 抽成独立工厂(非 persistence-client 内联)是为了通道可确定性单测:注入假 projects/ai
 * transport 即可验「解析锚→排任务→回 taskId / 无锚 400」,不必 boot pglite + 真 dispatch。
 */
export function createProjectsWithTranscribe(deps: {
  projects: Transport;
  ai: Transport;
}): Transport {
  const { projects, ai } = deps;
  return {
    async request(endpoint, input, ctx) {
      if (endpoint.id === "projects.transcribe") {
        if (!ctx) throw new Error("AuthenticationError: transcribe requires ctx");
        const { params } = (input ?? {}) as { params?: { projectId?: string } };
        const projectId = params?.projectId ?? "";
        // 属主门复用 projects.get(查不到/跨号 → 模块自身 OwnershipError → 404,不泄露存在)。
        const projEnvelope = (await projects.request(
          ENDPOINTS.getProject,
          { params: { projectId }, query: undefined, body: undefined },
          ctx,
        )) as {
          data?: { platformRef?: { platform?: string; externalId?: string } };
        };
        const ref = projEnvelope.data?.platformRef;
        const externalId =
          ref?.platform === "douyin" ? (ref.externalId ?? "").trim() : "";
        if (!externalId) {
          // 诚实 400:无抖音锚(手动项目/异常 imported 行)无法抓逐字稿。
          const err = new Error(
            "ValidationError: 该项目没有关联抖音作品(无 platformRef.externalId),无法抓取逐字稿",
          );
          (err as Error & { code: string }).code = "ValidationError";
          throw err;
        }
        const created = (await ai.request(
          ENDPOINTS.createAITask,
          {
            params: undefined,
            query: undefined,
            body: {
              taskType: "transcribe.douyin",
              inputData: { awemeIds: [externalId] },
            },
          },
          ctx,
        )) as { data?: { id?: string } };
        return {
          data: { taskId: created.data?.id ?? "" },
          meta: { requestId: ctx.requestId },
        };
      }
      return projects.request(endpoint, input, ctx);
    },
  };
}
