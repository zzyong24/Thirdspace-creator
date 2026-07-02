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
 *
 * READ side made real: the route ALSO assembles a REAL ProductionViewModel from
 * `outputs.production.get` (mode) + `materialLinks.list`→`assets.get` (matched
 * 已配素材), passing it as a `viewModel` override so AI-matched assets and the
 * persisted production mode surface on the page. See
 * `production-workspace-data.ts` for the assembly + per-field degradation
 * contract. A real project NEVER renders "未找到项目".
 */

import { createServerClient } from "@/lib/contract-client.server";
import { resolveSession } from "@/lib/session.server";
import { ProductionWorkspacePage } from "@/features/production/production-workspace-page";
import { StartProductionIsland } from "@/features/production/start-production-island";
import {
  buildProductionWorkspaceViewModel,
  countAssetLibrary,
  type ProductionDataClient,
} from "@/features/production/production-workspace-data";
import type {
  ProductionWiring,
  ProductionMultimodalConfig,
} from "@/features/production/production-interactive-region";

interface ProductionWorkspaceRouteProps {
  readonly params: Promise<{ readonly projectId: string }>;
}

// Slug → canonical project id, resolved against the REAL persisted project list
// (projects.list). Mirrors the selector's resolveProjectIdSlug but sourced from
// the (user-scoped) server client instead of the fixture dataset.
async function resolveProjectId(
  client: ProductionDataClient,
  slug: string,
): Promise<string> {
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
// Returns null when the project has no output. Carries `aspectRatio` (the
// contentOutputResource field) so the recording page's AI-generate region can
// default its画幅 to the project's横竖屏 (`[gate-F3]` 竖屏优先).
async function resolvePrimaryOutput(
  client: ProductionDataClient,
  projectId: string,
): Promise<{ id: string; aspectRatio?: string } | null> {
  try {
    const outputs = (await client.listOutputs({
      params: { projectId },
      query: undefined,
      body: undefined,
    })) as unknown as ReadonlyArray<{ id: string; aspectRatio?: string }>;
    if (outputs.length === 0) return null;
    const main = outputs.find((o) => o.id.endsWith("-main"));
    const output = main ?? outputs[0]!;
    return { id: output.id, aspectRatio: output.aspectRatio };
  } catch {
    return null;
  }
}

async function resolveWiring(
  client: ProductionDataClient,
  slug: string,
): Promise<{ wiring: ProductionWiring; outputAspectRatio?: string } | undefined> {
  const projectId = await resolveProjectId(client, slug);
  const output = await resolvePrimaryOutput(client, projectId);
  if (output === null) return undefined;
  try {
    const production = (await client.getOutputProduction({
      params: { outputId: output.id },
      query: undefined,
      body: undefined,
    })) as { id: string; contentOutputId: string };
    return {
      wiring: { outputId: output.id, productionId: production.id },
      outputAspectRatio: output.aspectRatio,
    };
  } catch {
    // Production unresolved (e.g. unseeded project) — degrade to local-only.
    return undefined;
  }
}

// 多模态模型是否已配 —— 读 REAL `settings.models.list`(与设置页同一 op),按 capability
// 找 image.generate / video.generate 行,`hasSecret` 判是否已配 key。任何读失败 → 视为未配
// (诚实禁用,AI 生成区引导去设置),绝不假装能生成。返回 undefined 让页面按未配渲染。
async function resolveMultimodalConfig(
  ctx: Parameters<typeof createServerClient>[0],
): Promise<ProductionMultimodalConfig | undefined> {
  try {
    const models = await createServerClient(ctx).listModels({
      params: undefined,
      query: undefined,
      body: undefined,
    });
    const has = (capability: string): boolean =>
      models.some((m) => m.capability === capability && m.hasSecret);
    return {
      imageConfigured: has("image.generate"),
      videoConfigured: has("video.generate"),
    };
  } catch {
    return undefined;
  }
}

export default async function ProductionWorkspaceRoute({
  params,
}: ProductionWorkspaceRouteProps) {
  const { projectId } = await params;
  // Session → ctx (layout already guarded). No session → fixture-deriving page.
  const session = await resolveSession();
  if (!session) {
    return <ProductionWorkspacePage projectId={projectId} />;
  }
  // User-scoped reads: an empty account reads empty, not the canonical seed.
  const client = createServerClient(
    session.ctx,
  ) as unknown as ProductionDataClient;
  const [wiringResult, viewModel, assetLibraryTotal, multimodalConfig] =
    await Promise.all([
      resolveWiring(client, projectId),
      buildProductionWorkspaceViewModel(projectId, client),
      countAssetLibrary(client),
      resolveMultimodalConfig(session.ctx),
    ]);
  // [T-053 断点②] 没有产出(wiring 解析不出)→ 传「开始制作」CTA:用户点击建
  // ContentOutput(write-on-intent),refresh 后 production getOrCreate 就位。
  const startProductionSlot =
    wiringResult === undefined ? (
      <StartProductionIsland
        projectId={projectId}
        projectTitle={await resolveProjectTitle(client, projectId)}
      />
    ) : undefined;
  return (
    <ProductionWorkspacePage
      projectId={projectId}
      viewModel={viewModel}
      wiring={wiringResult?.wiring}
      assetLibraryTotal={assetLibraryTotal}
      outputAspectRatio={wiringResult?.outputAspectRatio}
      multimodalConfig={multimodalConfig}
      startProductionSlot={startProductionSlot}
    />
  );
}

// [T-053 断点②] 「开始制作」建产出时用项目标题当产出题(一稿一产出的主内容)。
// 读失败退中性题,不挡创建。
async function resolveProjectTitle(
  client: ProductionDataClient,
  projectId: string,
): Promise<string> {
  try {
    const project = (await client.getProject({
      params: { projectId },
      query: undefined,
      body: undefined,
    })) as { title?: string };
    return project.title?.trim() || "主内容";
  } catch {
    return "主内容";
  }
}
