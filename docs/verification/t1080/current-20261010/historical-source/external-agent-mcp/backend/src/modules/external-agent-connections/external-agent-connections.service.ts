import { createHash, timingSafeEqual } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import type { RequestContext } from "@creatoros/contract";
import type { Db } from "../../db";
import { externalAgentConnections, type ExternalAgentConnectionRow } from "../../schema/external-agent-connections";

/** 逐项审过的外部 MCP 能力。新增 contract operation 默认不可授予。 */
export const EXTERNAL_AGENT_ACCOUNT_READ = [
  "accounts.get", "projects.list", "projects.get", "projects.outputs.list",
  "projects.activity.list", "analytics.projects.get", "analytics.publications.get",
  "candidates.list", "candidates.get", "scheduledJobs.list", "scheduledJobs.get",
  "ingestion.runs.get", "ai.tasks.get", "execution.tasks.get",
 ] as const;
export const EXTERNAL_AGENT_PROJECT_READ = [
  "projects.get", "projects.outputs.list", "projects.activity.list", "analytics.projects.get",
 ] as const;
export const EXTERNAL_AGENT_CANDIDATE_OPERATIONS = ["projects.scripts.generateCandidate"] as const;
const ACCOUNT_READ = new Set<string>(EXTERNAL_AGENT_ACCOUNT_READ);
const PROJECT_READ = new Set<string>(EXTERNAL_AGENT_PROJECT_READ);
const CANDIDATE_OPERATIONS = new Set<string>(EXTERNAL_AGENT_CANDIDATE_OPERATIONS);

export function grantableExternalAgentOperation(operation: string, projectScoped: boolean): boolean {
  return (projectScoped ? PROJECT_READ : ACCOUNT_READ).has(operation) || CANDIDATE_OPERATIONS.has(operation);
}

export function externalAgentCredentialHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function secretMatches(expected: string, token: string): boolean {
  const left = Buffer.from(expected, "hex");
  const right = Buffer.from(externalAgentCredentialHash(token), "hex");
  return left.length === 32 && right.length === 32 && timingSafeEqual(left, right);
}

export class ExternalAgentAccessError extends Error {
  constructor(public readonly code: string) { super(code); this.name = "ExternalAgentAccessError"; }
}

function required(value: boolean, code: string): void {
  if (!value) throw new ExternalAgentAccessError(code);
}

function noForeignScope(value: unknown, accountId: string, projectId: string | null): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) { for (const item of value) noForeignScope(item, accountId, projectId); return; }
  for (const [key, item] of Object.entries(value)) {
    if (key === "accountId") required(item === accountId, "ACCOUNT_SCOPE_CHANGED");
    if (key === "projectId" && projectId) required(item === projectId, "PROJECT_SCOPE_CHANGED");
    if (item && typeof item === "object") noForeignScope(item, accountId, projectId);
  }
}

export interface ExternalAgentConnectionService {
  create(ctx: RequestContext, input: {id: string; idempotencyKey:string; clientKind: string; accountId: string; projectId?: string | null; allowedOps: string[]; credentialHash: string; credentialExpiresAt: string}): Promise<{row:ExternalAgentConnectionRow;created:boolean}>;
  list(ctx: RequestContext): Promise<ExternalAgentConnectionRow[]>;
  revoke(ctx: RequestContext, id: string, expectedRevision: string): Promise<ExternalAgentConnectionRow>;
  authenticate(input: {id: string; revision: string; token: string; operation: string; payload: unknown}): Promise<{userId: string; accountId: string; projectId: string | null; clientId: string; revision: string}>;
  describe(input: {id:string;revision:string;token:string}):Promise<{userId:string;accountId:string;projectId:string|null;clientId:string;revision:string;allowedOps:string[]}>;
  rotate(ctx: RequestContext, id: string, expectedRevision: string, credentialHash: string, credentialExpiresAt: string): Promise<ExternalAgentConnectionRow>;
}

