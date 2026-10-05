import {workspaceKey} from '@creatoros/backend';
import {sql,type Db} from '@creatoros/backend';
/** 候选新增与每日补足共用事务互斥；只落实账号范围，不进行语义判断。 */
export async function lockCandidateSupply(tx:Parameters<Parameters<Db['transaction']>[0]>[0],scope:{userId:string;accountId?:string|null;groupId?:string|null}){
 if(!scope.userId)throw new Error('候选供给缺少属主');const workspace=workspaceKey(scope);
 await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify(['candidate-supply',scope.userId,workspace.kind,workspace.id])},0))`);
}
