import {afterAll, beforeAll, expect, it} from 'vitest';
import {createDb} from '@creatoros/backend';
import {createClient, ENDPOINTS, requestListWithMeta, type RequestContext} from '@creatoros/contract';
import {createReviewGateService} from './review-gate.service';
import {createReviewGateTransport} from './review-gate.transport';
import {accountGroups} from '../../schema/account-groups';

const ctx:RequestContext={userId:'review-contract-user',groupId:'review-contract-group',requestId:'review-contract',source:'user'};
let opened:Awaited<ReturnType<typeof createDb>>;
let service:ReturnType<typeof createReviewGateService>;
let transport:ReturnType<typeof createReviewGateTransport>;
beforeAll(async()=>{
 opened=await createDb();let seq=0;
 await opened.db.insert(accountGroups).values([{id:ctx.groupId!,userId:ctx.userId,name:'合成主组',status:'active',version:1,createdAt:'2026-10-25T00:00:00.000Z',updatedAt:'2026-10-25T00:00:00.000Z'},{id:'review-contract-other',userId:'other-user',name:'合成其他组',status:'active',version:1,createdAt:'2026-10-25T00:00:00.000Z',updatedAt:'2026-10-25T00:00:00.000Z'}]);
 service=createReviewGateService({db:opened.db,now:()=> '2026-10-25T00:00:00.000Z',nextId:p=>`${p}-${++seq}`,ai:{createTask:async()=>{throw Error('此规则列表回归不调用模型');}},script:{getCurrentScriptRef:async()=>{throw Error('此规则列表回归不读取稿件');}}});
 transport=createReviewGateTransport(()=>service);
});
afterAll(async()=>{await opened?.client.close();});

it('无query的公开规则列表，空库也具有合法列表meta而不被client拒绝',async()=>{
 const client=createClient(ENDPOINTS,transport,ctx);
 await expect(client.listReviewRules({params:undefined,query:undefined,body:undefined})).resolves.toEqual([]);
 const envelope=await requestListWithMeta(transport,ENDPOINTS.listReviewRules,{params:undefined,query:undefined,body:undefined},ctx);
 expect(envelope.meta).toEqual({requestId:ctx.requestId,page:1,pageSize:1,total:0});
});

it('完整列表保留真实规则、隔离用户且meta准确描述本页',async()=>{
 const rule=await service.createRule(ctx,{tier:'empirical',category:'合成规则',matchType:'word',pattern:'合成表达'});
 const second=await service.createRule(ctx,{tier:'empirical',category:'合成规则',matchType:'word',pattern:'第二条表达'});
 await service.createRule({...ctx,userId:'other-user',groupId:'review-contract-other'},{tier:'empirical',category:'其他用户规则',matchType:'word',pattern:'不可泄漏'});
 const envelope=await requestListWithMeta(transport,ENDPOINTS.listReviewRules,{params:undefined,query:undefined,body:undefined},ctx);
 expect(envelope.data).toEqual(expect.arrayContaining([rule,second]));
 expect(envelope.data).toHaveLength(2);
 expect(envelope.meta).toEqual({requestId:ctx.requestId,page:1,pageSize:2,total:2});
});
