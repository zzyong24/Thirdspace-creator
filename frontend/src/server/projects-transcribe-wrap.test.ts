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

function fakeTransports(platformRef: unknown) {
  const projectsRequest = vi.fn(
    async (endpoint: Endpoint): Promise<unknown> => {
      if (endpoint.id === "projects.get") {
        return { data: { id: "p-1", platformRef }, meta: { requestId: "req-1" } };
      }
      return { data: { passthrough: endpoint.id }, meta: { requestId: "req-1" } };
    },
  );
  const aiRequest = vi.fn(async (): Promise<unknown> => ({
    data: { id: "task-99" },
    meta: { requestId: "req-1" },
  }));
  const projects = { request: projectsRequest } as unknown as Transport;
  const ai = { request: aiRequest } as unknown as Transport;
  return { projects, ai, projectsRequest, aiRequest };
}

const input = {
  params: { projectId: "p-1" },
  query: undefined,
  body: undefined,
} as never;

describe("createProjectsWithTranscribe (T-374)", () => {
  it("有抖音锚 → 解析 externalId → 排 transcribe.douyin(awemeIds=[externalId])→ 回 taskId", async () => {
    const { projects, ai, projectsRequest, aiRequest } = fakeTransports({
      platform: "douyin",
      externalId: "  aweme-42  ", // 带空白:验证 trim
    });
    const wrapped = createProjectsWithTranscribe({ projects, ai });
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
      { body: { taskType: string; inputData: { awemeIds: string[] } } },
    ];
    expect(aiEndpoint).toBe(ENDPOINTS.createAITask);
    expect(aiInput.body.taskType).toBe("transcribe.douyin");
    expect(aiInput.body.inputData.awemeIds).toEqual(["aweme-42"]);
  });

  it("无锚(默认空形状)→ ValidationError 400,不排任务", async () => {
    const { projects, ai, aiRequest } = fakeTransports({
      platform: "",
      externalId: "",
    });
    const wrapped = createProjectsWithTranscribe({ projects, ai });
    await expect(
      wrapped.request(ENDPOINTS.transcribeProjectWork, input, ctx),
    ).rejects.toMatchObject({ code: "ValidationError" });
    expect(aiRequest).not.toHaveBeenCalled();
  });

  it("非 douyin 平台锚 → 同样 ValidationError(只认抖音链)", async () => {
    const { projects, ai, aiRequest } = fakeTransports({
      platform: "bilibili",
      externalId: "bv-1",
    });
    const wrapped = createProjectsWithTranscribe({ projects, ai });
    await expect(
      wrapped.request(ENDPOINTS.transcribeProjectWork, input, ctx),
    ).rejects.toMatchObject({ code: "ValidationError" });
    expect(aiRequest).not.toHaveBeenCalled();
  });

  it("无 ctx → AuthenticationError(写路径要求明确身份)", async () => {
    const { projects, ai } = fakeTransports({
      platform: "douyin",
      externalId: "aweme-1",
    });
    const wrapped = createProjectsWithTranscribe({ projects, ai });
    await expect(
      wrapped.request(ENDPOINTS.transcribeProjectWork, input, undefined),
    ).rejects.toThrow(/AuthenticationError/);
  });

  it("其余 op 透传底层 projects transport,不碰 ai", async () => {
    const { projects, ai, projectsRequest, aiRequest } = fakeTransports(null);
    const wrapped = createProjectsWithTranscribe({ projects, ai });
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
