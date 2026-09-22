import {COMMENT_NETWORK_COUNTS,type CommentPageEvidence} from '@creatoros/backend/application/collection/comment-read-diagnostics';

type Page={url?():string;isClosed?():boolean;evaluate<R>(fn:()=>R):Promise<R>};
export function createCommentPageEvidence():CommentPageEvidence {
 return {finalRoute:'unknown',navigationStatus:null,readyState:null,pageClosed:null,observation:'unavailable',cookieEvidence:'cookie_present_only',loginVisible:null,captchaVisible:null,
  scroll:{attempts:0,evaluateErrors:0,wheelErrors:0},network:Object.fromEntries(COMMENT_NETWORK_COUNTS.map(key=>[key,0])) as CommentPageEvidence['network']};
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

export function observeCommentResponse(evidence:CommentPageEvidence,response:{url():string;status?():number}):void {
 const network=evidence.network;
 network.totalResponses++;
 let category:'commentList'|'creatorOther'|'other'|'unknown'='unknown';
 try{
  const url=new URL(response.url());
  if(url.protocol==='https:'||url.protocol==='http:'){
   category=url.hostname==='creator.douyin.com'
    ?url.pathname==='/aweme/v1/web/comment/list/'?'commentList':'creatorOther':'other';
  }
 }catch{/* 只记固定unknown，不保存URL或原错。 */}
 network[category]++;
 const status=commentHttpStatus(response);
 const key=status===null?'statusUnknown':status>=500?'status5xx':status>=400?'status4xx':status>=300?'status3xx':status>=200?'status2xx':'statusOther';
 network[key]++;
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
