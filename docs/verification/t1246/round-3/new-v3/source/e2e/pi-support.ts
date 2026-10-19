import {createServer,type Server} from 'node:http';
import {appendFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {expect,REQUEST,Journey} from './acceptance-support';
// 仅Pi私有runtime的明确HTTP协议fixture。无官方上游、无真实secret、无数据库写入。
export async function startPiFixture(j:Journey){
 if(process.env.CREATOROS_T1246_PROFILE!=='pi')throw Error('PI_PROFILE_REQUIRED');
 const records:any[]=[];const audit=resolve(process.env.CREATOROS_T1246_RUN_DIR!,'pi-http.ndjson');
 const httpObservations:{method:string;path:string;outcome:string}[]=[];const pending=new Set<Promise<void>>();const handlerErrors:{name:string;code:string|null}[]=[];let captureStarted=false;let serverClosed=false;let closeOnce:Promise<void>|undefined;
 const bounded=async<T>(work:Promise<T>,code:string)=>{let timer:NodeJS.Timeout|undefined;try{return await Promise.race([work,new Promise<never>((_,bad)=>{timer=setTimeout(()=>bad(Object.assign(Error(code),{code})),REQUEST);})]);}finally{if(timer)clearTimeout(timer);}};
 const text='这是受控 Pi HTTP 兼容协议夹具的实际回答；不是官方模型生成。桌面整理采用正在使用、需要保留、暂时不需要三类。';
 const server=createServer((req,res)=>{const observation={method:req.method??'',path:req.url==='/v1/chat/completions'?'/v1/chat/completions':'other',outcome:'started'};httpObservations.push(observation);const work=(async()=>{let body='';for await(const chunk of req){body+=chunk;if(body.length>1_000_000){observation.outcome='body-too-large';res.writeHead(413).end();return;}}
  if(req.method!=='POST'||req.url!=='/v1/chat/completions'){observation.outcome='route-rejected';res.writeHead(404).end();return;}
  let value:any;try{value=JSON.parse(body);}catch{observation.outcome='json-rejected';res.writeHead(400).end();return;}
  const record={at:new Date().toISOString(),path:req.url,model:value.model,stream:value.stream===true,messageCount:value.messages?.length??0,callIndex:records.length+1};records.push(record);await appendFile(audit,JSON.stringify(record)+'\n');
  if(value.model!=='t1246-pi-fixture'){observation.outcome='model-rejected';res.writeHead(400).end();return;}observation.outcome='completion';
  const identity={id:'chatcmpl-fixture-'+record.callIndex,object:'chat.completion',created:Math.floor(Date.now()/1000),model:value.model};
  if(value.stream){res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache'});for(const event of [{...identity,object:'chat.completion.chunk',choices:[{index:0,delta:{role:'assistant',content:text},finish_reason:null}]},{...identity,object:'chat.completion.chunk',choices:[{index:0,delta:{},finish_reason:'stop'}],usage:{prompt_tokens:11,completion_tokens:7,total_tokens:18}}])res.write('data: '+JSON.stringify(event)+'\n\n');res.end('data: [DONE]\n\n');}
  else{res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({...identity,choices:[{index:0,message:{role:'assistant',content:text},finish_reason:'stop'}],usage:{prompt_tokens:11,completion_tokens:7,total_tokens:18}}));}
 })();pending.add(work);void work.catch((e:any)=>{observation.outcome='handler-error';handlerErrors.push({name:e?.name??'Error',code:typeof e?.code==='string'?e.code:null});if(!res.destroyed)res.destroy();}).finally(()=>pending.delete(work));});server.requestTimeout=REQUEST;server.headersTimeout=REQUEST;
 const close=()=>closeOnce??=(async()=>{let closureError:unknown;try{server.closeAllConnections();await bounded((async()=>{await new Promise<void>((ok,bad)=>server.close(e=>e?((e as NodeJS.ErrnoException).code==='ERR_SERVER_NOT_RUNNING'&&!captureStarted?ok():bad(e)):ok()));serverClosed=true;await Promise.allSettled([...pending]);})(),'PI_FIXTURE_CLOSE_TIMEOUT');}catch(e){closureError=e;}const value={schema:'T1267-owned-pi-http-audit/v1',profile:'pi',runDir:process.env.CREATOROS_T1246_RUN_DIR,candidate:process.env.CREATOROS_T1246_FROZEN_CANDIDATE,at:new Date().toISOString(),captureStarted,serverClosed,pendingHandlers:pending.size,status:captureStarted&&serverClosed&&!closureError&&!pending.size&&!handlerErrors.length?'complete':'partial',requestCount:captureStarted?httpObservations.length:null,completionRequestCount:captureStarted?httpObservations.filter(r=>r.outcome==='completion').length:null,recordsCount:records.length,httpObservations,handlerErrors,closureError:closureError?{name:(closureError as Error).name,code:(closureError as any).code??null}:null,closureBudgetMs:REQUEST,auditBudgetMs:REQUEST,notOfficialModel:true};let auditError:unknown;try{await bounded(writeFile(resolve(process.env.CREATOROS_T1246_RUN_DIR!,'pi-http-final-audit.json'),JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600}),'PI_FIXTURE_AUDIT_TIMEOUT');}catch(e){auditError=e;}if(closureError||auditError||handlerErrors.length)throw new AggregateError([closureError,auditError,...(handlerErrors.length?[Error('PI_FIXTURE_HANDLER_FAILED')]:[])].filter(Boolean),'PI_FIXTURE_FINALIZATION_FAILED');})();
 try{
 await bounded(new Promise<void>((ok,bad)=>{server.once('error',bad);server.listen(0,'127.0.0.1',()=>{captureStarted=true;ok();});}),'PI_FIXTURE_LISTEN_TIMEOUT');const address=server.address();if(!address||typeof address==='string')throw Error('PI_LOCAL_BIND_FAILED');
 const baseUrl=`http://127.0.0.1:${address.port}/v1`;
 await j.op('settings.preferences.patch',{body:{assistantExecutionEngine:'pi'}});
 await j.op('settings.models.put',{params:{capability:'topic.generate'},body:{provider:'openai-compatible',modelName:'t1246-pi-fixture',baseUrl,apiFormat:'openai_chat',secret:'t1246-owned-synthetic-fixture-key'}});
 const model=(await j.op('settings.models.list')).find((m:any)=>m.capability==='topic.generate');expect(model.modelName).toBe('t1246-pi-fixture');expect(model.baseUrl).toBe(baseUrl);
 return {text,records,close};
 }catch(error){try{await close();}catch(finalizationError){throw new AggregateError([error,finalizationError],'PI_FIXTURE_SETUP_AND_FINALIZATION_FAILED');}throw error;}
}
