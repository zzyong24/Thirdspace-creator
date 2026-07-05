/**
 * [T-127] 稿面论点骨架面板(可编辑)测试:
 *   - 纯逻辑:reorderWithinColumn(同列交换/跨列跳过/边界 no-op)、serializeNodes(剔空/trim/按列排)、
 *     toEditNodes(稳定 key);
 *   - 空态(thesis=null)→ 引导「立论点」深链;
 *   - 有论点 → 渲四列可编辑;编辑标题 → dirty → 保存;加/删/重排;
 *   - 保存 → client.createArtifactVersion(序列化 nodes)+ router.refresh。
 */

import * as React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRouter = { refresh: vi.fn(), push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

const createArtifactVersion = vi.fn(
  (_i: unknown): Promise<unknown> => Promise.resolve({ id: "av-2" }),
);
vi.mock("@/lib/contract-client", () => ({
  client: { createArtifactVersion: (i: unknown) => createArtifactVersion(i) },
}));

const openChat = vi.fn();
vi.mock("./draft-chat-request", () => ({
  useDraftChatRequest: () => ({ openChat }),
}));

import {
  ThesisSkeletonPanel,
  reorderWithinColumn,
  serializeNodes,
  toEditNodes,
  type EditNode,
} from "./thesis-skeleton-panel";
import type {
  ThesisSkeleton,
  ThesisSkeletonNode,
} from "@/features/script/script-editor-data";

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

const NODES: ThesisSkeletonNode[] = [
  { column: "core", title: "本地 AI 栈三步搭好", summary: "普通开发者也能自建" },
  { column: "support", title: "痛点真实", summary: "环境难配" },
  { column: "support", title: "有替代", summary: "云太贵" },
  { column: "evidence", title: "实测数据", summary: "10 分钟跑通" },
  { column: "counter", title: "有人说太慢", summary: "量化模型可缓解" },
];
const THESIS: ThesisSkeleton = { artifactId: "art-thesis-1", nodes: NODES };

// ── 纯逻辑 ────────────────────────────────────────────────────────────────

describe("thesis-skeleton pure helpers", () => {
  const ns = (): EditNode[] => [
    { key: "a", column: "support", title: "A", summary: "" },
    { key: "b", column: "core", title: "C", summary: "" },
    { key: "c", column: "support", title: "B", summary: "" },
  ];

  it("reorderWithinColumn:同列相邻交换(跨列跳过)", () => {
    // support 列顺序 A,B → 下移 A 跳过中间的 core,与 B 交换。
    const out = reorderWithinColumn(ns(), "a", 1);
    expect(out.map((n) => n.key)).toEqual(["c", "b", "a"]);
  });

  it("reorderWithinColumn:无同列邻居 → no-op", () => {
    const out = reorderWithinColumn(ns(), "b", -1); // core 只此一条
    expect(out.map((n) => n.key)).toEqual(["a", "b", "c"]);
  });

  it("serializeNodes:剔空 + trim + 按列顺序排", () => {
    const draft: EditNode[] = [
      { key: "1", column: "counter", title: " 反 ", summary: "" },
      { key: "2", column: "core", title: "核心", summary: " 说明 " },
      { key: "3", column: "support", title: "", summary: "" }, // 剔除
    ];
    expect(serializeNodes(draft)).toEqual([
      { column: "core", title: "核心", summary: "说明" },
      { column: "counter", title: "反", summary: "" },
    ]);
  });

  it("toEditNodes:稳定 key(n0/n1…)", () => {
    expect(toEditNodes(NODES).map((n) => n.key)).toEqual([
      "n0",
      "n1",
      "n2",
      "n3",
      "n4",
    ]);
  });
});

// ── 组件 ────────────────────────────────────────────────────────────────

describe("ThesisSkeletonPanel(可编辑)", () => {
  it("空态(null)→ 诚实空态 + 「立论点」深链 planning.thesis", () => {
    render(<ThesisSkeletonPanel thesis={null} />);
    const panel = screen.getByRole("region", { name: "论点骨架" });
    expect(panel.getAttribute("data-has-thesis")).toBe("false");
    expect(within(panel).getByText(/还没立论点/)).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("button", { name: /立论点/ }));
    expect(openChat.mock.calls[0][0]).toMatchObject({
      functionKey: "planning.thesis",
      autoSend: true,
    });
  });

  it("有论点 → 四列可编辑渲染,初始未 dirty(保存禁用)", () => {
    render(<ThesisSkeletonPanel thesis={THESIS} />);
    const panel = screen.getByRole("region", { name: "论点骨架" });
    expect(panel.getAttribute("data-has-thesis")).toBe("true");
    // 标题以 input 值呈现(可编辑)。
    expect(
      (within(panel).getByLabelText("核心论点标题") as HTMLInputElement).value,
    ).toBe("本地 AI 栈三步搭好");
    expect(
      within(panel).getByRole("button", { name: "保存论点骨架" }),
    ).toBeDisabled();
  });

  it("编辑标题 → dirty → 保存启用 → createArtifactVersion(序列化 nodes)+ refresh", async () => {
    render(<ThesisSkeletonPanel thesis={THESIS} />);
    const panel = screen.getByRole("region", { name: "论点骨架" });
    fireEvent.change(within(panel).getByLabelText("核心论点标题"), {
      target: { value: "改后的核心论点" },
    });
    const save = within(panel).getByRole("button", { name: "保存论点骨架" });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() => expect(createArtifactVersion).toHaveBeenCalledTimes(1));
    const arg = createArtifactVersion.mock.calls[0][0] as {
      params: { artifactId: string };
      body: { contentData: { nodes: ThesisSkeletonNode[] } };
    };
    expect(arg.params.artifactId).toBe("art-thesis-1");
    expect(arg.body.contentData.nodes[0]).toMatchObject({
      column: "core",
      title: "改后的核心论点",
    });
    expect(mockRouter.refresh).toHaveBeenCalled();
  });

  it("加分论点 → 该列多一行空节点", () => {
    render(<ThesisSkeletonPanel thesis={THESIS} />);
    const panel = screen.getByRole("region", { name: "论点骨架" });
    const before = within(panel).getAllByLabelText("证据标题").length;
    fireEvent.click(within(panel).getByRole("button", { name: "加证据" }));
    expect(within(panel).getAllByLabelText("证据标题").length).toBe(before + 1);
  });

  it("删除分论点 → 该行消失 + dirty", () => {
    render(<ThesisSkeletonPanel thesis={THESIS} />);
    const panel = screen.getByRole("region", { name: "论点骨架" });
    // 反驳列删掉唯一一条。
    const counterTitle = within(panel).getByLabelText("反驳标题");
    const row = counterTitle.closest('[data-slot="thesis-node"]') as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "删除" }));
    expect(within(panel).queryByLabelText("反驳标题")).toBeNull();
    expect(
      within(panel).getByRole("button", { name: "保存论点骨架" }),
    ).toBeEnabled();
  });

  it("下移支撑分论点 → 顺序反转(保存序列化反映)", async () => {
    render(<ThesisSkeletonPanel thesis={THESIS} />);
    const panel = screen.getByRole("region", { name: "论点骨架" });
    // 第一条 support 「痛点真实」下移。
    const firstSupport = within(panel).getAllByLabelText("支撑依据标题")[0]!;
    const row = firstSupport.closest('[data-slot="thesis-node"]') as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "下移" }));
    fireEvent.click(within(panel).getByRole("button", { name: "保存论点骨架" }));
    await waitFor(() => expect(createArtifactVersion).toHaveBeenCalled());
    const arg = createArtifactVersion.mock.calls[0][0] as {
      body: { contentData: { nodes: ThesisSkeletonNode[] } };
    };
    const supports = arg.body.contentData.nodes.filter(
      (n) => n.column === "support",
    );
    expect(supports.map((n) => n.title)).toEqual(["有替代", "痛点真实"]);
  });
});
