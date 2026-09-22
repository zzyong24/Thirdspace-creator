/** 只描述确定性的响应/解析/分页事实；不保存响应内容、凭据或评论文本。 */
export const COMMENT_READ_REASONS=["stable_end","pagination_exhausted","more_pages_pending","response_identity_unverified","watermark_reached","no_matching_response","no_valid_response","invalid_response","unparseable_records","response_pending","page_limit"] as const;
export type CommentReadReason=typeof COMMENT_READ_REASONS[number];
export const COMMENT_PAGE_ROUTES=['expected_comment','creator_home','other_creator','external','unknown'] as const;
export const COMMENT_NETWORK_COUNTS=['totalResponses','commentList','creatorOther','other','unknown','status2xx','status3xx','status4xx','status5xx','statusOther','statusUnknown'] as const;
export const COMMENT_ROUTE_HOSTS=['creator','douyin_web','douyin_other','external','unknown'] as const;
export const COMMENT_ROUTE_METHODS=['GET','POST','OTHER','unknown'] as const;
export const COMMENT_ROUTE_TYPES=['xhr','fetch','document','other','unknown'] as const;
export const COMMENT_ROUTE_STATUS_COUNTS=['status2xx','status3xx','status4xx','status5xx','statusOther','statusUnknown'] as const;
export const COMMENT_ROUTE_MAX_BUCKETS=16;
export const COMMENT_ROUTE_MAX_SEGMENTS=8;
/** SEMANTIC_BOUNDARY_ALLOW: 仅供路径隐私投影；不靠这些协议词判断页面内容/登录或接口是否变更。 */
export const COMMENT_ROUTE_SEGMENTS=['aweme','v1','v2','web','creator','pc','api','comment','comments','list','reply','interaction','user','info','item','work_list','search','query'] as const;
export interface CommentRouteBucket {
 host:typeof COMMENT_ROUTE_HOSTS[number];
 method:typeof COMMENT_ROUTE_METHODS[number];
 resourceType:typeof COMMENT_ROUTE_TYPES[number];
 pathTemplate:string;
 pathTruncated:boolean;
 count:number;
 status:Record<typeof COMMENT_ROUTE_STATUS_COUNTS[number],number>;
}
export interface CommentRouteDistribution {
 scope:'response_window';
 items:CommentRouteBucket[];
 omittedResponses:number;
 overflowResponses:number;
}
export const COMMENT_UI_KINDS=['heading','tab','button','alert','status','dialog'] as const;
export interface CommentUiEvidence {
 schemaVersion:1;
 status:'observed'|'unavailable'|'timeout'|'page_closed'|'not_applicable';
 title:string|null;
 nodes:{kind:typeof COMMENT_UI_KINDS[number];region:'main'|'dialog'|'navigation'|'other';text:string;selected:boolean|null;textTruncated:boolean}[];
 truncated:boolean;
 scannedNodes:number;
 coverage:{mainSeen:boolean;dialogSeen:boolean;scanComplete:boolean};
}
export function emptyCommentUiEvidence(status:CommentUiEvidence['status']):CommentUiEvidence {
 return {schemaVersion:1,status,title:null,nodes:[],truncated:false,scannedNodes:0,coverage:{mainSeen:false,dialogSeen:false,scanComplete:false}};
}
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
 routeDistribution?:CommentRouteDistribution;
 uiEvidence?:CommentUiEvidence;
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
/** SEMANTIC_BOUNDARY_ALLOW: 有界协议脱敏/白名单，不据文本推断登录、验证码或评论语义。
 * 标题/角色短文本可能含显示名，这是已授权排障例外；不是匿名化保证。
 */
