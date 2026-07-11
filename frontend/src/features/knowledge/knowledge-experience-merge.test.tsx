/**
 * [T-118b/T-119] 已验证经验并入知识库(只读一等类型 + 混排分页)读层/渲染契约。
 *
 * SPEC 2026-07-04-experience-relocation-design.md §B:
 *  - 左栏 CategoryPanel 加「经验」分类,count = validated learnings 数;
 *  - 中栏「最近更新」混排知识卡 + validated 经验条目,按 updatedAt 正序([T-211] 最早在前),每条带
 *    类型 chip(经验条目显「经验」),**经验条目只读**(无采纳/翻案/修订);
 *  - T-119 分页:混排 10 条/页,知识卡 + 经验共用同一分页上下文(`?page=` 承载);
 *  - 诚实数据:client 不支持 listLearnings / 读失败 → 经验并入静默空,不 fixture 兜底。
 */

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import type { KnowledgeDataClient } from "./knowledge-data";
import { buildKnowledgeDashboardViewModel } from "./knowledge-data";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    replace: vi.fn(),
    push: vi.fn(),
    back: vi.fn(),
  }),
}));
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/contract-client", () => ({
  client: {
    createKnowledge: vi.fn(),
    createKnowledgeRevision: vi.fn(),
    getKnowledge: vi.fn(() => Promise.resolve({})),
    listKnowledgeRevisions: vi.fn(() => Promise.resolve([])),
  },
}));

afterEach(() => cleanup());

// ---------------------------------------------------------------------------
// Mock contract client
// ---------------------------------------------------------------------------

function knowledgeItem(id: string, updatedAt: string) {
  return {
    id,
    title: `知识卡 ${id}`,
    knowledgeType: "note",
    status: "active",
    createdAt: updatedAt,
    updatedAt,
  };
}

function learning(id: string, updatedAt: string, reviewId: string | null) {
  return {
    id,
    title: `经验 ${id}`,
    insight: `洞察正文 ${id}`,
    learningType: "hook",
    validationStatus: "validated",
    reviewId,
    updatedAt,
  };
}

function makeClient(
  overrides: Partial<Record<keyof KnowledgeDataClient, unknown>> = {},
): KnowledgeDataClient {
  return {
    listKnowledge: vi.fn(() => Promise.resolve([])),
    listKnowledgeRelations: vi.fn(() => Promise.resolve([])),
    listTags: vi.fn(() => Promise.resolve([])),
    listEntitiesForTag: vi.fn(() => Promise.resolve([])),
    listLearnings: vi.fn(() => Promise.resolve([])),
    ...(overrides as Partial<KnowledgeDataClient>),
  } as KnowledgeDataClient;
}

// ---------------------------------------------------------------------------
// 读层:经验投影 + 混排 + 分类
// ---------------------------------------------------------------------------

