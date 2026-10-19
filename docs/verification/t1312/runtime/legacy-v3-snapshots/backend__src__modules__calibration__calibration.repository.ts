import type {RequestContext} from "@creatoros/contract";
import {projects,contentOutputs} from "../../schema/projects";
import {publications} from "../../schema/publishing";
import {learnings} from "../../schema/learnings";
import {withWorkspaceWrite,withWorkspaceParentWrite,type WorkspaceWriteTx,type WorkspaceWriteParent} from "../../workspace-write";
import {workspaceKey,workspaceFilter,workspaceStamp} from "@creatoros/backend";
import { and, asc, desc, eq, type Db } from "@creatoros/backend";
import {
  rubrics,
  rubricVersions,
  predictions,
  calibrationResults,
  calibrationRuleSuggestions,
} from "./calibration.db-schema";
import { OwnershipError } from "./calibration.errors";
import {ConflictError} from './calibration.errors';
import {isNull} from 'drizzle-orm';
import {accountGroups,accountGroupMemberships} from '../../schema/account-groups';
import {platformAccounts} from '../../schema/platform-account';
import {lockWorkspaceMembership} from '../platform-account';
import {defaultRubricIdentity,DEFAULT_RUBRIC_DIMENSIONS,DEFAULT_RUBRIC_NAME,DEFAULT_RUBRIC_CHANGE_SUMMARY} from './default-rubric';

// Calibration repository (foundation §5.2) — user-scoped queries ONLY. `userId` is
// baked into deps (mirrors the monetization/learnings repos): EVERY query filters
// `eq(table.userId, deps.userId)` and EVERY insert stamps `userId: deps.userId`. The
// private row getters throw OwnershipError when the scoped select returns empty —
// never revealing cross-user existence (foundation §2: 404 not 403). The repository
// executes only service-approved writes — the Prediction state machine + immutability
// guards live in the service (SPEC §12); the lock SQL `status='draft'` guard backs the
// invariant at the DB layer too.

export type RubricRow = typeof rubrics.$inferSelect;
type FrozenWorkspace=Awaited<ReturnType<typeof lockWorkspaceMembership>>;
export type RubricVersionRow = typeof rubricVersions.$inferSelect;
export type PredictionRow = typeof predictions.$inferSelect;
export type CalibrationResultRow = typeof calibrationResults.$inferSelect;
export type RuleSuggestionRow =
  typeof calibrationRuleSuggestions.$inferSelect;

export interface RepoDeps {
  now: () => string; // ISO-8601 clock (injected for deterministic tests)
  nextId: (prefix: string) => string; // id generator (deterministic in tests)
  userId: string; // the ownership boundary, baked in at construction
  // [T-332 S2 · ISO-02/03] 第二所有权维度,**必填 strict**:逐个 list/get/count 读门恒叠
  // eq(table.accountId),写路径盖章当前号。未选号在 service 入口 requireAccountId 即被拒
  // (SPEC §4.2 引导态),无「null → 退化全量」分支。
  accountId?: string | null;
  groupId?: string | null;
  context?:RequestContext;
}

export interface RubricDimension {
  key: string;
  label: string;
  weight: number;
}

export interface InsertRubricVersionInput {
  rubricId: string;
  versionNumber: number;
  dimensions: RubricDimension[];
  changeSummary: string;
}

export interface CreatePredictionInput {
  subjectType: string;
  subjectId: string;
  rubricVersionId: string;
  predictedMetrics: Record<string, unknown>;
  predictedConversion: Record<string, unknown>;
  predictedScore: string; // decimal-as-text
  confidence: string;
}

export interface CreateResultInput {
  predictionId: string;
  ingestionRunId: string;
  actualMetrics: Record<string, unknown>;
  deviation: Record<string, unknown>;
}

// 复盘飞轮回流 轨B — the CalibrationRuleSuggestion write/read inputs.
export interface ProposedDimension {
  key: string;
  label: string;
  weight: number;
  description: string;
}

export interface CreateRuleSuggestionInput {
  learningId: string;
  rubricId: string;
  proposedDimension: ProposedDimension;
  rationale: string;
}

