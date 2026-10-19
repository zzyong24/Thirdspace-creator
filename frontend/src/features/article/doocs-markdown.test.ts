import { describe, expect, it } from "vitest";
import { parseArticleMarkdown, serializeArticleMarkdown } from "./doocs-markdown";

const sections = [
  { sectionId: "section-a", order: 0, heading: "开头", headingLevel: 2, body: "正文\n\n### 正文内标题\n保留 HTML 注释 <!-- 普通注释 -->", sourceRefs: [] },
  { sectionId: "section-b", order: 1, heading: "结尾", headingLevel: 3, body: "收束", sourceRefs: [] },
];

describe("Doocs Markdown 与 CreatorOS 段落往返", () => {
  it("保留稳定 ID、H1-H6 层级、正文内标题和普通 HTML 注释，支持调整顺序", () => {
    const markdown = serializeArticleMarkdown([
      { ...sections[1]!, order: 0, headingLevel: 1 },
      { ...sections[0]!, order: 1, headingLevel: 4 },
    ]);
    const parsed = parseArticleMarkdown(markdown, sections);
    expect(parsed.sections.map((section) => [section.sectionId, section.order, section.headingLevel])).toEqual([
      ["section-b", 0, 1], ["section-a", 1, 4],
    ]);
    expect(parsed.sections[1]?.body).toContain("### 正文内标题");
    expect(parsed.sections[1]?.body).toContain("<!-- 普通注释 -->");
  });

  it("接受经过 Assets 校验的 CreatorOS 图片标记并返回精确文件引用", () => {
    const markdown = `${serializeArticleMarkdown(sections)}\n\n<img src="creatoros-asset:asset-a:file-a" alt="图" />`;
    expect(parseArticleMarkdown(markdown, sections).imageRefs).toEqual([{ sectionId: "section-b", assetId: "asset-a", assetFileId: "file-a" }]);
  });

  it.each(["data:image/png;base64,xx", "blob:https://creator.test/id", "https://example.test/a.png", "/assets/a.png", "../a.png"])(
    "拒绝非 CreatorOS 图片来源 %s",
    (source) => {
      const markdown = `${serializeArticleMarkdown(sections)}\n\n<img src="${source}" />`;
      expect(() => parseArticleMarkdown(markdown, sections)).toThrow(/CreatorOS 素材库/);
    },
  );

  it("拒绝丢失、重复和未知的段落标记", () => {
    const markdown = serializeArticleMarkdown(sections);
    expect(() => parseArticleMarkdown(markdown.replace("<!-- creatoros-section:section-b -->\n### 结尾\n收束", ""), sections)).toThrow(/标记缺失/);
    expect(() => parseArticleMarkdown(`${markdown}\n\n<!-- creatoros-section:section-a -->\n## 重复`, sections)).toThrow(/标记缺失/);
    expect(() => parseArticleMarkdown(`${markdown}\n\n<!-- creatoros-section:unknown -->\n## 新段`, sections)).toThrow(/标记缺失/);
  });

  it("拒绝 Markdown 行内或引用式图片，避免解析器漏掉绕过入口", () => {
    const base = serializeArticleMarkdown(sections);
    expect(() => parseArticleMarkdown(`${base}\n\n![图](https://example.test/a.png)`, sections)).toThrow(/Markdown 图片链接/);
    expect(() => parseArticleMarkdown(`${base}\n\n![图][remote]\n\n[remote]: /assets/a.png`, sections)).toThrow(/Markdown 图片链接/);
  });
});
