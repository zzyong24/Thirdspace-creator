// @vitest-environment node
import {runInNewContext} from 'node:vm';
import {expect,it,vi} from 'vitest';
import {fetchDouyinCommentsForWorks} from './douyin-cdp';
import {formatCommentReadDiagnostics} from '@creatoros/backend/application/collection/comment-read-diagnostics';
import {createCommentPageEvidence,finishCommentPageEvidence} from './douyin-cdp-page-evidence';

type Response={url():string;status():number;json():Promise<unknown>;request?():{method():string;resourceType():string}};
function fixture(options:{route?:string;status?:number;closed?:boolean;domError?:boolean;scrollError?:boolean;responses?:Response[];complete?:boolean}={}){
 const handlers=new Set<(response:Response)=>void>();
 const route=options.route??'https://creator.douyin.com/creator-micro/interactive/comment?item_id=v&token=SECRET_QUERY';
 const page={
  on:(_event:'response',handler:(response:Response)=>void)=>{handlers.add(handler);},
  off:(_event:'response',handler:(response:Response)=>void)=>{handlers.delete(handler);},
  url:()=>route,isClosed:()=>options.closed??false,
  goto:vi.fn(async()=>{
   for(const response of options.responses??[])for(const handler of handlers)handler(response);
   if(options.complete)for(const handler of handlers)handler({url:()=> 'https://creator.douyin.com/aweme/v1/web/comment/list/?item_id=v',status:()=>200,json:async()=>({comments:[],has_more:0})});
   return {status:()=>options.status??200};
  }),
  waitForTimeout:vi.fn(async()=>{}),
  async evaluate<R>(fn:()=>R):Promise<R>{
   if(options.domError)throw new Error('SECRET_DOM_BODY');
   return runInNewContext(`(${fn.toString()})()`,{window:{scrollTo:()=>{if(options.scrollError)throw new Error('SECRET_SCROLL');}},document:{readyState:'complete',body:{scrollHeight:100,innerText:'验证码 SECRET_BODY'},querySelectorAll:()=>[]}}) as R;
  },
  mouse:{wheel:vi.fn(async()=>{if(options.scrollError)throw new Error('SECRET_WHEEL');})},
 };
 const close=vi.fn(async()=>{});
 const run=()=>fetchDouyinCommentsForWorks(['v'],{authDir:'/isolated-fake',maxPages:4},{openContext:async()=>({pages:()=>[page],newPage:async()=>page,cookies:async()=>[{name:'sessionid'}],close})});
 return {page,run,close,handlers};
}

it.each([
 ['https://creator.douyin.com/creator-micro/home?token=SECRET_QUERY','creator_home'],
 ['https://creator.douyin.com/creator-micro/interactive/comment?item_id=v&token=SECRET_QUERY','expected_comment'],
 ['https://creator.douyin.com/creator-micro/content/upload?token=SECRET_QUERY','other_creator'],
 ['https://creator.douyin.com.evil.test/login?token=SECRET_QUERY','external'],
])('仅分类最终路由 %s；Cookie存在不证明登录或验证码状态',async(route,finalRoute)=>{
 const f=fixture({route});const result=await f.run();const work=result.works[0]!;
 expect(work).toMatchObject({complete:false,diagnostics:{reason:'no_matching_response',pageEvidence:{finalRoute,navigationStatus:200,readyState:'complete',pageClosed:false,observation:'observed',cookieEvidence:'cookie_present_only',loginVisible:null,captchaVisible:null,scroll:{attempts:3,evaluateErrors:0,wheelErrors:0}}}});
 expect(f.page.goto).toHaveBeenCalledOnce();expect(f.close).toHaveBeenCalledOnce();expect(f.handlers.size).toBe(0);
 expect(f.page.waitForTimeout.mock.calls).toHaveLength(4);
 expect(JSON.stringify(work.diagnostics)).not.toContain('SECRET');
});

