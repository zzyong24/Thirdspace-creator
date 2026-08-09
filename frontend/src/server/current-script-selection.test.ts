import { describe, expect, it } from "vitest";
import { resolveCurrentScriptSelectionFromTruth } from "./current-script-selection";

const contentDataSections = [
  { id: "section-current-1", originalText: "第一段当前正文" },
  { id: "section-current-2", originalText: "第二段当前正文" },
] as const;

describe("resolveCurrentScriptSelectionFromTruth", () => {
  it("优先使用当前版本的精确 sectionId", () => {
    expect(
      resolveCurrentScriptSelectionFromTruth({
        currentVersionId: "version-8",
        requestedVersionId: "version-8",
        requestedSectionId: "section-current-2",
        requestedExcerpt: "旧快照也不会覆盖当前正文",
        requestedSectionIndex: 0,
        contentDataSections,
        structuredSections: [],
      }),
    ).toEqual({
      sectionId: "section-current-2",
      originalText: "第二段当前正文",
      matchStrategy: "id",
    });
  });

  it("同一段同时存在 contentData 与 script_sections 时不会误判成正文冲突", () => {
    expect(
      resolveCurrentScriptSelectionFromTruth({
        currentVersionId: "version-8",
        requestedVersionId: "version-7",
        requestedSectionId: "old-section-id",
        requestedExcerpt: "第二段当前正文",
        contentDataSections,
        structuredSections: [
          { id: "row-1", originalText: "第一段当前正文" },
          { id: "row-2", originalText: "第二段当前正文" },
        ],
      }),
    ).toEqual({
      sectionId: "section-current-2",
      originalText: "第二段当前正文",
      matchStrategy: "text",
    });
  });

  it("同版本 sectionId 被重建时允许用明确段落位置重绑", () => {
    expect(
      resolveCurrentScriptSelectionFromTruth({
        currentVersionId: "version-8",
        requestedVersionId: "version-8",
        requestedSectionId: "recreated-id",
        requestedExcerpt: "编辑器发来的旧正文",
        requestedSectionIndex: 1,
        contentDataSections,
        structuredSections: [],
      }),
    ).toEqual({
      sectionId: "section-current-2",
      originalText: "第二段当前正文",
      matchStrategy: "position",
    });
  });

  it("跨版本连续改稿时按用户明确点击的段落位置重绑当前稿面", () => {
    expect(
      resolveCurrentScriptSelectionFromTruth({
        currentVersionId: "version-8",
        requestedVersionId: "version-7",
        requestedSectionId: "old-id",
        requestedExcerpt: "旧版本正文",
        requestedSectionIndex: 1,
        contentDataSections,
        structuredSections: [],
      }),
    ).toEqual({
      sectionId: "section-current-2",
      originalText: "第二段当前正文",
      matchStrategy: "position",
    });
  });

  it("复现真机 v16→v17：段落 id 与正文都变化时仍读取 v17 当下第 3 段", () => {
    const currentV17 = [
      { id: "v17-section-1", originalText: "v17 第一段" },
      { id: "v17-section-2", originalText: "v17 第二段" },
      {
        id: "v17-section-3",
        originalText: "v17 当前稿面第三段：第二步，写稿。传统写稿、查资料。",
      },
    ] as const;

    expect(
      resolveCurrentScriptSelectionFromTruth({
        currentVersionId: "version-17",
        requestedVersionId: "version-16",
        requestedSectionId: "v16-section-3",
        requestedExcerpt: "v16 旧稿第三段，内容已经完全不同",
        requestedSectionIndex: 2,
        contentDataSections: currentV17,
        structuredSections: [],
      }),
    ).toEqual({
      sectionId: "v17-section-3",
      originalText: "v17 当前稿面第三段：第二步，写稿。传统写稿、查资料。",
      matchStrategy: "position",
    });
  });

  it("兼容旧客户端：缺少 sectionIndex 时从明确历史版本恢复位置，再读取当前正文", () => {
    expect(
      resolveCurrentScriptSelectionFromTruth({
        currentVersionId: "version-17",
        requestedVersionId: "version-16",
        requestedSectionId: "version-16-section-2",
        requestedExcerpt: "第二段历史正文",
        requestedVersionSections: [
          { id: "version-16-section-1", originalText: "第一段历史正文" },
          { id: "version-16-section-2", originalText: "第二段历史正文" },
        ],
        contentDataSections,
        structuredSections: [],
      }),
    ).toEqual({
      sectionId: "section-current-2",
      originalText: "第二段当前正文",
      matchStrategy: "position",
    });
  });

  it("旧客户端的历史锚点若在当前稿已越界则拒绝，不拿历史正文继续调用", () => {
    expect(
      resolveCurrentScriptSelectionFromTruth({
        currentVersionId: "version-17",
        requestedVersionId: "version-16",
        requestedSectionId: "version-16-section-3",
        requestedExcerpt: "第三段历史正文",
        requestedVersionSections: [
          { id: "version-16-section-1", originalText: "第一段历史正文" },
          { id: "version-16-section-2", originalText: "第二段历史正文" },
          { id: "version-16-section-3", originalText: "第三段历史正文" },
        ],
        contentDataSections,
        structuredSections: [],
      }),
    ).toBeNull();
  });

  it("当前稿已删除用户原先点击的位置时拒绝越界重绑", () => {
    expect(
      resolveCurrentScriptSelectionFromTruth({
        currentVersionId: "version-8",
        requestedVersionId: "version-7",
        requestedSectionId: "old-id",
        requestedExcerpt: "旧版本正文",
        requestedSectionIndex: 9,
        contentDataSections,
        structuredSections: [],
      }),
    ).toBeNull();
  });

  it("历史单段稿仅允许 script-content-text 读取整稿", () => {
    expect(
      resolveCurrentScriptSelectionFromTruth({
        currentVersionId: "version-1",
        requestedVersionId: "version-1",
        requestedSectionId: "script-content-text",
        requestedExcerpt: "",
        contentDataSections: [],
        structuredSections: [],
        contentText: "历史单段整稿",
      }),
    ).toEqual({
      sectionId: "script-content-text",
      originalText: "历史单段整稿",
      matchStrategy: "whole_text",
    });
  });
});
