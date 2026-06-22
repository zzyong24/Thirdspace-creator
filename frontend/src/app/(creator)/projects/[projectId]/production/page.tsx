/**
 * Production Workspace route (Task 16 / Module 09 Step 5).
 *
 * `/projects/[projectId]/production` renders the project-workspace Header mode
 * page for the Production stage (page-specs §8). The route lives inside the
 * `(creator)` segment so the shared AppShell (one Sidebar + one TopHeader in
 * `project-workspace` mode, with the Production stage active) wraps it.
 *
 * This (async) route is the server boundary where the production is resolved:
 * it maps the project slug → its primary ContentOutput via the REAL
 * `projects.outputs.list` op (user-scoped pglite) and calls the REAL
 * `outputs.production.get` op (get-or-create) to obtain `{ outputId,
 * productionId }`. That wiring descriptor is threaded into the (sync) page →
 * interactive island so its needs-backend / wired-local→backend controls drive
 * their mapped contract ops (mode select, settings toggles, add-segment,
 * export). A resolution failure degrades to no-wiring (the island renders
 * local-only) — the page never throws.
 */

import { client } from "@/lib/contract-client.server";
import { ProductionWorkspacePage } from "@/features/production/production-workspace-page";
import type { ProductionWiring } from "@/features/production/production-interactive-region";

interface ProductionWorkspaceRouteProps {
  readonly params: Promise<{ readonly projectId: string }>;
}

// Slug → canonical project id, resolved against the REAL persisted project list
// (projects.list). Mirrors the selector's resolveProjectIdSlug but sourced from
// the server client instead of the fixture dataset.
async function resolveProjectId(slug: string): Promise<string> {
  if (!slug) return slug;
  try {
    const projects = (await client.listProjects({
      params: undefined,
      query: { page: 1, pageSize: 100 },
      body: undefined,
    })) as unknown as ReadonlyArray<{ id: string }>;
    const ids = projects.map((p) => p.id);
    if (ids.includes(slug)) return slug;
    const candidate = `project-${slug.replace(/-/g, "")}`;
    return ids.includes(candidate) ? candidate : slug;
  } catch {
    return slug;
  }
}

// The project's primary ContentOutput — prefer a `*-main` output, else the first
// output owned by the project — read via the REAL `projects.outputs.list` op.
// Returns null when the project has no output.
async function resolvePrimaryOutputId(projectId: string): Promise<string | null> {
  try {
    const outputs = (await client.listOutputs({
      params: { projectId },
      query: undefined,
      body: undefined,
    })) as unknown as ReadonlyArray<{ id: string }>;
    if (outputs.length === 0) return null;
    const main = outputs.find((o) => o.id.endsWith("-main"));
    return (main ?? outputs[0]!).id;
  } catch {
    return null;
  }
}

async function resolveWiring(slug: string): Promise<ProductionWiring | undefined> {
  const projectId = await resolveProjectId(slug);
  const outputId = await resolvePrimaryOutputId(projectId);
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
