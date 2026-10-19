import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createDb} from '../../../backend/src/db';
import {accountGroups} from '../../../backend/src/schema/account-groups';
import {canvasGenerationLinks} from '../../../backend/src/schema/creative-canvas';
import {createAiService} from '../../../backend/src/modules/ai/ai.service';
import {createCreativeCanvasRoot} from '../../../backend/src/application/generation/creative-canvas-root';
import {ENDPOINTS,type RequestContext,type CanvasDocument,type Endpoint} from '../../../contract/src/index';
import type {Db} from '../../../backend/src/db';

const timer=setTimeout(()=>{process.stderr.write('本次隔离公共链完整预算已耗尽\n');process.exit(124);},660_000);
const product='backend/src/modules/creative-canvas/creative-canvas.service.ts';
const sourceBefore=createHash('sha256').update(await readFile(product)).digest('hex');
const opened=await createDb(); // 无dataDir：fresh内存库，不读取用户库。
const now=()=>new Date().toISOString(),wakes:string[]=[];
const fail=async()=>{throw Error('本轮不操作项目、媒体或模型结果');};
const ctx:RequestContext={userId:'ratio-public-user',accountId:null,groupId:'ratio-public-group',groupVersion:1,requestId:'ratio-public',source:'user'};
const aiFor=(db:Db)=>createAiService({db,now,nextId:prefix=>prefix+'-'+randomUUID(),artifacts:{createVersion:fail},knowledge:{createKnowledge:fail},candidate:{createFromAIResult:fail,enrichCard:fail},learnings:{createLearning:fail},publishing:{createPublicationFromDraft:fail},materialLinks:{link:fail},positioning:{upsertProfile:fail,createStatementVersion:fail},calibration:{createDraftPrediction:fail},resolveTaskRuntimeData:async()=>({})});
const root=createCreativeCanvasRoot(opened.db,{now},{ai:aiFor,assets:()=>({getAsset:fail,readMediaFile:fail,readImageReference:fail,getAssetFileDownloadUrl:fail}),projects:()=>({getProject:fail}),resolveCapability:async()=>({provider:'openai',model:'gpt-image-1'}),wake:async(_c,id)=>{wakes.push(id);},projectCandidate:()=>{throw Error('不生成或采用媒体');}});
async function request<T>(endpoint:Endpoint,input:unknown,scope=ctx){return (await root.transport.request(endpoint,input as never,scope)).data as T;}
type Canvas={id:string;revision:number;document:CanvasDocument};
const node={id:'page',type:'image_generation' as const,position:{x:0,y:0},label:'已确认图片页',prompt:'已确认的中性几何图案',mode:'text_to_image' as const};
const document=(attempt:string):CanvasDocument=>({schemaVersion:1,viewport:{x:0,y:0,zoom:1},nodes:[node],edges:[],visualGroups:[{id:'pages',name:'图片页组',libraryKind:'xhs',aspectRatio:'3:4',caption:'已确认配文',pageOrder:[node.id],templateSnapshot:{id:'neutral-template',name:'通用样式',version:1,prompt:node.prompt,visualMode:'graphic',requiredIdentity:false},generationAttempts:{[node.id]:attempt}}]});
try{
 await opened.db.insert(accountGroups).values({id:ctx.groupId!,userId:ctx.userId,name:'中性隔离验收组',status:'active',version:1,createdAt:now(),updatedAt:now()});
 const created=await request<Canvas>(ENDPOINTS.createCanvas,{body:{title:'旧节点新请求',projectId:null}}),attempt='ratio-public-new-'+randomUUID();
 const saved=await request<Canvas>(ENDPOINTS.saveCanvas,{params:{canvasId:created.id},body:{expectedRevision:created.revision,document:document(attempt)}});
 const candidate=await root.service.prepareGenerateProposal(ctx,created.id,{baseRevision:saved.revision,nodeId:node.id});assert.equal(candidate.inputData.aspectRatio,'3:4');
 const generated=await request<{id:string;taskId:string}>(ENDPOINTS.generateCanvasNode,{params:{canvasId:created.id,nodeId:node.id},body:{expectedRevision:saved.revision,attemptId:attempt}});
 const ai=aiFor(opened.db),task=await ai.getTask(ctx,generated.taskId);assert.equal(task.inputData.aspectRatio,'3:4');assert.equal(task.attemptId,attempt);assert.equal(task.status,'queued');
 const replay=await request(ENDPOINTS.generateCanvasNode,{params:{canvasId:created.id,nodeId:node.id},body:{expectedRevision:saved.revision,attemptId:attempt}});assert.deepEqual(replay,generated);assert.deepEqual(await ai.getTask(ctx,generated.taskId),task);
 const links=await request<unknown[]>(ENDPOINTS.listCanvasNodeTasks,{params:{canvasId:created.id}});assert.equal(links.length,1);assert.deepEqual((await request<Canvas>(ENDPOINTS.getCanvas,{params:{canvasId:created.id}})).document,saved.document);
 await assert.rejects(request(ENDPOINTS.getCanvas,{params:{canvasId:created.id}},{...ctx,groupId:'another-isolated-group'}));

 // 显式旧格式夹具：真实AI service创建queued任务，不种成功结果，不改实际用户任务。
 const legacyCanvas=await request<Canvas>(ENDPOINTS.createCanvas,{body:{title:'原省略比例的冻结任务',projectId:null}}),legacyAttempt='ratio-public-legacy-'+randomUUID();
 const legacySaved=await request<Canvas>(ENDPOINTS.saveCanvas,{params:{canvasId:legacyCanvas.id},body:{expectedRevision:1,document:document(legacyAttempt)}});
 const prepared=await root.service.prepareGenerateProposal(ctx,legacyCanvas.id,{baseRevision:legacySaved.revision,nodeId:node.id});
 const {aspectRatio:_omitted,...legacy}=prepared.inputData;legacy.canvasOwner={...legacy.canvasOwner,inputDigest:''};
 const digest=createHash('sha256').update(JSON.stringify([legacySaved.revision,node.id,legacy])).digest('hex');legacy.canvasOwner.inputDigest=digest;
 const oldTask=await ai.createTask(ctx,{taskType:'asset.generate',attemptId:legacyAttempt,inputData:legacy});
 await opened.db.insert(canvasGenerationLinks).values({id:'legacy-public-link',userId:ctx.userId,accountId:null,groupId:ctx.groupId!,groupVersion:legacy.canvasOwner.groupVersion,membershipVersion:legacy.canvasOwner.membershipVersion,canvasId:legacyCanvas.id,nodeId:node.id,attemptId:legacyAttempt,taskId:oldTask.id,inputRevision:legacySaved.revision,inputDigest:digest,inputJson:legacy,referenceFileId:null,referenceChecksum:null,createdAt:now(),updatedAt:now()});
 const oldRows=await opened.db.select().from(canvasGenerationLinks),snapshot={inputRevision:legacySaved.revision,inputDigest:digest,inputData:legacy};
 const reserved=await opened.db.transaction(tx=>root.service.reserveGenerationInTransaction(ctx,legacyCanvas.id,node.id,{expectedRevision:legacySaved.revision,attemptId:legacyAttempt,snapshot},tx as unknown as Db));assert.deepEqual(reserved.inputData,legacy);
 const oldReplay=await request<{taskId:string}>(ENDPOINTS.generateCanvasNode,{params:{canvasId:legacyCanvas.id,nodeId:node.id},body:{expectedRevision:legacySaved.revision,attemptId:legacyAttempt}});assert.equal(oldReplay.taskId,oldTask.id);
 assert.deepEqual(await ai.getTask(ctx,oldTask.id),oldTask);assert.deepEqual(await opened.db.select().from(canvasGenerationLinks),oldRows);assert.equal(wakes.length,1);
 const sourceAfter=createHash('sha256').update(await readFile(product)).digest('hex');assert.equal(sourceAfter,sourceBefore);
 const record={task:'T-1141',surface:'backend-root-transport',observedAt:now(),sourceSha256:sourceBefore,sourceAfter,modelCapabilityFixture:true,wakeClosed:true,modelCalled:false,userDatabase:false,newTask:{id:task.id,attemptId:attempt,status:task.status,ratio:task.inputData.aspectRatio,publicReplaySame:true,documentUnchanged:true,foreignRejected:true},legacyTask:{id:oldTask.id,attemptId:legacyAttempt,status:oldTask.status,ratio:oldTask.inputData.aspectRatio??null,reservationSame:true,taskSame:true,inputDigestSame:true},links:oldRows.length};
 await writeFile(resolve('docs/verification/t1141/public-ratio-observation.json'),JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record));
}finally{await opened.client.close();clearTimeout(timer);}
