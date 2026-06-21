# Module 04 — Taxonomy (Tags) — Executable TDD Plan (Wave 1)

> **Per-module plan under the keystone foundation.** Follows `docs/superpowers/plans/2026-06-21-program-foundation.md` §5 template (db-schema → repository → service → transport → FE wiring → tests → acceptance) and §1 architecture (modules under `frontend/src/server/modules/<module>/`; user-scoped repositories; module transport registry; `globalThis` pglite singleton). Steps use `- [ ]`. Execute in order; each ends GREEN under `pnpm verify` + this module's own tests.

## Goal

Stand up the **Taxonomy** module: user-defined `Tag`s and the polymorphic `EntityTag` join that classifies Projects / Knowledge / Assets / Artifacts / Learnings / Publications across pages. Deliver user-scoped tag CRUD + `assignTags`/`removeTag` + `listTagsForEntity` + `listEntitiesForTag`, register the ops in the module transport registry, and turn the currently-**decorative** tag chips (Research, Knowledge) into real, navigational, server-backed affordances.

Taxonomy is **reusable** (tags live independent of any one project, like Knowledge/Asset/Learning per SPEC §22) and **follows Identity** (every row is `user_id`-scoped; ownership errors surface as 404 per SPEC §14/§20). It has **no state machine** (foundation roadmap §5: "No machine for … Taxonomy") — it is append/detach CRUD only.

## Architecture

- **Layout** (foundation §1, MODULE-ARCH §2), under the Next app:
  ```
  frontend/src/server/modules/taxonomy/
  ├── taxonomy.db-schema.ts                 # Drizzle pgTable: tags, entity_tags (user_id on both)
  ├── taxonomy.repository.ts                 # user-scoped queries ONLY (eq(table.userId, ctx.userId))
  ├── taxonomy.service.ts                    # RequestContext methods; no state machine; UoW for assign
  ├── taxonomy.schema.ts                     # re-export contract Zod DTOs for this module
  ├── taxonomy.transport.ts                  # { opId → (ctx,input)=>envelope }; UnsupportedOperationError otherwise
  ├── taxonomy.errors.ts                     # TagNotFoundError, DuplicateTagError, InvalidEntityRefError
  ├── index.ts                               # ONLY public entry (service interface + transport map)
  ├── taxonomy.service.test.ts
  ├── taxonomy.repository.integration.test.ts
  └── taxonomy.contract.test.ts
  ```
  No cross-module repository imports (SPEC §22). The polymorphic `EntityTag` stores `(entityType, entityId)` as a **soft reference**; Taxonomy does NOT join into Projects/Knowledge/etc. tables (SPEC §8). Existence checks for the referenced entity are the caller's concern (or a later cross-module guard via that module's public `assertOwns`); Taxonomy only validates that `entityType` is one of the 6 known kinds and that the tag is owned.

- **Ownership**: every repository query filters `WHERE user_id = ctx.userId`; every insert stamps `ctx.userId`. `EntityTag` carries its own `user_id` (denormalized from the owning `Tag`) so the join table is independently user-scoped and never needs a cross-table read to enforce ownership. Cross-user access → `OwnershipError` → 404.

- **Transport registry**: the module exports `taxonomyHandlers: Record<string, Handler>` (op id → handler), merged into the composite `HANDLERS` map in `frontend/src/server/mock-backend/mock-transport.ts` exactly as `projectsHandlers` is today. Adding the module = register it; no edits to unrelated handlers.

- **Contract gap (must close in Step 0)**: `@creatoros/contract` currently has **no taxonomy operations** — tags exist only as embedded `z.array(z.string())` in `resources/publishing.ts` (`platformTags`) and `pages/global-search.ts` (`tags`). SPEC §13 "知识与素材" lists no tag endpoints. This plan therefore **adds a `taxonomyOperations` group** to the contract (greenfield, modeled on the knowledge/assets ops), registers it in `ENDPOINTS`, and updates the §13 registry test — see Step 0. All op ids below are the ones this plan introduces and owns; they do not yet exist in the repo.

## Tech Stack

TypeScript strict · Drizzle ORM over pglite (`globalThis` singleton, foundation §1) · Zod DTOs from `@creatoros/contract` · Vitest (service unit + pglite-backed repository integration + contract conformance). Frontend islands are React client components calling the typed contract client (`@/lib/contract-client.server` / `@/server/mock-backend/in-process-client`) + `router.refresh()`.

