/**
 * [T-127] 稿面论点骨架面板(可编辑 + 挂素材)测试:
 *   - 纯逻辑:reorderWithinColumn / serializeNodes(剔空/trim/按列排/带 materialRefs)/ toEditNodes /
 *     mountMaterial(去重)/ unmountMaterial;
 *   - 空态 → 引导「立论点」深链;
 *   - 有论点 → 四列可编辑;编辑 → dirty → 保存 createArtifactVersion + refresh;加/删/重排;
 *   - 挂素材:picker 选用料链素材 → chip;× 卸载;保存序列化带 materialRefs。
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
  mountMaterial,
  unmountMaterial,
  type EditNode,
  type AvailableMaterial,
} from "./thesis-skeleton-panel";
import type {
  ThesisSkeleton,
  ThesisSkeletonNode,
} from "@/features/script/script-editor-data";

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

const NODES: ThesisSkeletonNode[] = [
  { column: "core", title: "本地 AI 栈三步搭好", summary: "普通开发者也能自建", materialRefs: [] },
  { column: "support", title: "痛点真实", summary: "环境难配", materialRefs: [] },
  { column: "support", title: "有替代", summary: "云太贵", materialRefs: [] },
  { column: "evidence", title: "实测数据", summary: "10 分钟跑通", materialRefs: [] },
  { column: "counter", title: "有人说太慢", summary: "量化模型可缓解", materialRefs: [] },
];
const THESIS: ThesisSkeleton = {
  artifactId: "art-thesis-1",
  versionId: "version-1",
  scriptBasisStatus: "inactive",
  nodes: NODES,
};
const AMMO: AvailableMaterial[] = [
  { id: "kn-1", title: "案例:某开发者自建栈", kind: "knowledge" },
  { id: "as-1", title: "截图:跑通耗时", kind: "asset" },
];

// ── 纯逻辑 ────────────────────────────────────────────────────────────────

describe("thesis-skeleton pure helpers", () => {
  const en = (
    key: string,
    column: EditNode["column"],
    title: string,
  ): EditNode => ({ key, column, title, summary: "", materialRefs: [] });

  it("reorderWithinColumn:同列相邻交换(跨列跳过)", () => {
    const nodes = [en("a", "support", "A"), en("b", "core", "C"), en("c", "support", "B")];
    const out = reorderWithinColumn(nodes, "a", 1);
    expect(out.map((n) => n.key)).toEqual(["c", "b", "a"]);
  });

  it("reorderWithinColumn:无同列邻居 → no-op", () => {
    const nodes = [en("a", "support", "A"), en("b", "core", "C"), en("c", "support", "B")];
    const out = reorderWithinColumn(nodes, "b", -1);
    expect(out.map((n) => n.key)).toEqual(["a", "b", "c"]);
  });

  it("serializeNodes:剔空 + trim + 按列排 + 带 materialRefs", () => {
    const draft: EditNode[] = [
      { key: "1", column: "counter", title: " 反 ", summary: "", materialRefs: [] },
      {
        key: "2",
        column: "core",
        title: "核心",
        summary: " 说明 ",
        materialRefs: [{ id: "kn-1", title: "案例" }],
      },
      { key: "3", column: "support", title: "", summary: "", materialRefs: [] },
    ];
    expect(serializeNodes(draft)).toEqual([
      { column: "core", title: "核心", summary: "说明", materialRefs: [{ id: "kn-1", title: "案例" }] },
      { column: "counter", title: "反", summary: "", materialRefs: [] },
    ]);
  });

  it("toEditNodes:稳定 key + 复制 materialRefs", () => {
    const withRef: ThesisSkeletonNode[] = [
      { column: "core", title: "c", summary: "", materialRefs: [{ id: "x", title: "X" }] },
    ];
    const out = toEditNodes(withRef);
    expect(out[0]!.key).toBe("n0");
    expect(out[0]!.materialRefs).toEqual([{ id: "x", title: "X" }]);
  });

  it("mountMaterial:挂载去重(同 id 不重复)", () => {
    const nodes: EditNode[] = [
      { key: "a", column: "core", title: "c", summary: "", materialRefs: [] },
    ];
    const once = mountMaterial(nodes, "a", { id: "kn-1", title: "案例" });
    expect(once[0]!.materialRefs).toHaveLength(1);
    const twice = mountMaterial(once, "a", { id: "kn-1", title: "案例" });
    expect(twice[0]!.materialRefs).toHaveLength(1);
  });

  it("unmountMaterial:按 id 卸载", () => {
    const nodes: EditNode[] = [
      {
        key: "a",
        column: "core",
        title: "c",
        summary: "",
        materialRefs: [{ id: "kn-1", title: "案例" }],
      },
    ];
    expect(unmountMaterial(nodes, "a", "kn-1")[0]!.materialRefs).toEqual([]);
  });
});

// ── 组件 ────────────────────────────────────────────────────────────────

describe("ThesisSkeletonPanel(可编辑 + 挂素材)", () => {
  it("空态(null)→ 诚实空态 + 「立论点」深链 planning.thesis", () => {
    render(<ThesisSkeletonPanel thesis={null} />);
    const panel = screen.getByRole("region", { name: "论点骨架（可选）" });
    expect(panel.getAttribute("data-has-thesis")).toBe("false");
    expect(within(panel).getByText(/还没有论点骨架/)).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("button", { name: "先梳理观点" }));
    expect(openChat.mock.calls[0][0]).toMatchObject({
      functionKey: "planning.thesis",
      autoSend: true,
    });
  });

  it("有论点 → 四列可编辑渲染,初始未 dirty(保存禁用)", () => {
    render(<ThesisSkeletonPanel thesis={THESIS} ammo={AMMO} />);
    const panel = screen.getByRole("region", { name: "论点骨架（可选）" });
    expect(panel.getAttribute("data-has-thesis")).toBe("true");
    expect(
      (within(panel).getByLabelText("核心论点标题") as HTMLInputElement).value,
    ).toBe("本地 AI 栈三步搭好");
    expect(
      within(panel).getByRole("button", { name: "保存论点骨架" }),
    ).toBeDisabled();
  });

  it("编辑标题 → dirty → 保存 createArtifactVersion(序列化 nodes)+ refresh", async () => {
    render(<ThesisSkeletonPanel thesis={THESIS} ammo={AMMO} />);
    const panel = screen.getByRole("region", { name: "论点骨架（可选）" });
    fireEvent.change(within(panel).getByLabelText("核心论点标题"), {
      target: { value: "改后的核心论点" },
    });
    const save = within(panel).getByRole("button", { name: "保存论点骨架" });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() => expect(createArtifactVersion).toHaveBeenCalledTimes(1));
    const arg = createArtifactVersion.mock.calls[0][0] as {
      params: { artifactId: string };
      body: {
        expectedCurrentVersionId: string;
        contentData: { nodes: ThesisSkeletonNode[] };
      };
    };
    expect(arg.params.artifactId).toBe("art-thesis-1");
    expect(arg.body.expectedCurrentVersionId).toBe("version-1");
    expect(arg.body.contentData.nodes[0]).toMatchObject({
      column: "core",
      title: "改后的核心论点",
    });
    expect(mockRouter.refresh).toHaveBeenCalled();
  });

  it("加分论点 → 该列多一行空节点", () => {
    render(<ThesisSkeletonPanel thesis={THESIS} ammo={AMMO} />);
    const panel = screen.getByRole("region", { name: "论点骨架（可选）" });
    const before = within(panel).getAllByLabelText("证据标题").length;
    fireEvent.click(within(panel).getByRole("button", { name: "加证据" }));
    expect(within(panel).getAllByLabelText("证据标题").length).toBe(before + 1);
  });

  it("删除分论点 → 该行消失 + dirty", () => {
    render(<ThesisSkeletonPanel thesis={THESIS} ammo={AMMO} />);
    const panel = screen.getByRole("region", { name: "论点骨架（可选）" });
    const counterTitle = within(panel).getByLabelText("反驳标题");
    const row = counterTitle.closest('[data-slot="thesis-node"]') as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "删除" }));
    expect(within(panel).queryByLabelText("反驳标题")).toBeNull();
    expect(
      within(panel).getByRole("button", { name: "保存论点骨架" }),
    ).toBeEnabled();
  });

  it("下移支撑分论点 → 顺序反转(保存序列化反映)", async () => {
    render(<ThesisSkeletonPanel thesis={THESIS} ammo={AMMO} />);
    const panel = screen.getByRole("region", { name: "论点骨架（可选）" });
    const firstSupport = within(panel).getAllByLabelText("支撑依据标题")[0]!;
    const row = firstSupport.closest('[data-slot="thesis-node"]') as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "下移" }));
    fireEvent.click(within(panel).getByRole("button", { name: "保存论点骨架" }));
    await waitFor(() => expect(createArtifactVersion).toHaveBeenCalled());
    const arg = createArtifactVersion.mock.calls[0][0] as {
      body: { contentData: { nodes: ThesisSkeletonNode[] } };
    };
    const supports = arg.body.contentData.nodes.filter((n) => n.column === "support");
    expect(supports.map((n) => n.title)).toEqual(["有替代", "痛点真实"]);
  });

  it("挂素材:picker 选用料链素材 → chip + dirty → 保存序列化带 materialRefs", async () => {
    render(<ThesisSkeletonPanel thesis={THESIS} ammo={AMMO} />);
    const panel = screen.getByRole("region", { name: "论点骨架（可选）" });
    const coreRow = (
      within(panel).getByLabelText("核心论点标题")
    ).closest('[data-slot="thesis-node"]') as HTMLElement;
    // 开 picker → 选第一条素材。
    fireEvent.click(within(coreRow).getByRole("button", { name: "挂素材" }));
    fireEvent.click(within(coreRow).getByText("案例:某开发者自建栈"));
    // chip 出现。
    expect(
      within(coreRow).getByText("案例:某开发者自建栈"),
    ).toBeInTheDocument();
    // 保存 → materialRefs 带上。
    fireEvent.click(within(panel).getByRole("button", { name: "保存论点骨架" }));
    await waitFor(() => expect(createArtifactVersion).toHaveBeenCalled());
    const arg = createArtifactVersion.mock.calls[0][0] as {
      body: { contentData: { nodes: ThesisSkeletonNode[] } };
    };
    const core = arg.body.contentData.nodes.find((n) => n.column === "core")!;
    expect(core.materialRefs).toEqual([
      { id: "kn-1", title: "案例:某开发者自建栈" },
    ]);
  });

  it("卸载素材:× 移除 chip", () => {
    const withRef: ThesisSkeleton = {
      artifactId: "art-1",
      versionId: "version-with-ref",
      scriptBasisStatus: "inactive",
      nodes: [
        {
          column: "core",
          title: "核心",
          summary: "",
          materialRefs: [{ id: "kn-1", title: "案例" }],
        },
      ],
    };
    render(<ThesisSkeletonPanel thesis={withRef} ammo={AMMO} />);
    const panel = screen.getByRole("region", { name: "论点骨架（可选）" });
    expect(within(panel).getByText("案例")).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("button", { name: "卸载素材 案例" }));
    expect(within(panel).queryByText("案例")).toBeNull();
  });

  it("无可挂素材(ammo 空)→ picker 提示先加素材", () => {
    render(<ThesisSkeletonPanel thesis={THESIS} ammo={[]} />);
    const panel = screen.getByRole("region", { name: "论点骨架（可选）" });
    const coreRow = (
      within(panel).getByLabelText("核心论点标题")
    ).closest('[data-slot="thesis-node"]') as HTMLElement;
    fireEvent.click(within(coreRow).getByRole("button", { name: "挂素材" }));
    expect(within(coreRow).getByText(/还没有可挂的素材/)).toBeInTheDocument();
  });

  // ── [T-387a] AI 预挂标记 + 缺素材徽标 ──────────────────────────────────────

  it("[T-387a] source:'ai' 的挂载素材渲「AI」小标;人挂的不渲", () => {
    const withAiRef: ThesisSkeleton = {
      artifactId: "art-thesis-1",
      versionId: "version-ai-ref",
      scriptBasisStatus: "inactive",
      nodes: [
        {
          column: "evidence",
          title: "实测数据",
          summary: "",
          materialRefs: [
            { id: "kn-1", title: "AI 预挂案例", source: "ai" },
            { id: "kn-2", title: "人挂案例" },
          ],
        },
      ],
    };
    render(<ThesisSkeletonPanel thesis={withAiRef} ammo={AMMO} />);
    const panel = screen.getByRole("region", { name: "论点骨架（可选）" });
    const chips = panel.querySelectorAll('[data-slot="thesis-material-chip"]');
    expect(chips).toHaveLength(2);
    expect(chips[0]!.getAttribute("data-material-source")).toBe("ai");
    expect(
      within(chips[0] as HTMLElement).getByText("AI"),
    ).toBeInTheDocument();
    expect(chips[1]!.getAttribute("data-material-source")).toBe("human");
    expect(within(chips[1] as HTMLElement).queryByText("AI")).toBeNull();
  });

  it("[T-387a] 支撑/证据节点无挂载素材 → 「缺素材」徽标 + 搜/传引导;core/counter 不渲", () => {
    render(<ThesisSkeletonPanel thesis={THESIS} ammo={AMMO} />);
    const panel = screen.getByRole("region", { name: "论点骨架（可选）" });
    const badges = panel.querySelectorAll(
      '[data-slot="thesis-missing-material"]',
    );
    // NODES:2 support + 1 evidence 均无 materialRefs → 3 个徽标;core/counter 不渲。
    expect(badges).toHaveLength(3);
    expect(badges[0]!.textContent).toContain("缺素材");
    expect(badges[0]!.textContent).toContain("联网找资料");
  });

  it("[T-387a] serializeNodes / toEditNodes 保留 source:'ai'(编辑往返不丢标记)", () => {
    const nodes: ThesisSkeletonNode[] = [
      {
        column: "support",
        title: "s",
        summary: "",
        materialRefs: [{ id: "kn-1", title: "案例", source: "ai" }],
      },
    ];
    const edit = toEditNodes(nodes);
    expect(edit[0]!.materialRefs[0]).toEqual({
      id: "kn-1",
      title: "案例",
      source: "ai",
    });
    const ser = serializeNodes(edit);
    expect(ser[0]!.materialRefs[0]).toEqual({
      id: "kn-1",
      title: "案例",
      source: "ai",
    });
  });
});
