/**
 * [T-373] 跨号项目整页门锚测(review / production 阶段路由)。
 *
 * 真机 bug:切到 B 号后打开 A 号项目的深链,稿面根路由(page.tsx,T-332 S4)会整页
 * 渲「不属于当前账号」引导,但 review / production 阶段路由此前把 OwnershipError
 * 逐区 catch 成「诚实空」→ 页面壳照渲(半渲染):复盘读被账号隔离挡了(sidecar 日志
 * `[review] readReviewHistory 读失败 … OwnershipError`),用户却看到一个空数据的
 * 工作面,不知道为什么。
 *
 * 锚定:两条阶段路由在项目按当前号读不到(getProject → OwnershipError)时,整页渲
 * CrossAccountEmptyState(与稿面根路由同款 data-page="project-cross-account-404"),
 * 不再渲染工作面;项目可读(同号)时行为不变(照常渲工作面)。
 */

import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- session:恒有 ctx(带当前号)。 ---
vi.mock("@/lib/session.server", () => ({
  resolveSession: async () => ({
    ctx: {
      userId: "user-1",
      accountId: "acct-current",
      requestId: "t-373",
      source: "user",
    },
  }),
}));

// --- contract client:getProject 行为由每个用例拨(跨号抛 OwnershipError / 同号返回)。 ---
const getProject = vi.fn();
const stubClient = {
  getProject: (...args: unknown[]) => getProject(...args),
  listProjects: async () => [],
  listOutputs: async () => [],
};
vi.mock("@/lib/contract-client.server", () => ({
  createServerClient: () => stubClient,
  client: stubClient,
}));

// --- 重特性组件/读侧装配全部替身:本测试只锚路由层的整页门。 ---
vi.mock("@/features/review/analytics-review-page", () => ({
  AnalyticsReviewPage: () => (
    <div data-testid="analytics-review-page">review-workspace</div>
  ),
}));
vi.mock("@/features/review/review-workspace-data", () => ({
  buildReviewWorkspaceViewModel: vi.fn(async () => undefined),
  buildPredictionComparison: vi.fn(async () => null),
}));
vi.mock("@/features/production/production-workbench", () => ({
  ProductionWorkbench: () => (
    <div data-testid="production-workbench">production-workspace</div>
  ),
}));
vi.mock("@/features/script/script-editor-data", () => ({
  resolveScriptArtifactIdFromDb: vi.fn(async () => null),
  loadScriptEditorData: vi.fn(async () => null),
}));

function ownershipError(): Error {
  // 后端 OwnershipError 形状(errors.ts:.code = ErrorCode.OwnershipError,
  // isOwnershipError 按 /Ownership/i 结构化识别,不靠 instanceof)。
  return Object.assign(new Error("Project not found: project-old-acct"), {
    code: "OwnershipError",
  });
}

async function renderReviewRoute() {
  const { default: AnalyticsReviewRoute } = await import("./review/page");
  const el = await AnalyticsReviewRoute({
    params: Promise.resolve({ projectId: "project-old-acct" }),
  });
  return render(el as React.ReactElement);
}

async function renderProductionRoute() {
  const { default: ProductionRoute } = await import("./production/page");
  const el = await ProductionRoute({
    params: Promise.resolve({ projectId: "project-old-acct" }),
  });
  return render(el as React.ReactElement);
}

describe("[T-373] 跨号项目整页门(不再半渲染)", () => {
  // 注意加花括号:beforeEach 的返回值会被 vitest 当 cleanup 函数调用,直接返回
  // mock(mockReset 返回自身)会让 cleanup 阶段裸调 getProject → 悬空 rejected
  // promise → 假失败。
  beforeEach(() => {
    getProject.mockReset();
  });
  afterEach(() => cleanup());

  it("review 路由:跨号项目 → 整页 CrossAccountEmptyState,不渲工作面", async () => {
    getProject.mockImplementation(() => Promise.reject(ownershipError()));
    const { container } = await renderReviewRoute();
    const page = container.querySelector(
      '[data-page="project-cross-account-404"]',
    );
    expect(page).not.toBeNull();
    expect(
      screen.getByText("未找到该项目,或它不属于当前账号"),
    ).toBeInTheDocument();
    expect(screen.getByText("回项目列表")).toHaveAttribute("href", "/projects");
    // 半渲染根治:复盘工作面完全不渲。
    expect(screen.queryByTestId("analytics-review-page")).toBeNull();
  });

  it("review 路由:同号项目 → 照常渲复盘工作面(零回归)", async () => {
    getProject.mockResolvedValue({ id: "project-old-acct" });
    await renderReviewRoute();
    expect(screen.getByTestId("analytics-review-page")).toBeInTheDocument();
    expect(
      screen.queryByText("未找到该项目,或它不属于当前账号"),
    ).toBeNull();
  });

  it("production 路由:跨号项目 → 整页 CrossAccountEmptyState,不渲工作面", async () => {
    getProject.mockImplementation(() => Promise.reject(ownershipError()));
    const { container } = await renderProductionRoute();
    expect(
      container.querySelector('[data-page="project-cross-account-404"]'),
    ).not.toBeNull();
    expect(
      screen.getByText("未找到该项目,或它不属于当前账号"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("production-workbench")).toBeNull();
  });

  it("production 路由:同号项目 → 照常渲制作工作台(零回归)", async () => {
    getProject.mockResolvedValue({ id: "project-old-acct" });
    await renderProductionRoute();
    expect(screen.getByTestId("production-workbench")).toBeInTheDocument();
  });

  it("非所有权读失败(transport 等)→ 维持原降级路径,不误判成跨号", async () => {
    getProject.mockImplementation(() => Promise.reject(new Error("ECONNREFUSED")));
    await renderReviewRoute();
    expect(screen.getByTestId("analytics-review-page")).toBeInTheDocument();
    expect(
      screen.queryByText("未找到该项目,或它不属于当前账号"),
    ).toBeNull();
  });
});
