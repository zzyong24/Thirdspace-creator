/**
 * Production Workspace route (Task 16 / Module 09 Step 5).
 *
 * `/projects/[projectId]/production` renders the project-workspace Header mode
 * page for the Production stage (page-specs §8). The route lives inside the
 * `(creator)` segment so the shared AppShell (one Sidebar + one TopHeader in
 * `project-workspace` mode, with the Production stage active) wraps it.
 *
 * This (async) route is the server boundary where the production is resolved:
 * it maps the project slug → its primary ContentOutput (canonical, server-only,
 * deterministic) and calls the REAL `outputs.production.get` op (get-or-create,
 * user-scoped pglite) to obtain `{ outputId, productionId }`. That wiring
 * descriptor is threaded into the (sync) page → interactive island so its
 * needs-backend / wired-local→backend controls drive their mapped contract ops
 * (mode select, settings toggles, add-segment, export). A resolution failure
 * degrades to no-wiring (the island renders local-only) — the page never throws.
 */

import { canonicalDataset } from "@/fixtures/canonical";
import { client } from "@/lib/contract-client.server";
import { ProductionWorkspacePage } from "@/features/production/production-workspace-page";
import type { ProductionWiring } from "@/features/production/production-interactive-region";

interface ProductionWorkspaceRouteProps {
  readonly params: Promise<{ readonly projectId: string }>;
}

// Slug → canonical project id (mirrors the selector's resolveProjectIdSlug).
function resolveProjectId(slug: string): string {
  if (!slug) return slug;
  const ids = canonicalDataset.projects.map((p) => p.id);
  if (ids.includes(slug)) return slug;
  const candidate = `project-${slug.replace(/-/g, "")}`;
  return ids.includes(candidate) ? candidate : slug;
}

// The project's primary ContentOutput — prefer a `*-main` output, else the first
// output owned by the project. Returns null when the project has no output.
function resolvePrimaryOutputId(projectId: string): string | null {
  const outputs = canonicalDataset.contentOutputs.filter(
    (o) => o.projectId === projectId,
  );
  if (outputs.length === 0) return null;
  const main = outputs.find((o) => o.id.endsWith("-main"));
  return (main ?? outputs[0]!).id;
}

async function resolveWiring(slug: string): Promise<ProductionWiring | undefined> {
  const projectId = resolveProjectId(slug);
  const outputId = resolvePrimaryOutputId(projectId);
  if (outputId === null) return undefined;
  try {
    const production = (await client.getOutputProduction({
      params: { outputId },
      query: undefined,
      body: undefined,
    })) as { id: string; contentOutputId: string };
    return { outputId, productionId: production.id };
  } catch {
    // Production unresolved (e.g. unseeded project) — degrade to local-only.
    return undefined;
  }
}

export default async function ProductionWorkspaceRoute({
  params,
}: ProductionWorkspaceRouteProps) {
  const { projectId } = await params;
  const wiring = await resolveWiring(projectId);
  return <ProductionWorkspacePage projectId={projectId} wiring={wiring} />;
}
