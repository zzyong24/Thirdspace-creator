import {sql,type Db} from '@creatoros/backend';
/** 候选新增与每日补足共用事务互斥；只落实账号范围，不进行语义判断。 */
export async function lockCandidateSupply(tx:Parameters<Parameters<Db['transaction']>[0]>[0],scope:{userId:string;accountId:string}){
 if(!scope.userId||!scope.accountId)throw new Error('候选供给缺少属主');
 await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify(['candidate-supply',scope.userId,scope.accountId])},0))`);
}
