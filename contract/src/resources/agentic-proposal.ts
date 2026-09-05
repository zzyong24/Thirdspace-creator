import { z } from "zod";

export const agenticProposalSource = z.object({
  taskId: z.string().min(1),
  toolCallId: z.string().min(1),
  evidenceRefs: z.array(z.string().min(1)).min(1).max(100),
}).strict();

export const knowledgeProposal = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal("knowledge.create"),
  proposalId: z.string().min(1).max(200),
  source: agenticProposalSource,
  target: z.object({ knowledgeId: z.string().min(1), expectedVersion: z.null() }).strict(),
  content: z.object({
    title: z.string().trim().min(1).max(500),
    note: z.string().trim().min(1).max(200000),
    sourceNote: z.string().max(20000),
  }).strict(),
}).strict();

export const assetTagProposal = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal("asset.tags"),
  proposalId: z.string().min(1).max(200),
  source: agenticProposalSource,
  targets: z.array(z.object({ assetId: z.string().min(1), expectedVersion: z.string().min(1) }).strict()).min(1).max(100),
  tag: z.string().trim().min(1).max(200),
}).strict();

export const agenticProposal = z.discriminatedUnion("kind", [knowledgeProposal, assetTagProposal]);
export type KnowledgeProposal = z.infer<typeof knowledgeProposal>;
export type AssetTagProposal = z.infer<typeof assetTagProposal>;
export type AgenticProposal = z.infer<typeof agenticProposal>;
