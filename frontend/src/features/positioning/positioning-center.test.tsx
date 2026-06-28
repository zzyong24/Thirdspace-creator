import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The view embeds client islands: the draft-drawer forms (PositioningProfileForm/
// StatementForm → upsertProfile/createStatement) AND the AI band
// (GeneratePositioningIsland → AdoptCandidateCard, which on mount reconciles via
// client.listAITasks and can poll createAITask/getTask/...). Stub next/navigation +
// the whole client surface so the render test stays deterministic and network-free.
// The island's hydration effect is async + catches its own errors, so the synchronous
// render asserts on layout structure only; the AI create→poll→confirm wiring lives in
// AdoptCandidateCard's own tests and the positioning-confirm integration test.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh() {}, push() {}, replace() {} }),
}));
vi.mock("@/lib/contract-client", () => ({
  client: {
    upsertProfile: () => Promise.resolve({}),
    createStatement: () => Promise.resolve({}),
    createAITask: () => Promise.resolve({ id: "t1" }),
    getTask: () => Promise.resolve({ status: "running" }),
    listTaskResults: () => Promise.resolve([]),
    confirmTask: () => Promise.resolve({}),
    listAITasks: () => Promise.resolve([]),
  },
}));

import { PositioningCenterView } from "./positioning-center";
import type { PositioningCenterViewModel } from "./positioning-center";

// 定位中心 page render test (Phase B redesign — viewModel seam). Asserts the page
// header + 新建定位版本 trigger, the empty-state CTA, the 当前定位母版 英雄区
// (一句话放大 + facet 网格 incl. product anchors), the AI 赋能带, the 下游影响
// collapsible (real injected facets), and the version-desc history table with the
// AI badge + 复制为草稿 action. Deterministic VM (no network).

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

const FACETS = {
  contentScope: "论文精读到工程落地",
  avoid: "纯理论推导",
  corePain: "看得懂论文却落不了地",
  coreValue: "今天就能 clone 跑通",
  tone: "硬核工程师口吻",
  statusNote: "稳定更新中",
};
const RULES = {
  topicRule: "只做能产出可运行代码的选题",
  scriptRule: "开头 15 秒抛可复现结果",
  projectRule: "每个项目绑定可演示代码产物",
  forbidRule: "不贴无法运行的截图",
  expressionRule: "统一工程师口吻不用营销腔",
};

const POPULATED: PositioningCenterViewModel = {
  profile: {
    id: "profile-1",
    userId: "user-a",
    persona: "硬核科普",
    field: "AI 工程",
    audience: "开发者",
    differentiation: "论文到代码",
    capabilities: ["拆解", "演示"],
    facets: FACETS,
    downstreamRules: RULES,
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
  it("renders the page header with the title and the 新建定位版本 trigger (populated)", () => {
    render(<PositioningCenterView viewModel={POPULATED} />);
    expect(screen.getByText("定位中心")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /新建定位版本/ }),
    ).toBeTruthy();
  });

  it("renders the empty-state CTA when there is no profile (brand-new user)", () => {
    render(<PositioningCenterView viewModel={EMPTY} />);
    expect(screen.getByTestId("positioning-empty-state")).toBeTruthy();
    expect(screen.getByRole("button", { name: "创建定位" })).toBeTruthy();
    // No 英雄区 / AI 带 / history before there is a profile.
    expect(screen.queryByTestId("positioning-ai-band")).toBeNull();
  });

  it("renders the 当前定位母版 英雄区: one-liner enlarged, current pill, 9-facet grid", () => {
    render(<PositioningCenterView viewModel={POPULATED} />);
    expect(screen.getByTestId("positioning-one-liner").textContent).toContain(
      "v2 把论文变生产级代码",
    );
    expect(screen.getByTestId("positioning-current-pill").textContent).toContain(
      "v2",
    );
    expect(screen.getByText("论文")).toBeTruthy();
    // facet grid carries the real profile fields + the 6 richer facets.
    const facets = screen.getByTestId("positioning-facets");
    expect(facets.textContent).toContain("硬核科普"); // 我是谁
    expect(facets.textContent).toContain("论文精读到工程落地"); // 内容范围
    expect(facets.textContent).toContain("看得懂论文却落不了地"); // 核心痛点
    expect(facets.textContent).toContain("论文到代码"); // 差异化视角
    // 9 facet labels present (all populated in the fixture).
    expect(screen.getAllByTestId("positioning-facet").length).toBe(9);
  });

  it("drops facets with no value rather than inventing them", () => {
    const sparse: PositioningCenterViewModel = {
      ...POPULATED,
      profile: {
        ...POPULATED.profile!,
        audience: "",
        differentiation: "",
        facets: { ...FACETS, corePain: "", avoid: "" },
      },
    };
    render(<PositioningCenterView viewModel={sparse} />);
    const facets = screen.getByTestId("positioning-facets");
    expect(facets.textContent).toContain("硬核科普"); // persona kept
    expect(facets.textContent).not.toContain("目标人群"); // empty audience dropped
    expect(facets.textContent).not.toContain("不做什么"); // empty avoid dropped
    // 9 - 4 empty (audience, differentiation, corePain, avoid) = 5 shown.
    expect(screen.getAllByTestId("positioning-facet").length).toBe(5);
  });

  it("renders the AI 赋能带 with the single real 生成定位建议 button", () => {
    render(<PositioningCenterView viewModel={POPULATED} />);
    expect(screen.getByTestId("positioning-ai-band")).toBeTruthy();
    expect(screen.getByText(/AI 生成定位建议/)).toBeTruthy();
  });

  it("renders the right-rail 定位规则 with the 5 rule cards (downstream constraints)", () => {
    render(<PositioningCenterView viewModel={POPULATED} />);
    const panel = screen.getByTestId("positioning-downstream");
    expect(panel.textContent).toContain("定位规则（供下游模块使用）");
    const fields = screen.getByTestId("positioning-downstream-fields");
    // the 5 rules actually injected into downstream runners (creative-context).
    expect(fields.textContent).toContain("选题规则");
    expect(fields.textContent).toContain("只做能产出可运行代码的选题");
    expect(fields.textContent).toContain("禁止事项");
    expect(screen.getAllByTestId("positioning-rule-card").length).toBe(5);
  });

  it("drops empty rule cards rather than inventing them", () => {
    const sparse: PositioningCenterViewModel = {
      ...POPULATED,
      profile: {
        ...POPULATED.profile!,
        downstreamRules: { ...RULES, projectRule: "", forbidRule: "" },
      },
    };
    render(<PositioningCenterView viewModel={sparse} />);
    expect(screen.getAllByTestId("positioning-rule-card").length).toBe(3);
  });

  it("renders the history timeline version-desc with the AI badge on AI rows", () => {
    render(<PositioningCenterView viewModel={POPULATED} />);
    const rows = screen.getAllByTestId("positioning-history-row");
    expect(rows.map((r) => r.getAttribute("data-version"))).toEqual(["2", "1"]);
    // v1 was AI-suggested → AI 建议 badge present once.
    expect(screen.getByText("AI 建议")).toBeTruthy();
  });

  it("offers a 复制为草稿 action per history row (createStatement seed) and NO 设为当前", () => {
    render(<PositioningCenterView viewModel={POPULATED} />);
    expect(screen.getAllByRole("button", { name: "复制为草稿" }).length).toBe(2);
    // statements are append-only — there is no real 设为当前 op, so no such button.
    expect(screen.queryByRole("button", { name: "设为当前" })).toBeNull();
  });
});
