import {createServer,type Server} from 'node:http';
import {appendFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {expect,REQUEST,Journey} from './acceptance-support';
// 仅Pi私有runtime的明确HTTP协议fixture。无官方上游、无真实secret、无数据库写入。
export async function startPiFixture(j:Journey){
 if(process.env.CREATOROS_T1246_PROFILE!=='pi')throw Error('PI_PROFILE_REQUIRED');
 const records:any[]=[];const audit=resolve(process.env.CREATOROS_T1246_RUN_DIR!,'pi-http.ndjson');
 const text='这是受控 Pi HTTP 兼容协议夹具的实际回答；不是官方模型生成。桌面整理采用正在使用、需要保留、暂时不需要三类。';
 const server=createServer(async(req,res)=>{let body='';for await(const chunk of req){body+=chunk;if(body.length>1_000_000){res.writeHead(413).end();return;}}
  if(req.method!=='POST'||req.url!=='/v1/chat/completions'){res.writeHead(404).end();return;}
  let value:any;try{value=JSON.parse(body);}catch{res.writeHead(400).end();return;}
  const record={at:new Date().toISOString(),path:req.url,model:value.model,stream:value.stream===true,messageCount:value.messages?.length??0,callIndex:records.length+1};records.push(record);await appendFile(audit,JSON.stringify(record)+'\n');
  if(value.model!=='t1246-pi-fixture'){res.writeHead(400).end();return;}
  const identity={id:'chatcmpl-fixture-'+record.callIndex,object:'chat.completion',created:Math.floor(Date.now()/1000),model:value.model};
  if(value.stream){res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache'});for(const event of [{...identity,object:'chat.completion.chunk',choices:[{index:0,delta:{role:'assistant',content:text},finish_reason:null}]},{...identity,object:'chat.completion.chunk',choices:[{index:0,delta:{},finish_reason:'stop'}],usage:{prompt_tokens:11,completion_tokens:7,total_tokens:18}}])res.write('data: '+JSON.stringify(event)+'\n\n');res.end('data: [DONE]\n\n');}
  else{res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({...identity,choices:[{index:0,message:{role:'assistant',content:text},finish_reason:'stop'}],usage:{prompt_tokens:11,completion_tokens:7,total_tokens:18}}));}
 });server.requestTimeout=REQUEST;server.headersTimeout=REQUEST;
 await new Promise<void>((ok,bad)=>{server.once('error',bad);server.listen(0,'127.0.0.1',ok);});const address=server.address();if(!address||typeof address==='string')throw Error('PI_LOCAL_BIND_FAILED');
 const baseUrl=`http://127.0.0.1:${address.port}/v1`;
 await j.op('settings.preferences.patch',{body:{assistantExecutionEngine:'pi'}});
 await j.op('settings.models.put',{params:{capability:'copilot.assist'},body:{provider:'openai-compatible',modelName:'t1246-pi-fixture',baseUrl,apiFormat:'openai_chat',secret:'t1246-owned-synthetic-fixture-key'}});
 const model=(await j.op('settings.models.list')).find((m:any)=>m.capability==='copilot.assist');expect(model.modelName).toBe('t1246-pi-fixture');expect(model.baseUrl).toBe(baseUrl);
 return {text,records,async close(){server.closeAllConnections();await new Promise<void>((ok,bad)=>server.close(e=>e?bad(e):ok()));}};
}
