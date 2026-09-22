import {COMMENT_NETWORK_COUNTS,COMMENT_ROUTE_MAX_BUCKETS,COMMENT_ROUTE_MAX_SEGMENTS,COMMENT_ROUTE_SEGMENTS,COMMENT_ROUTE_STATUS_COUNTS,type CommentPageEvidence,type CommentRouteBucket} from '@creatoros/backend/application/collection/comment-read-diagnostics';

type Page={url?():string;isClosed?():boolean;evaluate<R>(fn:()=>R):Promise<R>};
export function createCommentPageEvidence():CommentPageEvidence {
 return {finalRoute:'unknown',navigationStatus:null,readyState:null,pageClosed:null,observation:'unavailable',cookieEvidence:'cookie_present_only',loginVisible:null,captchaVisible:null,
  scroll:{attempts:0,evaluateErrors:0,wheelErrors:0},network:Object.fromEntries(COMMENT_NETWORK_COUNTS.map(key=>[key,0])) as CommentPageEvidence['network'],
  routeDistribution:{scope:'response_window',items:[],omittedResponses:0,overflowResponses:0}};
}

export function commentHttpStatus(response:unknown):number|null {
 try{
  const item=response as {status?:()=>unknown}|null;
  const status=typeof item?.status==='function'?item.status():null;
  return typeof status==='number'&&Number.isInteger(status)&&status>=100&&status<=599?status:null;
 }catch{return null;}
}

/** SEMANTIC_BOUNDARY_ALLOW: 固定host/path分类仅描述所见路由，不判断登录、验证码、限流或内容。 */
function classifyRoute(raw:string):CommentPageEvidence['finalRoute'] {
 try{
  const url=new URL(raw);
  if(url.protocol!=='https:'&&url.protocol!=='http:')return 'unknown';
  if(url.hostname!=='creator.douyin.com')return 'external';
  if(url.pathname==='/creator-micro/interactive/comment')return 'expected_comment';
  if(url.pathname==='/creator-micro/home')return 'creator_home';
  return 'other_creator';
 }catch{return 'unknown';}
}

type CommentResponseMetadata={url():string;status?():number;request?():{method?():string;resourceType?():string}};
/** Cached Playwright metadata only. No request, headers, body or URL strings are retained. */
function observeRoute(evidence:CommentPageEvidence,response:CommentResponseMetadata,url:URL|null,statusKey:typeof COMMENT_ROUTE_STATUS_COUNTS[number]):void {
 const distribution=evidence.routeDistribution;if(!distribution)return;
 let request:ReturnType<NonNullable<CommentResponseMetadata['request']>>|undefined;
 try{request=response.request?.();}catch{/* 老端口或metadata不可用仍记录unknown。 */}
 let method:CommentRouteBucket['method']='unknown',resourceType:CommentRouteBucket['resourceType']='unknown';
 try{const value=request?.method?.();if(typeof value==='string')method=value==='GET'||value==='POST'?value:'OTHER';}catch{/* 不传播原始错误。 */}
 try{const value=request?.resourceType?.();if(typeof value==='string')resourceType=value==='xhr'||value==='fetch'||value==='document'?value:'other';}catch{/* 不传播原始错误。 */}
 const host:CommentRouteBucket['host']=!url?'unknown':url.hostname==='creator.douyin.com'?'creator':url.hostname==='www.douyin.com'?'douyin_web':url.hostname.endsWith('.douyin.com')?'douyin_other':'external';
 const knownApi=url&&host!=='external'&&['/aweme/','/creator/pc/','/api/'].some(prefix=>url.pathname.startsWith(prefix));
 if(resourceType!=='xhr'&&resourceType!=='fetch'&&!knownApi){distribution.omittedResponses++;return;}
 // SEMANTIC_BOUNDARY_ALLOW: only a fixed protocol vocabulary can be public.
 // Dynamic host/path/query/fragment/credentials and unknown encoded/cased segments never escape.
 const segments=url&&host!=='external'?url.pathname.split('/').filter(Boolean):[];
 const pathTemplate=segments.length?'/'+segments.slice(0,COMMENT_ROUTE_MAX_SEGMENTS).map(segment=>COMMENT_ROUTE_SEGMENTS.some(allowed=>allowed===segment)?segment:':opaque').join('/'):'/:opaque';
 const pathTruncated=segments.length>COMMENT_ROUTE_MAX_SEGMENTS;
 let bucket=distribution.items.find(item=>item.host===host&&item.method===method&&item.resourceType===resourceType&&item.pathTemplate===pathTemplate&&item.pathTruncated===pathTruncated);
 if(!bucket){
  if(distribution.items.length>=COMMENT_ROUTE_MAX_BUCKETS){distribution.overflowResponses++;return;}
  bucket={host,method,resourceType,pathTemplate,pathTruncated,count:0,status:Object.fromEntries(COMMENT_ROUTE_STATUS_COUNTS.map(key=>[key,0])) as CommentRouteBucket['status']};
  distribution.items.push(bucket);
 }
 bucket.count++;bucket.status[statusKey]++;
}

export function observeCommentResponse(evidence:CommentPageEvidence,response:CommentResponseMetadata):void {
 const network=evidence.network;
 network.totalResponses++;
 let category:'commentList'|'creatorOther'|'other'|'unknown'='unknown';
 let observedUrl:URL|null=null;
 try{
  const url=new URL(response.url());
  if(url.protocol==='https:'||url.protocol==='http:'){
   observedUrl=url;
   category=url.hostname==='creator.douyin.com'
    ?url.pathname==='/aweme/v1/web/comment/list/'?'commentList':'creatorOther':'other';
  }
 }catch{/* 只记固定unknown，不保存URL或原错。 */}
 network[category]++;
 const status=commentHttpStatus(response);
 const key=status===null?'statusUnknown':status>=500?'status5xx':status>=400?'status4xx':status>=300?'status3xx':status>=200?'status2xx':'statusOther';
 network[key]++;
 observeRoute(evidence,response,observedUrl,key);
}

/** 单次被动读取，无导航/网络探针；老测试端口没有页面观察能力时诚实标不可用。 */
export async function finishCommentPageEvidence(page:Page,evidence:CommentPageEvidence):Promise<void> {
 try{if(page.url)evidence.finalRoute=classifyRoute(page.url());}catch{/* URL不可用。 */}
 try{if(page.isClosed)evidence.pageClosed=page.isClosed();}catch{/* 关闭状态未知。 */}
 if(evidence.pageClosed===true){evidence.observation='page_closed';return;}
 if(!page.url||!page.isClosed)return;
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  // 诊断新增等待有界；只获取固定readyState，不读取页面正文/账号资料。
  const state=await Promise.race([page.evaluate(()=>document.readyState),new Promise<null>(resolve=>{timer=setTimeout(()=>resolve(null),1000);})]);
  if(state==='loading'||state==='interactive'||state==='complete'){
   evidence.readyState=state;evidence.observation='observed';
  }
 }catch{/* 诊断不可用不改变原完成判据。 */}
 finally{if(timer)clearTimeout(timer);}
}