export interface CalibrationRepository {
  getDefaultRubric():Promise<{root:RubricRow;version:RubricVersionRow}|null>;
  ensureDefaultRubric():Promise<{root:RubricRow;version:RubricVersionRow}>;
  getDefaultOrOwnedRubricVersion(id:string):Promise<RubricVersionRow>;
  withVersionWrite<T>(id:string,body:(tx:WorkspaceWriteTx,mode?:string)=>Promise<T>):Promise<T>;
  withWrite<T>(body:(repo:CalibrationRepository)=>Promise<T>):Promise<T>;
  withRubricWrite<T>(rubricId:string,body:(repo:CalibrationRepository)=>Promise<T>):Promise<T>;
  withPredictionWrite<T>(predictionId:string,body:(repo:CalibrationRepository)=>Promise<T>):Promise<T>;
  withSuggestionWrite<T>(suggestionId:string,body:(repo:CalibrationRepository)=>Promise<T>):Promise<T>;
  // Fixture hydration (insert with explicit user_id already on the row).
  seedRubrics(rows: RubricRow[]): Promise<void>;
  seedRubricVersions(rows: RubricVersionRow[]): Promise<void>;
  // Canonical seed for 校准中心 (predictions + results carrying the 维度评分约定 jsonb), so the
  // overview KPI / 回流对照 / 中栏评分表 resolve real rows. onConflictDoNothing (idempotent).
  seedPredictions(rows: PredictionRow[]): Promise<void>;
  seedResults(rows: CalibrationResultRow[]): Promise<void>;
  // 复盘飞轮回流 轨B — canonical seed for the CalibrationRuleSuggestion (so the 校准中心 demo
  // shows a real pending reflow suggestion). onConflictDoNothing → idempotent.
  seedRuleSuggestions(rows: RuleSuggestionRow[]): Promise<void>;

  createRubric(input: { name: string }): Promise<RubricRow>;
  insertRubricVersion(input: InsertRubricVersionInput): Promise<RubricVersionRow>;
  setRubricCurrentVersion(
    rubricId: string,
    versionId: string,
  ): Promise<RubricRow>;
  getRubric(rubricId: string): Promise<RubricRow>;
  getRubricVersion(versionId: string): Promise<RubricVersionRow>;
  listRubricVersions(rubricId: string): Promise<RubricVersionRow[]>;
  countRubricVersions(rubricId: string): Promise<number>;

  createPrediction(input: CreatePredictionInput): Promise<PredictionRow>;
  lockPrediction(predictionId: string): Promise<PredictionRow>;
  getPrediction(predictionId: string): Promise<PredictionRow>;
  // GAP-CAL-1: user-scoped 盲预测 list (createdAt desc) + total count, for pagination.
  listPredictions(page: {
    limit: number;
    offset: number;
  }): Promise<{ rows: PredictionRow[]; total: number }>;

  createResult(input: CreateResultInput): Promise<CalibrationResultRow>;
  getResultByPrediction(
    predictionId: string,
  ): Promise<CalibrationResultRow | null>;

  // --- Overview reads (校准中心总览, Slice 1) — all user-scoped, derived at read time. ---
  // All predictions for the user (createdAt desc), no pagination — the overview derives
  // KPI counts + per-subject badges + reflow joins from the full set (the canonical
  // dataset is small; if it grows, page this).
  listAllPredictions(): Promise<PredictionRow[]>;
  // All calibration results for the user (createdAt desc) — drives completedReflows count,
  // avgDeviation, latestFinding, and the reflow对照 join (result ⋈ its prediction).
  listAllResults(): Promise<CalibrationResultRow[]>;

  // --- 复盘飞轮回流 轨B (Learning→校准) CalibrationRuleSuggestion ---
  // Idempotent on (learning_id, rubric_id, status='pending'): a re-reflow of the same
  // Learning onto the same Rubric returns the EXISTING pending suggestion (never a dup).
  createRuleSuggestion(
    input: CreateRuleSuggestionInput,
  ): Promise<RuleSuggestionRow>;
  // The ownership-gated single read (cross-user / unknown → OwnershipError → 404).
  getRuleSuggestion(suggestionId: string): Promise<RuleSuggestionRow>;
  // User-scoped pending-suggestion list (createdAt desc) + total, for pagination.
  listPendingRuleSuggestions(page: {
    limit: number;
    offset: number;
  }): Promise<{ rows: RuleSuggestionRow[]; total: number }>;
  // Mark a suggestion terminal (adopted|dismissed); stamps adoptedVersionId + adoptedAt.
  // SQL guard `status='pending'` backs the terminal invariant at the DB layer.
  markRuleSuggestionAdopted(
    suggestionId: string,
    input: { status: "adopted" | "dismissed"; adoptedVersionId: string | null },
  ): Promise<RuleSuggestionRow>;
}

