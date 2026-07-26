/**
 * [T-118a §A/§D gate-F1] 本期经验裁决区 + AI 要点卡的语义边界测试。
 *
 * 锁两区可区分:
 *   - data-slot 不同(current-period-learnings vs ai-analysis-card);
 *   - 标题/副标题不同(本期经验 · 可采纳沉淀 / 来源:本作品复盘提炼、待你裁决 ‖
 *     AI 要点 · 本期复盘摘要 / 来源:帮我复盘生成的要点);
 *   - 有候选时本期经验区渲 AdjudicationQueue(有采纳按钮 learning-adopt);AI 卡无任何动作;
 *   - 无候选时本期经验区渲差异化空态 + 「帮我复盘」CTA。
 */

import * as React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnalyticsViewModel } from "@/types/view-models";
import { AnalyticsReviewPage } from "./analytics-review-page";
import { buildAnalyticsReviewViewModel } from "@/fixtures/selectors";

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
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const PROJECT_ID = "project-podcast-launch";

afterEach(() => cleanup());

function vmWith(
  candidateLearnings: AnalyticsViewModel["candidateLearnings"],
): AnalyticsViewModel {
  return {
    ...buildAnalyticsReviewViewModel(PROJECT_ID),
    candidateLearnings,
  };
}

function candidate(
  over: Partial<NonNullable<AnalyticsViewModel["candidateLearnings"]>[number]>,
): NonNullable<AnalyticsViewModel["candidateLearnings"]>[number] {
  return {
    id: "l-1",
    title: "钩子前置提完播",
    insight: "前 3 秒抛冲突",
    learningType: "hook",
    validationStatus: "candidate",
    confidenceScore: 0,
    reuseCount: 0,
    reviewId: null,
    createdAt: "2026-07-04T02:00:00.000Z",
    updatedAt: "2026-07-04T02:00:00.000Z",
    ...over,
  };
}

describe("本期经验区(T-118a §D → [T-356③] AI 要点卡下架后收敛为单一区)", () => {
  it("[T-356③] AI 要点卡已下架(与本期经验区同源冗余),只剩本期经验单一区", () => {
    const { container } = render(
      <AnalyticsReviewPage
        projectId={PROJECT_ID}
        viewModel={vmWith([candidate({})])}
      />,
    );
    expect(
      container.querySelector('[data-slot="current-period-learnings"]'),
    ).not.toBeNull();
    // 「AI 要点 · 本期复盘摘要」卡与本期经验区同源(一次 review.analyze 产要点+候选),
    // 两块并存=概念重复(用户真机反馈分不清)→ 卡整块下架。
    expect(container.querySelector('[data-slot="ai-analysis-card"]')).toBeNull();
    expect(container.querySelector('[data-slot="ai-analysis-item"]')).toBeNull();
    expect(container.querySelector('[data-slot="ai-analysis-empty"]')).toBeNull();
    expect(container.querySelector('[data-slot="ai-analysis-cta"]')).toBeNull();
    expect(container.textContent ?? "").not.toContain(
      "来源:帮我复盘生成的要点",
    );
  });

  it("本期经验区标题/副标题 = 可裁决语义 + 采纳去处", () => {
    const { container } = render(
      <AnalyticsReviewPage
        projectId={PROJECT_ID}
        viewModel={vmWith([candidate({})])}
      />,
    );
    const region = container.querySelector<HTMLElement>(
      '[data-slot="current-period-learnings"]',
    )!;
    expect(region.textContent).toContain("本期经验 · 可采纳沉淀");
    // [T-356③] 副标题讲清全链路:来源(帮我复盘提炼)→ 裁决 → 采纳后的统一去处(知识库经验区)。
    expect(region.textContent).toContain("采纳后沉淀进知识库的经验区");
  });

  it("有候选:渲 AdjudicationQueue(采纳/翻案按钮)+ 区头常驻帮我复盘", () => {
    const { container } = render(
      <AnalyticsReviewPage
        projectId={PROJECT_ID}
        viewModel={vmWith([
          candidate({ id: "l-a", title: "候选甲" }),
          candidate({ id: "l-b", title: "候选乙" }),
        ])}
      />,
    );
    const region = container.querySelector<HTMLElement>(
      '[data-slot="current-period-learnings"]',
    )!;
    // AdjudicationQueue 渲两张候选卡。
    expect(
      region.querySelectorAll('[data-slot="candidate-card"]'),
    ).toHaveLength(2);
    // 关键区分:本期经验区有采纳按钮。
    expect(region.querySelector('[data-slot="learning-adopt"]')).not.toBeNull();
    expect(
      region.querySelector('[data-slot="learning-discard"]'),
    ).not.toBeNull();

    // [T-356③] 非空态区头有常驻「帮我复盘」再跑入口(原 AI 要点卡下架后由此承接)。
    expect(
      region.querySelector('[data-slot="current-period-learnings-rerun"]'),
    ).not.toBeNull();
  });

  it("无候选:本期经验区渲差异化空态 + 「帮我复盘」CTA(深链本项目 review.analyze)", () => {
    const { container } = render(
      <AnalyticsReviewPage projectId={PROJECT_ID} viewModel={vmWith([])} />,
    );
    const region = container.querySelector<HTMLElement>(
      '[data-slot="current-period-learnings"]',
    )!;
    expect(region.getAttribute("data-empty")).toBe("true");
    expect(
      region.querySelector('[data-slot="current-period-learnings-empty"]'),
    ).not.toBeNull();
    expect(region.textContent).toContain("本条视频还没有可裁决的经验候选");
    const cta = region.querySelector<HTMLAnchorElement>(
      '[data-slot="current-period-learnings-cta"]',
    );
    expect(cta).not.toBeNull();
    // 深链带 review surface + review.analyze fn + 本项目 selection。
    const href = cta!.getAttribute("href") ?? "";
    expect(href).toContain("surface=review");
    expect(href).toContain("fn=review.analyze");
    // 无候选时不渲裁决队列(无采纳按钮)。
    expect(region.querySelector('[data-slot="learning-adopt"]')).toBeNull();
  });
});