describe("[T-118b] 已验证经验并入知识库读层", () => {
  it("validated learnings 投影为经验行(origin=experience + 只读 detail)", async () => {
    const client = makeClient({
      listLearnings: vi.fn(() =>
        Promise.resolve([learning("l-1", "2026-07-03T00:00:00.000Z", "rev-1")]),
      ),
    });
    const vm = await buildKnowledgeDashboardViewModel(client);
    const expRow = vm.recent.find((r) => r.id === "l-1");
    expect(expRow?.origin).toBe("experience");
    expect(expRow?.type).toBe("经验");
    expect(expRow?.experienceDetail?.insight).toBe("洞察正文 l-1");
    expect(expRow?.experienceDetail?.reviewId).toBe("rev-1");
  });

  it("只读 validated:listLearnings 带 validationStatus=validated query", async () => {
    const listLearnings = vi.fn(() => Promise.resolve([]));
    const client = makeClient({ listLearnings });
    await buildKnowledgeDashboardViewModel(client);
    expect(listLearnings).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({ validationStatus: "validated" }),
      }),
    );
  });

  it("[T-211] 混排按 updatedAt 正序(知识卡 + 经验合流,最早在前)", async () => {
    const client = makeClient({
      listKnowledge: vi.fn(() =>
        Promise.resolve([
          knowledgeItem("k-old", "2026-07-01T00:00:00.000Z"),
          knowledgeItem("k-new", "2026-07-04T00:00:00.000Z"),
        ]),
      ),
      listLearnings: vi.fn(() =>
        Promise.resolve([
          learning("l-mid", "2026-07-02T00:00:00.000Z", null),
        ]),
      ),
    });
    const vm = await buildKnowledgeDashboardViewModel(client);
    expect(vm.recent.map((r) => r.id)).toEqual(["k-old", "l-mid", "k-new"]);
  });

  it("CategoryPanel 加「经验」分类,count = validated 数", async () => {
    const client = makeClient({
      listKnowledge: vi.fn(() =>
        Promise.resolve([knowledgeItem("k-1", "2026-07-01T00:00:00.000Z")]),
      ),
      listLearnings: vi.fn(() =>
        Promise.resolve([
          learning("l-1", "2026-07-02T00:00:00.000Z", null),
          learning("l-2", "2026-07-03T00:00:00.000Z", null),
        ]),
      ),
    });
    const vm = await buildKnowledgeDashboardViewModel(client);
    const expCat = vm.categories.find((c) => c.id === "cat-experience");
    expect(expCat?.name).toBe("经验");
    expect(expCat?.count).toBe(2);
  });

  it("无 validated 经验 → 不追加「经验」分类(诚实,不显空类)", async () => {
    const client = makeClient({
      listKnowledge: vi.fn(() =>
        Promise.resolve([knowledgeItem("k-1", "2026-07-01T00:00:00.000Z")]),
      ),
      listLearnings: vi.fn(() => Promise.resolve([])),
    });
    const vm = await buildKnowledgeDashboardViewModel(client);
    expect(vm.categories.find((c) => c.id === "cat-experience")).toBeUndefined();
  });

  it("client 不支持 listLearnings → 经验并入静默空(不崩,不 fixture 兜底)", async () => {
    const client = makeClient({
      listKnowledge: vi.fn(() =>
        Promise.resolve([knowledgeItem("k-1", "2026-07-01T00:00:00.000Z")]),
      ),
    });
    // 删掉 listLearnings 模拟旧 client。
    delete (client as { listLearnings?: unknown }).listLearnings;
    const vm = await buildKnowledgeDashboardViewModel(client);
    expect(vm.recent.every((r) => r.origin !== "experience")).toBe(true);
    expect(vm.categories.find((c) => c.id === "cat-experience")).toBeUndefined();
  });

  it("listLearnings 读失败 → 经验并入空(诚实降级)", async () => {
    const client = makeClient({
      listKnowledge: vi.fn(() =>
        Promise.resolve([knowledgeItem("k-1", "2026-07-01T00:00:00.000Z")]),
      ),
      listLearnings: vi.fn(() => Promise.reject(new Error("learnings read failed"))),
    });
    const vm = await buildKnowledgeDashboardViewModel(client);
    expect(vm.recent.every((r) => r.origin !== "experience")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T-119 分页:混排 10 条/页,?page= 承载
// ---------------------------------------------------------------------------

describe("[T-119] 最近更新混排分页(10 条/页)", () => {
  // 造 12 条知识卡 + 3 条经验 = 15 条混排 → 2 页(10 + 5)。
  function makePagedClient() {
    const items = Array.from({ length: 12 }, (_, i) =>
      // 用递减日期,确保排序稳定可断言。
      knowledgeItem(`k-${String(i).padStart(2, "0")}`, `2026-06-${String(28 - i).padStart(2, "0")}T00:00:00.000Z`),
    );
    const learnings = Array.from({ length: 3 }, (_, i) =>
      learning(`l-${i}`, `2026-07-0${i + 1}T00:00:00.000Z`, null),
    );
    return makeClient({
      listKnowledge: vi.fn(() => Promise.resolve(items)),
      listLearnings: vi.fn(() => Promise.resolve(learnings)),
    });
  }

  it("第 1 页 10 条 + totalPages/total 正确", async () => {
    const vm = await buildKnowledgeDashboardViewModel(makePagedClient());
    expect(vm.recent).toHaveLength(10);
    expect(vm.recentPage).toBe(1);
    expect(vm.recentTotal).toBe(15);
    expect(vm.recentTotalPages).toBe(2);
    // [T-211] 正序:经验(最新的 3 条 2026-07)排到最后(第 2 页);第 1 页全是
    // 较早的知识卡(2026-06)。
    expect(vm.recent.slice(0, 3).every((r) => r.origin !== "experience")).toBe(
      true,
    );
  });

  it("第 2 页取剩余 5 条", async () => {
    const vm = await buildKnowledgeDashboardViewModel(makePagedClient(), {
      page: 2,
    });
    expect(vm.recent).toHaveLength(5);
    expect(vm.recentPage).toBe(2);
  });

  it("page 超界 → 夹取到末页(不崩、不空)", async () => {
    const vm = await buildKnowledgeDashboardViewModel(makePagedClient(), {
      page: 99,
    });
    expect(vm.recentPage).toBe(2);
    expect(vm.recent).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// 渲染:经验行只读 + 分页控件
// ---------------------------------------------------------------------------

describe("[T-118b] 经验行只读渲染", () => {
  async function renderWithExperience() {
    const { KnowledgePage } = await import("./knowledge-page");
    const client = makeClient({
      listKnowledge: vi.fn(() =>
        Promise.resolve([knowledgeItem("k-1", "2026-07-01T00:00:00.000Z")]),
      ),
      listLearnings: vi.fn(() =>
        Promise.resolve([learning("l-1", "2026-07-03T00:00:00.000Z", "rev-1")]),
      ),
    });
    const vm = await buildKnowledgeDashboardViewModel(client);
    // 「最近更新」混排在「全部」视图里渲(默认视图是观点地图);置 atlas=null 让
    // 交互岛默认落「全部」列表视图,直接断言表格/分页(等价用户切到「全部」)。
    const element = await KnowledgePage({ viewModel: { ...vm, atlas: null } });
    return render(element);
  }

  it("经验行带「经验」类型 chip + data-origin=experience", async () => {
    const { container } = await renderWithExperience();
    const expRow = container.querySelector(
      '[data-slot="recent-knowledge-row"][data-origin="experience"]',
    );
    expect(expRow).not.toBeNull();
    expect(expRow!.getAttribute("data-knowledge-id")).toBe("l-1");
    const chip = expRow!.querySelector('[data-slot="recent-type-chip"][data-type="experience"]');
    expect(chip?.textContent).toBe("经验");
  });

  it("点开经验行 → 只读详情(insight + 来源),无采纳/翻案/修订按钮", async () => {
    const { container } = await renderWithExperience();
    const expRow = container.querySelector<HTMLElement>(
      '[data-slot="recent-knowledge-row"][data-origin="experience"]',
    )!;
    fireEvent.click(expRow);
    // T-192:详情进 ui/dialog 弹窗(Radix portal → document.body)。
    const detail = await waitFor(() => {
      const el = document.querySelector('[data-slot="experience-detail-preview"]');
      expect(el).not.toBeNull();
      return el!;
    });
    expect(detail.textContent).toContain("洞察正文 l-1");
    expect(detail.textContent).toContain("来自复盘诊断");
    // 只读:绝无裁决/修订入口。
    expect(document.querySelector('[data-slot="learning-adopt"]')).toBeNull();
    expect(document.querySelector('[data-slot="learning-reopen"]')).toBeNull();
    expect(document.querySelector('[data-slot="knowledge-add-revision"]')).toBeNull();
  });

  it("点开知识卡行 → 走 KnowledgeDetailPreview + 修订表单(非只读)", async () => {
    const { container } = await renderWithExperience();
    const kRow = container.querySelector<HTMLElement>(
      '[data-slot="recent-knowledge-row"][data-origin="knowledge"]',
    )!;
    fireEvent.click(kRow);
    // T-192:知识卡走弹窗(portal → document.body);不渲经验只读详情,渲修订表单。
    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="knowledge-add-revision"]'),
      ).not.toBeNull(),
    );
    expect(
      document.querySelector('[data-slot="experience-detail-preview"]'),
    ).toBeNull();
  });
});

describe("[T-119] 分页控件渲染", () => {
  it("多页 → 渲上/下一页链接(带 ?page=);单页不渲控件", async () => {
    const { KnowledgePage } = await import("./knowledge-page");
    // 15 条 → 2 页。
    const items = Array.from({ length: 15 }, (_, i) =>
      knowledgeItem(`k-${i}`, `2026-06-${String(28 - i).padStart(2, "0")}T00:00:00.000Z`),
    );
    const multiClient = makeClient({
      listKnowledge: vi.fn(() => Promise.resolve(items)),
      listLearnings: vi.fn(() => Promise.resolve([])),
    });
    const multiVm = await buildKnowledgeDashboardViewModel(multiClient);
    const { container } = render(
      await KnowledgePage({ viewModel: { ...multiVm, atlas: null } }),
    );
    const next = container.querySelector<HTMLAnchorElement>(
      '[data-slot="recent-pagination-next"]',
    );
    expect(next).not.toBeNull();
    expect(next!.getAttribute("href")).toBe("/knowledge?page=2");
    cleanup();

    // 单页(5 条)→ 无分页控件。
    const singleClient = makeClient({
      listKnowledge: vi.fn(() =>
        Promise.resolve(items.slice(0, 5)),
      ),
      listLearnings: vi.fn(() => Promise.resolve([])),
    });
    const singleVm = await buildKnowledgeDashboardViewModel(singleClient);
    const { container: c2 } = render(
      await KnowledgePage({ viewModel: { ...singleVm, atlas: null } }),
    );
    expect(c2.querySelector('[data-slot="recent-pagination"]')).toBeNull();
  });
});
