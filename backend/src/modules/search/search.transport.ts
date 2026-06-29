import type { Endpoint, RequestContext, Transport } from "@creatoros/contract";
import {
  AuthenticationError,
  UnsupportedOperationError,
} from "@creatoros/backend";
import type { SearchService } from "./search.service";
import type { SearchDocumentResource } from "./search.schema";

// Search transport (foundation §5.4) — the Search surface owns NO standalone
// dispatch endpoint (contract/src/operations/search.ts exports `{}`). The ONLY
// HTTP op is the composed page read `pages.search.get` → globalSearchPage DTO.
// This module ships an INTERIM COMPOSER for it (foundation §6: Wave-4's
// GlobalSearchQueryService takes final ownership; until then Search provides a
// deterministic composer so `/search` wires now). Mirrors the realized
// notifications transport: a `Transport` switching on endpoint.id, delegating to a
// per-ctx service, returning the SPEC §14 envelope. No ctx ⇒ unauthenticated
// dispatch ⇒ AuthenticationError (→401). Unknown ops ⇒ UnsupportedOperationError.
//
// The opId list is the registry this module owns; persistence-client builds
// PERSISTED_OPS from SEARCH_OP_IDS (adding the module = registering it).

export const SEARCH_OP_IDS = ["pages.search.get", "search.facets"] as const;

// The 4 locked result tabs, in the approved order (项目 / 知识 / 素材 / 视频).
const TAB_DEFS = [
  { id: "project", label: "项目", entityType: "project" },
  { id: "knowledge", label: "知识", entityType: "knowledge" },
  { id: "asset", label: "素材", entityType: "asset" },
  { id: "video", label: "视频", entityType: "video" },
] as const;

// Static facet/quick-action/tips definitions (the deterministic interim shell;
// Wave-4 may enrich these from real services). They keep globalSearchPage valid.
const STATIC_FILTERS = [
  { id: "f-type", label: "类型", options: ["项目", "知识", "素材", "视频"] },
  { id: "f-stage", label: "阶段", options: ["研究", "策划", "脚本", "拍摄", "发布", "复盘"] },
  { id: "f-tag", label: "标签", options: ["AI", "教程", "提示词", "Agent", "变现", "出海"] },
];
const STATIC_QUICK_ACTIONS = [
  { id: "qa-new-project", label: "新建项目" },
  { id: "qa-knowledge", label: "查看知识库" },
  { id: "qa-assets", label: "上传素材" },
];
const STATIC_TIPS = [
  "使用引号精确匹配: 'AI Browser'",
  "使用 - 排除关键词: 浏览器 -Chrome",
];

const PROJECT_STAGES = new Set([
  "research", "planning", "script", "production", "publishing", "review",
]);
const ASSET_TYPES = new Set(["image", "video", "audio", "document", "subtitle"]);
const PLATFORMS = new Set([
  "youtube", "bilibili", "douyin", "xiaohongshu", "wechatVideo", "x",
]);

