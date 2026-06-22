import { eq, asc } from "drizzle-orm";
import type { Db } from "../db";
import { projects, projectActivities } from "../schema/projects";

const STAGE_ORDER = [
  "research",
  "planning",
  "script",
  "production",
  "publishing",
  "review",
] as const;
type StageName = (typeof STAGE_ORDER)[number];

export interface RepoDeps {
  now: () => string; // ISO-8601 clock (injected for deterministic tests)
  nextId: (prefix: string) => string; // id generator (deterministic in tests)
  userId: string; // owner for created rows
}

type ProjectRow = typeof projects.$inferSelect;
type ActivityRow = typeof projectActivities.$inferSelect;

export interface ProjectRepository {
  seedProjects(rows: ProjectRow[]): Promise<void>;
  list(): Promise<ProjectRow[]>;
  get(projectId: string): Promise<ProjectRow>;
  create(input: { title: string; brief?: string }): Promise<ProjectRow>;
  transition(projectId: string, stage: StageName): Promise<ProjectRow>;
  archive(projectId: string): Promise<ProjectRow>;
  patch(
    projectId: string,
    patch: { title?: string; brief?: string; starred?: boolean },
  ): Promise<ProjectRow>;
  listActivity(projectId: string): Promise<ActivityRow[]>;
}

export function createProjectRepository(db: Db, deps: RepoDeps): ProjectRepository {
  async function get(projectId: string): Promise<ProjectRow> {
    const rows = await db.select().from(projects).where(eq(projects.id, projectId));
    const row = rows[0];
    if (!row) throw new Error(`OwnershipError: project not found: ${projectId}`);
    return row;
  }

  return {
    async seedProjects(rows) {
      if (rows.length === 0) return;
      await db.insert(projects).values(rows).onConflictDoNothing();
    },

    async list() {
      return db.select().from(projects).orderBy(asc(projects.createdAt));
    },

    get,

    async create({ title, brief }) {
      const ts = deps.now();
      const inserted = await db
        .insert(projects)
        .values({
          id: deps.nextId("project"),
          userId: deps.userId,
          title,
          brief: brief ?? "",
          contentCategory: "",
          creationMode: "guided",
          status: "active",
          currentStage: "research",
          progressPct: 0,
          starred: false,
          startedAt: ts,
          targetCompletedAt: null,
          completedAt: null,
          archivedAt: null,
          createdAt: ts,
          updatedAt: ts,
        })
        .returning();
      return inserted[0]!;
    },

    async transition(projectId, stage) {
      const project = await get(projectId);
      const fromIdx = STAGE_ORDER.indexOf(project.currentStage as StageName);
      const toIdx = STAGE_ORDER.indexOf(stage);
      if (toIdx === -1 || Math.abs(toIdx - fromIdx) !== 1) {
        throw new Error(
          `ConflictError: illegal stage transition ${project.currentStage} -> ${stage}`,
        );
      }
      const ts = deps.now();
      const updated = await db
        .update(projects)
        .set({ currentStage: stage, updatedAt: ts })
        .where(eq(projects.id, projectId))
        .returning();
      await db.insert(projectActivities).values({
        id: deps.nextId("activity"),
        projectId,
        eventType: "stage_transition",
        entityType: "project",
        entityId: projectId,
        eventData: { fromStage: project.currentStage, toStage: stage },
        occurredAt: ts,
      });
      return updated[0]!;
    },

    async archive(projectId) {
      await get(projectId);
      const ts = deps.now();
      const updated = await db
        .update(projects)
        .set({ status: "archived", archivedAt: ts, updatedAt: ts })
        .where(eq(projects.id, projectId))
        .returning();
      return updated[0]!;
    },

    async patch(projectId, patch) {
      await get(projectId);
      const set: Partial<ProjectRow> = { updatedAt: deps.now() };
      if (patch.title !== undefined) set.title = patch.title;
      if (patch.brief !== undefined) set.brief = patch.brief;
      if (patch.starred !== undefined) set.starred = patch.starred;
      const updated = await db
        .update(projects)
        .set(set)
        .where(eq(projects.id, projectId))
        .returning();
      return updated[0]!;
    },

    async listActivity(projectId) {
      return db
        .select()
        .from(projectActivities)
        .where(eq(projectActivities.projectId, projectId))
        .orderBy(asc(projectActivities.occurredAt));
    },
  };
}
