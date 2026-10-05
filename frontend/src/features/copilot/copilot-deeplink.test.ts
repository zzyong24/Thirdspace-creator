import { describe, expect, it } from "vitest";
import { copilotDeepLink } from "./copilot-deeplink";

describe("公众号文章配图深链", () => {
  it("在项目会话中携带文章、段落及不可变版本锚点", () => {
    const href = copilotDeepLink("project", "material.generate.image", {
      kind: "article_section", id: "section-1", title: "账号归属",
      outputId: "output-1", versionId: "version-2", projectId: "project-1",
    }, "为本段生成示意图", "project:project-1");
    const params = new URLSearchParams(href.slice(1));
    expect(params.get("fn")).toBe("material.generate.image");
    expect(params.get("selKind")).toBe("article_section");
    expect(params.get("selId")).toBe("section-1");
    expect(params.get("selOutputId")).toBe("output-1");
    expect(params.get("selVersionId")).toBe("version-2");
    expect(params.get("selProjectId")).toBe("project-1");
    expect(params.get("scope")).toBe("project:project-1");
  });
});
