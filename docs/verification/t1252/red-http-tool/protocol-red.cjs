'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const EXPECTED_DELAY_MS=310000,PROBE_MS=780000,CLEANUP_MS=120000;
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n',{flag:'wx',mode:0o600});
async function run(){
 const [scenario,runRoot,nonce]=process.argv.slice(2);
 if(!['headers','body'].includes(scenario)||!path.isAbsolute(runRoot)||!nonce||!/^[a-f0-9]{24}$/.test(nonce))throw Error('EXACT_PRIVATE_SCENARIO_REQUIRED');
 const marker=JSON.parse(fs.readFileSync(path.join(runRoot,'marker.json'),'utf8'));
 if(marker.nonce!==nonce||marker.pid!==process.ppid||fs.realpathSync(runRoot)!==runRoot)throw Error('OWNED_PARENT_MARKER_REQUIRED');
 const entered=performance.now();let response,timer,probeTimer,server,connections=new Set(),requests=0,releaseAt=null,headersAt=null,failure=null,cleanupError=null,finished=false;
 const payload=JSON.stringify({data:{scenario,fixtureNonce:nonce},meta:{requestId:`protocol-${nonce}`}}),payloadHash=hash(payload);
 const resultFile=path.join(runRoot,scenario+'-actual-red.json');
 const events=[];const event=kind=>events.push({kind,elapsedMs:performance.now()-entered});
 const stop=async()=>{
  if(timer)clearTimeout(timer);if(probeTimer)clearTimeout(probeTimer);
  if(!server)return;
  let cleanTimer;try{await Promise.race([new Promise((resolve,reject)=>{server.close(e=>e?reject(e):resolve());for(const socket of connections)socket.destroy();server.closeAllConnections();}),new Promise((_,reject)=>{cleanTimer=setTimeout(()=>reject(Error('OWNED_HTTP_CLOSE_UNCONFIRMED')),CLEANUP_MS);})]);}
  finally{clearTimeout(cleanTimer);}
 };
 const onStop=()=>{if(finished)return;failure??={name:'Interrupted',code:'OWNED_PROBE_INTERRUPTED'};void stop();};
 process.once('SIGTERM',onStop);process.once('SIGINT',onStop);
 try{
  server=http.createServer(async(req,res)=>{
   requests++;event('request_received');
   if(req.method!=='POST'||req.url!=='/api/v1/dispatch'||req.headers['x-test-fixture-nonce']!==nonce){res.writeHead(403).end();return;}
   let bytes='';for await(const part of req){bytes+=part;if(bytes.length>4096){req.destroy();return;}}
   if(bytes!==JSON.stringify({id:'protocol.timeout.probe',input:{}})){res.writeHead(400).end();return;}
   if(scenario==='body'){
    res.writeHead(200,{'content-type':'application/json','content-length':Buffer.byteLength(payload)});res.flushHeaders();res.write(payload.slice(0,8));headersAt=performance.now()-entered;event('response_headers_and_partial_body');
   }
   timer=setTimeout(()=>{
    releaseAt=performance.now()-entered;event('scheduled_fixture_release');
    if(res.destroyed)return;
    if(scenario==='headers'){res.writeHead(200,{'content-type':'application/json'});headersAt=performance.now()-entered;res.end(payload);}
    else res.end(payload.slice(8));
   },EXPECTED_DELAY_MS);
  });
  server.on('connection',socket=>{connections.add(socket);socket.once('close',()=>connections.delete(socket));});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen({host:'127.0.0.1',port:0,exclusive:true},()=>{server.off('error',reject);resolve();});});
  const address=server.address();if(!address||typeof address==='string'||address.address!=='127.0.0.1')throw Error('OWNED_LOOPBACK_REQUIRED');
  write(path.join(runRoot,scenario+'-listener.json'),{pid:process.pid,ppid:process.ppid,host:'127.0.0.1',port:address.port,nonce,scenario});
  const controller=new AbortController();probeTimer=setTimeout(()=>controller.abort(Error('COMPLETE_OWNED_PROBE_EXHAUSTED')),PROBE_MS);
  event('original_global_fetch_started');
  response=await globalThis.fetch(`http://127.0.0.1:${address.port}/api/v1/dispatch`,{method:'POST',headers:{'content-type':'application/json','x-test-fixture-nonce':nonce},body:JSON.stringify({id:'protocol.timeout.probe',input:{}}),signal:controller.signal});
  event('fetch_response_available');const text=await response.text();event('complete_body_eof');JSON.parse(text);
  if(response.status!==200||hash(text)!==payloadHash)throw Error('ACTUAL_PROTOCOL_REPLY_MISMATCH');
  result={transportOutcome:'succeeded',httpStatus:response.status,bodyHash:hash(text),bodyBytes:Buffer.byteLength(text)};
 }catch(e){failure??={name:e?.name??'Error',code:e?.cause?.code??e?.code??null};}
 finally{
  finished=true;process.removeListener('SIGTERM',onStop);process.removeListener('SIGINT',onStop);
  try{await stop();event('owned_http_closed');}catch(e){cleanupError={name:e?.name??'Error',code:'OWNED_HTTP_CLOSE_UNCONFIRMED'};}
  const elapsedMs=performance.now()-entered;
  const expectedCode=scenario==='headers'?'UND_ERR_HEADERS_TIMEOUT':'UND_ERR_BODY_TIMEOUT';
  const actualBaselineFailure=Boolean(failure?.code===expectedCode&&requests===1&&elapsedMs>=300000&&elapsedMs<EXPECTED_DELAY_MS+60000&&!cleanupError);
  write(resultFile,{scenario,pid:process.pid,ppid:process.ppid,nonce,actualNode:process.version,builtinUndici:process.versions.undici,declaredFixtureDelayMs:EXPECTED_DELAY_MS,probeMs:PROBE_MS,cleanupMs:CLEANUP_MS,elapsedMs,requests,headersAt,releaseAt,expectedResponseHash:payloadHash,result:typeof result==='undefined'?null:result,failure,cleanupError,actualBaselineFailure,productTestStatus:failure?'FAIL':'PASS',notOfficialModel:true,notPublicBusinessChain:true,events});
  process.stdout.write(JSON.stringify({scenario,resultFile,actualBaselineFailure,transportFailure:failure,elapsedMs})+'\n');
  // 真正RED保非零；收集器独立确认是否为预期旧内层失败，不将产品失败改写PASS。
  process.exitCode=failure||cleanupError?1:0;
 }
}
let result;
if(require.main===module)run().catch(e=>{process.stderr.write(JSON.stringify({name:e.name,code:'PROTOCOL_START_FAILED'})+'\n');process.exitCode=2;});
