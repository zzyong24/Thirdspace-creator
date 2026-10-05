import type {Db} from '../db';
import type {RequestContext} from '@creatoros/contract';
import {projects,contentOutputs} from '../schema/projects';
/** 历史单测也使用真实parent；不放宽生产guard或越权断言。 */
export async function seedAdjacentContent(db:Db,ctx:RequestContext,outputIds:readonly string[],projectId=`fixture-project-${ctx.userId}-${ctx.accountId??ctx.groupId}`){
 const at='2026-06-21T00:00:00.000Z';
 await db.insert(projects).values({id:projectId,userId:ctx.userId,accountId:ctx.accountId??null,groupId:ctx.groupId??null,title:'真实测试父项目',creationMode:'free',status:'active',currentStage:'script',startedAt:at,createdAt:at,updatedAt:at}).onConflictDoNothing();
 if(outputIds.length)await db.insert(contentOutputs).values(outputIds.map(id=>({id,projectId,title:'真实测试稿件',contentType:'video',status:'draft',createdAt:at,updatedAt:at}))).onConflictDoNothing();
}
