/**
 * [T-374] projects.transcribe 通道测(composition-only 拦截工厂):
 *   - 有抖音锚 → projects.get 解析 externalId → ai.tasks.create 排 transcribe.douyin
 *     (awemeIds=[externalId])→ 返回 { taskId };
 *   - 无锚(空形状 / 非 douyin 平台)→ ValidationError(code 齐,dispatch 映 400),不排任务;
 *   - 无 ctx → AuthenticationError;
 *   - 其余 op 原样透传底层 projects transport(不碰 ai)。
 * 确定性:注入假 transports,零网络 / 零 DB。
 */

import { describe, expect, it, vi } from "vitest";
import type {
  Endpoint,
  RequestContext,
  Transport,
} from "@creatoros/contract";
import { ENDPOINTS } from "@creatoros/contract";

import { createProjectsWithTranscribe } from "./projects-transcribe-wrap";

const ctx = { userId: "u1", requestId: "req-1" } as RequestContext;

function fakeTransports(
  platformRef: unknown,
  artifactRows: unknown[] = [],
  versionRows: unknown[] = [],
) {
  const projectsRequest = vi.fn(
    async (endpoint: Endpoint): Promise<unknown> => {
      if (endpoint.id === "projects.get") {
        return { data: { id: "p-1", platformRef }, meta: { requestId: "req-1" } };
      }
      return { data: { passthrough: endpoint.id }, meta: { requestId: "req-1" } };
    },
  );
  const aiRequest = vi.fn(async (..._args: unknown[]): Promise<unknown> => ({
    data: { id: "task-99" },
    meta: { requestId: "req-1" },
  }));
  const artifactsRequest = vi.fn(
    async (endpoint: Endpoint): Promise<unknown> => {
      if (endpoint.id === "artifacts.list") {
        return { data: artifactRows, meta: { requestId: "req-1" } };
      }
      if (endpoint.id === "artifacts.versions.list") {
        return { data: versionRows, meta: { requestId: "req-1" } };
      }
      return { data: null, meta: { requestId: "req-1" } };
    },
  );
  const projects = { request: projectsRequest } as unknown as Transport;
  const ai = { request: aiRequest } as unknown as Transport;
  const artifacts = { request: artifactsRequest } as unknown as Transport;
  return {
    projects,
    ai,
    artifacts,
    projectsRequest,
    aiRequest,
    artifactsRequest,
  };
}

const input = {
  params: { projectId: "p-1" },
  query: undefined,
  body: { attemptId: "attempt-transcribe-0001" },
} as never;

