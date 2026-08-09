import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { PositioningDiscoverySessionResource } from "@creatoros/contract";
import {
  buildCopilotPrefill,
  PositioningDiscoveryWorkflow,
} from "./positioning-discovery-workflow";

const SESSION: PositioningDiscoverySessionResource = {
  id: "posdisc-1",
  userId: "user-a",
  accountId: "account-a",
  sourceMode: "optimize",
  status: "draft",
  answers: [
    {
      themeId: "goal",
      selectedOptionIds: ["personal-brand", "lead-generation"],
      customText: "先服务湖南餐饮老板",
      skipped: false,
      updatedAt: "2026-08-01T00:00:00.000Z",
    },
  ],
  webReferences: [],
  inputManifest: {
    legacyProfileId: "profile-1",
    legacyStatementIds: ["statement-1"],
    legacyWorkIds: ["work-1"],
  },
  adoptedCandidateId: null,
  adoptedStatementId: null,
  revision: 1,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

describe("PositioningDiscoveryWorkflow — T-707", () => {
  it("只展示一个 Copilot 入口，不再渲染固定六问或完成度门禁", () => {
    render(
      <PositioningDiscoveryWorkflow
        initialSession={null}
        hasCurrentProfile={false}
      />,
    );

    expect(screen.getByText("用 Copilot 把定位聊清楚")).toBeTruthy();
    expect(screen.getByRole("link", { name: /开始定位对话/ })).toBeTruthy();
    expect(screen.queryByText(/还差 .* 个问题/)).toBeNull();
    expect(screen.queryByRole("button", { name: /保存并继续/ })).toBeNull();
  });

  it("恢复旧前采答案并带入 Copilot，但不要求 session ready", () => {
    render(
      <PositioningDiscoveryWorkflow
        initialSession={SESSION}
        hasCurrentProfile
      />,
    );

    expect(screen.getByText(/已恢复 1 条旧前采信息/)).toBeTruthy();
    const link = screen.getByRole("link", { name: /继续定位对话/ });
    expect(link).toHaveAttribute("href", expect.stringContaining("copilot=open"));
    expect(decodeURIComponent(link.getAttribute("href") ?? "")).toContain(
      "先服务湖南餐饮老板",
    );
  });

  it("预填话术明确纯人设/产品通版和随时生成", () => {
    const prompt = buildCopilotPrefill(SESSION, true);
    expect(prompt).toContain("纯人设和有产品/服务");
    expect(prompt).toContain("每轮最多问一个");
    expect(prompt).toContain("立即调用 positioning.generate");
    expect(prompt).toContain("不要用六问、逐字稿、联网或方向选择阻断");
  });

  it("旧 scratch 会话携带明确机器路由，普通入口不误写 scratch", () => {
    const scratch = buildCopilotPrefill(
      { ...SESSION, sourceMode: "scratch" },
      true,
    );
    expect(scratch).toContain("定位路径：scratch");
    expect(scratch).toContain("本次起点：重新定位");

    const fresh = buildCopilotPrefill(null, true);
    expect(fresh).not.toContain("定位路径：scratch");
  });
});
