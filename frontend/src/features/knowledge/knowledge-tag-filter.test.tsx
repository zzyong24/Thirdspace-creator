/**
 * T-062d 知识库假数据清理测试(SPEC 2026-07-03 §5 切片④)。
 *
 * KNOW-08:「知识关联」指标 —— 读成功=真值(空账号=真 0),relations 读全部
 *   失败=「—」错误降级;任何分支都不回退 fixture 386。
 * KNOW-13:热门标签 chip `?tag=` 被读侧真消费 —— knowledge.list 契约 query 不
 *   支持 tag,装配层经 taxonomy.entityTags.listEntitiesForTag 解析 tagId →
 *   实体行,对已读回列表求交集;页面显示「清除筛选」返回全量。
 */

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import type { KnowledgeDataClient } from "./knowledge-data";
import { buildKnowledgeDashboardViewModel } from "./knowledge-data";

// 岛组件依赖 useRouter / next/link / 浏览器端 contract client —— 全部打桩,
// 本测试不触发任何写操作。
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
  },
}));

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Mock contract client(读侧装配注入口)
// ---------------------------------------------------------------------------

const ITEMS = [
  {
    id: "k-1",
    title: "带标签的条目",
    knowledgeType: "note",
    status: "active",
    createdAt: "2026-06-30T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  },
  {
    id: "k-2",
    title: "无标签的条目",
    knowledgeType: "reference",
    status: "active",
    createdAt: "2026-06-29T00:00:00.000Z",
    updatedAt: "2026-06-30T00:00:00.000Z",
  },
] as const;

const TAGS = [
  {
    id: "tag-1",
    name: "选题",
    color: "#0ea5e9",
    usageCount: 3,
  },
] as const;

function makeClient(
  overrides: Partial<Record<keyof KnowledgeDataClient, unknown>> = {},
): KnowledgeDataClient {
  return {
    listKnowledge: vi.fn(() => Promise.resolve(ITEMS)),
    listKnowledgeRelations: vi.fn(() => Promise.resolve([])),
    listTags: vi.fn(() => Promise.resolve(TAGS)),
    listEntitiesForTag: vi.fn(() =>
      Promise.resolve([
        {
          id: "et-1",
          tagId: "tag-1",
          entityType: "knowledge",
          entityId: "k-1",
          createdAt: "2026-06-30T00:00:00.000Z",
        },
      ]),
    ),
    ...(overrides as Partial<KnowledgeDataClient>),
  } as KnowledgeDataClient;
}

function relationsMetric(
  vm: Awaited<ReturnType<typeof buildKnowledgeDashboardViewModel>>,
) {
  return vm.metrics.find((card) => card.id === "km-relations");
}

// ---------------------------------------------------------------------------
// KNOW-08 —— 知识关联指标:真值 / 真 0 / 读失败降级
// ---------------------------------------------------------------------------

describe("KNOW-08 知识关联指标", () => {
  it("空账号(list 为空)显真 0,不回退 fixture 386", async () => {
    const client = makeClient({
      listKnowledge: vi.fn(() => Promise.resolve([])),
    });
    const vm = await buildKnowledgeDashboardViewModel(client);
    const card = relationsMetric(vm);
    expect(card?.value).toBe("0");
    expect(card?.value).not.toBe("386");
  });

  it("relations 读成功时显真实边数", async () => {
    const client = makeClient({
      listKnowledgeRelations: vi.fn((input: { params: { knowledgeId: string } }) =>
        Promise.resolve(
          input.params.knowledgeId === "k-1"
            ? [
                {
                  id: "rel-1",
                  sourceKnowledgeId: "k-1",
                  targetKnowledgeId: "k-2",
                  relationType: "related",
                },
              ]
            : [],
        ),
      ),
    });
    const vm = await buildKnowledgeDashboardViewModel(client);
    expect(relationsMetric(vm)?.value).toBe("1");
  });

  it("relations 读全部失败 → 「—」错误降级(不是 0,更不是 386)", async () => {
    const client = makeClient({
      listKnowledgeRelations: vi.fn(() =>
        Promise.reject(new Error("relations read failed")),
      ),
    });
    const vm = await buildKnowledgeDashboardViewModel(client);
    const card = relationsMetric(vm);
    expect(card?.value).toBe("—");
    expect(card?.delta).toBe("读取失败");
  });
});

// ---------------------------------------------------------------------------
// KNOW-13 —— `?tag=` 真消费:装配层过滤 + 页面「清除筛选」
// ---------------------------------------------------------------------------

describe("KNOW-13 标签筛选", () => {
  it("给定 tag 时 recent 只保留挂该标签的条目,并回传 activeTag", async () => {
    const client = makeClient();
    const vm = await buildKnowledgeDashboardViewModel(client, { tag: "选题" });
    expect(vm.activeTag).toBe("选题");
    expect(vm.recent.map((row) => row.id)).toEqual(["k-1"]);
    // 指标仍按全量统计(过滤的是列表,不是数据)。
    expect(vm.metrics.find((card) => card.id === "km-total")?.value).toBe("2");
  });

  it("tag 不存在 → 列表为空(真:没有条目挂该标签)", async () => {
    const client = makeClient();
    const vm = await buildKnowledgeDashboardViewModel(client, {
      tag: "不存在的标签",
    });
    expect(vm.recent).toHaveLength(0);
  });

  it("未给 tag → 不过滤,activeTag 为 null", async () => {
    const client = makeClient();
    const vm = await buildKnowledgeDashboardViewModel(client);
    expect(vm.activeTag).toBeNull();
    expect(vm.recent).toHaveLength(2);
  });

  it("渲染:activeTag 生效时显示「清除筛选」链接,chip 链到 ?tag=", async () => {
    const { KnowledgePage } = await import("./knowledge-page");
    const client = makeClient();
    const vm = await buildKnowledgeDashboardViewModel(client, { tag: "选题" });
    const element = await KnowledgePage({ viewModel: vm });
    const { container } = render(element);

    // 过滤条 + 清除筛选(返回全量列表 = 去掉 URL 参数)。
    const bar = container.querySelector('[data-slot="knowledge-tag-filter"]');
    expect(bar).not.toBeNull();
    expect(bar!.textContent ?? "").toContain("选题");
    const clear = container.querySelector<HTMLAnchorElement>(
      '[data-slot="knowledge-tag-filter-clear"]',
    );
    expect(clear).not.toBeNull();
    expect(clear!.getAttribute("href")).toBe("/knowledge?view=advanced");

    // 列表只显该标签条目。
    const rows = container.querySelectorAll(
      '[data-slot="recent-knowledge-row"]',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.getAttribute("data-knowledge-id")).toBe("k-1");

    // 热门标签 chip 链回 `?tag=`(被读侧真消费的参数)。
    const chipLink = container.querySelector(
      '[data-slot="popular-tags"] a[href*="tag="]',
    );
    expect(chipLink).not.toBeNull();
    expect(chipLink!.getAttribute("href")).toBe(
      `/knowledge?view=advanced&tag=${encodeURIComponent("选题")}`,
    );
  });

  it("渲染:无 activeTag 时不显示过滤条", async () => {
    const { KnowledgePage } = await import("./knowledge-page");
    const client = makeClient();
    const vm = await buildKnowledgeDashboardViewModel(client);
    const element = await KnowledgePage({ viewModel: vm });
    const { container } = render(element);
    expect(
      container.querySelector('[data-slot="knowledge-tag-filter"]'),
    ).toBeNull();
  });
});
