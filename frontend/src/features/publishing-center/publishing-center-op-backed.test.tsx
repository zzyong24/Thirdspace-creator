/**
 * Task 6 FE adapter test (module Q server-read switch). Renders the Publishing
 * Center page with a `viewModel` built from a contract `publishingCenterPage` DTO
 * fixture (via the op→VM adapter) — NOT the fixture selector — and asserts the
 * page renders the op-supplied rows.
 */

import * as React from "react";
import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { publishingCenterPage } from "@creatoros/contract";
import { PublishingCenterPage } from "./publishing-center-page";
import { publishingCenterPageToViewModel } from "./publishing-center-view-model";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Stub next/navigation for the client island (jsdom has no app router).
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    replace: vi.fn(),
    push: vi.fn(),
    back: vi.fn(),
  }),
}));

afterEach(cleanup);

// A contract-valid publishingCenterPage DTO with two op-supplied rows.
const dto = publishingCenterPage.parse({
  scenario: "default",
  kind: "publishing-center",
  loading: false,
  error: null,
  contentTabs: [
    { id: "all", label: "全部" },
    { id: "video", label: "视频" },
    { id: "image", label: "图文" },
    { id: "audio", label: "音频" },
  ],
  rows: [
    {
      id: "pub-op-1",
      title: "组合返回的作品一",
      projectId: "project-1",
      projectTitle: "示例项目",
      platform: "bilibili",
      publishedAt: "2026-06-19T00:00:00.000Z",
      status: "published",
      views: 12000,
      engagement: 340,
    },
    {
      id: "pub-op-2",
      title: "组合返回的作品二",
      projectId: "project-1",
      projectTitle: "示例项目",
      platform: "youtube",
      publishedAt: "2026-06-18T00:00:00.000Z",
      status: "published",
      views: 800,
      engagement: 20,
    },
  ],
  metrics: [],
  platformComparison: [{ platform: "bilibili", value: 0.7 }],
  trend: [{ label: "6 月", value: 1000 }],
  topContent: [{ id: "top-1", title: "热门内容", value: "1.2 万" }],
});

describe("PublishingCenter op-backed render (DTO → VM adapter)", () => {
  it("renders the op-supplied performance rail without restoring the duplicate table", () => {
    const viewModel = publishingCenterPageToViewModel(dto);
    const { container } = render(
      <PublishingCenterPage
        viewModel={viewModel}
        calendar={<div data-testid="op-calendar">月历</div>}
      />,
    );

    expect(screen.getAllByText("热门内容")).toHaveLength(2);
    expect(screen.getByText("1.2 万")).toBeInTheDocument();
    expect(container.querySelector('[data-slot="analytics-rail"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="publication-table"]')).toBeNull();
    expect(viewModel.contentTypeTabs.find((t) => t.id === "all")?.count).toBe(2);
  });
});
