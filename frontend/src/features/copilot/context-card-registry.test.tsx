import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// [T-098] CONTEXT_CARD_REGISTRY 覆盖锁测(SPEC context-layer-redesign §2.2):
// chat-tools 里每个 context.* 工具(工具名 + 结果 kind)必须在注册表有渲染卡 ——
// 新增 context 工具不配卡 = 本测试红。「前端安全跳过」永久失效。

// 素材卡依赖 next/navigation + contract-client(注册表 import 链带进来)—— 打桩。
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/contract-client", () => ({ client: {} }));

import {
  allChatTools,
  type ChatToolDeps,
} from "@creatoros/backend/modules/ai-runtime";
import {
  CONTEXT_CARD_REGISTRY,
  renderContextCard,
} from "./context-card-registry";

afterEach(() => cleanup());

// context.* 工具 execute 会走的读端口给最小 stub(其余工具不 execute,不需要真依赖)。
const stubDeps = {
  listProjects: async () => ({
    rows: [
      {
        id: "p1",
        title: "真标题",
        stage: "planning",
        status: "active",
        publishedAt: null,
      },
    ],
    total: 1,
  }),
  listComments: async () => ({
    rows: [
      {
        text: "真评论",
        likeCount: 3,
        source: "douyin",
        createdAt: "2026-07-01T00:00:00Z",
      },
    ],
    total: 1,
  }),
  searchKnowledge: async () => [
    { id: "k1", title: "知识标题", snippet: "片段" },
  ],
  searchMaterials: async () => [{ id: "a1", title: "素材", kind: "video" }],
} as unknown as ChatToolDeps;

// 执行 tool.execute 的最小 helper(AI SDK Tool 类型的 execute 带 options 二参)。
async function exec(t: unknown, input: Record<string, unknown>) {
  const fn = (t as { execute: (i: unknown, o: unknown) => Promise<unknown> })
    .execute;
  return fn(input, { toolCallId: "t", messages: [] });
}

describe("[T-098] CONTEXT_CARD_REGISTRY 覆盖锁", () => {
  const tools = allChatTools(stubDeps);
  const contextToolNames = Object.keys(tools).filter((n) =>
    n.startsWith("context."),
  );

  it("chat-tools 里存在 context.* 工具(前提自检,防空集假绿)", () => {
    expect(contextToolNames.length).toBeGreaterThanOrEqual(4);
  });

  it("每个 context.* 工具名在注册表有卡 —— 新增不配卡 = 红", () => {
    for (const name of contextToolNames) {
      expect(
        CONTEXT_CARD_REGISTRY[name],
        `context 工具 ${name} 没有配渲染卡:在 features/copilot/context-card-registry.tsx 注册`,
      ).toBeTypeOf("function");
    }
  });

  it("每个 context.* 工具的**结果 kind** 也在注册表有卡(锁 kind 与工具名漂移)", async () => {
    for (const name of contextToolNames) {
      const out = (await exec(tools[name], {})) as { kind?: string };
      expect(typeof out.kind).toBe("string");
      expect(
        CONTEXT_CARD_REGISTRY[out.kind as string],
        `工具 ${name} 的结果 kind=${out.kind} 没有配渲染卡`,
      ).toBeTypeOf("function");
    }
  });

  it("已注册 kind 渲出真数据卡(projects → 作品清单卡直渲真标题)", async () => {
    const out = (await exec(tools["context.projects"], {})) as Record<
      string,
      unknown
    >;
    render(<>{renderContextCard("context.projects", out, { projectId: null })}</>);
    expect(screen.getByText("真标题")).toBeTruthy();
  });

  it("未知 context kind → 通用键值表格兜底卡(真数据表格,不是裸 JSON trace)", () => {
    const out = {
      kind: "context.unknown_future",
      items: [{ id: "x1", title: "未来实体标题", score: 42 }],
      total: 1,
    };
    render(
      <>{renderContextCard("context.unknown_future", out, { projectId: null })}</>,
    );
    // 真值以表格单元格形态可见。
    expect(screen.getByText("未来实体标题")).toBeTruthy();
    expect(screen.getByText("42")).toBeTruthy();
    // 分页真相标量也如实显示。
    expect(screen.getByText(/total: 1/)).toBeTruthy();
  });
});