export function createCalibrationRepository(
  db: Db,
  deps: RepoDeps,
): CalibrationRepository {
 return buildRepository(db,deps);
}
function buildRepository(db:Db,deps:RepoDeps,defaultRootId?:string):CalibrationRepository{
  const scope = workspaceKey(deps);
  const stamp = workspaceStamp(scope);
  const ctx:RequestContext=deps.context??{userId:deps.userId,...stamp,requestId:"calibration-parent-write",source:"user"};
  const ordinaryCtx:RequestContext={userId:deps.userId,...stamp,requestId:"calibration-parent-write",source:"user"};
  const identity=defaultRubricIdentity(ctx);
  const scoped=<T extends {userId:any;groupId:any;accountId:any}>(table:T)=>and(eq(table.userId,deps.userId),workspaceFilter(table,scope));
  // 完整实际ctx先按account→member→group锁；历史root来源账号从不变成新的权限ctx。
  const defaultWorkspaceWrite=<T>(storeDb:Db,body:(tx:WorkspaceWriteTx,frozen:FrozenWorkspace)=>Promise<T>)=>storeDb.transaction(async outer=>{
   const frozen=await lockWorkspaceMembership(outer,ctx);
   return withWorkspaceWrite(outer as unknown as Db,ctx,tx=>body(tx,frozen));
  });
  async function defaultAccess(store:Db){
   if(ctx.groupId){
    const [group]=await store.select().from(accountGroups).where(and(eq(accountGroups.id,ctx.groupId),eq(accountGroups.userId,ctx.userId)));
    if(!group)throw new OwnershipError('默认量表工作区不存在');
    return;
   }
   const [account]=await store.select().from(platformAccounts).where(and(eq(platformAccounts.id,ctx.accountId!),eq(platformAccounts.userId,ctx.userId),eq(platformAccounts.status,'active')));
   if(!account)throw new OwnershipError('默认量表需要真实可用平台账号');
   const [member]=await store.select().from(accountGroupMemberships).where(and(eq(accountGroupMemberships.userId,ctx.userId),eq(accountGroupMemberships.accountId,ctx.accountId!),isNull(accountGroupMemberships.leftAt)));
   if(member){
    if(member.groupId!==`grp_legacy_${ctx.accountId}`)throw new OwnershipError('默认量表旧入口账号已转组');
    const [group]=await store.select().from(accountGroups).where(and(eq(accountGroups.id,member.groupId),eq(accountGroups.userId,ctx.userId),eq(accountGroups.status,'active')));
    if(!group)throw new OwnershipError('默认量表旧工作区不可用');
   }
  }
  async function defaultRoot(store:Db,lock=false):Promise<RubricRow|null>{
   await defaultAccess(store);
   const query=store.select().from(rubrics).where(eq(rubrics.id,identity.rubricId));
   const [root]=await(lock?query.for('update'):query);if(!root)return null;
   const a=identity.sourceAccountId,group=root.groupId??null;
   const sourceValid=a?root.accountId===null||root.accountId===a:root.accountId===null;
   const groupValid=ctx.groupId?group===ctx.groupId:group===null||group===`grp_legacy_${ctx.accountId}`;
   if(root.userId!==ctx.userId||!sourceValid||!groupValid||(!group&&root.accountId===null))throw new OwnershipError('默认量表稳定标识或父根归属不一致');
   if(!ctx.groupId&&group){const [member]=await store.select().from(accountGroupMemberships).where(and(eq(accountGroupMemberships.userId,ctx.userId),eq(accountGroupMemberships.accountId,ctx.accountId!),eq(accountGroupMemberships.groupId,group),isNull(accountGroupMemberships.leftAt)));if(!member)throw new OwnershipError('默认量表旧入口缺少真实归属');}
   return root;
  }
  function validateDefaultVersion(root:RubricRow,version:RubricVersionRow|undefined):RubricVersionRow{
   const a=identity.sourceAccountId;
   if(!version||version.userId!==ctx.userId||version.rubricId!==root.id||(version.groupId??null)!==(root.groupId??null)||(a?version.accountId!==null&&version.accountId!==a:version.accountId!==null))throw new OwnershipError('默认量表版本父链不一致');
   return version;
  }
  async function defaultVersion(store:Db,root:RubricRow,id:string,lock=false){const query=store.select().from(rubricVersions).where(eq(rubricVersions.id,id));const [version]=await(lock?query.for('update'):query);return validateDefaultVersion(root,version);}
  async function defaultCurrent(store:Db,lock=false){const root=await defaultRoot(store,lock);if(!root)return null;if(!root.currentVersionId)throw new ConflictError('默认量表当前版本指针损坏');return {root,version:await defaultVersion(store,root,root.currentVersionId,lock)};}
  const rubricParent:WorkspaceWriteParent={table:rubrics,id:rubrics.id,userId:rubrics.userId,groupId:rubrics.groupId,accountId:rubrics.accountId,lock:"update"};
  const versionParent:WorkspaceWriteParent={...rubricParent,via:[{table:rubricVersions,id:rubricVersions.id,parentId:rubricVersions.rubricId,userId:rubricVersions.userId,scope:{groupId:rubricVersions.groupId,accountId:rubricVersions.accountId}}]};
  const predictionParent:WorkspaceWriteParent={...versionParent,via:[...versionParent.via!,{table:predictions,id:predictions.id,parentId:predictions.rubricVersionId,userId:predictions.userId,scope:{groupId:predictions.groupId,accountId:predictions.accountId}}]};
  const suggestionParent:WorkspaceWriteParent={...rubricParent,via:[{table:calibrationRuleSuggestions,id:calibrationRuleSuggestions.id,parentId:calibrationRuleSuggestions.rubricId,userId:calibrationRuleSuggestions.userId,scope:{groupId:calibrationRuleSuggestions.groupId,accountId:calibrationRuleSuggestions.accountId}}]};
  async function parentIdentity(store:Db,parent:WorkspaceWriteParent,id:string){
   let rootId:string|undefined,versionId:string|undefined;
   if(parent===rubricParent)rootId=id;
   else if(parent===suggestionParent){const [row]=await store.select().from(calibrationRuleSuggestions).where(and(scoped(calibrationRuleSuggestions),eq(calibrationRuleSuggestions.id,id)));rootId=row?.rubricId;}
   else{
    if(parent===predictionParent){const [row]=await store.select().from(predictions).where(and(scoped(predictions),eq(predictions.id,id)));versionId=row?.rubricVersionId;}
    else versionId=id;
    if(versionId){const [version]=await store.select().from(rubricVersions).where(and(eq(rubricVersions.id,versionId),eq(rubricVersions.userId,ctx.userId)));rootId=version?.rubricId;}
   }
   return {rootId,versionId};
  }
  const writeParent=<T>(parent:WorkspaceWriteParent,id:string,body:(tx:WorkspaceWriteTx,mode?:string)=>Promise<T>,ordinaryLock?:'share')=>db.transaction(async outer=>{
   const selected=await parentIdentity(outer as unknown as Db,parent,id);
   if(selected.rootId!==identity.rubricId)return withWorkspaceParentWrite(outer as unknown as Db,ordinaryCtx,ordinaryLock?{...parent,lock:ordinaryLock}:parent,[id],async tx=>{
    const current=await parentIdentity(tx as unknown as Db,parent,id);
    if(current.rootId!==selected.rootId||current.versionId!==selected.versionId)throw new OwnershipError('量表父链已改变');
    return body(tx);
   });
   return withDefaultParent(outer as unknown as Db,parent,id,selected,body);
  });
  // 仅在同一事务分类为默认父链后使用完整ctx admission，并在锁后重查父链。
  async function withDefaultParent<T>(storeDb:Db,parent:WorkspaceWriteParent,id:string,selected:{rootId?:string;versionId?:string},body:(tx:WorkspaceWriteTx,mode?:string)=>Promise<T>):Promise<T>{
   return defaultWorkspaceWrite(storeDb,async tx=>{
    const store=tx as unknown as Db,root=await defaultRoot(store,true);if(!root)throw new OwnershipError('默认量表父根不存在');
    if(selected.versionId)await defaultVersion(store,root,selected.versionId,true);
    if(parent===predictionParent){const [current]=await store.select().from(predictions).where(and(scoped(predictions),eq(predictions.id,id))).for('update');if(!current||current.rubricVersionId!==selected.versionId)throw new OwnershipError('预测默认父链已改变');}
    if(parent===suggestionParent){const [current]=await store.select().from(calibrationRuleSuggestions).where(and(scoped(calibrationRuleSuggestions),eq(calibrationRuleSuggestions.id,id))).for('update');if(!current||current.rubricId!==root.id)throw new OwnershipError('建议默认父链已改变');}
    return body(tx,root.id);
   });
  }
  async function getRubricRow(rubricId: string): Promise<RubricRow> {
    if(defaultRootId===rubricId){const root=await defaultRoot(db);if(!root)throw new OwnershipError('默认量表不存在');return root;}
    const rows = await db
      .select()
      .from(rubrics)
      .where(
        and(
          eq(rubrics.userId, deps.userId),
          // [T-332 S2 · ISO-02] 号维度 strict 恒叠。
          workspaceFilter(rubrics, scope),
          eq(rubrics.id, rubricId),
        ),
      );
    const row = rows[0];
    if (!row) {
      throw new OwnershipError(`OwnershipError: rubric not found: ${rubricId}`);
    }
    return row;
  }

  async function getRubricVersionRow(
    versionId: string,
  ): Promise<RubricVersionRow> {
    if(defaultRootId){const root=await defaultRoot(db);if(!root)throw new OwnershipError('默认量表不存在');return defaultVersion(db,root,versionId);}
    const rows = await db
      .select()
      .from(rubricVersions)
      .where(
        and(
          eq(rubricVersions.userId, deps.userId),
          // [T-332 S2 · ISO-02] 号维度 strict 恒叠。
          workspaceFilter(rubricVersions, scope),
          eq(rubricVersions.id, versionId),
        ),
      );
    const row = rows[0];
    if (!row) {
      throw new OwnershipError(
        `OwnershipError: rubric version not found: ${versionId}`,
      );
    }
    return row;
  }

  async function getPredictionRow(predictionId: string): Promise<PredictionRow> {
    const rows = await db
      .select()
      .from(predictions)
      .where(
        and(
          eq(predictions.userId, deps.userId),
          // [T-332 S2 · ISO-02] 号维度 strict 恒叠。
          workspaceFilter(predictions, scope),
          eq(predictions.id, predictionId),
        ),
      );
    const row = rows[0];
    if (!row) {
      throw new OwnershipError(
        `OwnershipError: prediction not found: ${predictionId}`,
      );
    }
    return row;
  }

  return {
    getDefaultRubric:()=>defaultCurrent(db),
    ensureDefaultRubric:()=>defaultWorkspaceWrite(db,async(tx,frozen)=>{
     const store=tx as unknown as Db,current=await defaultCurrent(store,true);if(current)return current;
     const [occupied]=await store.select().from(rubricVersions).where(eq(rubricVersions.id,identity.versionId));if(occupied)throw new ConflictError('默认量表初始版本标识已占用');
     const stamp=deps.now(),scopeStamp={groupId:ctx.groupId??frozen.groupId,accountId:ctx.groupId?null:ctx.accountId!};
     await store.insert(rubrics).values({id:identity.rubricId,userId:ctx.userId,...scopeStamp,name:DEFAULT_RUBRIC_NAME,currentVersionId:null,createdAt:stamp});
     await store.insert(rubricVersions).values({id:identity.versionId,userId:ctx.userId,...scopeStamp,rubricId:identity.rubricId,versionNumber:1,dimensions:DEFAULT_RUBRIC_DIMENSIONS,changeSummary:DEFAULT_RUBRIC_CHANGE_SUMMARY,createdAt:stamp});
     await store.update(rubrics).set({currentVersionId:identity.versionId}).where(and(eq(rubrics.id,identity.rubricId),eq(rubrics.userId,ctx.userId)));
     return (await defaultCurrent(store))!;
    }),
    async getDefaultOrOwnedRubricVersion(id){const [row]=await db.select().from(rubricVersions).where(and(eq(rubricVersions.id,id),eq(rubricVersions.userId,ctx.userId)));if(row?.rubricId===identity.rubricId){const root=await defaultRoot(db);if(!root)throw new OwnershipError('默认量表不存在');return validateDefaultVersion(root,row);}return getRubricVersionRow(id);},
    withWrite:body=>withWorkspaceWrite(db,ordinaryCtx,tx=>body(buildRepository(tx as unknown as Db,deps,defaultRootId))),
    withVersionWrite:(id,body)=>writeParent(versionParent,id,body,"share"),
    withRubricWrite:(id,body)=>writeParent(rubricParent,id,(tx,mode)=>body(buildRepository(tx as unknown as Db,deps,mode))),
    withPredictionWrite:(id,body)=>writeParent(predictionParent,id,(tx,mode)=>body(buildRepository(tx as unknown as Db,deps,mode))),
    withSuggestionWrite:(id,body)=>writeParent(suggestionParent,id,(tx,mode)=>body(buildRepository(tx as unknown as Db,deps,mode))),
    async seedRubrics(rows) {
      if (rows.length === 0) return;
      await db.insert(rubrics).values(rows).onConflictDoNothing();
    },

    async seedRubricVersions(rows) {
      if (rows.length === 0) return;
      await db.insert(rubricVersions).values(rows).onConflictDoNothing();
    },

    async seedPredictions(rows) {
      if (rows.length === 0) return;
      await db.insert(predictions).values(rows).onConflictDoNothing();
    },

    async seedResults(rows) {
      if (rows.length === 0) return;
      await db.insert(calibrationResults).values(rows).onConflictDoNothing();
    },

    async seedRuleSuggestions(rows) {
      if (rows.length === 0) return;
      await db
        .insert(calibrationRuleSuggestions)
        .values(rows)
        .onConflictDoNothing();
    },

    async createRubric({ name }) {
      return withWorkspaceWrite(db,ordinaryCtx,async tx=>{
      const inserted = await tx
        .insert(rubrics)
        .values({
          id: deps.nextId("rubric"),
          userId: deps.userId,
          // [T-332 S2 · ISO-03] 号维度盖章(必填,无 null 兜底)。
          ...stamp,
          name,
          currentVersionId: null,
          createdAt: deps.now(),
        })
        .returning();
      return inserted[0]!;
      });
    },

    async insertRubricVersion(input) {
      return writeParent(rubricParent,input.rubricId,async(tx,mode)=>{
      const parent=await buildRepository(tx as unknown as Db,deps,mode).getRubric(input.rubricId);
      // Never an update — each call is a NEW immutable row (data-model 约束 6).
      const inserted = await tx
        .insert(rubricVersions)
        .values({
          id: deps.nextId("rubricver"),
          userId: deps.userId,
          // [T-332 S2 · ISO-03] 号维度盖章(与父 rubric 同号;必填)。
          ...stamp, groupId: parent.groupId ?? stamp.groupId,...(mode&&identity.sourceAccountId?{accountId:parent.accountId,groupId:parent.groupId}:{}),
          rubricId: input.rubricId,
          versionNumber: input.versionNumber,
          dimensions: input.dimensions,
          changeSummary: input.changeSummary,
          createdAt: deps.now(),
        })
        .returning();
      return inserted[0]!;
      });
    },

    async setRubricCurrentVersion(rubricId, versionId) {
      return writeParent(versionParent,versionId,async(tx,mode)=>{
      const version=await buildRepository(tx as unknown as Db,deps,mode).getRubricVersion(versionId);
      if(version.rubricId!==rubricId)throw new OwnershipError("Rubric version not found");
      await buildRepository(tx as unknown as Db,deps,mode).getRubric(rubricId); // scoped ownership gate
      // The ONLY rubric mutation — re-points the pointer; version rows stay immutable.
      const updated = await tx
        .update(rubrics)
        .set({ currentVersionId: versionId })
        .where(and(eq(rubrics.userId, deps.userId), mode?eq(rubrics.id,identity.rubricId):workspaceFilter(rubrics, scope), eq(rubrics.id, rubricId)))
        .returning();
      return updated[0]!;
      });
    },

    async getRubric(rubricId) {
      return getRubricRow(rubricId);
    },

    async getRubricVersion(versionId) {
      return getRubricVersionRow(versionId);
    },

    async listRubricVersions(rubricId) {
      return db
        .select()
        .from(rubricVersions)
        .where(
          and(
            eq(rubricVersions.userId, deps.userId),
            // [T-332 S2 · ISO-02] 号维度 strict 恒叠。
            workspaceFilter(rubricVersions, scope),
            eq(rubricVersions.rubricId, rubricId),
          ),
        )
        .orderBy(asc(rubricVersions.versionNumber));
    },

    async countRubricVersions(rubricId) {
      if(defaultRootId===rubricId){const root=await defaultRoot(db);if(!root)throw new OwnershipError('默认量表不存在');const rows=await db.select().from(rubricVersions).where(eq(rubricVersions.rubricId,rubricId));for(const row of rows)validateDefaultVersion(root,row);return rows.length;}
      const rows = await db
        .select({ id: rubricVersions.id })
        .from(rubricVersions)
        .where(
          and(
            eq(rubricVersions.userId, deps.userId),
            // [T-332 S2 · ISO-02] 号维度 strict 恒叠。
            workspaceFilter(rubricVersions, scope),
            eq(rubricVersions.rubricId, rubricId),
          ),
        );
      return rows.length;
    },

    async createPrediction(input) {
      const subjectParent:WorkspaceWriteParent={table:projects,id:projects.id,userId:projects.userId,groupId:projects.groupId,accountId:projects.accountId,via:[{table:contentOutputs,id:contentOutputs.id,parentId:contentOutputs.projectId}]};
      if(input.subjectType==="publication")subjectParent.via!.push({table:publications,id:publications.id,parentId:publications.contentOutputId,userId:publications.userId,scope:{groupId:publications.groupId,accountId:publications.accountId}});
      else if(input.subjectType!=="content_output")throw new OwnershipError("校准对象不存在");
      return db.transaction(async outer=>{
       const [selected]=await outer.select().from(rubricVersions).where(and(eq(rubricVersions.id,input.rubricVersionId),eq(rubricVersions.userId,ctx.userId)));
       const isDefault=selected?.rubricId===identity.rubricId;
       const writeSubject=(store:Db)=>withWorkspaceParentWrite(store,ordinaryCtx,subjectParent,[input.subjectId],async subjectTx=>
        buildRepository(subjectTx as unknown as Db,deps,defaultRootId).withVersionWrite(input.rubricVersionId,async(writeTx,mode)=>{
      const parent=await buildRepository(writeTx as unknown as Db,deps,mode).getRubricVersion(input.rubricVersionId);
      const inserted = await writeTx
        .insert(predictions)
        .values({
          id: deps.nextId("pred"),
          userId: deps.userId,
          // [T-332 S2 · ISO-03] 号维度盖章(必填,无 null 兜底)。
          ...stamp, groupId: parent.groupId ?? stamp.groupId,
          subjectType: input.subjectType,
          subjectId: input.subjectId,
          rubricVersionId: input.rubricVersionId,
          predictedMetrics: input.predictedMetrics,
          predictedConversion: input.predictedConversion,
          predictedScore: input.predictedScore,
          confidence: input.confidence,
          status: "draft",
          lockedAt: null,
          createdAt: deps.now(),
        })
        .returning();
      return inserted[0]!;
      }));
       // 默认路径在subject锁之前取得实际workspace锁；普通路径保留原share版本锁与stamp权限。
       if(isDefault)return defaultWorkspaceWrite(outer as unknown as Db,tx=>writeSubject(tx as unknown as Db));
       return writeSubject(outer as unknown as Db);
      });
    },

    async lockPrediction(predictionId) {
      return writeParent(predictionParent,predictionId,async tx=>{
      await createCalibrationRepository(tx as unknown as Db,deps).getPrediction(predictionId); // scoped ownership gate
      // The SQL `status='draft'` guard backs the immutability invariant at the DB layer
      // (a re-lock of an already-locked prediction matches 0 rows). The service enforces
      // the state machine + idempotency on top.
      const updated = await tx
        .update(predictions)
        .set({ status: "locked", lockedAt: deps.now() })
        .where(
          and(
            eq(predictions.userId, deps.userId),
            workspaceFilter(predictions, scope),
            eq(predictions.id, predictionId),
            eq(predictions.status, "draft"),
          ),
        )
        .returning();
      return updated[0]!;
      });
    },

    async getPrediction(predictionId) {
      return getPredictionRow(predictionId);
    },

    async listPredictions({ limit, offset }) {
      // [T-332 S2 · ISO-02] 号维度 strict 恒叠(无「无号全量」退化)。
      const where = and(
        eq(predictions.userId, deps.userId),
        workspaceFilter(predictions, scope),
      );
      const rows = await db
        .select()
        .from(predictions)
        .where(where)
        .orderBy(desc(predictions.createdAt))
        .limit(limit)
        .offset(offset);
      const all = await db
        .select({ id: predictions.id })
        .from(predictions)
        .where(where);
      return { rows, total: all.length };
    },

    async createResult(input) {
      return writeParent(predictionParent,input.predictionId,async tx=>{
      const parent=await createCalibrationRepository(tx as unknown as Db,deps).getPrediction(input.predictionId);
      // Idempotent on UNIQUE prediction_id: a re-submit inserts nothing and the
      // read-back returns the existing row (never double-feeds the rubric/Learning).
      await tx
        .insert(calibrationResults)
        .values({
          id: deps.nextId("calibres"),
          userId: deps.userId,
          // [T-332 S2 · ISO-03] 号维度盖章(与父 prediction 同号;必填)。
          ...stamp, groupId: parent.groupId ?? stamp.groupId,
          predictionId: input.predictionId,
          ingestionRunId: input.ingestionRunId,
          actualMetrics: input.actualMetrics,
          deviation: input.deviation,
          createdAt: deps.now(),
        })
        .onConflictDoNothing();
      const existing = await tx
        .select()
        .from(calibrationResults)
        .where(
          and(
            eq(calibrationResults.userId, deps.userId),
            // [T-332 S2 · ISO-02] 号维度 strict 恒叠。
            workspaceFilter(calibrationResults, scope),
            eq(calibrationResults.predictionId, input.predictionId),
          ),
        );
      return existing[0]!;
      });
    },

    async getResultByPrediction(predictionId) {
      const rows = await db
        .select()
        .from(calibrationResults)
        .where(
          and(
            eq(calibrationResults.userId, deps.userId),
            // [T-332 S2 · ISO-02] 号维度 strict 恒叠。
            workspaceFilter(calibrationResults, scope),
            eq(calibrationResults.predictionId, predictionId),
          ),
        );
      return rows[0] ?? null;
    },

    async listAllPredictions() {
      return db
        .select()
        .from(predictions)
        .where(
          and(
            eq(predictions.userId, deps.userId),
            // [T-332 S2 · ISO-02] 号维度 strict 恒叠。
            workspaceFilter(predictions, scope),
          ),
        )
        .orderBy(desc(predictions.createdAt));
    },

    async listAllResults() {
      return db
        .select()
        .from(calibrationResults)
        .where(
          and(
            eq(calibrationResults.userId, deps.userId),
            // [T-332 S2 · ISO-02] 号维度 strict 恒叠。
            workspaceFilter(calibrationResults, scope),
          ),
        )
        .orderBy(desc(calibrationResults.createdAt));
    },

    async createRuleSuggestion(input) {
      return writeParent(rubricParent,input.rubricId,async parentTx=>
        withWorkspaceParentWrite(parentTx as unknown as Db,ctx,{table:learnings,id:learnings.id,userId:learnings.userId,groupId:learnings.groupId,accountId:learnings.accountId},[input.learningId],async tx=>{
      // Idempotent reflow: if a PENDING suggestion already exists for this
      // (learning, rubric), return it instead of inserting a duplicate — re-clicking
      // 回流到校准 never spawns a second pending row.
      const existing = await tx
        .select()
        .from(calibrationRuleSuggestions)
        .where(
          and(
            eq(calibrationRuleSuggestions.userId, deps.userId),
            // [T-332 S2 · ISO-02] 号维度 strict 恒叠。
            workspaceFilter(calibrationRuleSuggestions, scope),
            eq(calibrationRuleSuggestions.learningId, input.learningId),
            eq(calibrationRuleSuggestions.rubricId, input.rubricId),
            eq(calibrationRuleSuggestions.status, "pending"),
          ),
        );
      if (existing[0]) return existing[0];
      const inserted = await tx
        .insert(calibrationRuleSuggestions)
        .values({
          id: deps.nextId("calibsug"),
          userId: deps.userId,
          // [T-332 S2 · ISO-03] 号维度盖章(必填,无 null 兜底)。
          ...stamp,
          learningId: input.learningId,
          rubricId: input.rubricId,
          status: "pending",
          proposedDimension: input.proposedDimension,
          rationale: input.rationale,
          adoptedVersionId: null,
          createdAt: deps.now(),
          adoptedAt: null,
        })
        .returning();
      return inserted[0]!;
      }));
    },

    async getRuleSuggestion(suggestionId) {
      const rows = await db
        .select()
        .from(calibrationRuleSuggestions)
        .where(
          and(
            eq(calibrationRuleSuggestions.userId, deps.userId),
            // [T-332 S2 · ISO-02] 号维度 strict 恒叠。
            workspaceFilter(calibrationRuleSuggestions, scope),
            eq(calibrationRuleSuggestions.id, suggestionId),
          ),
        );
      const row = rows[0];
      if (!row) {
        throw new OwnershipError(
          `OwnershipError: calibration rule suggestion not found: ${suggestionId}`,
        );
      }
      return row;
    },

    async listPendingRuleSuggestions({ limit, offset }) {
      // [T-332 S2 · ISO-02] 号维度 strict 恒叠(无「无号全量」退化)。
      const where = and(
        eq(calibrationRuleSuggestions.userId, deps.userId),
        workspaceFilter(calibrationRuleSuggestions, scope),
        eq(calibrationRuleSuggestions.status, "pending"),
      );
      const rows = await db
        .select()
        .from(calibrationRuleSuggestions)
        .where(where)
        .orderBy(desc(calibrationRuleSuggestions.createdAt))
        .limit(limit)
        .offset(offset);
      const all = await db
        .select({ id: calibrationRuleSuggestions.id })
        .from(calibrationRuleSuggestions)
        .where(where);
      return { rows, total: all.length };
    },

    async markRuleSuggestionAdopted(suggestionId, input) {
      return writeParent(suggestionParent,suggestionId,async tx=>{
      // SQL `status='pending'` guard backs the terminal invariant (a re-adopt of an
      // already-terminal suggestion matches 0 rows). The service enforces the state
      // machine + ownership on top.
      const updated = await tx
        .update(calibrationRuleSuggestions)
        .set({
          status: input.status,
          adoptedVersionId: input.adoptedVersionId,
          adoptedAt: deps.now(),
        })
        .where(
          and(
            eq(calibrationRuleSuggestions.userId, deps.userId),
            workspaceFilter(calibrationRuleSuggestions, scope),
            eq(calibrationRuleSuggestions.id, suggestionId),
            eq(calibrationRuleSuggestions.status, "pending"),
          ),
        )
        .returning();
      return updated[0]!;
      });
    },
  };
}
