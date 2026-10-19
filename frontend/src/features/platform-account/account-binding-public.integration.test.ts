// @vitest-environment node
import {expect,it} from 'vitest';
import {createDb} from '@creatoros/backend';
import {ENDPOINTS,createClient,type RequestContext} from '@creatoros/contract';
import {createAccountGroupService,createPlatformAccountService,createAccountBindingService,createAccountBindingTransport,createAccountBindingPreparer,createAccountBindingCommitter,type AccountBindingStagePort,type AccountBindingPreparedPlan} from '@creatoros/backend/modules/platform-account';

it('T1345 public start/status真实持久六run、同平台连续与五平台、丢回执同key重读不重复宿主',async()=>{
 const store=await createDb();let seq=0,identitySeq=0,hostCalls=0;const now=()=>new Date().toISOString(),nextId=(prefix:string)=>prefix==='grp'?'g':`${prefix}-public-${++seq}`;
 const deps={db:store.db,now,nextId},ctx:RequestContext={userId:'u',requestId:'public-ui-binding',source:'user',accountId:null,groupId:'g'};
 const groups=createAccountGroupService(deps),accounts=createPlatformAccountService(deps);
 await groups.create({...ctx,groupId:null},{name:'受控绑定组',idempotencyKey:'public-group'});
 const makeStage=(platform:string):AccountBindingStagePort=>{
  const prepare=createAccountBindingPreparer({...deps,platform}),plans=new Map<string,AccountBindingPreparedPlan>();
  const commit=createAccountBindingCommitter({now,nextId,platform,prepareProfile:async()=>({rollbackProfile:async()=>{},finalizeProfile:async()=>{}})});
  return {createStaging:async()=>({stagingKey:`controlled-host-${++identitySeq}`}),login:async()=>{hostCalls++;return true;},identity:async()=>({externalAccountId:`controlled-identity-${platform}-${identitySeq}`,accountHandle:`受控${platform}账号${identitySeq}`}),discard:async()=>{},prepareCommit:async(c,input)=>{plans.set(input.stagingKey,await prepare(c,input.identity));},commit:async(c,input,tx)=>commit(c,{...input,prepared:plans.get(input.stagingKey)!},tx)};
 };
 const binding=createAccountBindingService({...deps,stage:makeStage('douyin'),localStages:{xiaohongshu:makeStage('xiaohongshu'),kuaishou:makeStage('kuaishou'),wechatVideo:makeStage('wechatVideo'),wechatOfficial:makeStage('wechatOfficial')},capabilities:async()=>['douyin','xiaohongshu','kuaishou','wechatVideo','wechatOfficial'].map(platform=>({platform,bind:{available:true,method:'qr',reason:'受控宿主'}}))});
 const transport=createAccountBindingTransport(()=>binding),publicClient=createClient(ENDPOINTS,{request:(endpoint,input)=>transport.request(endpoint,input,ctx)});
 const runIds:string[]=[];
 try{
  for(const platform of ['douyin','douyin','xiaohongshu','kuaishou','wechatVideo','wechatOfficial'] as const){
   const currentGroup=await groups.get(ctx,'g');const input={params:undefined,query:undefined,body:{groupId:'g',platform,expectedGroupVersion:currentGroup.version,idempotencyKey:`explicit-intent-${runIds.length}`}};
   const run=await publicClient.startAccountBinding(input);
   // 服务已写run但回执未知时，用户核对原intent仍读回同一个持久ID。
   expect((await publicClient.startAccountBinding(input)).runId).toBe(run.runId);
   expect(runIds).not.toContain(run.runId);runIds.push(run.runId);
   await binding.drainAccountBindingQueue({signal:new AbortController().signal,shouldStop:()=>false},{waitForCompletion:true});
   const receipt=await publicClient.getAccountBinding({params:{runId:run.runId},query:undefined,body:undefined});expect(receipt.status).toBe('succeeded');expect((await accounts.getAccount(ctx,receipt.accountId!)).platform).toBe(platform);
   if(runIds.length===1){const latest=await groups.get(ctx,'g');await groups.update(ctx,'g',{name:'版本已更新',expectedVersion:latest.version});}
  }
  expect((await groups.get(ctx,'g')).members).toHaveLength(6);expect(hostCalls).toBe(6);
 }finally{await binding.stop();await store.client.close();}
},120000);
