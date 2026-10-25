import {setImmediate as yieldTurn} from 'node:timers/promises';
import {afterAll,afterEach,beforeAll,beforeEach,expect,it,vi} from 'vitest';
import {drizzle} from 'drizzle-orm/pglite';
import type {PGlite,Transaction} from '@electric-sql/pglite';
import {createDb,executionTasks,eq,type Db} from '@creatoros/backend';
import {createExecutionScheduledChildService} from './execution-scheduled-child.service';

const stamp='2026-10-24T00:00:00.000Z';
const secret='resource-fixture-private-value';
let db:Db,client:PGlite;
let transactionCount=0;
let beforeTransaction:(()=>Promise<void>)|undefined;
let read:((query:string,rows:unknown[])=>void)|undefined;
let queries:string[]=[];
beforeAll(async()=>{
 const opened=await createDb();client=opened.client;
 const query=client.query.bind(client);
 client.query=(async(...args:Parameters<PGlite['query']>)=>{
  const result=await query(...args);read?.(args[0],result.rows);return result;
 }) as PGlite['query'];
 const transaction=client.transaction.bind(client);
 client.transaction=(async callback=>transaction(async tx=>{
  const query=tx.query.bind(tx);
  tx.query=(async(...args:Parameters<Transaction['query']>)=>{
   const result=await query(...args);read?.(args[0],result.rows);return result;
  }) as Transaction['query'];
  return callback(tx);
 })) as PGlite['transaction'];
 db=drizzle(client,{logger:{logQuery(query){queries.push(query);}}}) as Db;
 const runTransaction=db.transaction.bind(db);
 db.transaction=(async(callback,...rest)=>{
  transactionCount++;await beforeTransaction?.();return runTransaction(callback,...rest);
 }) as Db['transaction'];
});
beforeEach(async()=>{
 beforeTransaction=undefined;read=undefined;await db.delete(executionTasks);
 transactionCount=0;queries=[];
});
afterEach(()=>{beforeTransaction=undefined;read=undefined;vi.restoreAllMocks();});
afterAll(async()=>{await client.close();});

async function pair(index:number,options:{bad?:boolean;large?:boolean;daily?:unknown;parentStatus?:string;key?:string}={}){
 const key=options.key??String(index).padStart(3,'0'),parentId=`p-${key}`,childId=`c-${key}`,jobId=`job-${key}`;
 const junk=options.large?{unrelated:secret+'x'.repeat(300_000)}:{};
 const payload={...junk,modelInput:{...junk,facets:{...junk,__dailyTopic:options.daily===undefined?JSON.stringify({jobId:options.bad?'other':jobId}):options.daily}},parentExecutionTaskId:parentId};
 await db.insert(executionTasks).values([
  {id:parentId,userId:'u',accountId:'a',groupId:'g',kind:'automation_sync',ownerType:'scheduled_job',ownerId:jobId,status:options.parentStatus??'blocked',idempotencyKey:parentId,payload:{...junk,__scheduledChild:{executionTaskId:childId}},checkpoint:junk,createdAt:stamp,updatedAt:stamp},
  {id:childId,userId:'u',accountId:'a',groupId:'g',kind:'ai_task',ownerType:'ai_task',ownerId:childId,status:'failed',idempotencyKey:childId,payload,checkpoint:junk,executionBudget:junk,costEstimate:junk,createdAt:stamp,updatedAt:stamp},
 ]);
 return {parentId,childId,jobId};
}

it('原SQL只返回关系和状态需要的数据，巨大无关payload/checkpoint不进入JS',async()=>{
 await pair(0,{large:true});queries=[];let exposed=false;
 read=(_query,rows)=>{if(JSON.stringify(rows).includes(secret))exposed=true;};
 const report=await createExecutionScheduledChildService(db).reconcile();
 expect(report).toMatchObject({failed:1,inconsistent:0});
 expect(exposed).toBe(false);
 const selects=queries.filter(query=>query.startsWith('select'));
 expect(selects.join('\n')).not.toMatch(/checkpoint|execution_budget|cost_estimate|idempotency_key/);
 expect(selects.filter(query=>query.includes('for update'))).toHaveLength(1);
});

it('32条keyset页完整处理跨页终态和坏条，并在下一页前让出事件循环',async()=>{
 for(let i=0;i<65;i++)await pair(i,{bad:i===0,parentStatus:'succeeded'});
 queries=[];let firstYieldAt:number|undefined,scheduled=false;const pageSizes:number[]=[];
 read=(query,rows)=>{if(query.includes("#> '{__scheduledChild,executionTaskId}'")&&!query.includes('for update'))pageSizes.push(rows.length);};
 beforeTransaction=async()=>{
  if(!scheduled){scheduled=true;void yieldTurn().then(()=>{firstYieldAt=transactionCount;});}
 };
 vi.spyOn(console,'error').mockImplementation(()=>{});
 const report=await createExecutionScheduledChildService(db).reconcile();await yieldTurn();
 expect(report).toEqual({succeeded:0,failed:64,pending:0,inconsistent:1});
 expect(firstYieldAt).toBeGreaterThan(0);expect(firstYieldAt).toBeLessThanOrEqual(32);
 const pageQueries=queries.filter(query=>query.startsWith('select')&&!query.includes('for update'));
 expect(pageQueries.length).toBeGreaterThanOrEqual(4);
 expect(pageQueries.every(query=>query.includes('limit'))).toBe(true);
 expect(pageSizes).toEqual([32,32,1]);
 const [last]=await db.select().from(executionTasks).where(eq(executionTasks.id,'p-064'));
 expect(last?.status).toBe('failed');
});

