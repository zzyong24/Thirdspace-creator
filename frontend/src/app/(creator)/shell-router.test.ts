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
    // [T-063a] /library 与原 /knowledge 一样整页滚动(tab 内嵌区自管内部滚动)。
    expect(isContentFillRoute("/library")).toBe(false);
    // 仅精确匹配,不波及子路由 (项目工作台另有自己的布局)。
    expect(isContentFillRoute("/topics/anything")).toBe(false);
  });
});

// [T-063a] IA 收敛:4 面标题/描述 + /library 新条目;旧路由条目保留(301 前兜底)。
describe("resolveRoute — 4 面 IA(T-063a)", () => {
  it("/ → 今日台", () => {
    const res = resolveRoute("/");
    expect(res.pageTitle).toBe("今日台");
  });

  it("/projects → 作品(全生命周期语义)", () => {
    const res = resolveRoute("/projects");
    expect(res.pageTitle).toBe("作品");
    expect(res.pageDescription).toContain("全生命周期");
  });

  it("/library → 库(素材/知识/经验)", () => {
    const res = resolveRoute("/library");
    expect(res.pageTitle).toBe("库");
    expect(res.pageDescription).toContain("素材");
    expect(res.contextualCardVariant).toBe("assistant");
  });

  it("旧路由 resolveRoute 条目保留(301 落地前的瞬间渲染兜底)", () => {
    expect(resolveRoute("/topics").pageTitle).toBe("选题候选池");
    expect(resolveRoute("/publishing").pageTitle).toBe("发布中心");
    expect(resolveRoute("/knowledge").pageTitle).toBe("知识库");
    expect(resolveRoute("/positioning").pageTitle).toBe("定位中心");
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

  it("[T-055a] 项目根路由 = 稿面工作台:shell 不再叠大标题头(global + 空 pageTitle)", () => {
    const res = resolveRoute("/projects/ai-native-browser");
    expect(res.headerMode).toBe("global");
    expect(res.pageTitle).toBe("");
  });

  // T-039b item②:真项目 identity override —— fixture 里查不到的真项目,标题优先用 override 真值。
  it("有 override(routeParam 匹配)→ header + 左下角指示器显真项目标题(而非中性「当前项目」)", () => {
    const override = {
      routeParam: "proj-real-xyz",
      projectId: "proj-real-xyz",
      title: "22个没法看的复盘",
    };
    const res = resolveRoute("/projects/proj-real-xyz/research", override);
    // 顶部 header 的项目 identity 用真标题。
    expect(res.project?.title).toBe("22个没法看的复盘");
    // 左下角指示器(sidebarContext item)也用真标题。
    expect(res.sidebarContext?.items?.[0]?.label).toBe("22个没法看的复盘");
    // header 页标题同样是真标题。
    expect(res.pageTitle).toBe("22个没法看的复盘");
  });

  it("有 override 且是项目概览根路由 → pageTitle/指示器均显真标题", () => {
    const override = {
      routeParam: "proj-real-xyz",
      projectId: "proj-real-xyz",
      title: "上下文工程",
    };
    const res = resolveRoute("/projects/proj-real-xyz", override);
    // [T-055a] 稿面页自带顶条标题;shell pageTitle 收敛为空,指示器仍显真标题。
    expect(res.headerMode).toBe("global");
    expect(res.sidebarContext?.items?.[0]?.label).toBe("上下文工程");
  });

  // [T-054 组B] 无真标题时整个「当前项目」区不渲染 —— 原来的中性占位 item 与 section
  // 标题一字不差,在侧栏形成「当前项目/当前项目」两行重复(规范 §4 明令收敛)。
  it("无 override(真项目不在 fixture)→ 不渲染侧栏「当前项目」区(不留重复占位)", () => {
    const res = resolveRoute("/projects/proj-real-xyz/research");
    // fixture 查不到 → 不编造标题,也不显示与 heading 重复的占位行。
    expect(res.sidebarContext).toBeUndefined();
  });

  it("override 的 routeParam 与 URL 段不匹配 → 不采信 override(防串味),不留重复占位", () => {
    const stale = {
      routeParam: "other-project",
      projectId: "other-project",
      title: "串味的标题",
    };
    const res = resolveRoute("/projects/proj-real-xyz/research", stale);
    expect(res.sidebarContext).toBeUndefined();
    expect(res.project?.title).not.toBe("串味的标题");
  });

  it("override 优先于 fixture:fixture 命中的项目也用 override 的真标题(标题以真值为准)", () => {
    // ai-native-browser 在 fixture 里能命中;给一个 override → 标题应以 override 为准。
    const override = {
      routeParam: "ai-native-browser",
      projectId: "project-ainativebrowser",
      title: "改过名的真标题",
    };
    const res = resolveRoute("/projects/ai-native-browser", override);
    expect(res.project?.title).toBe("改过名的真标题");
    expect(res.sidebarContext?.items?.[0]?.label).toBe("改过名的真标题");
  });
});