## Dependency note

**Blocked on:** Wave 0 (foundation §2 Identity/auth → `RequestContext.userId`; §1 registry generalization + pglite singleton) must be green first. Within Wave 1, Taxonomy **follows Identity** (roadmap §3). It has no other module dependency for its own CRUD; its FE consumers (Knowledge page, Research workspace) and the Search-backed "相关标签" navigation are wired in their own module plans (06-knowledge, 02-search) once those land — this plan delivers the tag affordances that those pages already render.

---

## Contract op ids this module owns (introduced in Step 0)

Grepped baseline: **none exist today** (`grep -rin "tag\|taxonom" contract/src` → only `platformTags`/`tags` array fields, no operations). This plan adds:

| Op id | Method · Path | Purpose |
|---|---|---|
| `taxonomy.tags.list` | `GET /tags` | List the user's tags (paginated) |
| `taxonomy.tags.create` | `POST /tags` | Create a tag (`name`, `color`) |
| `taxonomy.tags.patch` | `PATCH /tags/:tagId` | Rename / recolor a tag |
| `taxonomy.tags.delete` | `POST /tags/:tagId/delete` | Delete a tag + cascade its EntityTags |
| `taxonomy.entityTags.assign` | `POST /tags/assignments` | Assign N tags to one `(entityType, entityId)` |
| `taxonomy.entityTags.remove` | `POST /tags/assignments/remove` | Detach one tag from one entity |
| `taxonomy.entityTags.listForEntity` | `GET /tags/for-entity` | Tags assigned to a given entity |
| `taxonomy.entityTags.listEntitiesForTag` | `GET /tags/:tagId/entities` | EntityTag rows for a given tag (drives "相关标签" navigation) |

> `POST …/delete` and `POST …/remove` (not HTTP `DELETE`) match the contract's existing convention (`projects.archive` = `POST /projects/:id/archive`; the contract registry has no `DELETE` verb). The registry test in `contract/tests/registry.test.ts` must be updated to expect these 8 ids under a new "知识与素材 / taxonomy" sub-group.

---

## Step 0 — Close the contract gap (taxonomy operations + resources)

- [ ] **0a. Resource DTOs.** Create `contract/src/resources/taxonomy.ts` mirroring the knowledge resource style (`iso8601`, `id` from primitives). Fields come from data-model §5 (`TAG`, `ENTITY_TAG`) + `frontend/src/types/domain.ts:406-425`:
  ```ts
  import { z } from "zod";
  import { id, iso8601 } from "../primitives";

  // TagEntityType — mirror frontend/src/types/domain.ts:413-419 exactly.
  export const tagEntityType = z.enum([
    "project", "artifact", "knowledge", "asset", "learning", "publication",
  ]);
  export type TagEntityType = z.infer<typeof tagEntityType>;

  // Tag extends BaseEntity; has its own createdAt (no updatedAt in data-model).
  export const tagResource = z.object({
    id,
    userId: id,
    name: z.string(),
    color: z.string(),
    createdAt: iso8601,
  });
  export type TagResource = z.infer<typeof tagResource>;

  // EntityTag extends BaseEntity; user_id denormalized for independent scoping.
  export const entityTagResource = z.object({
    id,
    userId: id,
    tagId: id,
    entityType: tagEntityType,
    entityId: id,
  });
  export type EntityTagResource = z.infer<typeof entityTagResource>;
  ```