export function createExternalAgentConnectionService(deps: {
  db: Db;
  assertAccount(ctx: RequestContext, id: string): Promise<unknown>;
  assertProject(ctx: RequestContext, id: string): Promise<unknown>;
  now?: () => string;
}): ExternalAgentConnectionService {
  const now = deps.now ?? (() => new Date().toISOString());
  const owned = (ctx: RequestContext, id: string) => and(eq(externalAgentConnections.id, id), eq(externalAgentConnections.userId, ctx.userId));
  const scope = async (ctx: RequestContext, row: ExternalAgentConnectionRow) => {
    const owner = {...ctx, accountId: row.accountId};
    try{await deps.assertAccount(owner, row.accountId);}catch(error){
      if((error as {name?:unknown})?.name==="OwnershipError")throw new ExternalAgentAccessError("ACCOUNT_SCOPE_CHANGED");
      throw error;
    }
    if (row.projectId)try{await deps.assertProject(owner, row.projectId);}catch(error){
      if((error as {name?:unknown})?.name==="OwnershipError")throw new ExternalAgentAccessError("PROJECT_SCOPE_CHANGED");
      throw error;
    }
  };
  const checked=async(input:{id:string;revision:string;token:string})=>{
    const [row]=await deps.db.select().from(externalAgentConnections).where(eq(externalAgentConnections.id,input.id));
    required(Boolean(row) && !row!.revokedAt,"PAIRING_REVOKED");
    required(row!.revision===input.revision,"REVISION_CONFLICT");
    required(Date.parse(row!.credentialExpiresAt)>Date.parse(now()) && secretMatches(row!.credentialHash,input.token),"CREDENTIAL_EXPIRED");
    const context:RequestContext={userId:row!.userId,accountId:row!.accountId,requestId:`external-agent:${row!.id}`,source:"user"};
    await scope(context,row!);
    return row!;
  };
  return {
    async create(ctx, input) {
      required(input.id.length > 0 && input.id.length <= 128, "INVALID_CONNECTION_ID");
      required(input.idempotencyKey.length>0 && input.idempotencyKey.length<=128,"INVALID_IDEMPOTENCY_KEY");
      required(["codex", "workbuddy", "manual"].includes(input.clientKind), "INVALID_CLIENT_KIND");
      required(input.allowedOps.length > 0 && input.allowedOps.length <= 32 && new Set(input.allowedOps).size === input.allowedOps.length, "INVALID_ALLOWED_OPS");
      required(input.allowedOps.every(op => grantableExternalAgentOperation(op, Boolean(input.projectId))), "OP_NOT_GRANTABLE");
      required(/^[a-f0-9]{64}$/.test(input.credentialHash) && Date.parse(input.credentialExpiresAt) > Date.parse(now()), "INVALID_CREDENTIAL");
      const row: ExternalAgentConnectionRow = {id:input.id,userId:ctx.userId,idempotencyKey:input.idempotencyKey,clientKind:input.clientKind,accountId:input.accountId,projectId:input.projectId ?? null,allowedOps:input.allowedOps,revision:"1",credentialHash:input.credentialHash,credentialExpiresAt:input.credentialExpiresAt,createdAt:now(),updatedAt:now(),lastInvocationAt:null,revokedAt:null};
      await scope(ctx,row);
      const inserted=await deps.db.insert(externalAgentConnections).values(row).onConflictDoNothing().returning();
      if(inserted.length)return {row:inserted[0]!,created:true};
      const [existing]=await deps.db.select().from(externalAgentConnections).where(and(eq(externalAgentConnections.userId,ctx.userId),eq(externalAgentConnections.accountId,input.accountId),eq(externalAgentConnections.idempotencyKey,input.idempotencyKey)));
      required(Boolean(existing),"PAIRING_CREATE_CONFLICT");
      required(existing!.clientKind===input.clientKind && existing!.projectId===(input.projectId??null) && JSON.stringify(existing!.allowedOps)===JSON.stringify(input.allowedOps),"IDEMPOTENCY_CONFLICT");
      return {row:existing!,created:false};
    },
    async list(ctx) { return deps.db.select().from(externalAgentConnections).where(eq(externalAgentConnections.userId,ctx.userId)); },
    async revoke(ctx,id,expectedRevision) {
      const [row]=await deps.db.select().from(externalAgentConnections).where(owned(ctx,id));
      required(Boolean(row),"PAIRING_NOT_FOUND");
      if(row!.revokedAt && (row!.revision===expectedRevision || String(Number(row!.revision)-1)===expectedRevision))return row!;
      required(row!.revision===expectedRevision,"REVISION_CONFLICT");
      const next={revision:String(Number(row!.revision)+1),revokedAt:now(),credentialHash:"",updatedAt:now()};
      const changed=await deps.db.update(externalAgentConnections).set(next).where(and(owned(ctx,id),eq(externalAgentConnections.revision,expectedRevision),isNull(externalAgentConnections.revokedAt))).returning();
      required(changed.length===1,"REVISION_CONFLICT");return changed[0]!;
    },
    async rotate(ctx,id,expectedRevision,credentialHash,credentialExpiresAt) {
      required(/^[a-f0-9]{64}$/.test(credentialHash) && Date.parse(credentialExpiresAt)>Date.parse(now()),"INVALID_CREDENTIAL");
      const [row]=await deps.db.select().from(externalAgentConnections).where(owned(ctx,id));
      required(Boolean(row) && !row!.revokedAt,"PAIRING_REVOKED");required(row!.revision===expectedRevision,"REVISION_CONFLICT");
      await scope(ctx,row!);
      const changed=await deps.db.update(externalAgentConnections).set({credentialHash,credentialExpiresAt,updatedAt:now()}).where(and(owned(ctx,id),eq(externalAgentConnections.revision,expectedRevision),eq(externalAgentConnections.credentialHash,row!.credentialHash),isNull(externalAgentConnections.revokedAt))).returning();
      required(changed.length===1,"REVISION_CONFLICT");return changed[0]!;
    },
    async authenticate(input) {
      const row=await checked(input);
      required(row!.allowedOps.includes(input.operation) && grantableExternalAgentOperation(input.operation,Boolean(row!.projectId)),"OP_NOT_GRANTED");
      const context:RequestContext={userId:row!.userId,accountId:row!.accountId,requestId:`external-agent:${row!.id}`,source:"user"};
      await scope(context,row!);
      noForeignScope(input.payload,row!.accountId,row!.projectId);
      if(row!.projectId) {
        const params=(input.payload && typeof input.payload==="object" && !Array.isArray(input.payload) ? (input.payload as {params?:unknown}).params : null);
        required(Boolean(params && typeof params==="object" && (params as {projectId?:unknown}).projectId===row!.projectId),"PROJECT_SCOPE_CHANGED");
      }
      // 撤销与调用并发时，不允许用已失效 grant 写审计或继续下发业务调用。
      const admitted=await deps.db.update(externalAgentConnections).set({lastInvocationAt:now()}).where(and(
        eq(externalAgentConnections.id,row!.id),
        eq(externalAgentConnections.revision,row!.revision),
        eq(externalAgentConnections.credentialHash,row!.credentialHash),
        isNull(externalAgentConnections.revokedAt),
      )).returning();
      required(admitted.length===1,"PAIRING_REVOKED");
      return {userId:row!.userId,accountId:row!.accountId,projectId:row!.projectId,clientId:row!.id,revision:row!.revision};
    },
    async describe(input){const row=await checked(input);return {userId:row.userId,accountId:row.accountId,projectId:row.projectId,clientId:row.id,revision:row.revision,allowedOps:row.allowedOps.filter(op=>grantableExternalAgentOperation(op,Boolean(row.projectId)))};},
  };
}
