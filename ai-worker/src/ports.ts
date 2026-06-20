import type { AiTaskStatus } from "./state-machine.js";

export interface AiTaskRecord {
  id: string;
  userId: string;
  projectId: string | null;
  contentOutputId: string | null;
  taskType: string;
  status: AiTaskStatus;
  inputData: Record<string, unknown>;
  modelKey: string;
  idempotencyKey: string;
  requestedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  sessionId: string | null; // stage-16 column: Agent SDK session for resume
  costUsd: number | null; // stage-16 column: recorded run cost
}

export interface AiTaskReferenceRecord {
  id: string;
  aiTaskId: string;
  entityType: string;
  entityId: string;
  relationType: string;
}

export interface AiTaskResultRecord {
  id: string;
  aiTaskId: string;
  resultType: string;
  artifactId: string | null;
  knowledgeItemId: string | null;
  assetId: string | null;
  resultData: Record<string, unknown>;
}

export interface ProjectView {
  id: string;
  title: string;
  stage: string;
}
export interface ArtifactVersionView {
  artifactId: string;
  versionId: string;
  versionNumber: number;
  body: string;
  isCurrent: boolean;
}
export interface KnowledgeItemView {
  id: string;
  title: string;
  summary: string;
}

export interface DomainReadPort {
  getProject(id: string): Promise<ProjectView | null>;
  getCurrentArtifactVersion(artifactId: string): Promise<ArtifactVersionView | null>;
  listKnowledgeItems(ids: readonly string[]): Promise<KnowledgeItemView[]>;
}

export interface DomainWritePort {
  // Immutable append: creates a NEW version (storage §6) and marks it current on adoption.
  appendArtifactVersion(input: {
    artifactId: string;
    body: string;
    sourceTaskId: string;
  }): Promise<ArtifactVersionView>;
}

export interface AiTaskStore {
  claimNextQueued(now: string): Promise<AiTaskRecord | null>;
  getTask(id: string): Promise<AiTaskRecord | null>;
  updateTask(id: string, patch: Partial<AiTaskRecord>): Promise<AiTaskRecord>;
  listReferences(taskId: string): Promise<AiTaskReferenceRecord[]>;
  insertResult(rec: AiTaskResultRecord): Promise<AiTaskResultRecord>;
  getResult(id: string): Promise<AiTaskResultRecord | null>;
}

export interface AgentRunOptions {
  model: string;
  effort: "low" | "medium" | "high" | "xhigh" | "max";
  skills: string[];
  allowedTools: string[];
  permissionMode: "default";
  settingSources: Array<"project">;
  resume?: string;
}

export interface AgentRunOutcome {
  sessionId: string | null;
  subtype: string; // "success" | "error_max_turns" | "error_during_execution" | ...
  totalCostUsd: number;
  finalText: string;
}

// The capture sink + read handlers the agent drives. Built SDK-free in context-tools.ts.
export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>; // a Zod raw shape (kept loose to stay SDK-free)
  handler: (
    args: Record<string, unknown>,
  ) => Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }>;
}

export interface ToolInvocation {
  tool: string;
  ok: boolean;
}

export interface CapturedCandidate {
  resultType: string;
  resultData: Record<string, unknown>;
}

export interface ContextTools {
  toolSpecs: ToolSpec[];
  allowedTools: string[];
  submitCandidate(input: CapturedCandidate): void; // shared sink (fake runner calls directly)
  getCaptured(): CapturedCandidate | null;
  getAudit(): ToolInvocation[];
}

export interface AgentRunner {
  run(input: {
    prompt: string;
    options: AgentRunOptions;
    tools: ContextTools;
  }): Promise<AgentRunOutcome>;
}
