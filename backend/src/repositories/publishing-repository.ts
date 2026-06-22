import { eq, and, asc, desc } from "drizzle-orm";
import type { Db } from "../db";
import { publications, publicationRevisions } from "../schema/publishing";

// Injected dependencies — mirrors project-/knowledge-repository's RepoDeps so the
// repo stays deterministic (no Date.now / Math.random / fetch inside) and
// user-scoped. `userId` is threaded from RequestContext.
export interface RepoDeps {
  now: () => string; // ISO-8601 clock (injected for deterministic tests)
  nextId: (prefix: string) => string; // id generator (deterministic in tests)
  userId: string; // owner threaded from RequestContext
}

type PublicationRow = typeof publications.$inferSelect;
type RevisionRow = typeof publicationRevisions.$inferSelect;
type PublicationStatus = "draft" | "scheduled" | "published" | "removed" | "failed";

// Publication.status FSM (contract publicationStatus + data-model §12). The state
// machine is enforced in the repository/service, NOT the schema. Transitions are
// adjacent-only: a publish goes draft → scheduled → published, either of the
// pre-publish states may → failed, and a published row may → removed. No skips,
// no resurrecting a terminal state.
const ALLOWED_TRANSITIONS: Record<PublicationStatus, readonly PublicationStatus[]> = {
  draft: ["scheduled", "published", "failed"],
  scheduled: ["published", "failed"],
  published: ["removed"],
  removed: [],
  failed: ["draft"],
};

export interface PublishingRepository {
  seedPublications(rows: PublicationRow[]): Promise<void>;
  // listPublications: outputs.publications.list (per ContentOutput, user-scoped).
  list(contentOutputId: string): Promise<PublicationRow[]>;
  // getPublication: publications.get.
  get(publicationId: string): Promise<PublicationRow>;
  // createPublication: outputs.publications.create.
  create(input: {
    contentOutputId: string;
    platform: string;
    accountReference: string;
  }): Promise<PublicationRow>;
  // createPublicationRevision: publications.revisions.create (append-only).
  createRevision(
    publicationId: string,
    input: { title: string; description?: string },
  ): Promise<RevisionRow>;
  listRevisions(publicationId: string): Promise<RevisionRow[]>;
  // transitionPublication: publications.transition (adjacent-only FSM).
  transition(
    publicationId: string,
    status: PublicationStatus,
  ): Promise<PublicationRow>;
}

export function createPublishingRepository(
  db: Db,
  deps: RepoDeps,
): PublishingRepository {
  // Owner-scoped read: a row owned by another user is invisible → same
  // "not found" surface project-/knowledge-repository use for cross-user /
  // missing rows.
  async function get(publicationId: string): Promise<PublicationRow> {
    const rows = await db
      .select()
      .from(publications)
      .where(
        and(
          eq(publications.id, publicationId),
          eq(publications.userId, deps.userId),
        ),
      );
    const row = rows[0];
    if (!row) {
      throw new Error(`OwnershipError: publication not found: ${publicationId}`);
    }
    return row;
  }

  return {
    async seedPublications(rows) {
      if (rows.length === 0) return;
      await db.insert(publications).values(rows).onConflictDoNothing();
    },

    async list(contentOutputId) {
      return db
        .select()
        .from(publications)
        .where(
          and(
            eq(publications.userId, deps.userId),
            eq(publications.contentOutputId, contentOutputId),
          ),
        )
        .orderBy(asc(publications.createdAt));
    },

    get,

    // create mints the publication AND its first revision (#1), then repoints
    // currentRevisionId at that revision. The (platform, external_id) partial
    // unique index is the idempotency anchor — external_id stays null until the
    // row is actually published, so onConflictDoNothing is a no-op here but keeps
    // a duplicate-key re-seed/re-publish safe (data-model rule 10).
    async create({ contentOutputId, platform, accountReference }) {
      const ts = deps.now();
      const publicationId = deps.nextId("publication");
      const revisionId = deps.nextId("revision");

      await db.insert(publicationRevisions).values({
        id: revisionId,
        userId: deps.userId,
        publicationId,
        revisionNumber: 1,
        title: "",
        description: "",
        coverAssetId: null,
        category: "",
        series: "",
        platformTags: [],
        platformSettings: {},
        createdAt: ts,
      });

      const inserted = await db
        .insert(publications)
        .values({
          id: publicationId,
          userId: deps.userId,
          contentOutputId,
          platform,
          accountReference,
          status: "draft",
          currentRevisionId: revisionId,
          externalId: null,
          externalUrl: null,
          scheduledAt: null,
          publishedAt: null,
          removedAt: null,
          createdAt: ts,
          updatedAt: ts,
        })
        .onConflictDoNothing()
        .returning();
      return inserted[0]!;
    },

    // An edit APPENDS a new revision with a monotonically increasing number and
    // repoints currentRevisionId. It NEVER updates an existing revision row
    // (PublicationRevision is immutable — contract extends BaseEntity only).
    async createRevision(publicationId, { title, description }) {
      await get(publicationId); // ownership + existence gate
      const ts = deps.now();

      const latest = await db
        .select()
        .from(publicationRevisions)
        .where(eq(publicationRevisions.publicationId, publicationId))
        .orderBy(desc(publicationRevisions.revisionNumber))
        .limit(1);
      const nextNumber = (latest[0]?.revisionNumber ?? 0) + 1;

      const revisionId = deps.nextId("revision");
      const inserted = await db
        .insert(publicationRevisions)
        .values({
          id: revisionId,
          userId: deps.userId,
          publicationId,
          revisionNumber: nextNumber,
          title,
          description: description ?? "",
          coverAssetId: null,
          category: "",
          series: "",
          platformTags: [],
          platformSettings: {},
          createdAt: ts,
        })
        .returning();

      // Repoint the publication at the freshly appended revision; old rows
      // untouched.
      await db
        .update(publications)
        .set({ currentRevisionId: revisionId, updatedAt: ts })
        .where(eq(publications.id, publicationId));

      return inserted[0]!;
    },

    async listRevisions(publicationId) {
      await get(publicationId); // ownership + existence gate
      return db
        .select()
        .from(publicationRevisions)
        .where(eq(publicationRevisions.publicationId, publicationId))
        .orderBy(asc(publicationRevisions.revisionNumber));
    },

    // Adjacent-only status FSM. Mirrors project-repository.transition's surface:
    // ownership gate first, then a ConflictError on an illegal hop. Side-effect
    // timestamps (scheduledAt/publishedAt/removedAt) are stamped from the
    // injected clock as the row enters the matching state.
    async transition(publicationId, status) {
      const publication = await get(publicationId);
      const from = publication.status as PublicationStatus;
      const allowed = ALLOWED_TRANSITIONS[from] ?? [];
      if (!allowed.includes(status)) {
        throw new Error(
          `ConflictError: illegal status transition ${from} -> ${status}`,
        );
      }
      const ts = deps.now();
      const set: Partial<PublicationRow> = { status, updatedAt: ts };
      if (status === "scheduled") set.scheduledAt = ts;
      if (status === "published") set.publishedAt = ts;
      if (status === "removed") set.removedAt = ts;
      const updated = await db
        .update(publications)
        .set(set)
        .where(eq(publications.id, publicationId))
        .returning();
      return updated[0]!;
    },
  };
}