it('记录所有响应固定分类和状态；不把无匹配误报为无网络',async()=>{
 const response=(url:string,status:number):Response=>({url:()=>url,status:()=>status,json:async()=>{throw new Error('不允许读取非评论响应正文');}});
 const f=fixture({status:404,responses:[response('https://creator.douyin.com/other?cookie=SECRET_QUERY',403),response('https://cdn.example.test/a.js?secret=SECRET_QUERY',200),response('not-a-url-SECRET',0)]});
 const {works}=await f.run();
 expect(works[0]).toMatchObject({complete:false,diagnostics:{matchedResponses:0,reason:'no_matching_response',pageEvidence:{navigationStatus:404,network:{totalResponses:3,commentList:0,creatorOther:1,other:1,unknown:1,status2xx:1,status3xx:0,status4xx:1,status5xx:0,statusOther:0,statusUnknown:1}}}});
 const publicText=formatCommentReadDiagnostics(works,{receivedComments:0,writtenComments:0,skippedComments:0});
 expect(JSON.parse(publicText).works[0].pageEvidence.network.totalResponses).toBe(3);
 expect(publicText).not.toContain('SECRET');
});

it('滚动失败公开计数，页面仍能观察；验证码字样不能推断验证码',async()=>{
 const f=fixture({scrollError:true});const result=await f.run();
 expect(result.works[0]).toMatchObject({complete:false,diagnostics:{reason:'no_matching_response',pageEvidence:{observation:'observed',captchaVisible:null,scroll:{attempts:3,evaluateErrors:3,wheelErrors:3}}}});
});

it.each([false,true])('页面诊断失败/关闭不改变真实完整响应的成功判据（closed=%s）',async closed=>{
 const f=fixture({domError:true,closed,complete:true});const result=await f.run();
 expect(result.works[0]).toMatchObject({complete:true,diagnostics:{reason:'pagination_exhausted',pageEvidence:{readyState:null,pageClosed:closed,observation:closed?'page_closed':'unavailable',loginVisible:null,captchaVisible:null}}});
 expect(JSON.stringify(result)).not.toContain('SECRET');
});

it('新增被动DOM观察最多等待1秒，不能挂住原抓取；未知状态不冒充observed',async()=>{
 vi.useFakeTimers();
 try{
  const evidence=createCommentPageEvidence();
  const page={url:()=> 'https://creator.douyin.com/creator-micro/interactive/comment',isClosed:()=>false,evaluate:<R>()=>new Promise<R>(()=>{})};
  const finished=finishCommentPageEvidence(page,evidence);
  await vi.advanceTimersByTimeAsync(1000);await finished;
  expect(evidence).toMatchObject({finalRoute:'expected_comment',observation:'unavailable',readyState:null});
  expect(vi.getTimerCount()).toBe(0);
 }finally{vi.useRealTimers();}
});

it('诊断期间迟到评论不延长监听窗口，不改变原pending/完成判断或记录',async()=>{
 const f=fixture();
 const originalEvaluate=f.page.evaluate;
 let evaluations=0;
 f.page.evaluate=async<R>(fn:()=>R):Promise<R>=>{
  if(++evaluations===4){
   expect(f.handlers.size).toBe(0);
   for(const handler of f.handlers)handler({url:()=> 'https://creator.douyin.com/aweme/v1/web/comment/list/?item_id=v',status:()=>200,json:async()=>({comments:[],has_more:0})});
  }
  return originalEvaluate(fn);
 };
 const result=await f.run();
 expect(evaluations).toBe(4);
 expect(result.works[0]).toMatchObject({complete:false,records:[],diagnostics:{reason:'no_matching_response',matchedResponses:0,pageEvidence:{network:{totalResponses:0}}}});
});

function routeResponse(url:string,{status=200,method='GET',resourceType='fetch',broken=false}={}):Response {
 return {url:()=>url,status:()=>status,json:async()=>{throw new Error('非匹配API不得读取正文');},request:()=>{
  if(broken)throw new Error('SECRET_REQUEST_ERROR');
  return {method:()=>method,resourceType:()=>resourceType};
 }};
}

