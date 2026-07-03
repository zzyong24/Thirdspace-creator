/**
 * 观点地图测试(T-079c,SPEC 2026-07-03-knowledge-asset-redesign §3):
 *   A. 纯函数 buildKnowledgeAtlas —— 分组/组头计数/排序/未归类兜底/多 tag 归首;
 *   B. 组件 KnowledgeAtlas —— type 中文徽章/战绩行(用于已发布加亮)/
 *      未归类组固定底部默认折叠可展开 [gate-F3]/点卡回调。
 */

import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildKnowledgeAtlas,
  UNSORTED_GROUP_KEY,
  type AtlasSourceItem,
} from "./knowledge-atlas-vm";
import { KnowledgeAtlas } from "./knowledge-atlas";

// ---------------------------------------------------------------------------
// 测试数据工厂
// ---------------------------------------------------------------------------

function item(over: Partial<AtlasSourceItem> & { id: string }): AtlasSourceItem {
  return {
    title: `知识 ${over.id}`,
    knowledgeType: "claim",
    sourceNote: null,
    usedCount: 0,
    usedInPublished: false,
    createdAt: "2026-07-01T00:00:00.000Z",
    ...over,
  };
}

// ---------------------------------------------------------------------------
// A. 纯函数
// ---------------------------------------------------------------------------

describe("buildKnowledgeAtlas — 分组与排序纯函数", () => {
  it("按 tag 分组;组头计数只数 claim/evidence", () => {
    const atlas = buildKnowledgeAtlas(
      [
        item({ id: "k1", knowledgeType: "claim" }),
        item({ id: "k2", knowledgeType: "evidence" }),
        item({ id: "k3", knowledgeType: "quote" }),
      ],
      [{ name: "上下文工程", itemIds: ["k1", "k2", "k3"] }],
    );
    expect(atlas.groups).toHaveLength(1);
    expect(atlas.groups[0]!.name).toBe("上下文工程");
    expect(atlas.groups[0]!.claimCount).toBe(1);
    expect(atlas.groups[0]!.evidenceCount).toBe(1);
    expect(atlas.groups[0]!.cards).toHaveLength(3);
    expect(atlas.unsorted).toBeNull();
  });

  it("组内排序:usedInPublished > usedCount desc > createdAt desc", () => {
    const atlas = buildKnowledgeAtlas(
      [
        // 无战绩但最新 —— 排最后一档的最前
        item({ id: "new", createdAt: "2026-07-02T00:00:00.000Z" }),
        // 无战绩、更旧
        item({ id: "old", createdAt: "2026-06-01T00:00:00.000Z" }),
        // 引用 3 次但未发布
        item({ id: "used3", usedCount: 3 }),
        // 引用 1 次且用于已发布 —— 最硬战绩,压过纯引用次数
        item({ id: "pub", usedCount: 1, usedInPublished: true }),
      ],
      [{ name: "T", itemIds: ["new", "old", "used3", "pub"] }],
    );
    expect(atlas.groups[0]!.cards.map((c) => c.id)).toEqual([
      "pub",
      "used3",
      "new",
      "old",
    ]);
  });

  it("无 tag 的知识落「未归类」组(unsorted),不混进主题组", () => {
    const atlas = buildKnowledgeAtlas(
      [item({ id: "tagged" }), item({ id: "loose" })],
      [{ name: "主题", itemIds: ["tagged"] }],
    );
    expect(atlas.groups[0]!.cards.map((c) => c.id)).toEqual(["tagged"]);
    expect(atlas.unsorted).not.toBeNull();
    expect(atlas.unsorted!.key).toBe(UNSORTED_GROUP_KEY);
    expect(atlas.unsorted!.name).toBe("未归类");
    expect(atlas.unsorted!.cards.map((c) => c.id)).toEqual(["loose"]);
  });

  it("多 tag 知识只归首个 tag(传入顺序=usageCount 排名),不出重复卡", () => {
    const atlas = buildKnowledgeAtlas(
      [item({ id: "multi" })],
      [
        { name: "热门主题", itemIds: ["multi"] },
        { name: "冷门主题", itemIds: ["multi"] },
      ],
    );
    // 只有热门主题成组;冷门主题无命中知识 → 不出空组。
    expect(atlas.groups).toHaveLength(1);
    expect(atlas.groups[0]!.name).toBe("热门主题");
    const totalCards = atlas.groups.reduce((n, g) => n + g.cards.length, 0);
    expect(totalCards).toBe(1);
  });

  it("主题组排序:有已发布战绩的组优先,其次组内 usedCount 总和", () => {
    const atlas = buildKnowledgeAtlas(
      [
        item({ id: "a1", usedCount: 5 }),
        item({ id: "b1", usedCount: 1, usedInPublished: true }),
      ],
      [
        { name: "高引用组", itemIds: ["a1"] },
        { name: "已发布组", itemIds: ["b1"] },
      ],
    );
    expect(atlas.groups.map((g) => g.name)).toEqual(["已发布组", "高引用组"]);
  });

  it("空输入 → 空墙(groups 空 + unsorted null)", () => {
    const atlas = buildKnowledgeAtlas([], []);
    expect(atlas.groups).toEqual([]);
    expect(atlas.unsorted).toBeNull();
  });

  it("type 徽章映射:四原子中文档 + 旧类型兼容", () => {
    const atlas = buildKnowledgeAtlas(
      [
        item({ id: "c", knowledgeType: "claim" }),
        item({ id: "e", knowledgeType: "evidence" }),
        item({ id: "q", knowledgeType: "quote" }),
        item({ id: "a", knowledgeType: "qa" }),
        item({ id: "r", knowledgeType: "reference" }),
        item({ id: "n", knowledgeType: "note" }),
      ],
      [{ name: "T", itemIds: ["c", "e", "q", "a", "r", "n"] }],
    );
    const byId = new Map(atlas.groups[0]!.cards.map((card) => [card.id, card]));
    expect(byId.get("c")).toMatchObject({ typeLabel: "观点", typeTone: "brand" });
    expect(byId.get("e")).toMatchObject({ typeLabel: "证据", typeTone: "info" });
    expect(byId.get("q")).toMatchObject({ typeLabel: "金句", typeTone: "warning" });
    expect(byId.get("a")).toMatchObject({ typeLabel: "问题", typeTone: "success" });
    expect(byId.get("r")).toMatchObject({ typeLabel: "参考", typeTone: "neutral" });
    expect(byId.get("n")).toMatchObject({ typeLabel: "笔记", typeTone: "neutral" });
  });
});

