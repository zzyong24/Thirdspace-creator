import { describe, expect, it } from "vitest";

import { isContentFillRoute, resolveRoute } from "./shell-router";

describe("isContentFillRoute", () => {
  it("opts the multi-column workbench routes into fixed-height fill mode", () => {
    expect(isContentFillRoute("/topics")).toBe(true);
    expect(isContentFillRoute("/calibration")).toBe(true);
    expect(isContentFillRoute("/positioning")).toBe(true);
  });

  it("leaves simple pages on the default (PageScrollArea) whole-page scroll", () => {
    expect(isContentFillRoute("/")).toBe(false);
    expect(isContentFillRoute("/projects")).toBe(false);
    expect(isContentFillRoute("/settings")).toBe(false);
    // 仅精确匹配,不波及子路由 (项目工作台另有自己的布局)。
    expect(isContentFillRoute("/topics/anything")).toBe(false);
  });
});

describe("resolveRoute", () => {
  it("uses project workspace header mode for project stage routes", () => {
    const resolution = resolveRoute(
      "/projects/ai-native-browser/research",
    );

    expect(resolution.headerMode).toBe("project-workspace");
    expect(resolution.primaryActionLabel).toBe("进入下一步:策划构思");
    expect(resolution.sidebarContext?.heading).toBe("当前项目");
    expect(resolution.projectStages?.[0]?.status).toBe("in_progress");
    expect(resolution.projectStages?.[1]?.status).toBe("pending");
  });

  it("uses project overview header mode for a project root route", () => {
    expect(resolveRoute("/projects/ai-native-browser").headerMode).toBe(
      "project-overview",
    );
  });
});