it('被动route模板区分API分布并合并query，未知path/第三方域不泄露；不增加请求或改变完成条件',async()=>{
 const f=fixture({responses:[
  routeResponse('https://creator.douyin.com/aweme/v2/creator/comments/list/?token=SECRET_A'),
  routeResponse('https://creator.douyin.com/aweme/v2/creator/comments/list/?token=SECRET_B',{status:302}),
  routeResponse('https://www.douyin.com/aweme/v1/web/comment/reply/123456/SECRET_TOKEN',{method:'POST'}),
  routeResponse('https://SECRET_HOST.douyin.com/api/SECRET_VALUE/%63omment/COMMENT'),
  routeResponse('https://SECRET_EXTERNAL.test/api/secret',{method:'PUT'}),
  routeResponse('https://creator.douyin.com/static/SECRET.js',{resourceType:'script'}),
 ]});
 const result=await f.run();
 const output=JSON.parse(formatCommentReadDiagnostics(result.works,{receivedComments:0,writtenComments:0,skippedComments:0}));
 expect(output.works[0]).toMatchObject({complete:false,reason:'no_matching_response',pageEvidence:{network:{totalResponses:6},routeDistribution:{scope:'response_window',omittedResponses:1,overflowResponses:0,items:[
  {host:'creator',method:'GET',resourceType:'fetch',pathTemplate:'/aweme/v2/creator/comments/list',pathTruncated:false,count:2,status:{status2xx:1,status3xx:1}},
  {host:'douyin_web',method:'POST',resourceType:'fetch',pathTemplate:'/aweme/v1/web/comment/reply/:opaque/:opaque',count:1},
  {host:'douyin_other',method:'GET',resourceType:'fetch',pathTemplate:'/api/:opaque/:opaque/:opaque',count:1},
  {host:'external',method:'OTHER',resourceType:'fetch',pathTemplate:'/:opaque',count:1},
 ]}}});
 expect(JSON.stringify(output)).not.toContain('SECRET');expect(JSON.stringify(output)).not.toContain('123456');
 expect(f.page.goto).toHaveBeenCalledOnce();expect(f.page.waitForTimeout).toHaveBeenCalledTimes(4);
});

it('route最多16桶；满后仍累计已知桶，overflow/omitted与原网络总量守恒',async()=>{
 const paths=['aweme','v1','v2','web','creator','pc','api','comment','comments','list','reply','interaction','user','info','item','work_list','search','query'];
 const responses=paths.map(segment=>routeResponse(`https://creator.douyin.com/api/${segment}`));
 responses.push(routeResponse('https://creator.douyin.com/api/aweme'));
 const f=fixture({responses});const result=await f.run();
 const publicText=formatCommentReadDiagnostics(result.works,{receivedComments:0,writtenComments:0,skippedComments:0});
 const evidence=JSON.parse(publicText).works[0].pageEvidence;
 expect(evidence.routeDistribution.items).toHaveLength(16);
 expect(evidence.routeDistribution.items[0]).toMatchObject({pathTemplate:'/api/aweme',count:2});
 expect(evidence.routeDistribution).toMatchObject({overflowResponses:2,omittedResponses:0});
 expect(evidence.routeDistribution.items.reduce((sum:number,item:{count:number})=>sum+item.count,0)+evidence.routeDistribution.overflowResponses+evidence.routeDistribution.omittedResponses).toBe(evidence.network.totalResponses);
});

it('request accessor失败不反杀采集，固定API前缀仍计未知类型；长path明确截断',async()=>{
 const f=fixture({responses:[routeResponse('https://creator.douyin.com/api/comment/list',{broken:true}),routeResponse('https://creator.douyin.com/api/'+Array(12).fill('SECRET').join('/'))]});
 const result=await f.run();
 const evidence=JSON.parse(formatCommentReadDiagnostics(result.works,{receivedComments:0,writtenComments:0,skippedComments:0})).works[0].pageEvidence;
 expect(evidence.routeDistribution.items[0]).toMatchObject({method:'unknown',resourceType:'unknown',pathTemplate:'/api/comment/list',count:1});
 expect(evidence.routeDistribution.items[1]).toMatchObject({pathTemplate:'/api/:opaque/:opaque/:opaque/:opaque/:opaque/:opaque/:opaque',pathTruncated:true,count:1});
 expect(result.works[0]).toMatchObject({complete:false,diagnostics:{reason:'no_matching_response'}});
 expect(JSON.stringify(evidence)).not.toContain('SECRET');
});
