import { ENDPOINTS, type Transport } from "@creatoros/contract";
import {
  hasCurrentTranscriptForAweme,
  type TranscriptArtifactSummary,
  type TranscriptArtifactVersion,
} from "./project-transcript-artifact";

/**
 * [T-374] 自己作品单条立抓逐字稿(composition-only op):wrap projects transport,拦
 * projects.transcribe(module transport 不认它 —— 触发要 ai transport 的 transcribe.douyin
 * 排队 + live dispatch,在 composition 层才可见,同 benchmarkWithTranscribe 约定)。其余 op 透传。
 *
 * 链路:projects.get 解析该项目 platformRef(douyin + 非空 externalId;无锚 → ValidationError
 * 400 诚实拒绝)→ 写前按 output_script 当前版本检查该 aweme 是否已有真稿（有则拒绝）
 * → ai.tasks.create 排 transcribe.douyin。动作发起方生成的 attemptId 原样透传；同一网络
 * 请求重发由 AI service 收敛，新动作则使用新 attempt。返回 taskId(转写分钟级后台跑,
 * 前端不轮询到完成)。
 *
 * 抽成独立工厂(非 persistence-client 内联)是为了通道可确定性单测:注入假 projects/ai
 * transport 即可验「真稿门禁 / 解析锚→排任务→回 taskId / 无锚 400」，不必 boot pglite。
 */
export function createProjectsWithTranscribe(deps: {
  projects: Transport;
  ai: Transport;
  artifacts: Transport;
}): Transport {
  const { projects, ai, artifacts } = deps;
  return {
    async request(endpoint, input, ctx) {
      if (endpoint.id === "projects.transcribe") {
        if (!ctx) throw new Error("AuthenticationError: transcribe requires ctx");
        const { params, body } = (input ?? {}) as {
          params?: { projectId?: string };
          body?: { attemptId?: string };
        };
        const projectId = params?.projectId ?? "";
        const attemptId = body?.attemptId ?? "";
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
        // [T-505] 与 runner 同一落点口径做写前门禁：已有该 aweme 的当前逐字稿，
        // 项目页不支持二次抓取。这里必须在 enqueue 之前拒绝，不能只依赖 worker
        // “接单后跳过”，否则仍会留下重复 ai_task。
        const hasTranscript = await hasCurrentTranscriptForAweme(
          {
            async listProjectArtifacts(id) {
              const envelope = (await artifacts.request(
                ENDPOINTS.listArtifacts,
                {
                  params: { projectId: id },
                  query: { page: 1, pageSize: 200 },
                  body: undefined,
                },
                ctx,
              )) as { data?: TranscriptArtifactSummary[] };
              return envelope.data ?? [];
            },
            async listArtifactVersions(artifactId) {
              const envelope = (await artifacts.request(
                ENDPOINTS.listArtifactVersions,
                {
                  params: { artifactId },
                  query: { page: 1, pageSize: 200 },
                  body: undefined,
                },
                ctx,
              )) as { data?: TranscriptArtifactVersion[] };
              return envelope.data ?? [];
            },
          },
          projectId,
          externalId,
        );
        if (hasTranscript) {
          const err = new Error(
            "ConflictError: 该项目已经有逐字稿，不支持重复抓取",
          );
          (err as Error & { code: string }).code = "ConflictError";
          throw err;
        }
        const created = (await ai.request(
          ENDPOINTS.createAITask,
          {
            params: undefined,
            query: undefined,
            body: {
              taskType: "transcribe.douyin",
              attemptId,
              inputData: {
                awemeIds: [externalId],
                projectId,
                // [T-505] 稳定业务键：同账号下同项目/同作品的 queued/running
                // 重复 POST 由 ai_tasks 唯一键原子收敛为同一任务；failed 后显式重试
                // 仍由 ai.service 的 terminal freshen 语义创建新一轮。
                idempotencyKey: `project-transcribe:${projectId}:${externalId}`,
              },
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
