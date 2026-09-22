/** 只描述确定性的响应/解析/分页事实；不保存响应内容、凭据或评论文本。 */
export const COMMENT_READ_REASONS=["stable_end","pagination_exhausted","more_pages_pending","response_identity_unverified","watermark_reached","no_matching_response","no_valid_response","invalid_response","unparseable_records","response_pending","page_limit"] as const;
export type CommentReadReason=typeof COMMENT_READ_REASONS[number];
export const COMMENT_PAGE_ROUTES=['expected_comment','creator_home','other_creator','external','unknown'] as const;
export const COMMENT_NETWORK_COUNTS=['totalResponses','commentList','creatorOther','other','unknown','status2xx','status3xx','status4xx','status5xx','statusOther','statusUnknown'] as const;
export interface CommentPageEvidence {
 finalRoute:typeof COMMENT_PAGE_ROUTES[number];
 navigationStatus:number|null;
 readyState:'loading'|'interactive'|'complete'|null;
 pageClosed:boolean|null;
 observation:'observed'|'unavailable'|'page_closed';
 /** 只证明采集前存在会话Cookie，不证明服务端接受会话。 */
 cookieEvidence:'cookie_present_only'|null;
 /** 尚无经验证的组件选择器；不得从正文/路由猜测。 */
 loginVisible:null;
 captchaVisible:null;
 scroll:{attempts:number;evaluateErrors:number;wheelErrors:number};
 network:Record<typeof COMMENT_NETWORK_COUNTS[number],number>;
}
export interface CommentReadDiagnostics {
 matchedResponses:number;
 validResponses:number;
 invalidResponses:number;
 parsedComments:number;
 pendingResponses:number;
 ignoredResponses?:number;
 reason:CommentReadReason;
 pageEvidence?:CommentPageEvidence;
}
export interface CommentDiagnosticWork {awemeId:string;complete?:boolean;diagnostics?:CommentReadDiagnostics}
const count=(value:unknown)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?value:null;
const record=(value:unknown):Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
/** SEMANTIC_BOUNDARY_ALLOW: 仅允许固定事实字段和枚举，阻断URL/正文/异常透传，不推断登录或内容语义。 */
function publicPageEvidence(value:unknown){
 if(value===null||typeof value!=='object'||Array.isArray(value))return null;
 const item=record(value),scroll=record(item.scroll),network=record(item.network);
 return {
  finalRoute:COMMENT_PAGE_ROUTES.find(route=>route===item.finalRoute)??'unknown',
  navigationStatus:typeof item.navigationStatus==='number'&&Number.isInteger(item.navigationStatus)&&item.navigationStatus>=100&&item.navigationStatus<=599?item.navigationStatus:null,
  readyState:typeof item.readyState==='string'&&['loading','interactive','complete'].includes(item.readyState)?item.readyState:null,
  pageClosed:typeof item.pageClosed==='boolean'?item.pageClosed:null,
  observation:typeof item.observation==='string'&&['observed','unavailable','page_closed'].includes(item.observation)?item.observation:'unavailable',
  cookieEvidence:item.cookieEvidence==='cookie_present_only'?'cookie_present_only':null,
  loginVisible:null,captchaVisible:null,
  scroll:Object.fromEntries(['attempts','evaluateErrors','wheelErrors'].map(key=>[key,count(scroll[key])])),
  network:Object.fromEntries(COMMENT_NETWORK_COUNTS.map(key=>[key,count(network[key])])),
 };
}
/** 每批最多列 20 个作品，长 ID 截至 80 字符；汇总覆盖整批，明确披露省略量和诊断缺失。 */
export function formatCommentReadDiagnostics(works:readonly CommentDiagnosticWork[],ingestion:{receivedComments:number;writtenComments:number;skippedComments:number},unresolvedSyncFailures:number|null=null,selection?:{size:number;accountFailures:number|null}):string {
 const fields=['matchedResponses','validResponses','invalidResponses','parsedComments','pendingResponses','ignoredResponses'] as const;
 const totals:Record<string,number|null>={};
 for(const field of fields){
  const values=works.map(work=>count(work.diagnostics?.[field]));
  const sum=values.reduce<number>((total,value)=>total+(value??0),0);
  totals[field]=values.some(value=>value===null)?null:count(sum);
 }
 const reasonOf=(work:CommentDiagnosticWork)=>work.diagnostics&&COMMENT_READ_REASONS.includes(work.diagnostics.reason)?work.diagnostics.reason:'unavailable';
 const reasons:Record<string,number>={};for(const work of works){const reason=reasonOf(work);reasons[reason]=(reasons[reason]??0)+1;}
 return JSON.stringify({schemaVersion:1,scope:'batch',...totals,
  unresolvedSyncFailures:{count:count(unresolvedSyncFailures),scope:selection?'selected_publications.comments':'account.comments',source:'publicationSyncService.failures'},
  ...(selection?{selectionSize:selection.size,accountUnresolvedSyncFailures:{count:count(selection.accountFailures),scope:'account.comments',source:'publicationSyncService.failures'}}:{}),
  receivedComments:count(ingestion.receivedComments),writtenComments:count(ingestion.writtenComments),skippedComments:count(ingestion.skippedComments),
  reasons,works:works.slice(0,20).map(work=>({awemeId:work.awemeId.slice(0,80),complete:work.complete??null,
   ...Object.fromEntries(fields.map(field=>[field,count(work.diagnostics?.[field])])),reason:reasonOf(work),pageEvidence:publicPageEvidence(work.diagnostics?.pageEvidence)})),omittedWorks:Math.max(0,works.length-20)});
}
