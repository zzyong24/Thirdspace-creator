import "server-only";

import { client as defaultClient } from "@/lib/contract-client.server";
import { buildPublishingViewModel } from "@/fixtures/selectors";
import type { PlatformId, PublicationStatus } from "@/types/domain";
import type { PlatformPublishCard, PublishingViewModel } from "@/types/view-models";

/**
 * Publishing Workspace READ-side data assembly ("workspace 读侧做真").
 *
 * Assembles a REAL `PublishingViewModel` for the project Publishing stage from:
 *   - `projects.list`             → resolve the URL slug to a canonical project id,
 *   - `projects.outputs.list`     → the project's ContentOutputs,
 *   - `outputs.publications.list` → each output's REAL publications (a 一稿多平台
 *                                   adapt run creates one node per platform).
 *
 * The REAL publication list drives the `platforms` cards (platform + status +
 * scheduledAt + account label). Everything that has no real read path this wave
 * (form, preview, checklist, tips, tabs) is kept from the fixture VM for the
 * canonical demo projects, and EMPTY / blank for real projects so the
 * BasicInformationForm / preview render their own empty states instead of fake
 * data.
 *
 * Degrades gracefully:
 *   - per-field: a project with no real publications keeps fixture cards for the
 *     canonical demo project, EMPTY for a real project (the panel owns the empty
 *     state),
 *   - wholesale: if the project can't be resolved against the real list, the
 *     whole VM falls back to the fixture builder (which surfaces "未找到项目" only
 *     for ids absent from the canonical dataset). A REAL project must NEVER
 *     render "未找到项目".
 *
 * The contract client is injected so this helper is unit-testable without the
 * real in-process backend.
 */

// Minimal structural DTOs — the contract client returns parsed resources; we
// only read the fields we map, so a narrow shape keeps the helper decoupled.
interface ProjectDto {
  readonly id: string;
  readonly title: string;
}

interface ContentOutputDto {
  readonly id: string;
  readonly projectId: string;
}

interface PublicationDto {
  readonly id: string;
  readonly contentOutputId: string;
  readonly platform: PlatformId;
  readonly accountReference: string;
  readonly status: PublicationStatus;
  readonly currentRevisionId: string;
  readonly scheduledAt: string | null;
}

interface PublicationRevisionDto {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly revisionNumber: number;
}

export interface PublishingDataClient {
  listProjects(input: {
    params: undefined;
    query: { page: number; pageSize: number };
    body: undefined;
  }): Promise<unknown>;
  listOutputs(input: {
    params: { projectId: string };
    query: undefined;
    body: undefined;
  }): Promise<unknown>;
  listPublications(input: {
    params: { outputId: string };
    query: { page: number; pageSize: number };
    body: undefined;
  }): Promise<unknown>;
  listPublicationRevisions(input: {
    params: { publicationId: string };
    query: { page: number; pageSize: number };
    body: undefined;
  }): Promise<unknown>;
}

/**
 * Resolve the URL `[projectId]` segment to a canonical project id against the
 * REAL persisted project list. A slug like `ai-native-browser` collapses to the
 * canonical `project-ainativebrowser` (matched on the kebab-cased title). If no
 * project matches (or the read fails) the original param is returned so the
 * fixture builder can surface the empty state.
 */
async function resolveProjectId(
  param: string,
  client: PublishingDataClient,
): Promise<{ id: string; isReal: boolean }> {
  if (!param) return { id: param, isReal: false };
  try {
    const projects = (await client.listProjects({
      params: undefined,
      query: { page: 1, pageSize: 100 },
      body: undefined,
    })) as ReadonlyArray<ProjectDto>;
    const direct = projects.find((project) => project.id === param);
    if (direct) return { id: direct.id, isReal: true };
    const slug = param.toLowerCase();
    const match = projects.find(
      (project) => slugifyTitle(project.title) === slug,
    );
    if (match) return { id: match.id, isReal: true };
    return { id: param, isReal: false };
  } catch {
    return { id: param, isReal: false };
  }
}

/**
 * Resolve a publication's REAL current-revision { title, description } (the
 * 真标题/文案 stored in publicationRevisions, read via publications.revisions.list).
 * Prefers the row matching `currentRevisionId`, else the newest. Returns `null`
 * when the read yields nothing or throws (caller keeps its placeholder). N+1 over
 * a small publication set — acceptable this wave.
 */
async function resolveRevision(
  client: PublishingDataClient,
  pub: PublicationDto,
): Promise<{ title: string; description: string } | null> {
  try {
    const revisions = (await client.listPublicationRevisions({
      params: { publicationId: pub.id },
      query: { page: 1, pageSize: 20 },
      body: undefined,
    })) as ReadonlyArray<PublicationRevisionDto>;
    if (revisions.length === 0) return null;
    const current =
      revisions.find((r) => r.id === pub.currentRevisionId) ?? revisions[0];
    if (!current) return null;
    return { title: current.title ?? "", description: current.description ?? "" };
  } catch {
    return null;
  }
}

