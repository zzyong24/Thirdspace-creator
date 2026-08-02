import * as React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// [T-234] 定位卡的硬约束(downstreamRules)透传:
//  - 卡上先渲染 AI 提炼的硬约束组(采纳前可见,用户看清再决定);
//  - 采纳时与库中已有规则逐键合并(新值非空取新值,否则保留现值)后随 upsertProfile 落库
//    —— 契约层对 downstreamRules 缺省键补 "",直接传部分对象会把已有规则抹空,故必须先读再合;
//  - 提案不带任何规则 → upsertProfile 整个省略该字段(服务端 partial merge 保留现值)。

const upsertProfile = vi.fn();
const createStatement = vi.fn();
const getProfile = vi.fn();
const getPositioningCenter = vi.fn();
const confirmDiscovery = vi.fn();
const routerRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh, push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/contract-client", () => ({
  client: {
    upsertProfile: (...a: unknown[]) => upsertProfile(...a),
    createStatement: (...a: unknown[]) => createStatement(...a),
    getProfile: (...a: unknown[]) => getProfile(...a),
    getPositioningCenter: (...a: unknown[]) => getPositioningCenter(...a),
    confirmDiscovery: (...a: unknown[]) => confirmDiscovery(...a),
  },
}));

import { ChatPositioningCard } from "./chat-result-cards";

const BASE = {
  persona: "硬核 AI 科普人",
  field: "AI 工程",
  audience: "一线开发者",
  differentiation: "论文直接落成可跑代码",
  capabilities: ["论文拆解"],
  oneLiner: "把最新 AI 论文翻译成你今晚就能跑的代码",
  keywords: ["论文", "代码", "工程化"],
};

afterEach(() => cleanup());
beforeEach(() => {
  vi.clearAllMocks();
  upsertProfile.mockResolvedValue({ id: "prof-1" });
  createStatement.mockResolvedValue({ id: "stmt-1" });
  getProfile.mockResolvedValue({
    id: "prof-1",
    downstreamRules: {
      topicRule: "",
      scriptRule: "已有写稿规则:先结论后论证",
      projectRule: "",
      forbidRule: "",
      expressionRule: "",
    },
  });
  getPositioningCenter.mockResolvedValue({
    currentStatement: { id: "stmt-current" },
  });
  confirmDiscovery.mockResolvedValue({
    statement: { id: "stmt-next" },
  });
});

describe("ChatPositioningCard — downstreamRules 硬约束 (T-234)", () => {
  it("提案带硬约束 → 卡上渲染硬约束组(采纳前可见)", () => {
    render(
      <ChatPositioningCard
        suggestion={{
          ...BASE,
          downstreamRules: { topicRule: "只做实战题", forbidRule: "不贩卖焦虑" },
        }}
      />,
    );
    const rules = document.querySelector(
      '[data-slot="chat-positioning-rules"]',
    );
    expect(rules).not.toBeNull();
    expect(screen.getByText("只做实战题")).toBeTruthy();
    expect(screen.getByText("不贩卖焦虑")).toBeTruthy();
    expect(screen.getByText("选题规则")).toBeTruthy();
    expect(screen.getByText("禁止事项")).toBeTruthy();
    // 空键不渲染。
    expect(screen.queryByText("写稿规则")).toBeNull();
  });

  it("采纳 → 先读现有 profile,新值非空取新值、空键保留现值,合成全量 downstreamRules 提交", async () => {
    const user = userEvent.setup();
    render(
      <ChatPositioningCard
        suggestion={{
          ...BASE,
          downstreamRules: { topicRule: "只做实战题", forbidRule: "不贩卖焦虑" },
        }}
      />,
    );
    await user.click(screen.getByText("采纳为当前定位"));
    await waitFor(() => expect(upsertProfile).toHaveBeenCalledTimes(1));
    expect(getProfile).toHaveBeenCalledTimes(1);
    expect(upsertProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          downstreamRules: {
            topicRule: "只做实战题", // 新值
            scriptRule: "已有写稿规则:先结论后论证", // 保留现值(不被空覆盖)
            projectRule: "",
            forbidRule: "不贩卖焦虑", // 新值
            expressionRule: "",
          },
        }),
      }),
    );
  });

  it("提案不带任何硬约束 → 不读 profile,upsertProfile 省略 downstreamRules(保留现值)", async () => {
    const user = userEvent.setup();
    render(<ChatPositioningCard suggestion={{ ...BASE }} />);
    expect(
      document.querySelector('[data-slot="chat-positioning-rules"]'),
    ).toBeNull();
    await user.click(screen.getByText("采纳为当前定位"));
    await waitFor(() => expect(upsertProfile).toHaveBeenCalledTimes(1));
    expect(getProfile).not.toHaveBeenCalled();
    const body = (upsertProfile.mock.calls[0]![0] as { body: object }).body;
    expect("downstreamRules" in body).toBe(false);
  });

  it("尚无 profile(getProfile 404 抛错)→ 现值按空,采纳仍落库不阻断", async () => {
    getProfile.mockRejectedValue(new Error("404"));
    const user = userEvent.setup();
    render(
      <ChatPositioningCard
        suggestion={{
          ...BASE,
          downstreamRules: { expressionRule: "不端着,说人话" },
        }}
      />,
    );
    await user.click(screen.getByText("采纳为当前定位"));
    await waitFor(() => expect(upsertProfile).toHaveBeenCalledTimes(1));
    expect(upsertProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          downstreamRules: expect.objectContaining({
            expressionRule: "不端着,说人话",
            topicRule: "",
          }),
        }),
      }),
    );
  });

  it("前采提案只调用原子 confirm，不再分两步更新画像和陈述", async () => {
    const user = userEvent.setup();
    render(
      <ChatPositioningCard
        suggestion={{ ...BASE }}
        discovery={{
          sessionId: "session-1",
          candidateId: "candidate-1",
          candidateRevision: 6,
        }}
      />,
    );
    await user.click(screen.getByText("采纳为当前定位"));
    await waitFor(() => expect(confirmDiscovery).toHaveBeenCalledTimes(1));
    expect(upsertProfile).not.toHaveBeenCalled();
    expect(createStatement).not.toHaveBeenCalled();
    expect(confirmDiscovery).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { sessionId: "session-1" },
        body: expect.objectContaining({
          candidateId: "candidate-1",
          candidateRevision: 6,
          expectedCurrentStatementId: "stmt-current",
          proposal: expect.objectContaining({
            oneLiner: BASE.oneLiner,
            keywords: BASE.keywords,
          }),
        }),
      }),
    );
  });

  it("前采版本已变化 → 明确提示卡片过期并禁用按钮，避免重复提交冲突", async () => {
    confirmDiscovery.mockRejectedValue(
      Object.assign(new Error("定位方向或当前母版已经变化"), {
        code: "ConflictError",
      }),
    );
    const user = userEvent.setup();
    render(
      <ChatPositioningCard
        suggestion={{ ...BASE }}
        discovery={{
          sessionId: "session-1",
          candidateId: "candidate-1",
          candidateRevision: 6,
        }}
      />,
    );

    await user.click(screen.getByText("采纳为当前定位"));

    expect(
      await screen.findByText(
        "前采内容在生成后有更新，这张定位卡已过期。请重新生成后再采纳，现有定位没有被覆盖。",
      ),
    ).toBeTruthy();
    const button = screen.getByRole("button", { name: "定位卡已过期" });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(confirmDiscovery).toHaveBeenCalledTimes(1);
  });
});
