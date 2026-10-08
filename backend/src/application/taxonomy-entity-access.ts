import type { RequestContext, TagEntityType } from '@creatoros/contract';
import type { Db } from '../db';
import { projects } from '../schema/projects';
import { artifacts } from '../schema/artifacts';
import { assets } from '../schema/assets';
import { knowledgeItems } from '../schema/knowledge';
import { learnings } from '../schema/learnings';
import { publications } from '../schema/publishing';
import { withWorkspaceParentWrite, type WorkspaceWriteParent } from '../workspace-write';
import type { TaxonomyEntityAccess } from '../modules/taxonomy/taxonomy.service';

const parent = (table: typeof projects | typeof assets | typeof knowledgeItems | typeof learnings | typeof publications): WorkspaceWriteParent => ({table,id:table.id,userId:table.userId,groupId:table.groupId,accountId:table.accountId});
// SEMANTIC_BOUNDARY_ALLOW: 六种契约entityType只选择真实表与父外键，不按名称或正文推断内容归属。
const parents: Record<TagEntityType, WorkspaceWriteParent> = {
  project: parent(projects),
  artifact: {...parent(projects),via:[{table:artifacts,id:artifacts.id,parentId:artifacts.projectId,userId:artifacts.userId,scope:{groupId:artifacts.groupId,accountId:artifacts.accountId}}]},
  asset: parent(assets),
  knowledge: parent(knowledgeItems),
  learning: parent(learnings),
  publication: parent(publications),
};

/** 读复用各实体公开服务（包含资源grant），写在调用方事务中锁真实owner父链。 */
export function createTaxonomyEntityAccess(db: Db, readers: Record<TagEntityType,(ctx:RequestContext,id:string)=>Promise<unknown>>): TaxonomyEntityAccess {
  return {
    assertEntityReadable: (ctx,type,id) => readers[type](ctx,id),
    async assertEntityWritable(ctx,type,id,transaction) {
      return withWorkspaceParentWrite(transaction ?? db,ctx,parents[type],[id],async()=>undefined);
    },
  };
}
