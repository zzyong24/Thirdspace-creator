/** 批次2-8b（B5 遗留）：本期经验区没有候选时，也显示最近一次复盘结论（来自对话复盘卡）。 */
import * as React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn(), back: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("@/lib/contract-client", () => ({ client: { createLearning: vi.fn(async () => ({ id: "l" })), evaluateLearning: vi.fn() } }));
import { AnalyticsReviewPage } from "./analytics-review-page";
import { buildAnalyticsReviewViewModel } from "@/fixtures/selectors";
import { ChatLearningsCard } from "@/features/copilot/chat-result-cards";

const PROJECT_ID = "project-podcast-launch";
afterEach(cleanup);
beforeEach(() => localStorage.clear());

it("对话复盘卡产出结论后，复盘页空态显示「最近一次复盘结论」，不再只有空提示", async () => {
  render(<AnalyticsReviewPage projectId={PROJECT_ID} viewModel={{ ...buildAnalyticsReviewViewModel(PROJECT_ID), candidateLearnings: [] }} />);
  const region = document.querySelector<HTMLElement>('[data-slot="current-period-learnings"]')!;
  expect(region.querySelector('[data-slot="current-period-review-conclusion"]')).toBeNull();
  await act(async () => {
    render(<ChatLearningsCard projectId={PROJECT_ID} items={[]} observations={["开头 3 秒流失 40%"]} hypotheses={["钩子没有给结果"]} nextExperiment="下一条把结果前置到第一句" />);
  });
  const conclusion = await screen.findByTestId("current-period-review-conclusion");
  expect(conclusion.textContent).toContain("最近一次复盘结论");
  expect(conclusion.textContent).toContain("开头 3 秒流失 40%");
  expect(conclusion.textContent).toContain("下一条把结果前置到第一句");
  expect(region.textContent).not.toContain("本条视频还没有可裁决的经验候选");
});

it("别的项目的结论不串到本项目", async () => {
  render(<ChatLearningsCard projectId="other-project" items={[]} observations={["别处结论"]} />);
  render(<AnalyticsReviewPage projectId={PROJECT_ID} viewModel={{ ...buildAnalyticsReviewViewModel(PROJECT_ID), candidateLearnings: [] }} />);
  expect(screen.queryByTestId("current-period-review-conclusion")).toBeNull();
});