export function publicCommentUiEvidence(value:unknown,applicable=true):CommentUiEvidence {
 if(!applicable)return emptyCommentUiEvidence('not_applicable');
 const item=record(value);
 if(item.schemaVersion!==1)return emptyCommentUiEvidence('unavailable');
 if(item.status!=='observed')return emptyCommentUiEvidence(['timeout','page_closed','not_applicable'].includes(String(item.status))?item.status as CommentUiEvidence['status']:'unavailable');
 const output=emptyCommentUiEvidence('observed'),coverage=record(item.coverage);
 output.coverage={mainSeen:coverage.mainSeen===true,dialogSeen:coverage.dialogSeen===true,scanComplete:coverage.scanComplete===true};
 output.truncated=item.truncated===true;
 output.scannedNodes=Math.min(2000,count(item.scannedNodes)??0);
 const cut=()=>{output.truncated=true;output.coverage.scanComplete=false;};
 if(output.scannedNodes!==item.scannedNodes)cut();
 const short=(value:unknown)=>{
  if(typeof value!=='string')return {text:'',truncated:false};
  // 与浏览器自包含 evaluator 保持相同协议；先限输入，再遮 URL/query，再限 Unicode 字符。
  const safe=value.slice(0,1024).replace(/(?:[a-z][a-z0-9+.-]*:\/\/|www\.|[?&][^\s=<>]+=[^\s<>]*)[^\s<>]*/gi,'[url]').replace(/\s+/gu,' ').trim();
  const chars=Array.from(safe);return {text:chars.slice(0,120).join(''),truncated:value.length>1024||chars.length>120};
 };
 if(typeof item.title==='string'){const title=short(item.title);output.title=title.text;if(title.truncated)cut();}
 const counts=new Map<string,number>();
 if(Array.isArray(item.nodes)){
  if(item.nodes.length>24)cut();
  for(const raw of item.nodes.slice(0,24)){
   const node=record(raw),kind=COMMENT_UI_KINDS.find(kind=>kind===node.kind);
   if(!kind||!['main','dialog','navigation','other'].includes(String(node.region))||(counts.get(kind)??0)>=4){cut();continue;}
   counts.set(kind,(counts.get(kind)??0)+1);
   const text=short(node.text);if(text.truncated)cut();
   output.nodes.push({kind,region:node.region as CommentUiEvidence['nodes'][number]['region'],text:text.text,selected:typeof node.selected==='boolean'?node.selected:null,textTruncated:node.textTruncated===true||text.truncated});
  }
 }
 while(new TextEncoder().encode(JSON.stringify(output)).byteLength>12*1024){output.nodes.pop();cut();}
 return output;
}
function publicRouteTemplate(value:unknown):string|null {
 if(typeof value!=='string'||value.length>160||!value.startsWith('/'))return null;
 const segments=value.slice(1).split('/');
 return segments.length<=COMMENT_ROUTE_MAX_SEGMENTS&&segments.every(segment=>segment===':opaque'||COMMENT_ROUTE_SEGMENTS.some(allowed=>segment===allowed))?value:null;
}
function publicRouteDistribution(value:unknown){
 const item=record(value);
 if(item.scope!=='response_window'||!Array.isArray(item.items))return null;
 return {scope:'response_window',omittedResponses:count(item.omittedResponses),overflowResponses:count(item.overflowResponses),
  omittedBuckets:Math.max(0,item.items.length-COMMENT_ROUTE_MAX_BUCKETS),
  items:item.items.slice(0,COMMENT_ROUTE_MAX_BUCKETS).map(raw=>{
   const bucket=record(raw),status=record(bucket.status);
   return {host:COMMENT_ROUTE_HOSTS.find(host=>host===bucket.host)??'unknown',
    method:COMMENT_ROUTE_METHODS.find(method=>method===bucket.method)??'unknown',
    resourceType:COMMENT_ROUTE_TYPES.find(type=>type===bucket.resourceType)??'unknown',
    pathTemplate:publicRouteTemplate(bucket.pathTemplate),pathTruncated:typeof bucket.pathTruncated==='boolean'?bucket.pathTruncated:null,count:count(bucket.count),
    status:Object.fromEntries(COMMENT_ROUTE_STATUS_COUNTS.map(key=>[key,count(status[key])])),
   };
  }),
 };
}
/** SEMANTIC_BOUNDARY_ALLOW: 仅允许固定事实字段和枚举，阻断URL/正文/异常透传，不推断登录或内容语义。 */
function publicPageEvidence(value:unknown,uiApplicable:boolean){
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
  routeDistribution:publicRouteDistribution(item.routeDistribution),
  uiEvidence:item.uiEvidence===undefined?null:publicCommentUiEvidence(item.uiEvidence,uiApplicable),
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
   ...Object.fromEntries(fields.map(field=>[field,count(work.diagnostics?.[field])])),reason:reasonOf(work),pageEvidence:publicPageEvidence(work.diagnostics?.pageEvidence,reasonOf(work)==='no_matching_response')})),omittedWorks:Math.max(0,works.length-20)});
}
