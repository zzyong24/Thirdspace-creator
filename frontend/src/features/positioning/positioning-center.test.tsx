import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The view embeds the client islands (PositioningProfileForm/StatementForm) which
// call useRouter + client.* — stub both so the render test stays deterministic and
// network-free (the mutation wiring is asserted in positioning-interactive-region.test).
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh() {}, push() {}, replace() {} }),
}));
vi.mock("@/lib/contract-client", () => ({
  client: {
    upsertProfile: () => Promise.resolve({}),
    createStatement: () => Promise.resolve({}),
  },
}));

import { PositioningCenterView } from "./positioning-center";
import type { PositioningCenterViewModel } from "./positioning-center";

// 定位中心 page render test (Task 6.4 — viewModel seam). Asserts the empty-state CTA,
// the current定位 + keyword chips, and the version-desc history timeline. The
// mutation wiring (client.* + router.refresh) is covered by
// positioning-interactive-region.test.tsx. Deterministic VM (no network).

afterEach(cleanup);

const STATEMENT = (versionNumber: number, oneLiner: string, ai = false) => ({
  id: `posstmt-${versionNumber}`,
  userId: "user-a",
  profileId: "profile-1",
  oneLiner,
  keywords: ["论文", "代码", "工程化"],
  productAnchorIds: ["product-1"],
  versionNumber,
  createdByType: (ai ? "ai" : "human") as "ai" | "human",
  aiTaskId: ai ? "ai-task-1" : null,
  createdAt: "2026-06-21T00:00:00.000Z",
});

const POPULATED: PositioningCenterViewModel = {
  profile: {
    id: "profile-1",
    userId: "user-a",
    persona: "硬核科普",
    field: "AI 工程",
    audience: "开发者",
    differentiation: "论文到代码",
    capabilities: ["拆解", "演示"],
    createdAt: "2026-06-21T00:00:00.000Z",
    updatedAt: "2026-06-21T00:00:00.000Z",
  },
  currentStatement: STATEMENT(2, "v2 把论文变生产级代码"),
  keywords: ["论文", "代码", "工程化"],
  productAnchors: ["product-1"],
  history: [STATEMENT(2, "v2 把论文变生产级代码"), STATEMENT(1, "v1 把论文变代码", true)],
};

const EMPTY: PositioningCenterViewModel = {
  profile: null,
  currentStatement: null,
  keywords: [],
  productAnchors: [],
  history: [],
};

describe("PositioningCenterView", () => {
  it("renders the empty-state CTA when there is no profile (brand-new user)", () => {
    render(<PositioningCenterView viewModel={EMPTY} />);
    expect(screen.getByTestId("positioning-empty-state")).toBeTruthy();
    expect(screen.getByRole("button", { name: "创建定位" })).toBeTruthy();
  });

  it("renders the current one-liner, keyword chips, and product anchors", () => {
    render(<PositioningCenterView viewModel={POPULATED} />);
    expect(screen.getByTestId("positioning-one-liner").textContent).toContain(
      "v2 把论文变生产级代码",
    );
    expect(screen.getByText("论文")).toBeTruthy();
    expect(
      screen.getByTestId("positioning-product-anchors").textContent,
    ).toContain("product-1");
  });

  it("renders the history timeline version-desc with the AI badge on AI rows", () => {
    render(<PositioningCenterView viewModel={POPULATED} />);
    const rows = screen.getAllByTestId("positioning-history-row");
    expect(rows.map((r) => r.getAttribute("data-version"))).toEqual(["2", "1"]);
    // v1 was AI-suggested → AI 建议 badge present once.
    expect(screen.getByText("AI 建议")).toBeTruthy();
  });
});
