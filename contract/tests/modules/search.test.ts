import { describe, it, expect } from "vitest";
import {
  searchDocumentResource,
  searchHistoryResource,
} from "../../src/resources/search";
import { ENDPOINTS } from "../../src/endpoints";

describe("search contract", () => {
  it("parses a SearchDocument resource", () => {
    const sd = searchDocumentResource.parse({
      id: "sd-project-ainativebrowser",
      userId: "user-zyongzhu",
      entityType: "project",
      entityId: "project-ainativebrowser",
      title: "AI Native Browser 深度解析",
      body: "深度拆解 AI Native Browser 的产品定位、技术架构与生态影响。",
      searchText: "ai native browser 深度解析 浏览器 代理",
      embedding: [0.01, 0.02, 0.03, 0.04],
      indexedAt: "2026-06-13T01:00:00.000Z",
    });
    expect(sd.entityType).toBe("project");
    expect(sd.embedding).toHaveLength(4);
  });

  it("parses a SearchHistory resource", () => {
    const sh = searchHistoryResource.parse({
      id: "sh-1",
      userId: "user-zyongzhu",
      query: "AI Native Browser",
      filters: { type: ["project"] },
      resultCount: 1,
      searchedAt: "2026-06-20T02:00:00.000Z",
    });
    expect(sh.resultCount).toBe(1);
  });

  it("exposes the composed GET /search endpoint (owned by the page layer)", () => {
    const search = Object.values(ENDPOINTS).find(
      (e) => e.method === "GET" && e.path === "/search",
    );
    expect(search).toBeDefined();
    expect(search!.fr.length).toBeGreaterThan(0);
  });
});
