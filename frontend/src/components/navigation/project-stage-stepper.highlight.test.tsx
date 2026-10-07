/**
 * [T-373] Tab 高亮一致锚测。
 *
 * 真机 bug:已发布项目(currentStage=review)打开 `/projects/[id]`(稿面 = 脚本
 * 工作面)时,内容是脚本面、顶部阶段条却高亮「复盘」——因为 segmented stepper 的
 * 高亮样式此前跟 `status === "in_progress"`(项目成熟度)走,而不是跟「正在查看的
 * 面」(isCurrent)走;且 TopHeader 在无 stage 子段时把 currentStage 传成
 * undefined,stepper 退回按 status 高亮。
 *
 * 锚定修复后的单一判定:
 *  1. segmented 高亮 = isCurrent(currentStage 命中);status 只画左侧成熟度点。
 *  2. TopHeader 稿面根路由(无 stage 子段)把 currentStage 视为 "script"
 *     (projectWorkspaceHref(id, "script") 也指回稿面根路由 —— 内容与高亮同源)。
 *  3. 无 currentStage 的旧调用方(compact/独立渲染)行为不变:退回 in_progress。
 */

import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { ProjectStageStepper } from "./project-stage-stepper";

const linkReads = vi.hoisted(() => ({ props: [] as Array<{ href: string; prefetch?: boolean | null }> }));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    prefetch,
    ...rest
  }: {
    children: ReactNode;
    href: string;
    prefetch?: boolean | null;
  }) => {
    linkReads.props.push({ href, prefetch });
    return (
    <a href={href} {...rest}>
      {children}
    </a>
    );
  },
}));

beforeEach(() => { linkReads.props.length = 0; });
afterEach(() => cleanup());

// 已发布项目的阶段条(shell-router buildProjectStages("review") 的产物形状)。
const REVIEW_PROJECT_STAGES = [
  { id: "script", label: "脚本", status: "completed" as const },
  { id: "production", label: "制作视频", status: "completed" as const },
  { id: "review", label: "复盘", status: "in_progress" as const },
];

const HIGHLIGHT_CLASS = "bg-brand-soft";

it("四工作面保留真实链接与高亮，未点击目标不预取", () => {
  const workspaces = [
    { id: "script", label: "脚本", href: "/projects/project-x", status: "completed" as const },
    { id: "article", label: "文章", href: "/projects/project-x/outputs/article-real/article", status: "pending" as const },
    { id: "graphic", label: "图文", href: "/projects/project-x/outputs/graphic-real/image", status: "pending" as const },
    { id: "video", label: "视频", href: "/projects/project-x/outputs/video-real/production", status: "pending" as const },
  ];
  render(<ProjectStageStepper variant="segmented" projectId="project-x" currentStage="article" stages={workspaces} />);
  for (const stage of workspaces) {
    const link = screen.getByRole("link", { name: stage.label });
    expect(link).toHaveAttribute("href", stage.href);
    expect(linkReads.props.find(props => props.href === stage.href)?.prefetch).toBe(false);
    expect(link.closest("li")).toHaveAttribute("data-current", String(stage.id === "article"));
  }
  expect(screen.getByRole("link", { name: "文章" })).toHaveAttribute("aria-current", "page");
});

it("取消预取不放开未到达阶段或无项目的导航门禁", () => {
  const stages = [
    { id: "script", label: "脚本", status: "in_progress" as const },
    { id: "production", label: "视频", status: "pending" as const },
    { id: "review", label: "复盘", status: "pending" as const },
  ];
  const view = render(<ProjectStageStepper variant="segmented" projectId="project-x" currentStage="script" stages={stages} />);
  expect(screen.getByRole("link", { name: "视频" })).toHaveAttribute("href", "/projects/project-x/production");
  expect(screen.getByTestId("stage-segment-review")).toHaveAttribute("aria-disabled", "true");
  expect(screen.getByTestId("stage-segment-review").tagName).toBe("SPAN");
  view.rerender(<ProjectStageStepper variant="segmented" currentStage="script" stages={stages} />);
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
});

