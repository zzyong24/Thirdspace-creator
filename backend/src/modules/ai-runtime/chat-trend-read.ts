import type {RequestContext} from "@creatoros/contract";
import {buildTrendQuery,parseFeed} from "@creatoros/ai-worker";
import {assertUrlAllowed} from "@creatoros/ai-worker/browser/url-guard";
import type {EnabledTrendSource} from "../trend-sources";
type TrendSourceProjection=Pick<EnabledTrendSource,"id"|"name"|"url"|"sourceType"|"domain">;

export interface ChatTrendReadDeps {
 listEnabledSources(context:RequestContext):Promise<TrendSourceProjection[]>;
 /** 复用现有域登录态/profile池读取；必须把 signal 交给实际浏览器读取，不能调用模型。 */
 readWebSource(context:RequestContext,source:TrendSourceProjection,signal:AbortSignal):Promise<{text:string;sourceUrl?:string}>;
 /** 绑定现有 searchWebPort，沿用当前真实搜索配置与回退，不解析第二套模型配置。 */
 search(context:RequestContext,query:string,options:{count:number;signal:AbortSignal}):Promise<Array<{title:string;url:string;snippet?:string;publishedAt?:string|null}>>;
}

/** 不可溯内容不进依据；只验证协议与链接，不选择哪个热点值得创作。 */
function publicLink(raw:string,base?:string):string|null {
 try {const url=new URL(raw,base);return ["https:","http:"].includes(url.protocol)?url.href:null;}catch{return null;}
}
async function bounded<T>(run:()=>Promise<T>,signal:AbortSignal):Promise<T>{
 signal.throwIfAborted();
 return new Promise<T>((resolve,reject)=>{
  const abort=()=>reject(signal.reason);
  signal.addEventListener("abort",abort,{once:true});
  Promise.resolve().then(run).then(resolve,reject).finally(()=>signal.removeEventListener("abort",abort));
 });
}
/** RSS 用原 parseFeed；手动跳转逐次校验，正文大小和读取时间有界。 */
async function readFeed(source:TrendSourceProjection,signal:AbortSignal){
 let url=source.url;
 for(let redirects=0;redirects<6;redirects++){
  signal.throwIfAborted();await assertUrlAllowed(url);signal.throwIfAborted();
  const response=await fetch(url,{redirect:"manual",signal,headers:{Accept:"application/rss+xml, application/atom+xml, application/xml, text/xml, */*"}});
  if(response.status>=300&&response.status<400){
   const location=response.headers.get("location");await response.body?.cancel();
   if(!location)throw new Error("RSS 跳转缺少地址");
   url=new URL(location,url).href;continue;
  }
  if(!response.ok){await response.body?.cancel();throw new Error(`RSS HTTP ${response.status}`);}
  const reader=response.body?.getReader();if(!reader)return [];
  const decoder=new TextDecoder();let text="",bytes=0;
  try{
   while(true){
    signal.throwIfAborted();const chunk=await reader.read();if(chunk.done)break;
    bytes+=chunk.value.byteLength;if(bytes>1_500_000)throw new Error("RSS 正文过大");
    text+=decoder.decode(chunk.value,{stream:true});
   }
   text+=decoder.decode();
  }finally{await reader.cancel().catch(()=>{});}
  return parseFeed(text,source.domain).map(item=>({...item,url:publicLink(item.url,url)})).filter(item=>item.url!==null).slice(0,8);
 }
 throw new Error("RSS 跳转次数过多");
}

