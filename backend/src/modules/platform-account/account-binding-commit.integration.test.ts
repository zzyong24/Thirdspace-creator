import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createDb,type Db} from '@creatoros/backend';
import type {RequestContext} from '@creatoros/contract';
import {createAccountGroupService} from './account-group.service';
import {createPlatformAccountService} from './platform-account.service';
import * as binding from './account-binding-commit';
let store:Awaited<ReturnType<typeof createDb>>,ctx:RequestContext,seq=0;
const now=()=>new Date().toISOString(),nextId=(prefix:string)=>`${prefix}-commit-${++seq}`;
beforeEach(async()=>{store=await createDb();const group=await createAccountGroupService({db:store.db,now,nextId}).create({userId:'commit-user',requestId:'test',source:'user'},{name:'目标',idempotencyKey:'group'});ctx={userId:'commit-user',requestId:'test',source:'user',accountId:null,groupId:group.id};});
afterEach(async()=>{await store?.client.close();});
const identity={externalAccountId:'stable-platform-id',accountHandle:'真实身份'};
const signal=new AbortController().signal;
it('事务外只预留ID，最终事务登记同一真实账号和成员',async()=>{
 const plan=await binding.createAccountBindingPreparer({db:store.db,now,nextId})(ctx,identity);
 const groups=createAccountGroupService({db:store.db,now,nextId});expect((await groups.get(ctx,ctx.groupId!)).members).toHaveLength(0);
 const prepareProfile=vi.fn(async()=>({rollbackProfile:async()=>{},finalizeProfile:async()=>{}}));
 const commit=binding.createAccountBindingCommitter({now,nextId,prepareProfile});
 const result=await store.db.transaction(tx=>commit(ctx,{stagingKey:'stage',identity,signal,prepared:plan},tx));
 expect(result.accountId).toBe(plan.accountId);expect((await groups.get(ctx,ctx.groupId!)).members[0]?.accountId).toBe(plan.accountId);expect(prepareProfile).toHaveBeenCalledOnce();
});
it('预留后相同平台ID被其它真实账号注册，拒绝旧计划且不搬目录',async()=>{
 const plan=await binding.createAccountBindingPreparer({db:store.db,now,nextId})(ctx,identity);
 await createPlatformAccountService({db:store.db,now,nextId}).createAccount(ctx,{platform:'douyin',...identity});
 const prepareProfile=vi.fn(async()=>({rollbackProfile:async()=>{},finalizeProfile:async()=>{}}));
 await expect(store.db.transaction(tx=>binding.createAccountBindingCommitter({now,nextId,prepareProfile})(ctx,{stagingKey:'stage',identity,signal,prepared:plan},tx))).rejects.toThrow('身份归属已改变');expect(prepareProfile).not.toHaveBeenCalled();
});
it('真实账号只在原组更新；其它组的同一平台ID不能暗中转组',async()=>{
 const service=createPlatformAccountService({db:store.db,now,nextId});const account=await service.createAccount(ctx,{platform:'douyin',...identity});
 const plan=await binding.createAccountBindingPreparer({db:store.db,now,nextId})(ctx,identity);expect(plan).toMatchObject({accountId:account.id,existing:true});
 const other=await createAccountGroupService({db:store.db,now,nextId}).create(ctx,{name:'其它',idempotencyKey:'other'});
 await expect(binding.createAccountBindingPreparer({db:store.db,now,nextId})({...ctx,groupId:other.id},identity)).rejects.toThrow('请先明确转组');
});
