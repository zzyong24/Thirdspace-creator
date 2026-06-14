import { describe, expect, it } from "vitest";

import { resolveRoute } from "./shell-router";

describe("resolveRoute", () => {
  it("uses project workspace header mode for project stage routes", () => {
    const resolution = resolveRoute(
      "/projects/ai-native-browser/research",
    );

    expect(resolution.headerMode).toBe("project-workspace");
    expect(resolution.primaryActionLabel).toBe("进入下一步");
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