it('并发reconcile共享同一轮，完成后新一轮仍可再次纠正终态',async()=>{
 const f=await pair(0);const service=createExecutionScheduledChildService(db);
 const first=service.reconcile(),second=service.reconcile();await Promise.all([first,second]);
 expect(second).toBe(first);expect(transactionCount).toBe(1);
 await db.update(executionTasks).set({status:'succeeded'}).where(eq(executionTasks.id,f.childId));
 expect(await service.reconcile()).toMatchObject({succeeded:1});expect(transactionCount).toBe(2);
});

it('页中旧引用不能覆盖锁内发生的链接变更',async()=>{
 const f=await pair(0);let changed=false;
 beforeTransaction=async()=>{if(!changed){changed=true;await db.update(executionTasks).set({payload:{__scheduledChild:{executionTaskId:'replacement'}}}).where(eq(executionTasks.id,f.parentId));}};
 const error=vi.spyOn(console,'error').mockImplementation(()=>{});
 expect(await createExecutionScheduledChildService(db).reconcile()).toMatchObject({inconsistent:1,failed:0});
 const [parent]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.parentId));
 expect(parent?.status).toBe('blocked');
 expect(error.mock.calls).toEqual([['[scheduled-child]',{kind:'guard',reason:'link_changed'}]]);
});

it.each([null,'null','{bad',17,true,false,{jobId:'job-000'}])('daily JSON %j 保持原拒绝且不泄露内容',async daily=>{
 await pair(0,{daily});const error=vi.spyOn(console,'error').mockImplementation(()=>{});
 expect(await createExecutionScheduledChildService(db).reconcile()).toMatchObject({inconsistent:1,failed:0});
 expect(JSON.stringify(error.mock.calls)).not.toContain('p-000');
 expect(error.mock.calls[0]?.[1]).toMatchObject({kind:'guard'});
});

it('本轮固定maxID，但范围内新ID可进入后页，范围外留待下轮',async()=>{
 for(let i=0;i<33;i++)await pair(i);
 let inserted=false;
 beforeTransaction=async()=>{if(!inserted){inserted=true;await pair(100,{key:'031x'});await pair(999);}};
 expect(await createExecutionScheduledChildService(db).reconcile()).toEqual({succeeded:0,failed:34,pending:0,inconsistent:0});
 const parents=await db.select({id:executionTasks.id,status:executionTasks.status}).from(executionTasks);
 expect(parents.find(row=>row.id==='p-031x')?.status).toBe('failed');
 expect(parents.find(row=>row.id==='p-999')?.status).toBe('blocked');
});

it('锁内子任务已换组仍拒绝，不能用页外旧身份放行',async()=>{
 const f=await pair(0);let changed=false;
 beforeTransaction=async()=>{if(!changed){changed=true;await db.update(executionTasks).set({groupId:'foreign'}).where(eq(executionTasks.id,f.childId));}};
 const error=vi.spyOn(console,'error').mockImplementation(()=>{});
 expect(await createExecutionScheduledChildService(db).reconcile()).toMatchObject({inconsistent:1,failed:0});
 expect(error.mock.calls).toEqual([['[scheduled-child]',{kind:'guard',reason:'ownership_mismatch'}]]);
 const [parent]=await db.select({status:executionTasks.status}).from(executionTasks).where(eq(executionTasks.id,f.parentId));
 expect(parent?.status).toBe('blocked');
});

it.each(['sql','unknown'] as const)('驱动最终%s错误不冒充关系异常，安全分类且坏条不饿死后续',async kind=>{
 await pair(0);await pair(1);
 const error=vi.spyOn(console,'error').mockImplementation(()=>{});
 const cause=kind==='sql'?Object.assign(new Error(secret),{code:'23514'}):new Error(secret);
 const failure=new Error(secret,{cause});let failed=false;
 beforeTransaction=async()=>{if(!failed){failed=true;throw failure;}};
 expect(await createExecutionScheduledChildService(db).reconcile()).toMatchObject({failed:1,inconsistent:1});
 expect(error.mock.calls).toEqual([['[scheduled-child]',kind==='sql'?{kind:'sql',code:'23514'}:{kind:'unknown'}]]);
 expect(JSON.stringify(error.mock.calls)).not.toContain(secret);
});

it('扫描异常同飞失败，释放后下一轮仍能正常执行',async()=>{
 await pair(0);const service=createExecutionScheduledChildService(db);const failure=new Error(secret);
 read=()=>{throw failure;};
 const first=service.reconcile(),second=service.reconcile();
 const results=await Promise.allSettled([first,second]);
 expect(second).toBe(first);expect(results).toEqual([{status:'rejected',reason:failure},{status:'rejected',reason:failure}]);
 read=undefined;
 expect(await service.reconcile()).toMatchObject({failed:1,inconsistent:0});
});

it('flywheel原分支只使用冻结job来源，不解析其无关非法daily字段',async()=>{
 const f=await pair(0);
 await db.update(executionTasks).set({payload:{parentExecutionTaskId:f.parentId,modelInput:{kind:'scheduled.flywheel',sourceKind:'self.metrics',jobId:f.jobId,facets:{__dailyTopic:'{bad'}}}}).where(eq(executionTasks.id,f.childId));
 expect(await createExecutionScheduledChildService(db).reconcile()).toMatchObject({failed:1,inconsistent:0});
});

it('原payload JSON null保留未知错误语义，不被窄投影造为有效来源',async()=>{
 const f=await pair(0);await client.query('update execution_tasks set payload = $1::jsonb where id = $2',['null',f.childId]);
 const error=vi.spyOn(console,'error').mockImplementation(()=>{});
 expect(await createExecutionScheduledChildService(db).reconcile()).toMatchObject({failed:0,inconsistent:1});
 expect(error.mock.calls).toEqual([['[scheduled-child]',{kind:'unknown'}]]);
});