- [ ] **0b. Operations.** Create `contract/src/operations/taxonomy.ts` modeled on `operations/knowledge.ts`:
  ```ts
  import { z } from "zod";
  import { defineEndpoint } from "../endpoints";
  import { id, paginationQuery } from "../primitives";
  import { tagResource, entityTagResource, tagEntityType } from "../resources/taxonomy";

  const tagParams = z.object({ tagId: id });
  const entityRef = z.object({ entityType: tagEntityType, entityId: id });

  // SPEC §13 "知识与素材" group — Taxonomy sub-group (added by module-04 plan).
  export const taxonomyOperations = {
    listTags: defineEndpoint({
      id: "taxonomy.tags.list", method: "GET", path: "/tags",
      query: paginationQuery, response: tagResource, isList: true,
      fr: ["FR-TAXONOMY-TAG-LIST"],
    }),
    createTag: defineEndpoint({
      id: "taxonomy.tags.create", method: "POST", path: "/tags",
      body: z.object({ name: z.string().min(1).max(64), color: z.string().min(1).default("#888888") }),
      response: tagResource, fr: ["FR-TAXONOMY-TAG-CREATE"],
    }),
    patchTag: defineEndpoint({
      id: "taxonomy.tags.patch", method: "PATCH", path: "/tags/:tagId",
      params: tagParams,
      body: z.object({ name: z.string().min(1).max(64).optional(), color: z.string().min(1).optional() }),
      response: tagResource, fr: ["FR-TAXONOMY-TAG-UPDATE"],
    }),
    deleteTag: defineEndpoint({
      id: "taxonomy.tags.delete", method: "POST", path: "/tags/:tagId/delete",
      params: tagParams, response: tagResource, fr: ["FR-TAXONOMY-TAG-DELETE"],
    }),
    assignTags: defineEndpoint({
      id: "taxonomy.entityTags.assign", method: "POST", path: "/tags/assignments",
      body: entityRef.extend({ tagIds: z.array(id).min(1).max(50) }),
      response: entityTagResource, isList: true, fr: ["FR-TAXONOMY-ASSIGN"],
    }),
    removeAssignment: defineEndpoint({
      id: "taxonomy.entityTags.remove", method: "POST", path: "/tags/assignments/remove",
      body: entityRef.extend({ tagId: id }),
      response: entityTagResource, fr: ["FR-TAXONOMY-REMOVE"],
    }),
    listTagsForEntity: defineEndpoint({
      id: "taxonomy.entityTags.listForEntity", method: "GET", path: "/tags/for-entity",
      query: entityRef, response: tagResource, isList: true,
      fr: ["FR-TAXONOMY-LIST-FOR-ENTITY"],
    }),
    listEntitiesForTag: defineEndpoint({
      id: "taxonomy.entityTags.listEntitiesForTag", method: "GET", path: "/tags/:tagId/entities",
      params: tagParams, query: paginationQuery, response: entityTagResource, isList: true,
      fr: ["FR-TAXONOMY-LIST-ENTITIES-FOR-TAG"],
    }),
  } as const;
  ```
- [ ] **0c. Register.** In `contract/src/endpoints.ts` add `import { taxonomyOperations } from "./operations/taxonomy";` and spread `...taxonomyOperations,` into `ENDPOINTS` (alongside `...knowledgeOperations`). Export the resource from `contract/src/index.ts` if resources are re-exported there.
- [ ] **0d. Registry test.** Update `contract/tests/registry.test.ts` (the test that "asserts this matches §13 exactly") to expect the 8 new ids. Since §13 has no literal tag endpoints, add a documented exception block noting "Taxonomy ops are a contract addition by module-04; SPEC §13 omits them but data-model §5 defines `Tag`/`EntityTag` as first-class user-owned entities." *(test: `ENDPOINTS` contains exactly the 8 ids; client typing compiles.)*

---

## Step 1 — db-schema (`taxonomy.db-schema.ts`)

- [ ] Define two Drizzle `pgTable`s; `user_id` on **both** owned rows (foundation §5.1). Add their DDL to the shared pglite init alongside the existing module tables.
  ```ts
  import { pgTable, uuid, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";

  export const tags = pgTable("tags", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    name: text("name").notNull(),
    color: text("color").notNull().default("#888888"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  }, (t) => ({
    // tag names unique per user (case-sensitive); enables DuplicateTagError via DB constraint.
    uqUserName: uniqueIndex("tags_user_name_uq").on(t.userId, t.name),
  }));

  export const entityTags = pgTable("entity_tags", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),       // denormalized from owning tag → independent scoping
    tagId: uuid("tag_id").notNull(),
    entityType: text("entity_type").notNull(), // one of TagEntityType
    entityId: uuid("entity_id").notNull(),
  }, (t) => ({
    // one assignment per (tag, entity); re-assign is idempotent (SPEC §8 unique-constraint idempotency).
    uqAssignment: uniqueIndex("entity_tags_tag_entity_uq").on(t.tagId, t.entityType, t.entityId),
    ixEntity: index("entity_tags_entity_ix").on(t.userId, t.entityType, t.entityId),
    ixTag: index("entity_tags_tag_ix").on(t.userId, t.tagId),
  }));
  ```
- [ ] *(test — in the repository integration file, Step 6b: tables round-trip a tag + an entity_tag; the `tags_user_name_uq` and `entity_tags_tag_entity_uq` constraints reject duplicates.)*

---

