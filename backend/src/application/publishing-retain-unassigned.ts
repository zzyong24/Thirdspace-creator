import {createHash} from 'node:crypto';
import type {Db} from '../db';
import {createMembershipLockService} from '../modules/platform-account';
import {createArtifactsService} from '../modules/artifacts';
import {createProjectsService,createProjectRepository} from '../modules/projects';
import type {RequestContext} from '@creatoros/contract';
import type {AdoptPublicationDraftInput} from '../modules/publishing/publication-draft-adoption.service';

/** 已采纳但未选号的平台物料留在当前创作组，完整候选与回执由Artifacts保存。 */
export function createUnassignedDraftRetainer(ports:{db:Db;now:()=>string;nextId:(prefix:string)=>string}){
 return (ctx:RequestContext,input:AdoptPublicationDraftInput)=>ports.db.transaction(async tx=>{
  await createMembershipLockService(ports.db).lock(tx,ctx);
  const projects=createProjectsService(createProjectRepository(tx as unknown as Db),{now:ports.now,nextId:ports.nextId});
  const output=await projects.getOutput(ctx,input.outputId);
  // SEMANTIC_BOUNDARY_ALLOW: 摘要仅生成稳定资源ID及校验重复采纳，不判断内容或平台适配。
  const id='artifact-platform-material-'+createHash('sha256').update(JSON.stringify([ctx.userId,ctx.groupId,input.outputId,input.platform])).digest('hex');
  const artifacts=createArtifactsService({db:tx as unknown as Db,now:ports.now,nextId:prefix=>prefix==='artifact'?id:ports.nextId(prefix),assertProjectOwned:(c,p)=>projects.listOutputIdsByProject(c,p),resolveOutputProjectId:(c,o)=>projects.getProjectIdByOutput(c,o)});
  try{await artifacts.getArtifact(ctx,id);}catch(error){if(!(error&&typeof error==='object'&&'code' in error&&error.code==='OwnershipError'))throw error;await artifacts.createArtifact(ctx,{projectId:output.projectId,contentOutputId:output.id,title:input.title,artifactType:'platform_copy',stage:'publishing'});}
  return artifacts.createVersion(ctx,id,{contentText:input.description,contentData:{...input,needsTarget:true},changeSummary:'已采纳平台物料，待选择真实账号',createdByType:'user',adoptionKey:input.adoptionKey,adoptionSourceDigest:'sha256:'+createHash('sha256').update(JSON.stringify(input)).digest('hex')});
 });
}
