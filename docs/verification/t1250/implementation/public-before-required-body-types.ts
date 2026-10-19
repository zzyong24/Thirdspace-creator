import {afterEach,it,expect} from "vitest";
import {ENDPOINTS} from "@creatoros/contract";
import {compositeTransport,__resetPersistenceForTests} from "./persistence-client";

const ctx={userId:"cli-integration-user",accountId:"cli-integration-account",requestId:"cli-integration",source:"user" as const};
afterEach(()=>__resetPersistenceForTests());
it("公开dispatch真实装配可发现宿主能力，并拒绝未授权任务/产物",async()=>{
 const empty={params:undefined,query:undefined,body:undefined};
 const result=await compositeTransport.request(ENDPOINTS.listWorkbenchCapabilities,empty,ctx);
 const catalog=ENDPOINTS.listWorkbenchCapabilities.response.parse((result as {data:unknown}).data);
 expect(catalog.dependencyLock.piCodingAgent).toBeTruthy();
 expect(catalog.builtins.some(b=>b.id==="creatoros.task-files")).toBe(true);
 for(const endpoint of [ENDPOINTS.inspectWorkbenchTask,ENDPOINTS.readWorkbenchEvents]){
  await expect(compositeTransport.request(endpoint,{...empty,params:{taskId:"foreign"},query:{afterSequence:0,limit:50}},ctx)).rejects.toThrow();
 }
 await expect(compositeTransport.request(ENDPOINTS.listWorkbenchArtifacts,{...empty,params:{conversationId:"foreign"},query:{limit:50}},ctx)).rejects.toThrow();
 await expect(compositeTransport.request(ENDPOINTS.renderWorkbenchArtifact,{...empty,params:{taskId:"foreign",artifactId:"foreign",version:1},query:{format:"preview"}},ctx)).rejects.toThrow();
 await expect(compositeTransport.request(ENDPOINTS.listWorkbenchCapabilities,empty)).rejects.toThrow();
});

