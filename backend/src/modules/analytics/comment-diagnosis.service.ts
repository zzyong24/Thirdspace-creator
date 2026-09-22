import {ENDPOINTS,type RequestContext} from '@creatoros/contract';
import type {z} from 'zod';
import {OwnershipError,requireAccountId} from './analytics.errors';

export type CommentDiagnosisInput=z.infer<typeof ENDPOINTS.diagnoseComments.body>;
export type CommentDiagnosisReport=z.infer<typeof ENDPOINTS.diagnoseComments.response>;
export interface CommentDiagnosisIdentity {userId:string;accountId:string;publicationId:string;externalId:string}
export interface CommentDiagnosisHost {
 identity(id:string):CommentDiagnosisIdentity|undefined;
 start(identity:CommentDiagnosisIdentity):Promise<CommentDiagnosisReport>;
 step(identity:CommentDiagnosisIdentity,input:Exclude<CommentDiagnosisInput,{action:'start'}>,options?:{allowActions:boolean}):Promise<CommentDiagnosisReport>;
 expired(id:string):CommentDiagnosisReport;
 dispose():Promise<void>;
}

/** SEMANTIC_BOUNDARY_ALLOW: 只守真实账号/作品身份、固定字段及公开隐私边界，不选择站点菜单。 */
export function createCommentDiagnosisService(ports:{assertPublication(ctx:RequestContext,id:string):Promise<{externalId:string|null}>;host:CommentDiagnosisHost}){
 const short=(value:string)=>Array.from(value.slice(0,1024).replace(/(?:[a-z][a-z0-9+.-]*:\/\/|www\.|[?&][^\s=<>]+=[^\s<>]*)[^\s<>]*/gi,'[url]').replace(/\s+/gu,' ').trim()).slice(0,120).join('');
 return {
  async diagnose(ctx:RequestContext,raw:unknown):Promise<CommentDiagnosisReport>{
   const accountId=requireAccountId(ctx.accountId,'analytics.comments.diagnose');
   const input=ENDPOINTS.diagnoseComments.body.parse(raw);
   let result:CommentDiagnosisReport;
   if(input.action==='start'){
    const publication=await ports.assertPublication(ctx,input.publicationId);
    if(!publication.externalId)throw new OwnershipError('作品不可诊断');
    result=await ports.host.start({userId:ctx.userId,accountId,publicationId:input.publicationId,externalId:publication.externalId});
   }else{
    const identity=ports.host.identity(input.diagnosisId);
    if(!identity)return ports.host.expired(input.diagnosisId);
    if(identity.userId!==ctx.userId||identity.accountId!==accountId)throw new OwnershipError('诊断会话不可访问');
    // close 不依赖已删/隐藏作品，必须始终允许原 owner 清理。
    if(input.action==='advance'){
     const publication=await ports.assertPublication(ctx,identity.publicationId);
     if(publication.externalId!==identity.externalId)throw new OwnershipError('诊断作品身份已变化，请关闭原会话');
    }
    let allowActions=true;
    if(input.action==='observe'){try{const publication=await ports.assertPublication(ctx,identity.publicationId);allowActions=publication.externalId===identity.externalId;}catch{allowActions=false;}}
    result=await ports.host.step(identity,input,{allowActions});
   }
   // 第二道严格契约只接受固定字段；宿主多传raw headers/body等时拒绝，不能缓存越界回执。
   const output=ENDPOINTS.diagnoseComments.response.parse(result);
   output.ui.title=output.ui.title===null?null:short(output.ui.title);
   for(const node of output.ui.nodes)node.text=short(node.text);
   const segments=new Set(['aweme','v1','v2','web','creator','pc','api','comment','comments','list','reply','interaction','user','info','item','work_list','search','query',':opaque']);
   for(const item of output.networkEvidence.items){
    if(!item.pathTemplate.startsWith('/')||item.pathTemplate.slice(1).split('/').some(segment=>!segments.has(segment)))item.pathTemplate='/:opaque';
   }
   while(Buffer.byteLength(JSON.stringify(output.ui))>12*1024&&output.ui.nodes.length){output.ui.nodes.pop();output.ui.truncated=true;}
   while(Buffer.byteLength(JSON.stringify(output))>48*1024&&output.networkEvidence.items.length){output.networkEvidence.items.pop();output.networkEvidence.omittedResponses++;output.networkEvidence.truncated=true;}
   return output;
  },
 };
}