/** 原始网页摘要/RSS/搜索先冻结，内容理解留给 Worker 的 topic.generate；不调用 trend.extract。 */
export function createChatTrendRead(deps:ChatTrendReadDeps){
 return async(context:RequestContext,positioningBrief:string,abort?:AbortSignal)=>{
  const owner=structuredClone(context);
  if(!owner.userId||!owner.accountId)throw new Error("热点读取缺少当前账号");
  abort?.throwIfAborted();
  const signal=AbortSignal.any([...(abort?[abort]:[]),AbortSignal.timeout(45_000)]);
  let listFailed=false;
  const sourcesPromise=bounded(()=>deps.listEnabledSources(owner),signal).catch(()=>{listFailed=true;return [] as TrendSourceProjection[];});
  const searchPromise=bounded(()=>deps.search(owner,buildTrendQuery(positioningBrief),{count:8,signal}),signal).then(items=>items.filter(item=>item.title.trim()&&publicLink(item.url)).slice(0,8)).catch(()=>[]);
  const sources=structuredClone(await sourcesPromise);
  abort?.throwIfAborted();
  type Read={brief:string;sourceCount:number;signalCount:number;rawWeb:boolean};
  const results:Array<Read|null>=sources.map(()=>null);let cursor=0;
  // 按已登记顺序保留结果；并发上限只限制资源占用，不评价信源内容。
  await Promise.all(Array.from({length:Math.min(3,sources.length)},async()=>{
   while(cursor<sources.length&&!signal.aborted){
    const index=cursor++,source=sources[index]!;
    const child=AbortSignal.any([signal,AbortSignal.timeout(20_000)]);
    try{
     if(source.sourceType==="rss"){
      const items=await bounded(()=>readFeed(source,child),child);
      if(items.length)results[index]={brief:[`【已登记 RSS：${source.name}】\n来源：${source.url}`,...items.map(item=>`${item.title}\n链接：${item.url}${item.publishedAt?`\n发布时间：${item.publishedAt}`:""}${item.snippet?`\n原文摘要：${item.snippet.slice(0,2500)}`:""}`)].join("\n\n"),sourceCount:1,signalCount:items.length,rawWeb:false};
     }else{
      const page=await bounded(()=>deps.readWebSource(owner,source,child),child);
      const text=page.text.trim(),url=publicLink(page.sourceUrl??source.url);
      if(text&&url)results[index]={brief:`【已登记网页：${source.name}】\n来源：${url}\n以下为真实正文摘录，尚未提炼热点条目；不得把导航、广告或阅读时间当作事件/发布时间：\n${text.slice(0,40000)}${text.length>40000?"\n（正文较长，仅保留前 40000 字）":""}`,sourceCount:1,signalCount:0,rawWeb:true};
     }
    }catch{abort?.throwIfAborted(); /* 单源失败保留其他真实依据。 */}
   }
  }));
  const search=await searchPromise;abort?.throwIfAborted();
  const successful=results.filter((item):item is Read=>item!==null);
  const searchBrief=search.length?["【当前搜索结果】",...search.map(item=>`${item.title}\n链接：${item.url}${item.snippet?`\n原文摘要：${item.snippet.slice(0,2500)}`:""}`)].join("\n\n"):"";
  const notes:string[]=[];
  if(listFailed)notes.push("本次未能读取当前账号的已登记信源列表");
  else if(!sources.length)notes.push("当前没有已启用的网页/RSS 信源");
  if(sources.length>successful.length)notes.push(`${sources.length-successful.length} 个已登记信源未取得正文或条目（可能为空、超时或需要登录）`);
  if(!search.length)notes.push("本次搜索未取得可引用结果");
  if(successful.some(item=>item.rawWeb))notes.push("网页依据是原文摘录，热点条目由本次生成模型理解；未计算网页热度或条目数量");
  if(!successful.length&&!search.length)notes.push("本次没有实时网络依据，候选不能声称基于当前热榜或已核实的新事件");
  return {brief:[...successful.map(item=>item.brief),searchBrief].filter(Boolean).join("\n\n"),sourceCount:successful.length+(search.length?1:0),signalCount:successful.reduce((sum,item)=>sum+item.signalCount,0)+search.length,note:notes.length?notes.join("；"):null};
 };
}
