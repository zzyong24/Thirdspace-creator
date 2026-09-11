import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TopicCard } from "./topic-card";
vi.mock("@/features/project-overview/brief-workbench", () => ({ BriefWorkbench: () => <div>选题详情</div> }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));
afterEach(cleanup);
it.each(["流量型", "信任型", "获客型"])("保留 %s 目的，字段齐全不宣称选题已定或已有真实证据", goal => {
  render(<TopicCard projectId="p1" title="当前选题" brief="" briefDetail={{ targetPlatforms: [], targetAudience: "刚入职正在准备汇报的人", contentGoal: goal, coreMessage: "如何展示工作结果" }} />);
  expect(screen.getByText("这条为什么值得做")).toBeTruthy();
  expect(screen.queryByText("选题已定")).toBeNull();
  expect(screen.getByText(`${goal} · 如何展示工作结果`)).toBeTruthy();
  expect(screen.getByText(/选题卡尚未记录可核对来源/)).toBeTruthy();
});
