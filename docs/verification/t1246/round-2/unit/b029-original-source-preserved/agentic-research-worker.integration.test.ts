import {createServer} from "node:http";
import {createHash,randomUUID} from "node:crypto";
import {mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import {resolve,join} from "node:path";
import {execFileSync} from "node:child_process";
import {expect,it} from "vitest";
import {createDb,aiTasks,aiTaskResults,executionTasks,executionCalls,knowledgeItems,knowledgeRevisions,knowledgeAdoptions,executionEvidence,eq} from "@creatoros/backend";
import {createKnowledgeProposalAdoptionService,createKnowledgeService,createKnowledgeRepository} from "../knowledge";
import {createBrowserSessionsService} from "../browser-sessions";
import {createAgenticProposalStagingService} from "../ai/agentic-proposal-staging.service";
import {createAgenticProposalAdoptionService} from "../ai/agentic-proposal-adoption.service";
import {createAiService} from "../ai/ai.service";
import {createAgenticWorkerDispatcher} from "../execution/model-worker-dispatcher";
import {createAgenticResearchTools} from "./agentic-research-tools";
import {createAgenticBusinessExecutionService} from "./agentic-business-execution.service";

it.each([{maxCalls:20,expectedRequests:6,expectedStatus:"succeeded",repair:true},{maxCalls:10,expectedRequests:5,expectedStatus:"partial",repair:true},{maxCalls:8,expectedRequests:4,expectedStatus:"partial",repair:false}])("真实Pi与跨进程研究端口：长文、自修复与采纳，调用上限 $maxCalls",async({maxCalls,expectedRequests,expectedStatus,repair})=>{
 const directory=await mkdtemp(resolve("../ai-worker/node_modules/.research-integration-"));
 const entryPath=join(directory,"worker.cjs");
 const sourceUrl="https://research.example.com/article";
 execFileSync(process.execPath,["--input-type=module","-e",`import{build}from'esbuild';await build({entryPoints:[process.argv[1]],outfile:process.argv[2],bundle:true,platform:'node',target:'node24',format:'cjs',external:['@playwright/test','jsdom','@mozilla/readability']});`,resolve("src/modules/ai-runtime/agentic-research-worker.fixture.ts"),entryPath],{cwd:resolve("../ai-worker"),stdio:"pipe"});
 const f=await createDb(),now=()=>new Date().toISOString(),nextId=(prefix:string)=>`${prefix}-${randomUUID()}`;
 const ctx={userId:"research-worker",accountId:"research-account",requestId:"test",source:"user" as const};
 const noExternal=async():Promise<never>=>{throw new Error("未授权外部能力");};
 const knowledge=createKnowledgeProposalAdoptionService(f.db,now);
 const adoption=createAgenticProposalAdoptionService(f.db,{knowledge:(context,proposal,tx)=>knowledge.adopt(context,proposal,tx),assetTagsBatch:noExternal},now);
 const ai=createAiService({db:f.db,now,nextId,agenticProposals:adoption,artifacts:{createVersion:noExternal},knowledge:{createKnowledge:noExternal},candidate:{createFromAIResult:noExternal,enrichCard:noExternal},learnings:{createLearning:noExternal},publishing:{createPublicationFromDraft:noExternal},materialLinks:{link:noExternal},positioning:{upsertProfile:noExternal,createStatementVersion:noExternal},calibration:{createDraftPrediction:noExternal}});
 const staging=createAgenticProposalStagingService(f.db,{resolveLease:()=>{throw new Error("不能进入旧ALS执行");},prepareAssets:noExternal});
 const research=createAgenticResearchTools({stage:(ref,input,signal)=>staging.stageForExecution(ref,input,signal)});
 const budget={maxCalls,maxTokens:100000,deadlineMs:60000};
 const preparation=createAgenticBusinessExecutionService(f.db,{definitions:{"exec.agentic.research":{taskType:"agentic.research",systemPrompt:"搜索并完整分窗读取来源，然后生成有真实证据的知识候选，最后总结。",capability:"planning",tools:research.definitions}},budget,maxOutputTokens:300,validateInputs:async()=>{}});
 const sessions=createBrowserSessionsService({db:f.db,now,nextId,masterKey:createHash("sha256").update("fixture-master-key").digest()});
 const privateCookie="fixture-private-cookie";
 await sessions.saveState(ctx,"research.example.com",JSON.stringify({cookies:[{name:"session",value:privateCookie,domain:".research.example.com",path:"/"}],origins:[]}));
 const initialSession=await sessions.getStateVersioned(ctx,"research.example.com");
 const requests:string[]=[];let serverError:unknown;
 let firstWindow:{evidenceRef:string;snapshotId:string;nextOffset:number;text:string}|undefined;
 let nextWindow:{text:string;nextOffset:null}|undefined;
 const extractToolData=(raw:string)=>{
  const body=JSON.parse(raw) as {messages:Array<{role:string;content:string}>};
  return body.messages.filter(row=>row.role==="tool").map(row=>JSON.parse(row.content) as {evidence:{data?:Record<string,unknown>;error?:{code:string}}});
 };
 const server=createServer(async(req,res)=>{
  try{
   const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));const raw=Buffer.concat(chunks).toString("utf8");requests.push(raw);
   const index=requests.length+(!repair && requests.length>=4?1:0);let name:string|undefined,args:unknown;
   if(index===1){name="web.search";args={query:"受控调研来源"};}
   else if(index===2){expect(raw).toContain(sourceUrl);name="web.read";args={url:sourceUrl};}
   else if(index===3){firstWindow=extractToolData(raw).at(-1)!.evidence.data as typeof firstWindow;expect(firstWindow?.evidenceRef).toMatch(/^evidence_/);expect(firstWindow?.nextOffset).toBe(12000);expect(firstWindow?.text).toContain("首窗可核实事实");name="web.read";args={url:sourceUrl,offset:firstWindow!.nextOffset,snapshotId:firstWindow!.snapshotId,evidenceRef:firstWindow!.evidenceRef};}
   else if(index===4){nextWindow=extractToolData(raw).at(-1)!.evidence.data as typeof nextWindow;expect(nextWindow?.nextOffset).toBeNull();expect(nextWindow?.text).toContain("尾窗可核实事实");name="knowledge.write";args={title:"调研知识候选",note:"已阅读首窗与尾窗的真实fixture事实。",sourceNote:sourceUrl,evidenceRefs:["invented-source"]};}
   else if(index===5){if(repair)expect(raw).toContain("invalid_input");else {nextWindow=extractToolData(raw).at(-1)!.evidence.data as typeof nextWindow;expect(nextWindow?.text).toContain("尾窗可核实事实");}expect(await f.db.select().from(knowledgeItems)).toHaveLength(0);expect((await f.db.select().from(aiTaskResults)).filter(row=>row.resultType==="agentic_proposal_staged")).toHaveLength(0);name="knowledge.write";args={title:"调研知识候选",note:"已阅读首窗与尾窗的真实fixture事实。",sourceNote:sourceUrl,evidenceRefs:[firstWindow!.evidenceRef]};}
   else if(index!==6)throw new Error("模型发生非预期额外调用");
   const delta=name?{role:"assistant",tool_calls:[{index:0,id:`tool-${index}`,type:"function",function:{name,arguments:JSON.stringify(args)}}]}:{role:"assistant",content:"已完整读取来源并生成知识候选，请采纳。"};
   const base={id:`response-${index}`,object:"chat.completion.chunk",created:1,model:"test"};res.writeHead(200,{"content-type":"text/event-stream"});res.end(`data: ${JSON.stringify({...base,choices:[{index:0,delta,finish_reason:null}]})}\n\ndata: ${JSON.stringify({...base,choices:[{index:0,delta:{},finish_reason:name?"tool_calls":"stop"}],usage:{prompt_tokens:3,completion_tokens:4,total_tokens:7}})}\n\ndata: [DONE]\n\n`);
  }catch(error){serverError=error;res.writeHead(500);res.end("fixture assertion failed");}
 });
 await new Promise<void>(done=>server.listen(0,"127.0.0.1",done));
 const errors:string[]=[];
 const dispatcher=createAgenticWorkerDispatcher(f.db,{entryPath,workerId:"research-host",budget,pollMs:100,modelConcurrency:1,tools:research.tools,browserSessions:sessions,onError:code=>errors.push(code),resolveModelCredential:async(context)=>{
  expect(context).toMatchObject({userId:ctx.userId,accountId:ctx.accountId});return {apiFormat:"openai_chat",authStyle:"bearer",baseUrl:`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`,model:"test",token:"local-model-fixture"};
 }});
 try{
  await f.db.insert(aiTasks).values({id:"research-task",userId:ctx.userId,accountId:ctx.accountId,taskType:"exec.agentic.research",status:"queued",idempotencyKey:"research-task",requestedAt:now(),inputData:{spec:{taskType:"agentic.research",goal:"研究网页并生成知识候选",inputs:[],params:{},constraints:{timeoutSec:60,network:"deny",maxOutputMB:512}}}});
  const mapped=await preparation.prepare(ctx,"research-task");expect(await dispatcher.drainOnce()).toBe(1);if(serverError)throw serverError;
  const trace=(await readFile(join(directory,"trace.ndjson"),"utf8")).trim().split("\n").map(line=>JSON.parse(line) as {pid:number;type:string;port?:string;url?:string;hasFixtureCookie?:boolean});
  const [execution]=await f.db.select().from(executionTasks).where(eq(executionTasks.id,mapped.executionTaskId!));expect(execution?.status,JSON.stringify({errors,execution,trace})).toBe(expectedStatus);
  expect((execution?.checkpoint as {messages:unknown[]}).messages).toHaveLength(expectedRequests+(repair?5:4));expect(trace.filter(row=>row.type==="context-close")).toHaveLength(trace.filter(row=>row.type==="context").length);
  expect(requests).toHaveLength(expectedRequests);expect(trace.every(row=>row.pid!==process.pid)).toBe(true);
  for(const port of ["readBrowserSession","saveBrowserSession","settleResearchRead","executeEvidenceRead"])expect(trace.filter(row=>row.port===port)).toHaveLength(1);
  expect(trace.filter(row=>row.type==="navigation" && row.url===sourceUrl)).toHaveLength(1);expect(trace.some(row=>row.hasFixtureCookie===true)).toBe(true);
  const providerText=requests.join("\n");expect(providerText).not.toContain(privateCookie);expect(providerText).not.toContain(initialSession.revision!);expect(providerText).not.toContain("stateJson");expect(providerText).not.toContain("cookies");expect(providerText).not.toContain("revision");
  const [snapshot]=await f.db.select().from(executionEvidence).where(eq(executionEvidence.executionTaskId,mapped.executionTaskId!));expect(snapshot?.fullText).toBe(firstWindow!.text+nextWindow!.text);expect(snapshot?.id).toBe(firstWindow!.evidenceRef);
  const currentSession=await sessions.getStateVersioned(ctx,"research.example.com");expect(currentSession.revision).not.toBe(initialSession.revision);expect(providerText).not.toContain(currentSession.revision!);
  expect(await f.db.select().from(knowledgeItems)).toHaveLength(0);expect(await f.db.select().from(knowledgeRevisions)).toHaveLength(0);expect((await ai.getTask(ctx,"research-task")).status).toBe("awaiting_confirmation");
  const results=await f.db.select().from(aiTaskResults).where(eq(aiTaskResults.aiTaskId,"research-task"));expect(results.map(row=>row.resultType).sort()).toEqual(["agentic_proposal_staged","agentic_proposals"]);
  const calls=await f.db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,mapped.executionTaskId!));expect(calls).toHaveLength(expectedRequests+(repair?5:4));expect(calls.every(call=>call.status==="settled")).toBe(true);
  expect((await ai.confirmTask(ctx,"research-task")).status).toBe("succeeded");expect((await ai.confirmTask(ctx,"research-task")).status).toBe("succeeded");
  const readKnowledge=createKnowledgeService(createKnowledgeRepository(f.db,{now,nextId}));const knowledgeRows=await readKnowledge.listKnowledge(ctx);expect(knowledgeRows).toHaveLength(1);expect((await readKnowledge.getKnowledge(ctx,knowledgeRows[0]!.id)).sourceNote).toBe(sourceUrl);
  expect(await f.db.select().from(knowledgeRevisions)).toHaveLength(1);expect(await f.db.select().from(knowledgeAdoptions)).toHaveLength(1);expect(await dispatcher.drainOnce()).toBe(0);expect(requests).toHaveLength(expectedRequests);
 }finally{await writeFile(`/tmp/t915-research-worker-trace-${maxCalls}.ndjson`,await readFile(join(directory,"trace.ndjson"),"utf8").catch(()=>"no child trace"));await dispatcher.stop();server.closeAllConnections();await new Promise<void>(done=>server.close(()=>done()));await f.client.close();await rm(directory,{recursive:true,force:true});}
},60000);
