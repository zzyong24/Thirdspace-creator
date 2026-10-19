import type {RequestContext,PlatformAccountResource,AccountGroupResource,GroupMemberResource} from '@creatoros/contract';
/** 启动组合只派生真实scope；知识/共享任务按组，平台采集按真实账号。无假账号，无自动归组。 */
export async function runAccountGroupStartup(ctx:RequestContext,ports:{
 listAccounts(ctx:RequestContext,query:{limit:number;offset:number}):Promise<{rows:PlatformAccountResource[];total:number}>;
 membership(ctx:RequestContext,accountId:string):Promise<GroupMemberResource>;
 group(ctx:RequestContext,groupId:string):Promise<AccountGroupResource>;
 capabilities(ctx:RequestContext):Promise<Array<{platform:string;collect:{available:boolean}}>>;
 hasCredentialEvidence(ctx:RequestContext,account:PlatformAccountResource):Promise<boolean>;
 seedGroup(ctx:RequestContext):Promise<void>;
 ensureSharedJobs(ctx:RequestContext):Promise<void>;
 ensurePrivateJobs(ctx:RequestContext,account:PlatformAccountResource):Promise<void>;
 warn(stage:string,error:unknown,accountId?:string):void;
}){
 const seeded=new Set<string>();const capabilities=await ports.capabilities(ctx);
 for(let offset=0;;offset+=100){
  const page=await ports.listAccounts(ctx,{limit:100,offset});
  for(const account of page.rows.filter(row=>row.status==='active')){
   try{
    const member=await ports.membership(ctx,account.id),group=await ports.group(ctx,member.groupId);
    const scoped:RequestContext={...ctx,groupId:member.groupId,groupVersion:group.version,accountId:account.id,membershipVersion:member.version,source:'ingestion'};
    if(group.status==='active'&&!seeded.has(group.id)){
     seeded.add(group.id);const shared={...scoped,accountId:null,membershipVersion:undefined};
     for(const [stage,work] of [['知识预设',ports.seedGroup],['共享任务',ports.ensureSharedJobs]] as const){try{await work(shared);}catch(error){ports.warn(stage,error,account.id);}}
    }
    // 平台真实能力与账号凭据分别验证；每个平台只补齐已实现的私有任务。
    if(['douyin','kuaishou','xiaohongshu','wechatVideo','wechatOfficial'].includes(account.platform)&&capabilities.some(row=>row.platform===account.platform&&row.collect.available)&&await ports.hasCredentialEvidence(scoped,account))await ports.ensurePrivateJobs(scoped,account);
   }catch(error){ports.warn('账号启动',error,account.id);}
  }
  if(offset+page.rows.length>=page.total||page.rows.length===0)break;
 }
}
