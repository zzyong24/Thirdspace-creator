import {sql,type Db} from '@creatoros/backend';
import {createHash} from 'node:crypto';
import type {RequestContext} from '@creatoros/contract';
import {redfoxObservationSchema} from '@creatoros/contract/execution-worker';
export const REDFOX_SUBMISSIONS_DDL=`CREATE TABLE IF NOT EXISTS redfox_submissions (user_id text NOT NULL, input_hash text NOT NULL, fingerprint text NOT NULL, call_id text NOT NULL, task_id text, observation jsonb, PRIMARY KEY(user_id,input_hash));`;
/** SEMANTIC_BOUNDARY_ALLOW: 精确URL哈希仅作付费提交幂等，不比较作品内容或决定创作。 */
export function createRedfoxSubmissions(db:Db){
 const hash=(url:string)=>createHash('sha256').update(url).digest('hex');
 return {
 async claim(ctx:RequestContext,url:string,fingerprint:string,callId:string){
  const digest=hash(url);const result=await db.execute(sql`insert into redfox_submissions(user_id,input_hash,fingerprint,call_id) values(${ctx.userId},${digest},${fingerprint},${callId}) on conflict do nothing returning call_id`);
  if(result.rows.length)return {claimed:true as const};
  const found=await db.execute(sql`select observation,fingerprint from redfox_submissions where user_id=${ctx.userId} and input_hash=${digest}`);const row=found.rows[0] as {observation:unknown;fingerprint:string}|undefined;
  if(row && row.fingerprint!==fingerprint)return {claimed:false as const,observation:{status:"error" as const,code:"REDFOX_TASK_OR_CREDENTIAL_MISMATCH"}};
  return {claimed:false as const,observation:row?.observation?redfoxObservationSchema.parse(row.observation):{status:'unknown' as const,code:'REDFOX_SUBMIT_UNKNOWN'}};
 },
 async settle(ctx:RequestContext,callId:string,observation:unknown){
  const parsed=redfoxObservationSchema.parse(observation);
  if(parsed.status==="error"){await db.execute(sql`delete from redfox_submissions where user_id=${ctx.userId} and call_id=${callId}`);return;}
  const data=parsed.data as {taskId?:unknown}|undefined;
  const taskId=typeof data?.taskId==='string'?data.taskId:null;
  await db.execute(sql`update redfox_submissions set observation=${JSON.stringify(parsed)}::jsonb,task_id=${taskId} where user_id=${ctx.userId} and call_id=${callId}`);
 },
 async canRead(ctx:RequestContext,taskId:string,fingerprint:string){const found=await db.execute(sql`select task_id from redfox_submissions where user_id=${ctx.userId} and task_id=${taskId} and fingerprint=${fingerprint}`);return found.rows.length>0;},
 };
}