function slugifyTitle(title: string): string {
  const asciiOnly = title.replace(/[^\x20-\x7E]/g, " ");
  return asciiOnly
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Build the REAL Publishing ViewModel, degrading to the fixture VM on failure.
 *
 * @param projectId  the route segment / project id (canonical id or slug).
 * @param client     the contract client (server-bound). Injected for tests.
 */
export async function buildPublishingWorkspaceViewModel(
  projectId: string,
  client: PublishingDataClient = defaultClient as unknown as PublishingDataClient,
): Promise<PublishingViewModel> {
  const { id: resolvedId, isReal } = await resolveProjectId(projectId, client);

  // The fixture VM is the per-field fallback source for everything with no real
  // read path, and the WHOLE fallback when the project can't be resolved.
  const fixtureVm = buildPublishingViewModel(resolvedId);

  // Unknown / unresolved project → preserve old behavior (fixture VM, which
  // renders the "未找到项目" / empty scenario for unknown ids).
  if (!isReal && fixtureVm.scenario === "empty") {
    return fixtureVm;
  }

  // A canonical/demo project keeps the fixture's curated cards/form/tips; a real
  // project shows empty states (no fake data) when it has no real publications.
  const isFixtureProject = fixtureVm.scenario !== "empty";

  let realCards: ReadonlyArray<PlatformPublishCard> = [];
  // The REAL 标题/文案 from the first publication's current revision (read via
  // publications.revisions.list). Null until/unless we resolve one.
  let realForm: { title: string; description: string } | null = null;

  try {
    const outputs = (await client.listOutputs({
      params: { projectId: resolvedId },
      query: undefined,
      body: undefined,
    })) as ReadonlyArray<ContentOutputDto>;

    const publicationLists = await Promise.all(
      outputs.map(async (output) => {
        try {
          return (await client.listPublications({
            params: { outputId: output.id },
            query: { page: 1, pageSize: 50 },
            body: undefined,
          })) as ReadonlyArray<PublicationDto>;
        } catch {
          return [] as ReadonlyArray<PublicationDto>;
        }
      }),
    );

    const publications = publicationLists.flat();

    // One platform card per REAL publication (a 一稿多平台 adapt run creates one
    // publication node per target platform).
    realCards = publications.map((pub) => ({
      id: pub.id,
      platform: pub.platform,
      accountLabel: pub.accountReference,
      status: pub.status,
      scheduledAt: pub.scheduledAt ?? null,
    }));

    // 标题/文案 做真: read the first publication's current-revision title/description
    // (the form previously had no real source — placeholder empty for real
    // projects). One extra read per first publication; try/catch → keep null.
    const firstPub = publications[0];
    if (firstPub) {
      realForm = await resolveRevision(client, firstPub);
    }
  } catch {
    // Outputs read failed — keep cards empty; the fallback below picks fixture
    // cards for the canonical demo project.
    realCards = [];
  }

  // REAL publications win. When there are none: fixture cards for the canonical
  // demo project, EMPTY for a real project (the panel owns the empty state).
  const platforms: ReadonlyArray<PlatformPublishCard> =
    realCards.length > 0
      ? realCards
      : isFixtureProject
        ? fixtureVm.platforms
        : [];

  // Preview platform follows the (now possibly real) first card.
  const preview =
    platforms.length > 0
      ? {
          title: fixtureVm.preview.title,
          description: fixtureVm.preview.description,
          platform: platforms[0]!.platform,
        }
      : fixtureVm.preview;

  // Form: fixture content for demo projects, blank slate for real projects. The
  // 标题/文案 are overridden with the REAL current-revision values when we resolved
  // one (a non-empty real title/description wins over the placeholder/fixture).
  const baseForm = isFixtureProject
    ? fixtureVm.form
    : {
        title: "",
        description: "",
        coverLabel: "无封面",
        tags: [],
        category: "未分类",
        series: "无系列",
      };
  const form = realForm
    ? {
        ...baseForm,
        title: realForm.title.trim() ? realForm.title : baseForm.title,
        description: realForm.description.trim()
          ? realForm.description
          : baseForm.description,
      }
    : baseForm;

  return {
    scenario: "default",
    kind: "publishing",
    projectId: resolvedId,
    // Static page-tab taxonomy — always the fixture's.
    tabs: fixtureVm.tabs,
    form,
    platforms,
    preview,
    // No real source for checklist/tips this wave — fixture for demo projects,
    // empty for real projects.
    checklist: isFixtureProject ? fixtureVm.checklist : [],
    tips: isFixtureProject ? fixtureVm.tips : [],
    loading: false,
    error: null,
  };
}
