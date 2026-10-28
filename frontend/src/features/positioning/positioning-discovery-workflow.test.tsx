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

    expect(screen.getByText("定位对话")).toBeTruthy();
    expect(screen.getByRole("link", { name: /开始定位对话/ })).toBeTruthy();
    expect(screen.getByText("默认无需抖音登录")).toBeInTheDocument();
    const entry = new URL(screen.getByRole("link", { name: /开始定位对话/ }).getAttribute("href")!, "http://localhost");
    expect(entry.searchParams.get("copilot")).toBe("open");
    expect(decodeURIComponent(entry.href)).not.toContain("定位路径：scratch");
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

  it("开场简短，不重复执行说明；旧资料仍完整带入", () => {
    for (const hasCurrentProfile of [false, true]) {
      const fresh = buildCopilotPrefill(null, hasCurrentProfile);
      expect(fresh.length).toBeLessThan(60);
      expect(fresh).toContain("帮我梳理账号定位");
      expect(fresh).not.toContain("positioning.generate");
    }
    const prompt = buildCopilotPrefill(SESSION, true);
    expect(prompt).toContain("建立个人品牌；获得客户线索；先服务湖南餐饮老板");
    expect(prompt).toContain("定位路径：optimize");
    expect(prompt).not.toContain("positioning.generate");
  });

  it("长答案和跳过状态原样保留，不为缩短界面裁掉用户资料", () => {
    const answer = "我希望保留的真实经历。".repeat(50);
    const prompt = buildCopilotPrefill({...SESSION, answers:[
      {...SESSION.answers[0], customText:answer},
      {...SESSION.answers[0], themeId:"proof", skipped:true},
    ]}, true);
    expect(prompt).toContain(answer);
    expect(prompt).toContain("可信证明：暂不确定");
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
