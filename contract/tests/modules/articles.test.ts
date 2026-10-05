import { describe, expect, it } from "vitest";
import { articleDocument, articleNativeLayout } from "../../src/resources/articles";

const layout = {
  schemaVersion: 1,
  editor: "doocs-md",
  editorCommit: "a7c17fc4cda92e3c13aa7e24f06615cfa4219b31",
  themeId: "default",
  themeSettings: { colors: { body: "#222" }, enabled: true },
  customCss: "",
  exportOptions: { useIndent: false, useJustify: false },
};

describe("article native layout", () => {
  it("defaults section headings to H2 and stores the Doocs layout in the article version", () => {
    const parsed = articleDocument.parse({ schemaVersion: 1, title: "标题", summary: "", sections: [
      { sectionId: "section-a", order: 0, heading: "第一节", body: "正文" },
    ], factItems: [], visualBriefs: [], imageUses: [], nativeLayout: layout });
    expect(parsed.sections[0]?.headingLevel).toBe(2);
    expect(parsed.nativeLayout).toEqual(layout);
  });

  it("accepts heading levels H1–H6 and rejects values outside that range", () => {
    for (const headingLevel of [1, 2, 3, 4, 5, 6]) {
      expect(articleDocument.safeParse({ schemaVersion: 1, title: "", summary: "", sections: [
        { sectionId: "section-a", order: 0, heading: "第一节", headingLevel, body: "", sourceRefs: [] },
      ], factItems: [], visualBriefs: [], imageUses: [] }).success).toBe(true);
    }
    expect(articleDocument.safeParse({ schemaVersion: 1, title: "", summary: "", sections: [
      { sectionId: "section-a", order: 0, heading: "第一节", headingLevel: 7, body: "", sourceRefs: [] },
    ], factItems: [], visualBriefs: [], imageUses: [] }).success).toBe(false);
  });

  it("bounds native settings and pins the editor source commit", () => {
    expect(articleNativeLayout.safeParse(layout).success).toBe(true);
    expect(articleNativeLayout.safeParse({ ...layout, editorCommit: "moving-branch" }).success).toBe(false);
    expect(articleNativeLayout.safeParse({ ...layout, customCss: "x".repeat(50 * 1024 + 1) }).success).toBe(false);
    expect(articleNativeLayout.safeParse({ ...layout, themeSettings: { css: "x".repeat(65_537) } }).success).toBe(false);
  });
});
