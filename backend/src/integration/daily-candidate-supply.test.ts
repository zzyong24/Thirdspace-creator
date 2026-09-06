import {afterAll,beforeAll,it,expect} from 'vitest';
import {createDb,candidates,platformAccounts,type Db} from '@creatoros/backend';
import {countCandidatesForDay} from '../modules/candidate/candidate.service';
import {lockAccountForSupply} from '../modules/platform-account/platform-account.service';
let db:Db,close:()=>Promise<void>;
const ctx={userId:'daily-u',accountId:'daily-a',requestId:'test',source:'user' as const};
beforeAll(async()=>{const c=await createDb();db=c.db;close=()=>c.client.close();});
afterAll(async()=>close?.());
it('真实日供给超过1000仍完整计数，并按账号/UTC日隔离',async()=>{
 await db.insert(candidates).values(Array.from({length:1002},(_,i)=>({id:`daily-c-${i}`,userId:ctx.userId,accountId:ctx.accountId,title:'真实候选',angle:'',source:'idea',createdAt:'2026-09-05T12:00:00.000Z',updatedAt:'2026-09-05T12:00:00.000Z'})));
 await db.insert(candidates).values([{id:'daily-other-day',userId:ctx.userId,accountId:ctx.accountId,title:'昨日',angle:'',source:'idea',createdAt:'2026-09-04T23:59:59.000Z',updatedAt:'2026-09-04T23:59:59.000Z'},{id:'daily-other-account',userId:ctx.userId,accountId:'other',title:'他号',angle:'',source:'idea',createdAt:'2026-09-05T00:00:00.000Z',updatedAt:'2026-09-05T00:00:00.000Z'}]);
 expect(await countCandidatesForDay(db,ctx,'2026-09-05')).toBe(1002);
 expect(await countCandidatesForDay(db,ctx,'2026-09-06')).toBe(0);
 await expect(countCandidatesForDay(db,ctx,'2026-02-31')).rejects.toThrow();
});
it('账号供给锁只允许真实属主且必须在提交事务内使用',async()=>{
 await db.insert(platformAccounts).values({id:ctx.accountId,userId:ctx.userId,platform:'douyin',accountHandle:'daily',createdAt:'2026-09-05T00:00:00.000Z',updatedAt:'2026-09-05T00:00:00.000Z'});
 await db.transaction(async tx=>{await lockAccountForSupply(tx,ctx);await expect(lockAccountForSupply(tx,{...ctx,userId:'other'})).rejects.toThrow();});
});
