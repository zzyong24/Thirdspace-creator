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

describe("本期经验区 vs AI 要点卡 语义边界 (T-118a §D)", () => {
  it("两区 data-slot 不同,且同页共存", () => {
    const { container } = render(
      <AnalyticsReviewPage
        projectId={PROJECT_ID}
        viewModel={vmWith([candidate({})])}
      />,
    );
    const learningsRegion = container.querySelector(
      '[data-slot="current-period-learnings"]',
    );
    const aiCard = container.querySelector('[data-slot="ai-analysis-card"]');
    expect(learningsRegion).not.toBeNull();
    expect(aiCard).not.toBeNull();
    // 两区是不同 DOM 节点(不是同一个区)。
    expect(learningsRegion).not.toBe(aiCard);
  });

  it("本期经验区标题/副标题 = 可裁决语义;AI 卡 = 只读摘要语义", () => {
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
    expect(region.textContent).toContain("来源:本作品复盘提炼、待你裁决");

    const aiCard = container.querySelector<HTMLElement>(
      '[data-slot="ai-analysis-card"]',
    )!;
    expect(aiCard.textContent).toContain("AI 要点 · 本期复盘摘要");
    expect(aiCard.textContent).toContain("来源:帮我复盘生成的要点");
  });

  it("有候选:本期经验区渲 AdjudicationQueue(有采纳按钮);AI 卡无采纳动作", () => {
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

    // AI 卡无任何采纳/裁决动作(只读)。
    const aiCard = container.querySelector<HTMLElement>(
      '[data-slot="ai-analysis-card"]',
    )!;
    expect(aiCard.querySelector('[data-slot="learning-adopt"]')).toBeNull();
    expect(aiCard.querySelector("button")).toBeNull();
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
