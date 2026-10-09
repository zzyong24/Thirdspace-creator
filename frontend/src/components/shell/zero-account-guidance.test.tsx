// [T-332 S4] 0 号全局引导:路径白名单判定 + 引导页渲染(SPEC §4.2)。

import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  ZeroAccountGuidance,
  isZeroAccountAllowedPath,
} from "./zero-account-guidance";

afterEach(() => cleanup());

describe("isZeroAccountAllowedPath", () => {
  it("user 级页面与随包课程入口放行(绑号入口/设置/知识库/激活)", () => {
    expect(isZeroAccountAllowedPath("/accounts")).toBe(true);
    expect(isZeroAccountAllowedPath("/accounts/new")).toBe(true);
    expect(isZeroAccountAllowedPath("/settings")).toBe(true);
    expect(isZeroAccountAllowedPath("/knowledge")).toBe(true);
    expect(isZeroAccountAllowedPath("/activate")).toBe(true);
  });

  it("[T-348] 首页 `/` 放行 —— 首页承接完整引导流(OnboardingCard),不被守卫盖掉", () => {
    expect(isZeroAccountAllowedPath("/")).toBe(true);
  });

  it("首页外的 per-account 创作域页面不放行 → 守卫引导", () => {
    for (const p of [
      "/projects",
      "/projects/p-1",
      "/topics",
      "/assets",
      "/publishing-center",
      "/automations",
      "/calendar",
      "/positioning",
    ]) {
      expect(isZeroAccountAllowedPath(p)).toBe(false);
    }
  });

  it("前缀匹配是路径段级,不误放行相似前缀(/accountsX);首页只精确匹配 `/`", () => {
    expect(isZeroAccountAllowedPath("/accountsX")).toBe(false);
    expect(isZeroAccountAllowedPath("/settingsX")).toBe(false);
    // 首页放行是精确匹配 `/`,不把所有路径都当首页放行。
    expect(isZeroAccountAllowedPath("/projects")).toBe(false);
  });
});

describe("ZeroAccountGuidance", () => {
  it("渲染绑定引导 + /accounts 深链", () => {
    render(<ZeroAccountGuidance />);
    expect(screen.getByTestId("zero-account-guidance")).toBeInTheDocument();
    expect(
      screen.getByText("先创建账号组，再开始创作"),
    ).toBeInTheDocument();
    expect(screen.getByText("创建账号组与绑定账号")).toBeInTheDocument();
    expect(screen.queryByText("先绑定一个抖音号,再开始创作")).not.toBeInTheDocument();
    expect(screen.getByTestId("zero-account-bind-link")).toHaveAttribute(
      "href",
      "/accounts",
    );
  });

  it("[T-348] 次级动作:回首页看完整上手引导(深链 → `/`)", () => {
    render(<ZeroAccountGuidance />);
    expect(screen.getByTestId("zero-account-home-link")).toHaveAttribute(
      "href",
      "/",
    );
  });
});
