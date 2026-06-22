import { eq, and, asc, desc } from "drizzle-orm";
import type { Db } from "../db";
import { artifacts, artifactVersions, artifactRelations } from "../schema/artifacts";

// Injected dependencies — mirrors project/knowledge RepoDeps so the repo stays
// deterministic (no Date.now / Math.random / fetch inside) and user-scoped.
export interface RepoDeps {
  now: () => string; // ISO-8601 clock (injected for deterministic tests)
  nextId: (prefix: string) => string; // id generator (deterministic in tests)
  userId: string; // owner threaded from RequestContext
}

type ArtifactStage =
  | "research"
  | "planning"
  | "script"
  | "production"
  | "publishing"
  | "review";

type ArtifactType =
  | "project_idea"
  | "trend_analysis"
  | "market_analysis"
  | "competitor_analysis"
  | "audience_research"
  | "research_note"
  | "content_contract"
  | "thesis_tree"
  | "evidence_map"
  | "audience_profile"
  | "differentiation"
  | "content_outline"
  | "master_script"
  | "output_script"
  | "golden_quotes"
  | "script_review"
  | "production_plan"
  | "shot_list"
  | "timeline"
  | "subtitle_plan"
  | "export_config"
  | "publish_package"
  | "platform_copy"
  | "cover_brief"
  | "review_report"
  | "comparison_report"
  | "optimization_plan";

type ArtifactStatus = "drafting" | "in_review" | "approved" | "archived";
type CreatedByType = "user" | "ai" | "import";
type ArtifactRelationType =
  | "derived_from"
  | "references"
  | "replaces"
  | "supports"
  | "summarizes";

// Status FSM — adjacent-only transitions (data-model: artifacts move forward
// through review/approval, terminal at archived). Mirrors project-repository's
// STAGE_ORDER adjacency check.
const STATUS_ORDER = ["drafting", "in_review", "approved", "archived"] as const;

type ArtifactRow = typeof artifacts.$inferSelect;
type VersionRow = typeof artifactVersions.$inferSelect;
type RelationRow = typeof artifactRelations.$inferSelect;

export interface ArtifactsRepository {
  seedArtifacts(rows: ArtifactRow[]): Promise<void>;
  list(): Promise<ArtifactRow[]>;
  listByProject(projectId: string): Promise<ArtifactRow[]>;
  get(artifactId: string): Promise<ArtifactRow>;
  create(input: {
    projectId: string;
    stage: ArtifactStage;
    artifactType: ArtifactType;
    title: string;
    contentOutputId?: string | null;
    contentText?: string;
    contentData?: Record<string, unknown>;
    changeSummary?: string;
    createdByType?: CreatedByType;
    aiTaskId?: string | null;
  }): Promise<ArtifactRow>;
  // An edit APPENDS an immutable version and repoints currentVersionId.
  createVersion(
    artifactId: string,
    input: {
      contentText?: string;
      contentData?: Record<string, unknown>;
      changeSummary?: string;
      createdByType?: CreatedByType;
      aiTaskId?: string | null;
    },
  ): Promise<VersionRow>;
  listVersions(artifactId: string): Promise<VersionRow[]>;
  transitionStatus(artifactId: string, status: ArtifactStatus): Promise<ArtifactRow>;
  archive(artifactId: string): Promise<ArtifactRow>;
  patch(
    artifactId: string,
    patch: { title?: string; stage?: ArtifactStage },
  ): Promise<ArtifactRow>;
  createRelation(
    artifactId: string,
    input: { targetArtifactId: string; relationType: ArtifactRelationType },
  ): Promise<RelationRow>;
  // TODO: structured-content ops (thesis_nodes / script_sections / evidence_links
  // / timeline_segments) are deferred — they hang off an artifact_version and
  // belong to per-vertical editors; core artifact + version + relation ops first.
}

