import { z } from "zod";
import { id, iso8601, platformId, projectStageName, assetType } from "../primitives.js";

// PAGE composition DTO for the Global Search page. Modeled from the grouped
// search result shape (`SearchViewModel`) in
// frontend/src/types/view-models.ts — results are grouped by entity kind
// (projects / knowledge / assets / videos).

const viewModelError = z.object({ code: z.string(), message: z.string() });

const searchResultProjectCard = z.object({
  id,
  title: z.string(),
  stage: projectStageName,
  progressPct: z.number(),
  snippet: z.string(),
});

const searchResultKnowledgeCard = z.object({
  id,
  title: z.string(),
  excerpt: z.string(),
  tags: z.array(z.string()),
});

// SearchResultAssetCard.assetType reuses AssetCardView["assetType"] which is
// the asset-type enum from the domain model.
const searchResultAssetCard = z.object({
  id,
  title: z.string(),
  assetType,
});

const searchResultVideoCard = z.object({
  id,
  title: z.string(),
  platform: platformId,
  durationLabel: z.string(),
});

export const globalSearchPage = z.object({
  scenario: z.enum(["default", "empty", "loading", "error", "selected"]),
  kind: z.literal("search"),
  loading: z.boolean(),
  error: viewModelError.nullable(),
  query: z.string(),
  resultTabs: z.array(z.object({ id: z.string(), label: z.string(), count: z.number() })),
  projects: z.array(searchResultProjectCard),
  knowledge: z.array(searchResultKnowledgeCard),
  assets: z.array(searchResultAssetCard),
  videos: z.array(searchResultVideoCard),
  filters: z.array(
    z.object({ id: z.string(), label: z.string(), options: z.array(z.string()) }),
  ),
  quickActions: z.array(z.object({ id, label: z.string() })),
  history: z.array(z.object({ id, query: z.string(), searchedAt: iso8601 })),
  tips: z.array(z.string()),
});
export type GlobalSearchPage = z.infer<typeof globalSearchPage>;
