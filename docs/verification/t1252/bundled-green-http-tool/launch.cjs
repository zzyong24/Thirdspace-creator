'use strict';const entryClock=performance.now();
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),crypto=require('node:crypto');
const root=fs.realpathSync(path.resolve(__dirname,'../../../..')),BF=path.join(__dirname,'input-binding.json'),H=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),hashBytes=b=>crypto.createHash('sha256').update(b).digest('hex');
const REQUEST=120000,DELAY=310000,CHILD=8400000,HELPER=2160000,PREP=240000,POST=600000,MARGIN=120000,CASE=REQUEST+CHILD+HELPER+REQUEST,OUTER=PREP+2*CASE+POST+MARGIN,deadline=entryClock+OUTER;
const ctrl=new AbortController();let timer,expired=false;const onStop=()=>ctrl.abort(Error('OWNED_GREEN_HTTP_INTERRUPTED'));process.once('SIGINT',onStop);process.once('SIGTERM',onStop);
function tick(){if(performance.now()>=deadline){expired=true;ctrl.abort(Error('GREEN_FULL_OUTER_EXHAUSTED'));}else timer=setTimeout(tick,Math.min(60000,deadline-performance.now()));}tick();
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n',{flag:'wx',mode:0o600});
function finite(p,ms,label){let t;return Promise.race([p,new Promise((_,reject)=>{t=setTimeout(()=>reject(Error(label)),ms);})]).finally(()=>clearTimeout(t));}
async function run(){let b,runRoot,toolSha,bindingSha,failure=null,results=[],after=[];
 try{
  if(process.platform!=='darwin'||process.env.CREATOROS_T1252_GREEN_TOOL_REVIEWED!=='1'||process.env.CREATOROS_T1252_GREEN_TOOL_SHA256!==H(__filename)||process.env.CREATOROS_T1252_GREEN_BINDING_SHA256!==H(BF))throw Error('ROOT_EXACT_BUNDLED_GREEN_REVIEW_REQUIRED');
  b=JSON.parse(fs.readFileSync(BF,'utf8'));toolSha=H(__filename);bindingSha=H(BF);if(process.execPath!==b.node.path||H(process.execPath)!==b.node.sha256||H(b.bundle.path)!==b.bundle.sha256||b.bundle.actualStandardBuildComplete!==true||b.outerMs!==OUTER)throw Error('ACTUAL_NODE_BUNDLED_CLI_FULL_BUDGET_REQUIRED');
  for(const x of b.inputs)if(H(path.join(root,x.path))!==x.sha256)throw Error('GREEN_SOURCE_INPUT_CHANGED');const helper=path.join(root,b.helper.path);if(H(helper)!=='393f88771f732e57959ce948a61104fe616c6090faa3e21808186a6df7df3dea'||H(helper)!==b.helper.sha256)throw Error('OWNED_HELPER_REQUIRED');const runtime=require(helper);
  if(ctrl.signal.aborted||performance.now()-entryClock>PREP||deadline-performance.now()<2*CASE+POST+MARGIN)throw Error('COMPLETE_TWO_HTTP_CASES_REMAINING_REQUIRED');
  runRoot=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'creatoros-t1252-bundled-green-')));fs.chmodSync(runRoot,0o700);const nonce=crypto.randomUUID();write(path.join(runRoot,'start.json'),{at:new Date().toISOString(),runRoot,nonce,node:b.node,bundle:b.bundle,toolSha256:toolSha,bindingSha256:bindingSha,outerMs:OUTER,caseMs:CASE,childMs:CHILD,helperCleanupReserveMs:HELPER,fixtureDelayMs:DELAY,notOfficialModelOrPublicBusiness:true});console.log(JSON.stringify({runRoot,stage:'actual-bundled-green-http'}));
  for(const [index,scenario] of ['headers','body'].entries()){
   if(ctrl.signal.aborted||deadline-performance.now()<(2-index)*CASE+POST+MARGIN)throw Error('NO_NEW_CASE_WITHOUT_COMPLETE_REMAINING');
   const started=performance.now(),payload=Buffer.from(JSON.stringify({data:{scenario,fixtureNonce:nonce},meta:{requestId:`original-${scenario}-${nonce}`}})),expectedHash=hashBytes(payload),events=[],connections=new Set();let releaseTimer,requests=0,actualRequestHash=null,headersAt=null,releaseAt=null,responseFailure=null,receipt=null,serverClosed=false,caseError=null;
   const event=kind=>events.push({kind,elapsedMs:performance.now()-started});
   const server=http.createServer(async(req,res)=>{
    requests++;event('actual_packaged_cli_request_received');
    try{
     let bytes=Buffer.alloc(0);for await(const part of req){bytes=Buffer.concat([bytes,part]);if(bytes.length>4096)throw Error('OWNED_REQUEST_TOO_LARGE');}actualRequestHash=hashBytes(bytes);
     if(req.method!=='POST'||req.url!=='/api/v1/dispatch'||bytes.toString('utf8')!==JSON.stringify({id:'accounts.list',input:{}})||req.headers['x-account-id']!==`owned-account-${nonce}`||req.headers['x-group-id']!==`owned-group-${nonce}`||req.headers['x-creatoros-cli-access']!==`owned-token-${nonce}`){res.writeHead(403).end();throw Error('EXACT_ORIGINAL_CLI_SCOPE_REQUIRED');}
     if(scenario==='body'){res.writeHead(200,{'content-type':'application/json','content-length':payload.length});res.flushHeaders();res.write(payload.subarray(0,8));headersAt=performance.now()-started;event('response_headers_partial_body');}
     releaseTimer=setTimeout(()=>{releaseAt=performance.now()-started;event('fixed_protocol_release');if(res.destroyed)return;if(scenario==='headers'){res.writeHead(200,{'content-type':'application/json','content-length':payload.length});headersAt=performance.now()-started;res.end(payload);}else res.end(payload.subarray(8));},DELAY);
    }catch(e){responseFailure=e.message;if(!res.destroyed&&!res.writableEnded){res.writeHead(400).end();}}
   });server.on('connection',s=>{connections.add(s);s.once('close',()=>connections.delete(s));});
   try{
    await finite(new Promise((resolve,reject)=>{server.once('error',reject);server.listen({host:'127.0.0.1',port:0,exclusive:true},()=>{server.off('error',reject);resolve();});}),REQUEST,'OWNED_LISTEN_STARTUP_EXHAUSTED');const addr=server.address();if(!addr||typeof addr==='string'||addr.address!=='127.0.0.1')throw Error('EXCLUSIVE_OWNED_LOOPBACK_REQUIRED');write(path.join(runRoot,scenario+'-listener.json'),{pid:process.pid,host:addr.address,port:addr.port,nonce,scenario});
    const env=runtime.cleanEnv();for(const k of Object.keys(env))if(/^(CREATOROS_|GROWTH_|TAURI_|S3_|AWS_|OPENAI_|ANTHROPIC_|AZURE_|GOOGLE_API_|GEMINI_|DEEPSEEK_|REDIS_)/.test(k)||/(?:API_KEY|AUTH_TOKEN|SECRET|PASSWORD)$/.test(k))delete env[k];Object.assign(env,{PATH:path.dirname(b.node.path)+':/usr/bin:/bin',TMPDIR:runRoot,TMP:runRoot,TEMP:runRoot,CREATOROS_BASE_URL:`http://127.0.0.1:${addr.port}`,CREATOROS_CLI_ACCESS_TOKEN:`owned-token-${nonce}`,CREATOROS_CLI_ACCESS_FILE:'',CREATOROS_EMAIL:'',CREATOROS_PASSWORD:'',CI:'1'});if(env.HOME!==process.env.HOME||env.CODEX_HOME!==process.env.CODEX_HOME)throw Error('SYSTEM_ROOTS_MUST_REMAIN_ORIGINAL');
    const log=path.join(runRoot,scenario+'-actual-cli.log');receipt=await runtime.boundedProcess(b.node.path,[b.bundle.path,'call','accounts.list','--input','{}','--account',`owned-account-${nonce}`,'--group',`owned-group-${nonce}`,'--json'],{cwd:runRoot,env,log,budgetMs:CHILD,signal:ctrl.signal});write(path.join(runRoot,scenario+'-cli-receipt.json'),receipt);
    if(receipt.code!==0||receipt.spawnError||receipt.budgetExhausted||!receipt.processClosed||receipt.remainingOwnedGroupMembers.length)throw Error('ACTUAL_BUNDLED_CLI_OR_CLEANUP_FAILED');const output=JSON.parse(fs.readFileSync(log,'utf8'));event('actual_cli_complete_JSON_EOF_and_close');
    if(output.ok!==true||output.operation!=='accounts.list'||output.accountId!==`owned-account-${nonce}`||output.groupId!==`owned-group-${nonce}`||output.requestId!==`original-${scenario}-${nonce}`||JSON.stringify(output.data)!==JSON.stringify({scenario,fixtureNonce:nonce})||requests!==1||releaseAt===null||releaseAt<300000||responseFailure)throw Error('ACTUAL_SINGLE_REQUEST_AND_COMPLETE_ORIGINAL_REPLY_REQUIRED');
    if(hashBytes(Buffer.from(JSON.stringify({data:output.data,meta:output.meta})))!==expectedHash)throw Error('ORIGINAL_COMPLETE_ENVELOPE_HASH_MISMATCH');
    if(scenario==='headers'&&(headersAt===null||headersAt<300000)||scenario==='body'&&(headersAt===null||headersAt>=300000))throw Error('ACTUAL_HEADER_VS_PARTIAL_BODY_STAGE_REQUIRED');
   }catch(e){caseError=e;}
   finally{
    clearTimeout(releaseTimer);try{await finite(new Promise((resolve,reject)=>{server.close(error=>error&&error.code!=='ERR_SERVER_NOT_RUNNING'?reject(error):resolve());server.closeAllConnections();for(const s of connections)s.destroy();}),REQUEST,'OWNED_HTTP_CLOSE_UNKNOWN');serverClosed=true;}catch(e){caseError??=e;}
    const result={scenario,pid:process.pid,nonce,elapsedMs:performance.now()-started,requests,headersAt,releaseAt,requestHash:actualRequestHash,expectedBodyHash:expectedHash,expectedBodyBytes:payload.length,responseFailure,serverClosed,cliReceipt:receipt,events,status:caseError?'FAIL':'PASS',error:caseError?.message??null,notOfficialModel:true,notPublicBusinessTask:true};write(path.join(runRoot,scenario+'-actual-green.json'),result);results.push(result);if(caseError)failure??=caseError;
   }
   if(ctrl.signal.aborted)throw Error('NO_NEW_CASE_AFTER_CANCEL');
  }
 }catch(e){failure??=e;}
 finally{
  try{after=(b?.inputs??[]).map(x=>({path:x.path,same:H(path.join(root,x.path))===x.sha256}));if(after.some(x=>!x.same)||toolSha!==H(__filename)||bindingSha!==H(BF)||b?.node.sha256!==H(process.execPath)||b?.bundle.sha256!==H(b.bundle.path))failure??=Error('ACTUAL_SOURCE_TOOL_NODE_BUNDLE_DRIFT');}catch(e){failure??=e;}
  clearTimeout(timer);process.removeListener('SIGINT',onStop);process.removeListener('SIGTERM',onStop);if(performance.now()>=deadline)expired=true;if(runRoot){write(path.join(runRoot,'final.json'),{at:new Date().toISOString(),runRoot,status:failure||expired?'failed':'two_actual_bundled_green_complete',error:failure?.message??null,expired,elapsedMs:performance.now()-entryClock,actualPassed:results.filter(r=>r.status==='PASS').length,actualFailed:results.filter(r=>r.status==='FAIL').length,results,inputAfter:after,notPublicBusinessOrAppAcceptance:true});console.log(JSON.stringify({runRoot,status:failure||expired?'failed':'two_actual_bundled_green_complete',error:failure?.message??null}));}else console.error(JSON.stringify({status:'startup_failed',error:failure?.message}));if(failure||expired)process.exitCode=1;
 }
}
if(require.main===module)run().catch(e=>{clearTimeout(timer);console.error(JSON.stringify({status:'uncaught_failed',error:e.name}));process.exitCode=1;});