export function createArtifactsRepository(db: Db, deps: RepoDeps): ArtifactsRepository {
  // Owner-scoped read: a row owned by another user is invisible → same
  // "not found" surface project/knowledge repositories use for cross-user /
  // missing rows.
  async function get(artifactId: string): Promise<ArtifactRow> {
    const rows = await db
      .select()
      .from(artifacts)
      .where(and(eq(artifacts.id, artifactId), eq(artifacts.userId, deps.userId)));
    const row = rows[0];
    if (!row) {
      throw new Error(`OwnershipError: artifact not found: ${artifactId}`);
    }
    return row;
  }

  return {
    async seedArtifacts(rows) {
      if (rows.length === 0) return;
      await db.insert(artifacts).values(rows).onConflictDoNothing();
    },

    async list() {
      return db
        .select()
        .from(artifacts)
        .where(eq(artifacts.userId, deps.userId))
        .orderBy(asc(artifacts.createdAt));
    },

    async listByProject(projectId) {
      return db
        .select()
        .from(artifacts)
        .where(
          and(eq(artifacts.userId, deps.userId), eq(artifacts.projectId, projectId)),
        )
        .orderBy(asc(artifacts.createdAt));
    },

    get,

    // create mints the artifact AND its first version (#1), then repoints
    // currentVersionId at that version. Append-only invariant starts here.
    async create({
      projectId,
      stage,
      artifactType,
      title,
      contentOutputId,
      contentText,
      contentData,
      changeSummary,
      createdByType,
      aiTaskId,
    }) {
      const ts = deps.now();
      const artifactId = deps.nextId("artifact");
      const versionId = deps.nextId("artifactversion");

      await db.insert(artifactVersions).values({
        id: versionId,
        artifactId,
        versionNumber: 1,
        contentText: contentText ?? "",
        contentData: contentData ?? {},
        changeSummary: changeSummary ?? "",
        createdByType: createdByType ?? "user",
        aiTaskId: aiTaskId ?? null,
        createdAt: ts,
      });

      const inserted = await db
        .insert(artifacts)
        .values({
          id: artifactId,
          userId: deps.userId,
          projectId,
          contentOutputId: contentOutputId ?? null,
          currentVersionId: versionId,
          stage,
          artifactType,
          title,
          status: "drafting",
          archivedAt: null,
          createdAt: ts,
          updatedAt: ts,
        })
        .returning();
      return inserted[0]!;
    },

    // An edit APPENDS a new immutable version with a monotonically increasing
    // number and repoints currentVersionId. It NEVER updates an existing version.
    async createVersion(
      artifactId,
      { contentText, contentData, changeSummary, createdByType, aiTaskId },
    ) {
      await get(artifactId); // ownership + existence gate
      const ts = deps.now();

      const latest = await db
        .select()
        .from(artifactVersions)
        .where(eq(artifactVersions.artifactId, artifactId))
        .orderBy(desc(artifactVersions.versionNumber))
        .limit(1);
      const nextNumber = (latest[0]?.versionNumber ?? 0) + 1;

      const versionId = deps.nextId("artifactversion");
      const inserted = await db
        .insert(artifactVersions)
        .values({
          id: versionId,
          artifactId,
          versionNumber: nextNumber,
          contentText: contentText ?? "",
          contentData: contentData ?? {},
          changeSummary: changeSummary ?? "",
          createdByType: createdByType ?? "user",
          aiTaskId: aiTaskId ?? null,
          createdAt: ts,
        })
        .returning();

      // Repoint the artifact at the freshly appended version; old rows untouched.
      await db
        .update(artifacts)
        .set({ currentVersionId: versionId, updatedAt: ts })
        .where(eq(artifacts.id, artifactId));

      return inserted[0]!;
    },

    async listVersions(artifactId) {
      await get(artifactId); // ownership + existence gate
      return db
        .select()
        .from(artifactVersions)
        .where(eq(artifactVersions.artifactId, artifactId))
        .orderBy(asc(artifactVersions.versionNumber));
    },

    // Status FSM: adjacent-only transitions along STATUS_ORDER (mirrors
    // project-repository.transition's adjacency rule).
    async transitionStatus(artifactId, status) {
      const artifact = await get(artifactId);
      const fromIdx = STATUS_ORDER.indexOf(artifact.status as ArtifactStatus);
      const toIdx = STATUS_ORDER.indexOf(status);
      if (toIdx === -1 || Math.abs(toIdx - fromIdx) !== 1) {
        throw new Error(
          `ConflictError: illegal status transition ${artifact.status} -> ${status}`,
        );
      }
      const ts = deps.now();
      const set: Partial<ArtifactRow> = { status, updatedAt: ts };
      if (status === "archived") set.archivedAt = ts;
      const updated = await db
        .update(artifacts)
        .set(set)
        .where(eq(artifacts.id, artifactId))
        .returning();
      return updated[0]!;
    },

    async archive(artifactId) {
      await get(artifactId);
      const ts = deps.now();
      const updated = await db
        .update(artifacts)
        .set({ status: "archived", archivedAt: ts, updatedAt: ts })
        .where(eq(artifacts.id, artifactId))
        .returning();
      return updated[0]!;
    },

    async patch(artifactId, patch) {
      await get(artifactId);
      const set: Partial<ArtifactRow> = { updatedAt: deps.now() };
      if (patch.title !== undefined) set.title = patch.title;
      if (patch.stage !== undefined) set.stage = patch.stage;
      const updated = await db
        .update(artifacts)
        .set(set)
        .where(eq(artifacts.id, artifactId))
        .returning();
      return updated[0]!;
    },

    async createRelation(artifactId, { targetArtifactId, relationType }) {
      await get(artifactId); // caller must own the source artifact
      const inserted = await db
        .insert(artifactRelations)
        .values({
          id: deps.nextId("artifactrelation"),
          sourceArtifactId: artifactId,
          targetArtifactId,
          relationType,
          createdAt: deps.now(),
        })
        .returning();
      return inserted[0]!;
    },
  };
}
