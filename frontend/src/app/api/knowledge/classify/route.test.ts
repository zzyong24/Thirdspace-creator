import { describe, it, expect, beforeEach, vi } from "vitest";

// /api/knowledge/classify 路由单测(T-062c)—— mock 组合根 + runner,断言路由:
// body 校验、鉴权直通(T-046 无 cookie 走本机主用户)、runner 结果透传、失败诚实 4xx
// (倾倒场据此内联展示,原始输入保留)。真模型调用在 runner 层另测。

const resolveContextFromToken = vi.fn();
const resolveLocalContext = vi.fn();
const resolveModelSpec = vi.fn();
const runKnowledgeClassify = vi.fn();

vi.mock("@/server/persistence-client", () => ({
  getIdentityService: async () => ({
    resolveContextFromToken,
    resolveLocalContext,
  }),
  getChatRuntime: async () => ({
    resolveModelSpec,
  }),
}));

vi.mock("@creatoros/backend/modules/ai-runtime", () => ({
  runKnowledgeClassify: (...args: unknown[]) => runKnowledgeClassify(...args),
}));

import { POST } from "./route";

function classifyReq(body: unknown): Request {
  return new Request("http://localhost/api/knowledge/classify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  resolveContextFromToken.mockReset();
  resolveLocalContext.mockReset();
  resolveLocalContext.mockResolvedValue({ userId: "u-1" });
  runKnowledgeClassify.mockReset();
  runKnowledgeClassify.mockResolvedValue({
    knowledgeType: "note",
    title: "一条笔记",
    tags: ["标签"],
    summary: "摘要。",
  });
});

describe("POST /api/knowledge/classify", () => {
  it("空 content → 400(不空跑模型)", async () => {
    const res = await POST(classifyReq({ content: "   " }));
    expect(res.status).toBe(400);
    expect(runKnowledgeClassify).not.toHaveBeenCalled();
  });

  it("非 JSON body → 400", async () => {
    const res = await POST(
      new Request("http://localhost/api/knowledge/classify", {
        method: "POST",
        body: "not-json",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("正常归类 → 200 { classification }(无 cookie 走本机主用户直通)", async () => {
    const res = await POST(classifyReq({ content: "倒入的原文" }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { classification: { title: string } };
    expect(json.classification.title).toBe("一条笔记");
    expect(resolveLocalContext).toHaveBeenCalledTimes(1);
    // runner 收到 trim 后的 content + 组合根的 resolveModelSpec 端口
    expect(runKnowledgeClassify).toHaveBeenCalledWith(
      { userId: "u-1" },
      { content: "倒入的原文" },
      { resolveModelSpec },
    );
  });

  it("runner 抛错(无凭据/产出不可用)→ 400 { error }(诚实失败,前端内联展示)", async () => {
    runKnowledgeClassify.mockRejectedValue(new Error("无可用 LLM 凭据"));
    const res = await POST(classifyReq({ content: "原文" }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain("无可用 LLM 凭据");
  });
});
