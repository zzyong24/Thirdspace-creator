import {pgTable,text,jsonb,uniqueIndex} from "drizzle-orm/pg-core";

export const publicationTextCandidates=pgTable("publication_text_candidates",{
  id:text("id").primaryKey(),userId:text("user_id").notNull(),accountId:text("account_id").notNull(),
  projectId:text("project_id").notNull(),outputId:text("output_id").notNull(),platform:text("platform").notNull(),
  kind:text("kind").notNull(),value:jsonb("value").notNull(),publicationId:text("publication_id"),
  baseRevisionId:text("base_revision_id"),sourceRefs:jsonb("source_refs").notNull(),
  ruleSnapshotRef:jsonb("rule_snapshot_ref"),appliedRules:text("applied_rules").notNull(),createdAt:text("created_at").notNull(),
});

/** Claimed only for result-first drafts; existing imported/published rows remain unchanged. */
export const publicationResultAnchors=pgTable("publication_result_anchors",{
  userId:text("user_id").notNull(),accountId:text("account_id").notNull(),outputId:text("output_id").notNull(),
  platform:text("platform").notNull(),publicationId:text("publication_id").notNull(),createdAt:text("created_at").notNull(),
},table=>[uniqueIndex("publication_result_anchors_output_platform_ux").on(table.userId,table.accountId,table.outputId,table.platform),
  uniqueIndex("publication_result_anchors_publication_ux").on(table.publicationId)]);

export const publicationResultAdoptions=pgTable("publication_result_adoptions",{
  id:text("id").primaryKey(),userId:text("user_id").notNull(),accountId:text("account_id").notNull(),
  clientRequestId:text("client_request_id").notNull(),requestDigest:text("request_digest").notNull(),
  candidateId:text("candidate_id").notNull(),publicationId:text("publication_id").notNull(),
  revisionId:text("revision_id").notNull(),createdAt:text("created_at").notNull(),
},table=>[uniqueIndex("publication_result_adoptions_request_ux").on(table.userId,table.accountId,table.clientRequestId)]);
