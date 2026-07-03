/**
 * [T-063a] 库页 tab 骨架测试:tab 归一化 + ?tab= Link 切换条渲染。
 */

import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import {
  LIBRARY_TABS,
  LibraryTabBar,
  normalizeLibraryTab,
} from "./library-tabs";

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

describe("normalizeLibraryTab", () => {
  it("合法 tab 原样返回,缺省/非法回默认「素材」", () => {
    expect(normalizeLibraryTab("knowledge")).toBe("knowledge");
    expect(normalizeLibraryTab("experience")).toBe("experience");
    expect(normalizeLibraryTab(undefined)).toBe("assets");
    expect(normalizeLibraryTab("bogus")).toBe("assets");
  });
});

describe("LibraryTabBar", () => {
  it("渲染 素材/知识/经验 三 tab,href 指向 /library?tab=,激活项带 aria-current", () => {
    render(<LibraryTabBar active="knowledge" />);
    const nav = screen.getByTestId("query-tabs");
    const links = Array.from(nav.querySelectorAll("a"));
    expect(links.map((a) => a.textContent?.trim())).toEqual([
      "素材",
      "知识",
      "经验",
    ]);
    expect(links.map((a) => a.getAttribute("href"))).toEqual(
      LIBRARY_TABS.map((t) => `/library?tab=${t.id}`),
    );
    const active = links.find((a) => a.getAttribute("aria-current") === "page");
    expect(active?.getAttribute("href")).toBe("/library?tab=knowledge");
  });
});