describe("createProjectsWithTranscribe (T-374)", () => {
  it("有抖音锚 → 解析 externalId → 排 transcribe.douyin(awemeIds=[externalId])→ 回 taskId", async () => {
    const { projects, ai, artifacts, projectsRequest, aiRequest } = fakeTransports({
      platform: "douyin",
      externalId: "  aweme-42  ", // 带空白:验证 trim
    });
    const wrapped = createProjectsWithTranscribe({ projects, ai, artifacts });
    const res = (await wrapped.request(
      ENDPOINTS.transcribeProjectWork,
      input,
      ctx,
    )) as { data: { taskId: string } };
    expect(res.data.taskId).toBe("task-99");
    // 属主门:锚解析走 projects.get(带 projectId)。
    expect(projectsRequest).toHaveBeenCalledTimes(1);
    expect(projectsRequest.mock.calls[0]![0]).toBe(ENDPOINTS.getProject);
    // 排队走 ai.tasks.create,任务形状 = 现有 transcribe.douyin 契约(批字段单条传)。
    expect(aiRequest).toHaveBeenCalledTimes(1);
    const [aiEndpoint, aiInput] = aiRequest.mock.calls[0] as unknown as [
      Endpoint,
      {
        body: {
          taskType: string;
          attemptId: string;
          inputData: {
            awemeIds: string[];
            projectId: string;
            idempotencyKey: string;
          };
        };
      },
    ];
    expect(aiEndpoint).toBe(ENDPOINTS.createAITask);
    expect(aiInput.body.taskType).toBe("transcribe.douyin");
    expect(aiInput.body.attemptId).toBe("attempt-transcribe-0001");
    expect(aiInput.body.inputData.awemeIds).toEqual(["aweme-42"]);
    expect(aiInput.body.inputData.projectId).toBe("p-1");
    expect(aiInput.body.inputData.idempotencyKey).toBe(
      "project-transcribe:p-1:aweme-42",
    );
  });

  it("同一 projects.transcribe 请求重发 → 原样复用调用方 attemptId", async () => {
    const { projects, ai, artifacts, aiRequest } = fakeTransports({
      platform: "douyin",
      externalId: "aweme-42",
    });
    const wrapped = createProjectsWithTranscribe({ projects, ai, artifacts });

    await wrapped.request(ENDPOINTS.transcribeProjectWork, input, ctx);
    await wrapped.request(ENDPOINTS.transcribeProjectWork, input, ctx);

    const attempts = aiRequest.mock.calls.map(
      (call) =>
        (
          call[1] as {
            body: { attemptId: string };
          }
        ).body.attemptId,
    );
    expect(attempts).toEqual([
      "attempt-transcribe-0001",
      "attempt-transcribe-0001",
    ]);
  });

  it("已有该作品逐字稿 → 服务端拒绝二次抓取,不新建 AI 任务", async () => {
    const { projects, ai, artifacts, aiRequest } = fakeTransports(
      { platform: "douyin", externalId: "aweme-42" },
      [
        {
          id: "artifact-transcript",
          artifactType: "output_script",
          currentVersionId: "version-current",
        },
      ],
      [
        {
          id: "version-current",
          contentData: { awemeId: "aweme-42", transcript: "已有真稿" },
        },
      ],
    );
    const wrapped = createProjectsWithTranscribe({ projects, ai, artifacts });

    await expect(
      wrapped.request(ENDPOINTS.transcribeProjectWork, input, ctx),
    ).rejects.toMatchObject({ code: "ConflictError" });
    expect(aiRequest).not.toHaveBeenCalled();
  });

  it("无锚(默认空形状)→ ValidationError 400,不排任务", async () => {
    const { projects, ai, artifacts, aiRequest } = fakeTransports({
      platform: "",
      externalId: "",
    });
    const wrapped = createProjectsWithTranscribe({ projects, ai, artifacts });
    await expect(
      wrapped.request(ENDPOINTS.transcribeProjectWork, input, ctx),
    ).rejects.toMatchObject({ code: "ValidationError" });
    expect(aiRequest).not.toHaveBeenCalled();
  });

  it("非 douyin 平台锚 → 同样 ValidationError(只认抖音链)", async () => {
    const { projects, ai, artifacts, aiRequest } = fakeTransports({
      platform: "bilibili",
      externalId: "bv-1",
    });
    const wrapped = createProjectsWithTranscribe({ projects, ai, artifacts });
    await expect(
      wrapped.request(ENDPOINTS.transcribeProjectWork, input, ctx),
    ).rejects.toMatchObject({ code: "ValidationError" });
    expect(aiRequest).not.toHaveBeenCalled();
  });

  it("无 ctx → AuthenticationError(写路径要求明确身份)", async () => {
    const { projects, ai, artifacts } = fakeTransports({
      platform: "douyin",
      externalId: "aweme-1",
    });
    const wrapped = createProjectsWithTranscribe({ projects, ai, artifacts });
    await expect(
      wrapped.request(ENDPOINTS.transcribeProjectWork, input, undefined),
    ).rejects.toThrow(/AuthenticationError/);
  });

  it("其余 op 透传底层 projects transport,不碰 ai", async () => {
    const { projects, ai, artifacts, projectsRequest, aiRequest } =
      fakeTransports(null);
    const wrapped = createProjectsWithTranscribe({ projects, ai, artifacts });
    const res = (await wrapped.request(
      ENDPOINTS.listProjects,
      { params: undefined, query: { page: 1, pageSize: 10 }, body: undefined } as never,
      ctx,
    )) as { data: { passthrough: string } };
    expect(res.data.passthrough).toBe("projects.list");
    expect(projectsRequest).toHaveBeenCalledTimes(1);
    expect(aiRequest).not.toHaveBeenCalled();
  });
});
