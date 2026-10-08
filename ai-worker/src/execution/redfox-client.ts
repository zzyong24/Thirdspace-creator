import {executionTimeoutMs} from "@creatoros/contract/timeout-policy";
import {redfoxInputSchema,type RedfoxInput,redfoxObservationSchema} from "@creatoros/contract/execution-worker";
/** 固定官方域名和端点；模型无法指定 API URL/请求头。 */
export async function queryRedfox(input:RedfoxInput,key:string,signal:AbortSignal,fetcher:typeof fetch=fetch){
 const parsed=redfoxInputSchema.safeParse(input);if(!parsed.success)return redfoxObservationSchema.parse({status:"error",code:"REDFOX_INPUT_INVALID"});const q=parsed.data;let path:string;let body:unknown;
 switch(q.action){
 case "hotspots":{const a=Date.parse(q.startDate.replace(" ","T")+(q.startDate.length===10?"T00:00:00+08:00":"+08:00")),b=Date.parse(q.endDate.replace(" ","T")+(q.endDate.length===10?"T00:00:00+08:00":"+08:00"));if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a||b-a>30*86400000)return redfoxObservationSchema.parse({status:"error",code:"REDFOX_DATE_RANGE_INVALID"});path="/story/api/hotKeyword/list";body={startDate:q.startDate,endDate:q.endDate};break;}
 case "search":path="/story/api/dy/data/searchWork";body={keyword:q.keyword,pageNum:q.page,pageSize:20};break;
 case "accountWorks":{const u=new URL(q.authorUrl);if(u.protocol!=="https:"||u.hostname!=="www.douyin.com"||!u.pathname.startsWith("/user/"))return redfoxObservationSchema.parse({status:"error",code:"REDFOX_AUTHOR_URL_INVALID"});path="/story/api/dyData/queryWorkList";body={authorUrl:q.authorUrl,offset:q.offset,sortType:"2"};break;}
 case "detail":path="/story/api/dyData/queryWork";body={workId:q.workId};break;
 case "transcriptSubmit":{const u=new URL(q.url);if(u.protocol!=="https:"||!["www.douyin.com","v.douyin.com"].includes(u.hostname))return redfoxObservationSchema.parse({status:"error",code:"REDFOX_VIDEO_URL_INVALID"});path="/story/api/parseWork/audioTextExtract/submit/douyin";body={url:q.url};break;}
 case "transcriptResult":path="/story/api/parseWork/audioTextExtract/result/douyin";body={taskId:q.taskId};break;
 }
 const submit=q.action==="transcriptSubmit";
 for(let attempt=0;attempt<3;attempt++){
  signal.throwIfAborted();try{
   const response=await fetcher("https://redfox.hk"+path,{method:"POST",redirect:"error",headers:{"Content-Type":"application/json",REDFOX_API_KEY:key},body:JSON.stringify(body),signal:AbortSignal.any([signal,AbortSignal.timeout(executionTimeoutMs())])});
   if(response.status===401||response.status===403)return redfoxObservationSchema.parse({status:"error",code:"REDFOX_AUTH_INVALID"});
   if(response.status===429||response.status>=500){if(submit)return redfoxObservationSchema.parse({status:"unknown",code:"REDFOX_SUBMIT_UNKNOWN"});if(attempt<2){await pause(attempt,signal);continue;}return redfoxObservationSchema.parse({status:"error",code:response.status===429?"REDFOX_RATE_LIMIT":"REDFOX_UPSTREAM_UNAVAILABLE"});}
   if(!response.ok)return redfoxObservationSchema.parse({status:"error",code:"REDFOX_HTTP_"+response.status});
   const text=await response.text();if(text.length>500000)throw Error("REDFOX_RESPONSE_TOO_LARGE");const envelope=JSON.parse(text);
   // SEMANTIC_BOUNDARY_ALLOW: 仅翻译 RedFox 已定义的额度协议码，供对话明确告知用户补充额度；不参与内容判断。
   if(envelope.code!==2000)return redfoxObservationSchema.parse({status:"error",code:[401,4001].includes(envelope.code)?"REDFOX_AUTH_INVALID":envelope.code===3201?"REDFOX_QUOTA_EXHAUSTED":"REDFOX_BUSINESS_"+(typeof envelope.code==="number"?String(envelope.code):"INVALID_CODE")});
   if(submit && (typeof envelope.data?.taskId!=="string" || !envelope.data.taskId.trim()))return redfoxObservationSchema.parse({status:"unknown",code:"REDFOX_SUBMIT_RECEIPT_INVALID"});
   // SEMANTIC_BOUNDARY_ALLOW: 凭据字段和签名URL按协议清理，只控制泄露，不做内容选择。
   const clean=(v:unknown):unknown=>{if(typeof v==="string")return v.includes(key)?"[已隐藏]":v.startsWith("http")&&/[?&](token|sign|signature|auth|key|expires)=/i.test(v)?"[临时媒体地址已隐藏]":v;if(Array.isArray(v))return v.map(clean);if(v&&typeof v==="object")return Object.fromEntries(Object.entries(v).filter(([k])=>!/(api.?key|secret|authorization|cookie|token)/i.test(k)).map(([k,val])=>[k,clean(val)]));return v;};
   return redfoxObservationSchema.parse({status:"ok",data:clean(envelope.data??{})});
  }catch{signal.throwIfAborted();if(submit)return redfoxObservationSchema.parse({status:"unknown",code:"REDFOX_SUBMIT_UNKNOWN"});if(attempt===2)return redfoxObservationSchema.parse({status:"error",code:"REDFOX_NETWORK_OR_RESPONSE_ERROR"});await pause(attempt,signal);}
 }
 throw Error("REDFOX_RETRY_EXHAUSTED");
}
function pause(attempt:number,signal:AbortSignal){return new Promise<void>((resolve,reject)=>{const stop=()=>{clearTimeout(timer);reject(Error("ABORTED"));};const timer=setTimeout(()=>{signal.removeEventListener("abort",stop);resolve();},300*2**attempt);signal.addEventListener("abort",stop,{once:true});});}
