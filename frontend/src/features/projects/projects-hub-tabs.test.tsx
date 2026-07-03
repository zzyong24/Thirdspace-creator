/**
 * [T-063a] 作品页 tab 骨架测试:tab 归一化 + ?tab= Link 切换条渲染。
 */

import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import {
  normalizeProjectsHubTab,
  ProjectsHubTabBar,
  PROJECTS_HUB_TABS,
} from "./projects-hub-tabs";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(() => cleanup());

describe("normalizeProjectsHubTab", () => {
  it("合法 tab 原样返回,缺省/非法回默认「进行中」(现有项目列表不回退)", () => {
    expect(normalizeProjectsHubTab("candidates")).toBe("candidates");
    expect(normalizeProjectsHubTab("published")).toBe("published");
    expect(normalizeProjectsHubTab("schedule")).toBe("schedule");
    expect(normalizeProjectsHubTab(undefined)).toBe("active");
    expect(normalizeProjectsHubTab("bogus")).toBe("active");
  });
});

describe("ProjectsHubTabBar", () => {
  it("渲染 候选/进行中/已发布/排期 四 tab,href 指向 /projects?tab=,激活项带 aria-current", () => {
    render(<ProjectsHubTabBar active="published" />);
    const nav = screen.getByTestId("query-tabs");
    const links = Array.from(nav.querySelectorAll("a"));
    expect(links.map((a) => a.textContent?.trim())).toEqual([
      "候选",
      "进行中",
      "已发布",
      "排期",
    ]);
    expect(links.map((a) => a.getAttribute("href"))).toEqual(
      PROJECTS_HUB_TABS.map((t) => `/projects?tab=${t.id}`),
    );
    const active = links.find((a) => a.getAttribute("aria-current") === "page");
    expect(active?.getAttribute("href")).toBe("/projects?tab=published");
  });
});
