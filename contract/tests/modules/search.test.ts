import { describe, it, expect } from "vitest";
import {
  searchDocumentResource,
  searchHistoryResource,
  searchFacetsResource,
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

  it("parses a SearchFacets resource (entityType / tag buckets with counts)", () => {
    const facets = searchFacetsResource.parse({
      query: "ai",
      entityType: [
        { value: "knowledge", count: 3 },
        { value: "project", count: 1 },
      ],
      tag: [{ value: "AI", count: 2 }],
    });
    expect(facets.entityType).toHaveLength(2);
    expect(facets.entityType[0]!.value).toBe("knowledge");
    expect(facets.tag[0]!.count).toBe(2);
  });

  it("exposes the standalone GET /search/facets endpoint (search.facets)", () => {
    const facets = ENDPOINTS.getSearchFacets;
    expect(facets).toBeDefined();
    expect(facets.id).toBe("search.facets");
    expect(facets.method).toBe("GET");
    expect(facets.path).toBe("/search/facets");
    expect(facets.isList).toBe(false);
    expect(facets.fr.length).toBeGreaterThan(0);
  });
});
