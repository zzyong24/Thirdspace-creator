/** 只描述确定性的响应/解析/分页事实；不保存响应内容、凭据或评论文本。 */
export const COMMENT_READ_REASONS=["stable_end","pagination_exhausted","more_pages_pending","response_identity_unverified","watermark_reached","no_matching_response","no_valid_response","invalid_response","unparseable_records","response_pending","page_limit"] as const;
export type CommentReadReason=typeof COMMENT_READ_REASONS[number];
export interface CommentReadDiagnostics {
 matchedResponses:number;
 validResponses:number;
 invalidResponses:number;
 parsedComments:number;
 pendingResponses:number;
 ignoredResponses?:number;
 reason:CommentReadReason;
}
export interface CommentDiagnosticWork {awemeId:string;complete?:boolean;diagnostics?:CommentReadDiagnostics}
const count=(value:unknown)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?value:null;
/** 每批最多列 20 个作品，长 ID 截至 80 字符；汇总覆盖整批，明确披露省略量和诊断缺失。 */
export function formatCommentReadDiagnostics(works:readonly CommentDiagnosticWork[],ingestion:{receivedComments:number;writtenComments:number;skippedComments:number},unresolvedSyncFailures:number|null=null):string {
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
  unresolvedSyncFailures:{count:count(unresolvedSyncFailures),scope:'account.comments',source:'publicationSyncService.failures'},
  receivedComments:count(ingestion.receivedComments),writtenComments:count(ingestion.writtenComments),skippedComments:count(ingestion.skippedComments),
  reasons,works:works.slice(0,20).map(work=>({awemeId:work.awemeId.slice(0,80),complete:work.complete??null,
   ...Object.fromEntries(fields.map(field=>[field,count(work.diagnostics?.[field])])),reason:reasonOf(work)})),omittedWorks:Math.max(0,works.length-20)});
}
