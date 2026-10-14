import { describe, it, expect, beforeEach, vi } from "vitest";

// /api/knowledge/distill 路由单测(T-079b)—— mock 组合根 + runner,断言路由:
// body 校验、鉴权直通(T-046 无 cookie 走本机主用户)、runner 结果透传({atoms,suggestedTags}
// 顶层直出)、失败诚实 4xx(倾倒场据此内联展示,原始输入保留)。真模型调用在 runner 层另测。

const resolveContextFromToken = vi.fn();
const resolveRequestContext = vi.fn();
const resolveLocalContext = vi.fn();
const runKnowledgeGeneration = vi.fn();
const runKnowledgeDistill = vi.fn();

vi.mock("@/server/persistence-client", () => ({
  getIdentityService: async () => ({
    resolveContextFromToken,
    resolveLocalContext,
  }),
  getChatRuntime: async () => ({
    runKnowledgeGeneration,
    runWithEffectiveSkills: async (
      _ctx: unknown,
      _skillIds: readonly string[],
      execute: () => Promise<unknown>,
    ) => execute(),
  }),
}));

vi.mock("@/lib/request-context.server",async original=>({...await original<typeof import('@/lib/request-context.server')>(),resolveRequestContext:(...args:unknown[])=>{resolveRequestContext(...args);return resolveLocalContext();}}));

vi.mock("@creatoros/backend/modules/ai-runtime", async original => ({
  ...await original<typeof import("@creatoros/backend/modules/ai-runtime")>(),
  runKnowledgeDistill: (...args: unknown[]) => runKnowledgeDistill(...args),
}));

import { POST } from "./route";

function distillReq(body: unknown): Request {
  return new Request("http://localhost/api/knowledge/distill", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  resolveContextFromToken.mockReset();
  resolveRequestContext.mockReset();
  resolveLocalContext.mockReset();
  resolveLocalContext.mockResolvedValue({ userId: "u-1" });
  runKnowledgeDistill.mockReset();
  runKnowledgeDistill.mockResolvedValue({
    atoms: [
      { type: "claim", title: "一条观点", note: "评注", sourceNote: "出处" },
      { type: "quote", title: "一句金句", note: "", sourceNote: "" },
    ],
    suggestedTags: ["主题"],
  });
});

describe("POST /api/knowledge/distill", () => {
  it("空 content → 400(不空跑模型)", async () => {
    const res = await POST(distillReq({ content: "   " }));
    expect(res.status).toBe(400);
    expect(runKnowledgeDistill).not.toHaveBeenCalled();
  });

  it("非 JSON body → 400", async () => {
    const res = await POST(
      new Request("http://localhost/api/knowledge/distill", {
        method: "POST",
        body: "not-json",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("正常蒸馏 → 200 { atoms, suggestedTags }(无 cookie 走本机主用户直通)", async () => {
    const res = await POST(distillReq({ content: "倒入的原文" }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      atoms: Array<{ type: string; title: string }>;
      suggestedTags: string[];
    };
    expect(json.atoms).toHaveLength(2);
    expect(json.atoms[0]!.title).toBe("一条观点");
    expect(json.suggestedTags).toEqual(["主题"]);
    expect(resolveLocalContext).toHaveBeenCalledTimes(1);
    expect(resolveRequestContext).toHaveBeenCalledWith(null,null,{rejectInvalidToken:true,groupId:null});
    // runner 收到 trim 后的 content + 组合根的受控 Worker 候选端口和请求取消信号
    expect(runKnowledgeDistill).toHaveBeenCalledWith(
      { userId: "u-1" },
      { content: "倒入的原文", signal: expect.any(AbortSignal) },
      { runKnowledgeGeneration },
    );
  });

  it("runner 抛错(无凭据/产出不可用)→ 400 { error }(诚实失败,前端内联展示)", async () => {
    runKnowledgeDistill.mockRejectedValue(new Error("无可用 LLM 凭据"));
    const res = await POST(distillReq({ content: "原文" }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("还没有可用的 AI 模型。完成设置后，回到这里即可继续。");
  });
});
