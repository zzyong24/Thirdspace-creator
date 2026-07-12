import { describe, expect, it } from "vitest";

import { isContentFillRoute, resolveRoute } from "./shell-router";

describe("isContentFillRoute", () => {
  it("opts the multi-column workbench routes into fixed-height fill mode", () => {
    expect(isContentFillRoute("/topics")).toBe(true);
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
    // [T-076] research 段(遗留路由,301 落稿面)映射进「脚本」段;脚本段无阶段跳转主行动。
    const resolution = resolveRoute(
      "/projects/ai-native-browser/research",
    );

    expect(resolution.headerMode).toBe("project-workspace");
    expect(resolution.primaryActionLabel).toBeUndefined();
    expect(resolution.sidebarContext?.heading).toBe("当前项目");
    expect(resolution.projectStages?.[0]?.status).toBe("in_progress");
    expect(resolution.projectStages?.[1]?.status).toBe("pending");
  });

  it("[T-076/T-254c] 阶段条三段:脚本|制作视频|复盘,复盘页主行动为「导出报告」", () => {
    const res = resolveRoute("/projects/ai-native-browser/review");
    expect(res.projectStages?.map((s) => s.label)).toEqual([
      "脚本",
      "制作视频",
      "复盘",
    ]);
    expect(res.projectStages?.[0]?.status).toBe("completed");
    expect(res.projectStages?.[1]?.status).toBe("completed");
    expect(res.projectStages?.[2]?.status).toBe("in_progress");
    expect(res.primaryActionLabel).toBe("导出报告");
  });

  it("[T-254c] production 路由映射进「制作视频」段(脚本 completed,复盘 pending)", () => {
    const res = resolveRoute("/projects/ai-native-browser/production");
    expect(res.headerMode).toBe("project-workspace");
    expect(res.projectStages?.[0]?.status).toBe("completed");
    expect(res.projectStages?.[1]?.status).toBe("in_progress");
    expect(res.projectStages?.[2]?.status).toBe("pending");
    // 制作视频段不渲阶段跳转主行动(可执行入口都在 tab 内)。
    expect(res.primaryActionLabel).toBeUndefined();
  });

  it("[T-075] 项目根路由(稿面)与阶段页同一套 project-workspace 阶段条(双导航收敛)", () => {
    const res = resolveRoute("/projects/ai-native-browser");
    expect(res.headerMode).toBe("project-workspace");
    // [T-076] 6 项 → 2 项;[T-254c] 制作视频段复活 → 3 项(脚本 | 制作视频 | 复盘)。
    expect(res.projectStages?.length).toBe(3);
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
    // [T-075] 稿面走 project-workspace header:pageTitle 与指示器均显真标题。
    expect(res.headerMode).toBe("project-workspace");
    expect(res.pageTitle).toBe("上下文工程");
    expect(res.sidebarContext?.items?.[0]?.label).toBe("上下文工程");
  });

  it("无 override(真项目不在 fixture)→ 退回中性「当前项目」(诚实兜底,不硬凑)", () => {
    const res = resolveRoute("/projects/proj-real-xyz/research");
    // fixture 查不到 → 指示器退回中性态,不编造标题。
    expect(res.sidebarContext?.items?.[0]?.label).toBe("当前项目");
  });

  it("override 的 routeParam 与 URL 段不匹配 → 不采信 override(防串味),退回 fixture/中性", () => {
    const stale = {
      routeParam: "other-project",
      projectId: "other-project",
      title: "串味的标题",
    };
    const res = resolveRoute("/projects/proj-real-xyz/research", stale);
    expect(res.sidebarContext?.items?.[0]?.label).toBe("当前项目");
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
