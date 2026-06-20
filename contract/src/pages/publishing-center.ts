import { z } from "zod";
import { id, iso8601, platformId, publicationStatus } from "../primitives.js";
import { metricCard } from "./dashboard.js";

// PAGE composition DTO for the Publishing Center page. Modeled from
// `PublishingCenterViewModel` in frontend/src/types/view-models.ts.
//
// NOTE: there is no distinct read endpoint for this page in SPEC §13 — the
// page is composed client-side via `GET /publications` + analytics. This DTO
// is defined for reuse only; no endpoint is registered in operations/pages.ts.

const viewModelError = z.object({ code: z.string(), message: z.string() });

// PublicationPerformanceRow (view-models.ts) --------------------------------
const publicationPerformanceRow = z.object({
  id,
  title: z.string(),
  projectId: id,
  projectTitle: z.string(),
  platform: platformId,
  publishedAt: iso8601,
  status: publicationStatus,
  views: z.number(),
  engagement: z.number(),
});

export const publishingCenterPage = z.object({
  scenario: z.enum(["default", "empty", "loading", "error", "selected"]),
  kind: z.literal("publishing-center"),
  loading: z.boolean(),
  error: viewModelError.nullable(),
  contentTabs: z.array(z.object({ id: z.string(), label: z.string() })),
  rows: z.array(publicationPerformanceRow),
  metrics: z.array(metricCard),
  platformComparison: z.array(z.object({ platform: platformId, value: z.number() })),
  trend: z.array(z.object({ label: z.string(), value: z.number() })),
  topContent: z.array(z.object({ id, title: z.string(), value: z.string() })),
});
export type PublishingCenterPage = z.infer<typeof publishingCenterPage>;