// Owning modules denormalize the card-only fields (stage/progressPct/assetType/
// platform/durationLabel) as a JSON payload in `body` at upsert time. Parse it
// here; fall back to deterministic defaults so the DTO ALWAYS validates even when
// `body` is plain text (e.g. Wave-1 seeds without a JSON payload).
function parsePayload(body: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(body);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function toProjectCard(doc: SearchDocumentResource) {
  const p = parsePayload(doc.body);
  const stage = typeof p.stage === "string" && PROJECT_STAGES.has(p.stage) ? p.stage : "research";
  const progressPct = typeof p.progressPct === "number" ? p.progressPct : 0;
  const snippet = typeof p.snippet === "string" ? p.snippet : "";
  return { id: doc.entityId, title: doc.title, stage, progressPct, snippet };
}

function toKnowledgeCard(doc: SearchDocumentResource) {
  const p = parsePayload(doc.body);
  const excerpt = typeof p.excerpt === "string" ? p.excerpt : "";
  const tags = Array.isArray(p.tags) ? p.tags.filter((t): t is string => typeof t === "string") : [];
  return { id: doc.entityId, title: doc.title, excerpt, tags };
}

function toAssetCard(doc: SearchDocumentResource) {
  const p = parsePayload(doc.body);
  const assetType = typeof p.assetType === "string" && ASSET_TYPES.has(p.assetType) ? p.assetType : "document";
  return { id: doc.entityId, title: doc.title, assetType };
}

function toVideoCard(doc: SearchDocumentResource) {
  const p = parsePayload(doc.body);
  const platform = typeof p.platform === "string" && PLATFORMS.has(p.platform) ? p.platform : "youtube";
  const durationLabel = typeof p.durationLabel === "string" ? p.durationLabel : "00:00";
  return { id: doc.entityId, title: doc.title, platform, durationLabel };
}

type Input = { params?: unknown; query?: unknown; body?: unknown };

export function createSearchTransport(
  serviceFactory: (ctx: RequestContext) => SearchService,
): Transport {
  return {
    async request(endpoint: Endpoint, input, ctx) {
      if (!ctx) throw new AuthenticationError();
      const service = serviceFactory(ctx);

      // search.facets (GAP-SRCH-facets) — GET /search/facets?q= → per-dimension
      // facet buckets (entityType / tag) with hit counts over the matched docs.
      // A DERIVED read (no history side-effect, no write); empty q ⇒ empty buckets.
      if (endpoint.id === "search.facets") {
        const { query: fq } = (input ?? {}) as Input;
        const fqObj = (fq ?? {}) as { q?: string };
        const rawFacetQuery = typeof fqObj.q === "string" ? fqObj.q : "";
        const facets = await service.facets(ctx, rawFacetQuery);
        return { data: facets, meta: { requestId: ctx.requestId } };
      }

      if (endpoint.id !== "pages.search.get") {
        throw new UnsupportedOperationError(endpoint.id);
      }

      const { query } = (input ?? {}) as Input;
      const q = (query ?? {}) as { q?: string; type?: string };
      const rawQuery = typeof q.q === "string" ? q.q : "";
      const typeFilter = typeof q.type === "string" && q.type ? q.type : undefined;

      // Map the type facet (project|knowledge|asset|video) to the entityType the
      // repo filters on. Search returns [] for an empty/whitespace query.
      const docs = await service.search(ctx, rawQuery, { entityType: typeFilter });

      const byType = (et: string) => docs.filter((d) => d.entityType === et);
      const projects = byType("project").map(toProjectCard);
      const knowledge = byType("knowledge").map(toKnowledgeCard);
      const assets = byType("asset").map(toAssetCard);
      const videos = byType("video").map(toVideoCard);

      const countByType: Record<string, number> = {
        project: projects.length,
        knowledge: knowledge.length,
        asset: assets.length,
        video: videos.length,
      };
      const resultTabs = TAB_DEFS.map((t) => ({
        id: t.id,
        label: t.label,
        count: countByType[t.entityType] ?? 0,
      }));

      // History is written server-side as a post-commit side-effect of the read
      // (the spec-gap resolution — no invented endpoint). recordSearch NEVER
      // throws; we ignore the outcome so an index/history failure never fails the
      // page render (SPEC §16/§11). Skip recording empty queries.
      if (rawQuery.trim() !== "") {
        await service.recordSearch(ctx, {
          query: rawQuery,
          filters: typeFilter ? { type: typeFilter } : {},
          resultCount: docs.length,
        });
      }

      const history = (await service.listHistory(ctx, 10)).map((h) => ({
        id: h.id,
        query: h.query,
        searchedAt: h.searchedAt,
      }));

      const page = {
        scenario: rawQuery.trim() !== "" ? ("default" as const) : ("empty" as const),
        kind: "search" as const,
        loading: false,
        error: null,
        query: rawQuery,
        resultTabs,
        projects,
        knowledge,
        assets,
        videos,
        filters: STATIC_FILTERS,
        quickActions: STATIC_QUICK_ACTIONS,
        history,
        tips: STATIC_TIPS,
      };

      return { data: page, meta: { requestId: ctx.requestId } };
    },
  };
}
