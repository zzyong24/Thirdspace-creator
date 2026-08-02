import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PositioningDiscoverySessionResource } from "@creatoros/contract";
import { PositioningDiscoveryWorkflow } from "./positioning-discovery-workflow";

const startDiscovery = vi.fn();
const updateDiscoveryAnswer = vi.fn();
const researchDiscovery = vi.fn();
const setDiscoveryEvidence = vi.fn();

vi.mock("@/lib/contract-client", () => ({
  client: {
    startDiscovery: (...args: unknown[]) => startDiscovery(...args),
    updateDiscoveryAnswer: (...args: unknown[]) => updateDiscoveryAnswer(...args),
    researchDiscovery: (...args: unknown[]) => researchDiscovery(...args),
    setDiscoveryEvidence: (...args: unknown[]) => setDiscoveryEvidence(...args),
  },
}));

const SESSION: PositioningDiscoverySessionResource = {
  id: "posdisc-1",
  userId: "user-a",
  accountId: "account-a",
  sourceMode: "scratch",
  status: "draft",
  answers: [],
  webReferences: [],
  inputManifest: {
    legacyProfileId: null,
    legacyStatementIds: [],
    legacyWorkIds: [],
  },
  adoptedCandidateId: null,
  adoptedStatementId: null,
  revision: 0,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

describe("PositioningDiscoveryWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    startDiscovery.mockResolvedValue(SESSION);
    updateDiscoveryAnswer.mockImplementation(
      async (input: { body: Record<string, unknown> }) => ({
        ...SESSION,
        revision: 1,
        answers: [
          {
            themeId: input.body.themeId,
            selectedOptionIds: input.body.selectedOptionIds,
            customText: input.body.customText,
            skipped: input.body.skipped,
            updatedAt: SESSION.updatedAt,
          },
        ],
      }),
    );
    researchDiscovery.mockResolvedValue({
      ...SESSION,
      revision: 1,
      webReferences: [],
    });
  });

  it("新用户选择从零开始时调用真实 start operation，并明确隔离旧数据", async () => {
    const user = userEvent.setup();
    render(
      <PositioningDiscoveryWorkflow
        initialSession={null}
        hasCurrentProfile={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: /完全从零开始/ }));
    await waitFor(() =>
      expect(startDiscovery).toHaveBeenCalledWith({
        params: undefined,
        query: undefined,
        body: { sourceMode: "scratch" },
      }),
    );
    expect(screen.getByText("你希望这个 IP 最终帮你完成什么？")).toBeTruthy();
  });

  it("同一问题可多选并补充自定义文本，再持久化为一个答案", async () => {
    const user = userEvent.setup();
    render(
      <PositioningDiscoveryWorkflow
        initialSession={SESSION}
        hasCurrentProfile
      />,
    );

    await user.click(screen.getByRole("button", { name: /建立个人品牌/ }));
    await user.click(screen.getByRole("button", { name: /获得客户线索/ }));
    await user.type(
      screen.getByPlaceholderText("写下选项没有覆盖到的真实情况……"),
      "先建立专业信任",
    );
    await user.click(screen.getByRole("button", { name: /保存并继续/ }));

    await waitFor(() => expect(updateDiscoveryAnswer).toHaveBeenCalledTimes(1));
    expect(updateDiscoveryAnswer.mock.calls[0]?.[0]).toMatchObject({
      params: { sessionId: "posdisc-1" },
      body: {
        themeId: "goal",
        selectedOptionIds: ["personal-brand", "lead-generation"],
        customText: "先建立专业信任",
        skipped: false,
        expectedRevision: 0,
      },
    });
  });

  it("联网补充默认使用国内中文范围，并把本次可见关键词独立发送", async () => {
    const user = userEvent.setup();
    render(
      <PositioningDiscoveryWorkflow
        initialSession={SESSION}
        hasCurrentProfile
      />,
    );

    await user.type(
      screen.getByPlaceholderText("例如：杭州家装 IP 用户高频痛点"),
      "国内智能体",
    );
    await user.click(screen.getByRole("button", { name: /联网补充/ }));

    await waitFor(() => expect(researchDiscovery).toHaveBeenCalledTimes(1));
    expect(researchDiscovery.mock.calls[0]?.[0]).toMatchObject({
      params: { sessionId: "posdisc-1" },
      body: {
        query: "国内智能体",
        market: "cn",
        language: "zh-CN",
        targetThemeId: "goal",
        expectedRevision: 0,
      },
    });
    expect(
      screen.getByText(/二次搜索会替换上一批未采用结果/),
    ).toBeTruthy();
  });
});
