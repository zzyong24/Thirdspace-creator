import {createHash} from 'node:crypto';
import {and,eq,sql} from 'drizzle-orm';
import {projectSourceReference,type ProjectSource,type ProjectSourceReference,type RequestContext} from '@creatoros/contract';
import type {Db} from '../../db';
import {ConflictError} from '../../errors';
import {createProjectPreparationStateService} from '../execution/project-preparation-state.service';
import {workspaceKey} from '../../workspace-scope';
import {projects,projectIntakes,projectSourceReferences} from './projects.db-schema';
import {createProjectRepository,type ProjectRow} from './projects.repository';
import {createProjectsService,type CreateProjectCommand,type ServiceDeps} from './projects.service';

export type IntakeTransaction=Parameters<Parameters<Db['transaction']>[0]>[0];
type RawInput<T> = T extends ProjectSourceReference ? Omit<T,'id'|'projectId'|'createdAt'|'updatedAt'> : never;
export type ProjectIntakeReference=RawInput<ProjectSourceReference>;
export interface ProjectIntakeResolution {
 preparationReviewOnly?:boolean;
 positioningVersionId?:string|null;
 command:CreateProjectCommand;
 references:ProjectIntakeReference[];
 existingProjects?:Array<{projectId:string;required:boolean;itemId?:string}>;
 commitRelations?:(projectId:string)=>Promise<unknown>;
}
export interface ProjectIntakeResult {project:ProjectRow;preparationTaskId:string|null;sourceReferences:ProjectSourceReference[];reused:boolean}
/** 后续准备父任务必须在同一 tx 预约。缺省不预约、不制造运行状态或任务 ID。 */
export interface ProjectPreparationReservationPort {
 reserve(ctx:RequestContext,input:{project:ProjectRow;sourceReferences:ProjectSourceReference[];source:ProjectSource;intakeId:string;positioningVersionId?:string|null},tx:IntakeTransaction):Promise<string|null>;
}
export interface ProjectIntakeCommand {
 source:ProjectSource;
 intakeKey:string;
 request:unknown;
 resolve(tx:IntakeTransaction,previousReferences:ProjectSourceReference[]):Promise<ProjectIntakeResolution>;
}
function canonical(value:unknown):unknown {
 if(Array.isArray(value))return value.map(canonical);
 if(value!==null&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)]));
 return value;
}
/** SEMANTIC_BOUNDARY_ALLOW: 仅按真实身份和规范 JSON 判断幂等/冲突，不去重标题、不做语义选择。 */
export function projectIntakeDigest(value:unknown){return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');}
export function projectIntakeId(ctx:RequestContext,source:ProjectSource,key:string){const scope=workspaceKey(ctx);return `project-intake-${projectIntakeDigest([ctx.userId,scope.kind,scope.id,source,key]).slice(0,32)}`;}
function toReference(row:typeof projectSourceReferences.$inferSelect):ProjectSourceReference {
 const common={id:row.id,projectId:row.projectId,sourceKey:row.sourceKey,sourceKind:row.sourceKind,url:row.url,bodyAvailable:row.bodyAvailable,sourceDigest:row.sourceDigest,transcriptHash:row.transcriptHash,createdAt:row.createdAt,updatedAt:row.updatedAt};
 return projectSourceReference.parse(row.sourceKind==='intelligence_item'?{...common,itemId:row.itemId,snapshotId:row.snapshotId}:{...common,accountId:row.accountId,platform:row.platform,externalId:row.externalId});
}
function hasItemEvidence(project:ProjectRow,itemId:string,raw:ProjectSourceReference[]){
 const brief=project.briefDetail as {contentRadarEvidence?:{sourceReferences?:Array<{intelligenceItemId?:string}>}}|null;
 return raw.some(r=>r.sourceKind==='intelligence_item'&&r.itemId===itemId)||brief?.contentRadarEvidence?.sourceReferences?.some(r=>r.intelligenceItemId===itemId)===true;
}

/** 项目模块只持有自身表；跨域归属、来源和关系写入由 application 的同事务 service ports 提供。 */
export function createProjectIntakeService(db:Db,deps:ServiceDeps,ports:{lockWorkspace(ctx:RequestContext,tx:IntakeTransaction):Promise<unknown>;preparation?:ProjectPreparationReservationPort}){
 return {
  async ensure(ctx:RequestContext,command:ProjectIntakeCommand):Promise<ProjectIntakeResult>{
   const scope=workspaceKey(ctx);
   if(!ctx.userId||!command.intakeKey.trim())throw new ConflictError('项目入口缺少真实用户或稳定动作键');
   const projectId=projectIntakeId(ctx,command.source,command.intakeKey),digest=projectIntakeDigest(command.request);
   return db.transaction(async tx=>{
    await ports.lockWorkspace(ctx,tx);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${projectId},0))`);
    const store=tx as unknown as Db,repo=createProjectRepository(store);
    const [receipt]=await tx.select().from(projectIntakes).where(and(eq(projectIntakes.userId,ctx.userId),eq(projectIntakes.scopeKind,scope.kind),eq(projectIntakes.scopeId,scope.id),eq(projectIntakes.source,command.source),eq(projectIntakes.intakeKey,command.intakeKey))).for('update');
    if(receipt&&receipt.requestDigest!==digest)throw new ConflictError('同一入口幂等键的输入不一致，请使用新的明确动作');
    const readReferences=async(id:string)=>(await tx.select().from(projectSourceReferences).where(eq(projectSourceReferences.projectId,id)).orderBy(projectSourceReferences.id)).map(toReference);
    // 任何重放仍核当前项目/来源归属；删除后不能把原身份复活成新项目。
    const original=receipt?await repo.get(ctx,receipt.projectId,true):null;
    const previous=original?await readReferences(original.id):[];
    const resolved=await command.resolve(tx,previous);
    if(receipt&&original){
     // 重核本入口要求的固定来源；同项目后来合法追加的其它来源不构成请求篡改。
     for(const ref of resolved.references){
      const prior=previous.find(r=>r.sourceKey===ref.sourceKey);
      if(!prior||prior.sourceKind!==ref.sourceKind||(ref.sourceKind==='intelligence_item'&&prior.sourceKind==='intelligence_item'&&(ref.itemId!==prior.itemId||ref.snapshotId!==prior.snapshotId))||(ref.sourceKind==='platform_work'&&prior.sourceKind==='platform_work'&&(ref.accountId!==prior.accountId||ref.platform!==prior.platform||ref.externalId!==prior.externalId)))throw new ConflictError('原项目来源关联已改变，请核对原记录');
     }
     return {project:original,preparationTaskId:(await createProjectPreparationStateService(store).latest(ctx,original.id))?.id??receipt.preparationTaskId??null,sourceReferences:previous,reused:true};
    }
    let existing:ProjectRow|null=null;
    for(const pointer of resolved.existingProjects??[]){
     const [found]=await tx.select({id:projects.id}).from(projects).where(eq(projects.id,pointer.projectId)).for('update');
     if(!found){if(pointer.required)throw new ConflictError('原项目关联已失效，不能另建项目替代');continue;}
     const row=await repo.get(ctx,found.id,true);
     if(pointer.itemId&&!hasItemEvidence(row,pointer.itemId,await readReferences(row.id)))throw new ConflictError('原项目与雷达作品的真实来源关联冲突');
     if(existing&&existing.id!==row.id)throw new ConflictError('来源对应多个原项目，请核对既有记录');
     existing=row;
    }
    const [collision]=!existing?await tx.select({id:projects.id}).from(projects).where(eq(projects.id,projectId)):[];
    if(collision)throw new ConflictError('入口项目身份已有记录但缺少回执，请核对原记录');
    const project=existing??await createProjectsService(repo,{now:deps.now,nextId:prefix=>prefix==='project'?projectId:deps.nextId(prefix)}).createProject(ctx,{...resolved.command,source:command.source});
    const ts=deps.now();
    for(const ref of resolved.references){
     const id=`project-source-${projectIntakeDigest([project.id,ref.sourceKey]).slice(0,32)}`;
     const row={...ref,id,projectId:project.id,createdAt:ts,updatedAt:ts};
     const [saved]=await tx.insert(projectSourceReferences).values(row).onConflictDoNothing({target:[projectSourceReferences.projectId,projectSourceReferences.sourceKey]}).returning();
     if(!saved){const [prior]=await tx.select().from(projectSourceReferences).where(and(eq(projectSourceReferences.projectId,project.id),eq(projectSourceReferences.sourceKey,ref.sourceKey)));const parsed=toReference(prior!);if(parsed.sourceKind!==ref.sourceKind||(parsed.sourceKind==='intelligence_item'&&ref.sourceKind==='intelligence_item'&&(parsed.itemId!==ref.itemId||parsed.snapshotId!==ref.snapshotId)))throw new ConflictError('原始来源版本冲突');}
    }
    await resolved.commitRelations?.(project.id);
    const refs=await readReferences(project.id),intakeId=`intake-${projectId.slice('project-intake-'.length)}`;
    const preparationTaskId=existing&&!resolved.preparationReviewOnly?(await createProjectPreparationStateService(store).latest(ctx,project.id))?.id??null:ports.preparation?await ports.preparation.reserve(ctx,{project,sourceReferences:refs,source:command.source,intakeId,positioningVersionId:resolved.positioningVersionId??null},tx):null;
    await tx.insert(projectIntakes).values({id:intakeId,userId:ctx.userId,scopeKind:scope.kind,scopeId:scope.id,source:command.source,intakeKey:command.intakeKey,requestDigest:digest,projectId:project.id,preparationTaskId,createdAt:ts,updatedAt:ts});
    return {project,preparationTaskId,sourceReferences:refs,reused:existing!==null};
   });
  },
 };
}

// SEMANTIC_BOUNDARY_ALLOW: 保留内部来源工件ID只编码真实intake身份，不根据正文挑选素材。
const importedArtifactId=(intakeId:string)=>`project-imported-source-${projectIntakeDigest(intakeId)}`;
const importedTextHash=(text:string)=>`sha256:${createHash('sha256').update(text).digest('hex')}`;
/** 仅可信导入组合在同一事务调用；v1 是本次采集事实，不随项目资料或工件当前版本改变。 */
export async function saveImportedProjectText(db:Db,deps:ServiceDeps,ctx:RequestContext,input:{intakeId:string;projectId:string;reference:ProjectSourceReference;contentText:string}){
 if(typeof (db as unknown as {rollback?:unknown}).rollback!=='function'||ctx.source!=='ingestion'||input.reference.sourceKind!=='platform_work'||input.reference.projectId!==input.projectId)throw new ConflictError('导入正文缺少真实事务和来源');
 const {createArtifactsService}=await import('../artifacts/artifacts.service');
 const artifacts=createArtifactsService({db,...deps,nextId:prefix=>prefix==='artifact'?importedArtifactId(input.intakeId):deps.nextId(prefix),assertProjectOwned:(c,id)=>createProjectRepository(db).get(c,id)});
 if((await artifacts.listProjectArtifacts(ctx,input.projectId)).some(a=>a.id===importedArtifactId(input.intakeId))){await readImportedProjectText(db,deps,ctx,input.intakeId);return;}
 await artifacts.createArtifact(ctx,{projectId:input.projectId,title:'采集原始正文',artifactType:'output_script',stage:'script',initialContentText:input.contentText,initialContentData:{purpose:'project_preparation_source',source:'imported_text',skipMasterScript:true,intakeId:input.intakeId,projectId:input.projectId,referenceId:input.reference.id,accountId:input.reference.accountId,platform:input.reference.platform,externalId:input.reference.externalId,contentHash:importedTextHash(input.contentText)}});
 await db.update(projectSourceReferences).set({bodyAvailable:true,updatedAt:deps.now()}).where(eq(projectSourceReferences.id,input.reference.id));
}
export async function readImportedProjectText(db:Db,deps:ServiceDeps,ctx:RequestContext,intakeId:string){
 const scope=workspaceKey(ctx),[receipt]=await db.select().from(projectIntakes).where(and(eq(projectIntakes.id,intakeId),eq(projectIntakes.userId,ctx.userId),eq(projectIntakes.scopeKind,scope.kind),eq(projectIntakes.scopeId,scope.id),eq(projectIntakes.source,'imported')));
 if(!receipt)throw new ConflictError('原始导入回执不存在或归属已变化');
 await createProjectRepository(db).get(ctx,receipt.projectId);
 const {createArtifactsService}=await import('../artifacts/artifacts.service');
 const artifacts=createArtifactsService({db,...deps,assertProjectOwned:(c,id)=>createProjectRepository(db).get(c,id)}),artifact=await artifacts.getArtifact(ctx,importedArtifactId(intakeId));
 const version=(await artifacts.listVersions(ctx,artifact.id)).find(row=>row.versionNumber===1),data=version?.contentData as Record<string,unknown>|undefined;
 const [ref]=await db.select().from(projectSourceReferences).where(and(eq(projectSourceReferences.id,typeof data?.referenceId==='string'?data.referenceId:''),eq(projectSourceReferences.projectId,receipt.projectId)));
 if(artifact.projectId!==receipt.projectId||!version||!ref||ref.sourceKind!=='platform_work'||data?.purpose!=='project_preparation_source'||data.source!=='imported_text'||data.intakeId!==receipt.id||data.projectId!==receipt.projectId||data.accountId!==ref.accountId||data.platform!==ref.platform||data.externalId!==ref.externalId||data.contentHash!==importedTextHash(version.contentText))throw new ConflictError('原始导入正文版本或来源身份不符');
 return {projectId:receipt.projectId,contentText:version.contentText,contentHash:importedTextHash(version.contentText)};
}
export async function findImportedProjectText(db:Db,deps:ServiceDeps,ctx:RequestContext,projectId:string){
 const scope=workspaceKey(ctx);await createProjectRepository(db).get(ctx,projectId);
 const receipts=await db.select().from(projectIntakes).where(and(eq(projectIntakes.projectId,projectId),eq(projectIntakes.userId,ctx.userId),eq(projectIntakes.scopeKind,scope.kind),eq(projectIntakes.scopeId,scope.id),eq(projectIntakes.source,'imported')));
 const {createArtifactsService}=await import('../artifacts/artifacts.service');
 const artifacts=await createArtifactsService({db,...deps,assertProjectOwned:(c,id)=>createProjectRepository(db).get(c,id)}).listProjectArtifacts(ctx,projectId);
 const available=receipts.filter(row=>artifacts.some(a=>a.id===importedArtifactId(row.id)));
 if(!available.length)return null;if(available.length!==1)throw new ConflictError('存在多份导入正文，请明确本次来源');
 return {intakeId:available[0]!.id,...await readImportedProjectText(db,deps,ctx,available[0]!.id)};
}
