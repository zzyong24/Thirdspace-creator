import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BUILT_IN_IP_COURSE } from "./built-in-ip-course";
import { getBuiltInCourseLesson } from "./built-in-ip-course.server";
import { KnowledgeCourseReader } from "./knowledge-course-reader";

vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: ReactNode; href: string }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

const PROGRESS_KEY = `${BUILT_IN_IP_COURSE.courseId}:${BUILT_IN_IP_COURSE.version}:progress`;

describe("KnowledgeCourseReader", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => cleanup());

  it("课程目录展示真实的 6 模块、22 节课和 119 个知识点", () => {
    render(<KnowledgeCourseReader lesson={null} />);
    expect(screen.getByRole("heading", { name: BUILT_IN_IP_COURSE.title })).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(6);
    expect(screen.getByText("119")).toBeInTheDocument();
    expect(screen.getAllByRole("link").filter((link) => link.getAttribute("href")?.includes("lesson="))).toHaveLength(23);
  });

  it("课程页逐点呈现正文、提问、练习和 60/80/95 自评", () => {
    const lesson = getBuiltInCourseLesson("lesson-01");
    expect(lesson).not.toBeNull();
    render(<KnowledgeCourseReader lesson={lesson} />);
    expect(screen.getByRole("heading", { level: 1, name: lesson!.meta.title })).toBeInTheDocument();
    expect(screen.getByText("想一想再展开")).toBeInTheDocument();
    expect(screen.getByText("现在就做")).toBeInTheDocument();
    const rubric = screen.getByText("做到什么算掌握").closest("section");
    expect(rubric).not.toBeNull();
    expect(within(rubric!).getByText("60")).toBeInTheDocument();
    expect(within(rubric!).getByText("80")).toBeInTheDocument();
    expect(within(rubric!).getByText("95")).toBeInTheDocument();
  });

  it("完成状态只写本机课程进度,不触发知识写入", () => {
    const lesson = getBuiltInCourseLesson("lesson-01")!;
    render(<KnowledgeCourseReader lesson={lesson} />);
    fireEvent.click(screen.getByRole("button", { name: /人是感性脑做决策/ }));
    fireEvent.click(screen.getByRole("button", { name: "标记本节完成" }));
    expect(screen.getByRole("button", { name: "本节已完成" })).toBeDisabled();
    const saved = JSON.parse(window.localStorage.getItem(PROGRESS_KEY) ?? "{}") as {
      completedLessonIds?: string[];
      currentPointByLesson?: Record<string, number>;
    };
    expect(saved.completedLessonIds).toEqual(["lesson-01"]);
    expect(saved.currentPointByLesson?.["lesson-01"]).toBe(1);
  });
});