## Step 2 — repository (`taxonomy.repository.ts`) — user-scoped queries ONLY

- [ ] Every method takes `ctx: RequestContext` and filters/stamps `ctx.userId`. **Never** unscoped. Use `and(eq(tags.userId, ctx.userId), …)`.
  - `insertTag(ctx, { name, color }) → TagRow` — insert with `userId: ctx.userId`; relies on the unique index for duplicate detection (catch → rethrow as `DuplicateTagError` in the service).
  - `listTags(ctx, { limit, offset }) → TagRow[]` — `where eq(tags.userId, ctx.userId)`, `orderBy(tags.createdAt)`.
  - `findTag(ctx, tagId) → TagRow | undefined` — `where and(eq(tags.id, tagId), eq(tags.userId, ctx.userId))`.
  - `updateTag(ctx, tagId, patch) → TagRow | undefined` — `update … set(patch) where and(eq(tags.id, tagId), eq(tags.userId, ctx.userId)) returning`.
  - `deleteTag(ctx, tagId) → TagRow | undefined` — delete the tag scoped to user; **caller (service) deletes its entity_tags first in the same UoW** (see Step 3).
  - `insertEntityTag(ctx, { tagId, entityType, entityId }) → EntityTagRow` — stamp `userId: ctx.userId`; `onConflictDoNothing` against `entity_tags_tag_entity_uq` then re-select (idempotent assign).
  - `deleteEntityTag(ctx, { tagId, entityType, entityId }) → EntityTagRow | undefined` — scoped delete `returning`.
  - `deleteEntityTagsForTag(ctx, tagId)` — scoped delete of all `entity_tags` for a tag (cascade on tag delete).
  - `listTagsForEntity(ctx, { entityType, entityId }) → TagRow[]` — select tags by `tag_id IN (select tag_id from entity_tags where userId=ctx.userId and entityType and entityId)`; **two scoped queries, no cross-module join** (entity_tags is this module's own table).
  - `listEntityTagsForTag(ctx, tagId, { limit, offset }) → EntityTagRow[]` — `where and(eq(entityTags.userId, ctx.userId), eq(entityTags.tagId, tagId))`.
- [ ] Map DB rows → resource DTO shape (`createdAt` → ISO string) in the repository; do **not** leak Drizzle row types past the service (SPEC §9).
- [ ] *(integration test, Step 6b: ownership enforced — user A's `listTags`/`findTag` never returns user B's rows; `findTag(ctxB, tagA.id) === undefined`.)*

---

## Step 3 — service (`taxonomy.service.ts`) — RequestContext methods (no state machine)

- [ ] All public methods take `ctx: RequestContext` first. Taxonomy has **no §12 state machine**; the service enforces ownership, validation invariants, and the **cross-table cascade** under one Unit-of-Work.
  - `createTag(ctx, { name, color })` — trim/validate `name` non-empty; call `repo.insertTag`; on unique-violation throw `DuplicateTagError` (→ `ConflictError`/409). Returns `TagResource`.
  - `listTags(ctx, query)` — passthrough to `repo.listTags`.
  - `renameTag(ctx, tagId, patch)` — `repo.findTag` → if absent throw `TagNotFoundError` (→ 404); `repo.updateTag`; duplicate name → `DuplicateTagError`.
  - `deleteTag(ctx, tagId)` — `repo.findTag` or `TagNotFoundError`; in a UoW: `repo.deleteEntityTagsForTag(ctx, tagId)` then `repo.deleteTag(ctx, tagId)` (cascade; entity_tags has no FK so the service owns the cascade). Returns the deleted `TagResource`.
  - `assignTags(ctx, { entityType, entityId, tagIds })` — validate `entityType` ∈ the 6 kinds (else `InvalidEntityRefError` → 400); for each tagId verify `repo.findTag` ownership (unknown/foreign → `TagNotFoundError`); in a UoW `repo.insertEntityTag` each (idempotent). Returns the resulting `EntityTagResource[]`.
  - `removeTag(ctx, { entityType, entityId, tagId })` — `repo.deleteEntityTag`; absent assignment → return is empty/no-op (idempotent remove; do **not** 404 on already-absent, to keep detach idempotent).
  - `listTagsForEntity(ctx, { entityType, entityId })` — `repo.listTagsForEntity`.
  - `listEntitiesForTag(ctx, tagId, query)` — `repo.findTag` ownership gate then `repo.listEntityTagsForTag`.
- [ ] **Reusability invariant** (SPEC §22 — "Tag … 可脱离 Project 存在并被复用"): tags are never project-scoped; `assignTags` accepts any of the 6 `entityType`s and the same tag may be assigned to entities across different projects/modules. Add an explicit service test asserting one tag assigned to both a `project` and a `knowledge` entity.
- [ ] *(service test, Step 6a: `createTag` duplicate → ConflictError; `assignTags` with bad entityType → ValidationError; `assignTags` of a foreign tagId → 404; `deleteTag` removes both the tag and its entity_tags; cross-user `renameTag` → 404; idempotent re-assign yields one row; reusability test above.)*

---

## Step 4 — transport (`taxonomy.transport.ts`) — register ops

- [ ] Export `taxonomyHandlers: Record<string, Handler>` keyed by the **exact** op ids from Step 0, each `(ctx, input) => envelope` delegating to the service. Throw `UnsupportedOperationError` for anything else. Pattern mirrors `frontend/src/server/mock-backend/handlers/projects.ts`:
  ```ts
  export const taxonomyHandlers: Record<string, Handler> = {
    "taxonomy.tags.list":                 ({ ctx, query }) => service.listTags(ctx, query),
    "taxonomy.tags.create":               ({ ctx, body })  => service.createTag(ctx, body),
    "taxonomy.tags.patch":                ({ ctx, params, body }) => service.renameTag(ctx, params.tagId, body),
    "taxonomy.tags.delete":               ({ ctx, params }) => service.deleteTag(ctx, params.tagId),
    "taxonomy.entityTags.assign":         ({ ctx, body })  => service.assignTags(ctx, body),
    "taxonomy.entityTags.remove":         ({ ctx, body })  => service.removeTag(ctx, body),
    "taxonomy.entityTags.listForEntity":  ({ ctx, query }) => service.listTagsForEntity(ctx, query),
    "taxonomy.entityTags.listEntitiesForTag": ({ ctx, params, query }) => service.listEntitiesForTag(ctx, params.tagId, query),
  };
  ```
- [ ] Register into the composite map in `frontend/src/server/mock-backend/mock-transport.ts`: add `import { taxonomyHandlers } from "@/server/modules/taxonomy";` and spread `...taxonomyHandlers` into `HANDLERS` (exactly as `...projectsHandlers`). The `Handler` signature gains `ctx` per foundation §2 ("the transport signature gains a `ctx` parameter") — that change lands in Wave 0; this module consumes it.
- [ ] *(contract test, Step 6c: each handler's output validates against the contract DTO from Step 0; list ops produce the `{data:[],meta}` envelope.)*

---

## Step 5 — FE island wiring (from roadmap §4 button rows)

The roadmap §4 rows tagged **Module = Taxonomy** are all currently **decorative** (no handler). They live on two pages. Wire each to the op the row implies; mark the genuinely presentational ones intentionally inert.

| Page (§4 row) | Label | §4 state | Target op (this plan) | Wiring |
|---|---|---|---|---|
| Research `/projects/:id/research` | **资料来源标签 TagChip** | decorative | `taxonomy.entityTags.listForEntity` | Island reads tags for the active `knowledge`/`project` entity and renders real chips; remove `×` calls `taxonomy.entityTags.remove` + `router.refresh()`. |
| Research `/projects/:id/research` | **相关标签 TagChip** (→ GET /search) | decorative | `taxonomy.entityTags.listEntitiesForTag` (+ Search) | Make each chip a link/handler: click → `listEntitiesForTag(tagId)` to fetch co-tagged entities, or navigate to `/search?tag=<name>` (Search module owns the result page). |
| Knowledge `/knowledge` | **Popular tags / row tags** (TagChip) | decorative | `taxonomy.tags.list` + `taxonomy.entityTags.listForEntity` | Sidebar "Popular tags" reads `listTags`; clicking a chip filters the knowledge list by that tag (`/knowledge?tag=<name>`, consumed by 06-knowledge). Row tags read `listTagsForEntity` per knowledge item. |

- [ ] **5a. Research source/related tags** — in `frontend/src/features/research/research-workspace-page.tsx` (uses `TagChip` from `frontend/src/components/content/tag-chip.tsx`): lift the static tag rows into a client island that fetches via the typed client (`listTagsForEntity`); wire the chip `×` to `removeTag`; wire "相关标签" chips to navigate to `/search?tag=`. Server read switches to the real op; preserve the `viewModel?` seam.
- [ ] **5b. Knowledge popular/row tags** — in `frontend/src/features/knowledge/knowledge-interactive-region.tsx`: "Popular tags" → `listTags`; each chip becomes a link to `/knowledge?tag=<name>`; per-row tag chips → `listTagsForEntity`. (The `?tag=` filter consumption is delivered by 06-knowledge; this plan supplies the navigational chip + the tag data.)
- [ ] **Intentionally inert / out of scope (documented):**
  - **Planning `相关标签`-style status pills, Research 竞品平台 / 威胁等级 / 趋势 badges** — §4 marks these `Module = Analytics/Projects`, not Taxonomy; they are **presentational badges, not tags**. Leave inert; not this module's surface.
  - **Publishing-Workspace `Tag chips × remove`** — §4 marks them `Module = Publishing` (write via `POST /publications/:id/revisions`, `platformTags` string array on the Publication), **not** the `EntityTag` taxonomy. Leave to 10-publishing; do not route them through Taxonomy.
  - There is **no create-tag affordance** in the §4 inventory for any page — `taxonomy.tags.create`/`patch`/`delete` are contract+service capabilities with no current button. Mark as **backend-ready, no FE control** (consistent with the Knowledge "no create affordance" gap noted in roadmap §4). Do not invent a button.

---

## Step 6 — tests (per MODULE-ARCH §2)

- [ ] **6a. `taxonomy.service.test.ts`** — the service assertions enumerated in Step 3 (duplicate-name conflict; invalid entityType; foreign-tag 404; delete cascade; idempotent assign/remove; cross-user 404; reusability across project+knowledge). Fake/in-memory repo or pglite-backed; deterministic ids.
- [ ] **6b. `taxonomy.repository.integration.test.ts`** (pglite-backed, `globalThis` singleton) — table round-trip; unique-constraint rejection for duplicate `(userId,name)` and `(tagId,entityType,entityId)`; **multi-tenant**: seed user A + user B, assert A's repository methods never see B's tags/entity_tags and `findTag(ctxB, tagA.id) === undefined`.
- [ ] **6c. `taxonomy.contract.test.ts`** — for each of the 8 ops, drive the transport handler and assert the output parses against the Step-0 contract DTO (`tagResource` / `entityTagResource`); list ops yield the `{data,meta}` envelope; unknown op id → `UnsupportedOperationError`.

---

## Step 7 — acceptance (SPEC §22)

- [ ] Module has `service` + `repository` + `schema` + `types` + `tests`; no cross-module repository import (entity_tags soft-references other modules' rows but never joins them).
- [ ] Routes/RSCs do not touch the db client — all access via the public `index.ts` service + the registered transport handlers.
- [ ] **Reusability** (SPEC §22): `Tag`/`EntityTag` exist independent of any Project and are assignable to ≥2 entity kinds — covered by the Step-3 reusability test.
- [ ] **User-scope everywhere**: every repository query asserts `eq(table.userId, ctx.userId)` (grep the repository: zero unscoped `select`/`update`/`delete`); cross-user access → 404.
- [ ] No state machine to honor (Taxonomy is exempt per roadmap §5); idempotency holds for assign/remove via the unique index.
- [ ] `pnpm verify` (frontend lint/tsc/tests/build) green **and** `contract` package tests green (registry now includes the 8 taxonomy ids).

---

## Open questions (resolve before/within Step 0)

1. **Contract authority for the taxonomy ops.** SPEC §13 lists no tag endpoints; this plan adds 8 ops as a documented contract addition keyed to data-model §5. Confirm the program owner accepts extending `@creatoros/contract` + the §13 registry test, vs. modeling tags purely as embedded string arrays (the current `platformTags`/`tags` shape) with no first-class CRUD.
2. **`?tag=` filter ownership.** The Research/Knowledge chip navigation targets `/search?tag=` and `/knowledge?tag=` — those query params are consumed by the Search (02) and Knowledge (06) module plans. Confirm Taxonomy delivers only the chip + tag data here and the filter wiring lands in those plans (assumed above).
3. **`EntityTag` existence guard.** Taxonomy validates `entityType` + tag ownership but does not verify the referenced `entityId` actually exists/belongs to the user (no cross-module join, SPEC §8). Confirm a dangling-reference guard (via each owning module's public `assertOwns`) is deferred to Wave 2+ rather than enforced here.