it('T1250 原任务真实登记HTML版本→公共render transport→慢Chromium PNG/PDF保同来源hash和有效字节',async()=>{
 const {createHash,randomUUID}=await import('node:crypto');
 const {createDb}=await import('@creatoros/backend');
 const {createPersistentTaskService,createWorkbenchArtifactReadService,createWorkbenchPublicService,createWorkbenchPublicStreamService,createWorkbenchPublicTransport}=await import('@creatoros/backend/modules/execution');
 const {createWorkbenchArtifactHost}=await import('./workbench-artifact-host');
 const {createWorkbenchArtifactRepresentation}=await import('./workbench-artifact-representation');
 const {chromium}=await import('@playwright/test'),{vi}=await import('vitest'),{PNG}=await import('pngjs'),{PDFParse}=await import('pdf-parse');
 const store=await createDb(),nonce=randomUUID(),owner={userId:`slow-artifact-${nonce}`,accountId:`slow-account-${nonce}`,requestId:nonce,source:'user' as const};
 const tasks=createPersistentTaskService(store.db),task=await tasks.enqueue(owner,{kind:'ai_task',ownerType:'ai_task',ownerId:nonce,idempotencyKey:nonce,payload:{}});
 const claim=(await tasks.claimTask({taskId:task.id,workerId:`slow-worker-${nonce}`}))!;
 const bytes=Buffer.from('<style>body{margin:0;background:#df2828}</style><h1>Slow public original report</h1>'),objects=new Map<string,Uint8Array>();
 const digest=(value:Uint8Array)=>createHash('sha256').update(value).digest('hex');
 const blobs={submit:async(_ctx:unknown,input:{operationId:string;bytes:Uint8Array})=>{const hash=digest(input.bytes);objects.set(`${input.operationId}:${hash}`,new Uint8Array(input.bytes));return {hash,size:input.bytes.byteLength};},read:async(_ctx:unknown,input:{operationId:string;hash:string})=>{const value=objects.get(`${input.operationId}:${input.hash}`);if(!value)throw Error('MISSING_OWNED_BLOB');return new Uint8Array(value);}};
 const host=createWorkbenchArtifactHost(store.db,{platform:'darwin',desktop:true,socketPath:'private-controlled-file-source.sock',blobs,filePort:async(_ref,_operationId,action)=>{if(action.kind==='stat')return {isDirectory:false,size:bytes.length,version:1};if(action.kind==='read')return {contentBase64:bytes.subarray(action.offset,action.offset+action.limit).toString('base64'),total:bytes.length,version:1};throw Error('UNEXPECTED_FILE_ACTION');}})!;
 const registration=await host.dispatch({context:{userId:owner.userId,accountId:owner.accountId,taskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken,leaseId:`slow-worker-${nonce}`,operationId:nonce},invocation:{name:'artifact.register',schemaVersion:1,input:{path:'slow/report.html',mime:'text/html'}}},{signal:new AbortController().signal,onProgress:()=>{}});
 expect(registration.status).toBe('succeeded');if(registration.status!=='succeeded')throw Error(JSON.stringify(registration));
 const metadata=JSON.parse(registration.content.find(part=>part.type==='text')!.text) as {artifactId:string;version:number;hash:string};expect(metadata).toMatchObject({version:1,hash:digest(bytes)});
 const artifacts=createWorkbenchArtifactReadService(store.db,{blobs}),transport=createWorkbenchPublicTransport({tasks:createWorkbenchPublicService(store.db),stream:createWorkbenchPublicStreamService(store.db),artifacts,capabilities:()=>({}),render:(ctx,taskId,artifactId,version,format)=>createWorkbenchArtifactRepresentation(artifacts,ctx,taskId,artifactId,version,format),reconcile:async()=>{throw Error('NO_RECONCILE_IN_THIS_CASE');}});
 const launch=chromium.launch.bind(chromium),spy=vi.spyOn(chromium,'launch').mockImplementation(async options=>{const browser=await launch(options),newContext=browser.newContext.bind(browser);vi.spyOn(browser,'newContext').mockImplementation(async options=>{const context=await newContext(options),route=context.route.bind(context);vi.spyOn(context,'route').mockImplementation(async(url,handler,options)=>route(url,async intercepted=>{if(intercepted.request().isNavigationRequest())await new Promise<void>(resolve=>{const timer=setTimeout(resolve,35000);context.once('close',()=>{clearTimeout(timer);resolve();});});if(!intercepted.request().frame().page().isClosed())await handler(intercepted,intercepted.request());},options));return context;});return browser;});
 try{
  for(const format of ['png','pdf'] as const){
   const started=performance.now(),envelope=await transport.request(ENDPOINTS.renderWorkbenchArtifact,{params:{taskId:task.id,artifactId:metadata.artifactId,version:1},query:{format}},owner);
   const result=ENDPOINTS.renderWorkbenchArtifact.response.parse((envelope as {data:unknown}).data),output=Buffer.from(result.data,'base64');
   expect(performance.now()-started).toBeGreaterThan(30000);expect(result).toMatchObject({sourceHash:metadata.hash,metadata:{artifactId:metadata.artifactId,version:1,hash:metadata.hash},size:output.length,hash:digest(output),mime:format==='png'?'image/png':'application/pdf'});
   if(format==='png'){const image=PNG.sync.read(output);expect([...image.data.subarray(0,4)]).toEqual([223,40,40,255]);}
   else{const parser=new PDFParse({data:output});try{expect((await parser.getText()).text).toContain('Slow public original report');}finally{await parser.destroy();}}
  }
  expect((await artifacts.readAll(owner,task.id,metadata.artifactId,1)).bytes).toEqual(new Uint8Array(bytes));
  await expect(transport.request(ENDPOINTS.renderWorkbenchArtifact,{params:{taskId:task.id,artifactId:metadata.artifactId,version:1},query:{format:'png'}},{...owner,accountId:'foreign'})).rejects.toThrow();
  await expect(transport.request(ENDPOINTS.renderWorkbenchArtifact,{params:{taskId:task.id,artifactId:metadata.artifactId,version:2},query:{format:'png'}},owner)).rejects.toThrow();expect(spy).toHaveBeenCalledTimes(2);
 }finally{spy.mockRestore();await store.client.close();}
},1800000);
