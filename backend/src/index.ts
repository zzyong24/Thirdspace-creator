export { createDb, schema, type Db, type CreateDbOptions } from "./db";
export {
  createProjectRepository,
  type ProjectRepository,
  type RepoDeps,
} from "./repositories/project-repository";
export {
  createPersistenceTransport,
  UnsupportedOperationError,
} from "./persistence-transport";
export { projects, projectActivities, PROJECTS_DDL } from "./schema/projects";
export { users, sessions, IDENTITY_DDL } from "./schema/identity";
export type { RequestContext } from "./request-context";
// Re-export the drizzle query helpers modules need so per-module repositories
// under the Next app (which does not declare drizzle-orm directly) build their
// user-scoped queries against the ONE shared-infra drizzle (foundation §1: the
// db factory + ORM live in @creatoros/backend). Identity's repository is the
// first such in-app module.
export { eq, and, or, asc, desc, sql } from "drizzle-orm";