describe("[T-373] segmented stepper 高亮跟随正在查看的面(isCurrent)", () => {
  it("currentStage=script + review 项目:高亮「脚本」而非「复盘」;成熟度点保留", () => {
    render(
      <ProjectStageStepper
        variant="segmented"
        projectId="project-x"
        currentStage="script"
        stages={REVIEW_PROJECT_STAGES}
      />,
    );
    const script = screen.getByTestId("stage-segment-script");
    const review = screen.getByTestId("stage-segment-review");
    // 高亮(选中底色)在「脚本」——正在查看的面。
    expect(script.className).toContain(HIGHLIGHT_CLASS);
    expect(script).toHaveAttribute("aria-current", "step");
    // 「复盘」不再高亮;但 li 上的成熟度状态(in_progress)不丢。
    expect(review.className).not.toContain(HIGHLIGHT_CLASS);
    expect(review).not.toHaveAttribute("aria-current");
    expect(review.closest("li")).toHaveAttribute("data-status", "in_progress");
    // 已到达的段仍可点回(回归护栏:reachable 语义不因高亮改动而变)。
    expect(review.tagName).toBe("A");
    expect(review).toHaveAttribute("href", "/projects/project-x/review");
  });

  it("currentStage=review:高亮「复盘」(阶段子路由行为不变)", () => {
    render(
      <ProjectStageStepper
        variant="segmented"
        projectId="project-x"
        currentStage="review"
        stages={REVIEW_PROJECT_STAGES}
      />,
    );
    expect(screen.getByTestId("stage-segment-review").className).toContain(
      HIGHLIGHT_CLASS,
    );
    expect(
      screen.getByTestId("stage-segment-script").className,
    ).not.toContain(HIGHLIGHT_CLASS);
  });

  it("不传 currentStage:退回按 status(in_progress)高亮 —— 旧调用方行为不变", () => {
    render(
      <ProjectStageStepper
        variant="segmented"
        projectId="project-x"
        stages={REVIEW_PROJECT_STAGES}
      />,
    );
    expect(screen.getByTestId("stage-segment-review").className).toContain(
      HIGHLIGHT_CLASS,
    );
  });
});

describe("[T-373] TopHeader 稿面根路由的高亮与实际渲染面同源", () => {
  it("/projects/[id](无 stage 子段,内容=脚本面)→ 高亮「脚本」,即使项目 currentStage=review", async () => {
    const { TopHeader } = await import("@/components/shell/top-header");
    render(
      <TopHeader
        mode="project-workspace"
        pathname="/projects/project-x"
        project={{
          projectId: "project-x",
          title: "编导智能体-新账号一键导入",
          stage: "review",
          stageProgressPct: 100,
          updatedLabel: "",
          starred: false,
        }}
        projectStages={REVIEW_PROJECT_STAGES}
      />,
    );
    const script = screen.getByTestId("stage-segment-script");
    const review = screen.getByTestId("stage-segment-review");
    expect(script).toHaveAttribute("aria-current", "step");
    expect(script.className).toContain(HIGHLIGHT_CLASS);
    expect(review.className).not.toContain(HIGHLIGHT_CLASS);
  });

  it("/projects/[id]/review(复盘子路由)→ 高亮「复盘」(不回归)", async () => {
    const { TopHeader } = await import("@/components/shell/top-header");
    render(
      <TopHeader
        mode="project-workspace"
        pathname="/projects/project-x/review"
        project={{
          projectId: "project-x",
          title: "编导智能体-新账号一键导入",
          stage: "review",
          stageProgressPct: 100,
          updatedLabel: "",
          starred: false,
        }}
        projectStages={REVIEW_PROJECT_STAGES}
      />,
    );
    expect(screen.getByTestId("stage-segment-review").className).toContain(
      HIGHLIGHT_CLASS,
    );
    expect(
      screen.getByTestId("stage-segment-script").className,
    ).not.toContain(HIGHLIGHT_CLASS);
  });
});