// ---------------------------------------------------------------------------
// B. 组件渲染
// ---------------------------------------------------------------------------

afterEach(cleanup);

describe("KnowledgeAtlas — 组件渲染", () => {
  const atlas = buildKnowledgeAtlas(
    [
      item({
        id: "k-pub",
        title: "上下文工程是 Agent 的第一性问题",
        knowledgeType: "claim",
        usedCount: 3,
        usedInPublished: true,
      }),
      item({
        id: "k-ev",
        title: "实测:截断策略让任务成功率 +18%",
        knowledgeType: "evidence",
        sourceNote: "本账号 6/30 视频复盘",
        usedCount: 1,
      }),
      item({ id: "k-loose", title: "散装金句", knowledgeType: "quote" }),
    ],
    [{ name: "上下文工程", itemIds: ["k-pub", "k-ev"] }],
  );

  it("组头 = 主题名 + 观点/证据计数;卡片带中文徽章、source_note 小字", () => {
    render(<KnowledgeAtlas atlas={atlas} selectedId={null} onSelectCard={() => {}} />);
    expect(screen.getByText("上下文工程")).toBeTruthy();
    // 组头计数(观点 1 · 证据 1)。
    const counts = screen.getAllByText(/观点 1 · 证据 1/);
    expect(counts.length).toBeGreaterThan(0);
    // 徽章 + 本体 + 出处小字。
    expect(screen.getByText("观点")).toBeTruthy();
    expect(screen.getByText("证据")).toBeTruthy();
    expect(screen.getByText("上下文工程是 Agent 的第一性问题")).toBeTruthy();
    expect(screen.getByText("本账号 6/30 视频复盘")).toBeTruthy();
  });

  it("战绩行:usedCount>0 显「被 N 条内容用过」;usedInPublished 加亮 ⚡", () => {
    const { container } = render(
      <KnowledgeAtlas atlas={atlas} selectedId={null} onSelectCard={() => {}} />,
    );
    expect(screen.getByText(/被 3 条内容用过 · ⚡ 用于已发布/)).toBeTruthy();
    expect(screen.getByText(/^被 1 条内容用过$/)).toBeTruthy();
    // 加亮标记落在 data 属性上(样式档位可查)。
    const highlighted = container.querySelector(
      '[data-slot="knowledge-atlas-card-stats"][data-used-in-published="true"]',
    );
    expect(highlighted).not.toBeNull();
  });

  it("[gate-F3] 未归类组固定底部、默认折叠,点组头可展开", () => {
    const { container } = render(
      <KnowledgeAtlas atlas={atlas} selectedId={null} onSelectCard={() => {}} />,
    );
    const unsorted = container.querySelector(
      '[data-slot="knowledge-atlas-unsorted"]',
    )!;
    // 默认折叠:组容器在场但卡片不渲。
    expect(unsorted.getAttribute("data-open")).toBe("false");
    expect(screen.queryByText("散装金句")).toBeNull();
    // 固定底部:未归类容器是卡墙 section 的最后一个分组节点。
    const sectionChildren = Array.from(
      container.querySelector('[data-slot="knowledge-atlas"]')!.children,
    );
    expect(sectionChildren[sectionChildren.length - 1]).toBe(unsorted);
    // 展开后卡片可见。
    fireEvent.click(
      container.querySelector('[data-slot="knowledge-atlas-unsorted-toggle"]')!,
    );
    expect(unsorted.getAttribute("data-open")).toBe("true");
    expect(screen.getByText("散装金句")).toBeTruthy();
  });

  it("点卡片 → onSelectCard(id)(父层复用 T-062c 详情预览)", () => {
    const onSelect = vi.fn();
    const { container } = render(
      <KnowledgeAtlas atlas={atlas} selectedId={null} onSelectCard={onSelect} />,
    );
    fireEvent.click(
      container.querySelector('[data-knowledge-id="k-pub"]')!,
    );
    expect(onSelect).toHaveBeenCalledWith("k-pub");
  });

  it("空墙 → 诚实空态文案", () => {
    render(
      <KnowledgeAtlas
        atlas={{ groups: [], unsorted: null }}
        selectedId={null}
        onSelectCard={() => {}}
      />,
    );
    expect(screen.getByText(/还没有可上墙的知识/)).toBeTruthy();
  });
});
