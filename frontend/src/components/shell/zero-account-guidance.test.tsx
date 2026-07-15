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
  it("user 级页面放行(绑号入口/设置/激活)", () => {
    expect(isZeroAccountAllowedPath("/accounts")).toBe(true);
    expect(isZeroAccountAllowedPath("/accounts/new")).toBe(true);
    expect(isZeroAccountAllowedPath("/settings")).toBe(true);
    expect(isZeroAccountAllowedPath("/activate")).toBe(true);
  });

  it("per-account 创作域页面不放行 → 引导", () => {
    for (const p of [
      "/",
      "/projects",
      "/projects/p-1",
      "/topics",
      "/knowledge",
      "/assets",
      "/publishing-center",
      "/automations",
      "/calendar",
      "/positioning",
    ]) {
      expect(isZeroAccountAllowedPath(p)).toBe(false);
    }
  });

  it("前缀匹配是路径段级,不误放行相似前缀(/accountsX)", () => {
    expect(isZeroAccountAllowedPath("/accountsX")).toBe(false);
    expect(isZeroAccountAllowedPath("/settingsX")).toBe(false);
  });
});

describe("ZeroAccountGuidance", () => {
  it("渲染绑定引导 + /accounts 深链", () => {
    render(<ZeroAccountGuidance />);
    expect(screen.getByTestId("zero-account-guidance")).toBeInTheDocument();
    expect(
      screen.getByText("先绑定一个抖音号,再开始创作"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("zero-account-bind-link")).toHaveAttribute(
      "href",
      "/accounts",
    );
  });
});
