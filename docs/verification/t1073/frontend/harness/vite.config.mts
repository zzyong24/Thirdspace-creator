import {resolve} from 'node:path';
import tailwind from '../../../../../frontend/node_modules/@tailwindcss/postcss/dist/index.mjs';
import {ENDPOINTS} from '../../../../../contract/src/index';
import {aiTaskResource} from '../../../../../contract/src/resources/ai';

const workspace=resolve(import.meta.dirname,'../../../../..');
const now='2026-10-07T00:00:00.000Z';
const upgrade=(id:string,status='succeeded')=>({id,userId:'fixture',groupId:'group-a',accountId:null,kind:'radar_project_upgrade',ownerType:'item_import',ownerId:id,status,priority:1,idempotencyKey:id,checkpoint:null,leaseOwner:null,leaseExpiresAt:null,heartbeatAt:null,attempt:0,maxAttempts:3,errorCode:null,errorMessage:null,costEstimate:null,createdAt:now,updatedAt:now});
const rows=Array.from({length:250},(_,i)=>upgrade(`history-${i}`));
const counts:Record<string,number>={};
let hold=false,activeReviews=0,maxReviews=0;
const held:Array<()=>void>=[];
const report=(projectId:string)=>({id:`review-${projectId}`,projectId,artifactId:'fixture-artifact',artifactVersion:2,verdict:'pass',summary:'当前版本审核完成',lintFindings:[],llmFindings:[],modelLabel:'合成回执',reviewedAt:now});
export default {
 root:import.meta.dirname,cacheDir:resolve(import.meta.dirname,'.vite'),
 esbuild:{jsx:'automatic'},
 resolve:{dedupe:['react','react-dom'],alias:{
  '@':resolve(workspace,'frontend/src'),
  '@creatoros/contract/timeout-policy':resolve(workspace,'contract/src/timeout-policy.ts'),
  '@creatoros/contract':resolve(workspace,'contract/src/index.ts'),
  'react':resolve(workspace,'frontend/node_modules/react'),
  'react-dom':resolve(workspace,'frontend/node_modules/react-dom'),
  'next/navigation':resolve(import.meta.dirname,'navigation.tsx'),
  'next/link':resolve(import.meta.dirname,'navigation.tsx'),
 }},
 css:{postcss:{plugins:[tailwind()]}},
 server:{host:'127.0.0.1',port:4173,strictPort:true,fs:{allow:[workspace,resolve(workspace,'frontend/node_modules')]}},
 plugins:[{name:'synthetic-public-http',configureServer(server:any){server.middlewares.use(async(req:any,res:any,next:any)=>{
  if(!req.url?.startsWith('/api/v1/dispatch')&&!req.url?.startsWith('/witness/'))return next();
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const input=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):{};
  const send=(data:unknown,status=200)=>{res.statusCode=status;res.setHeader('content-type','application/json');res.end(JSON.stringify(data));};
  if(req.url==='/witness/metrics')return send({counts,activeReviews,maxReviews,total:rows.length});
  if(req.url==='/witness/control'){
   if(input.action==='hold')hold=true;
   if(input.action==='release'){hold=false;held.splice(0).forEach(done=>done());}
   if(input.action==='add')rows.push(upgrade('external-original','queued'));
   if(input.action==='complete'){const task=rows.find(row=>row.id==='external-original');if(task)task.status='succeeded';}
   return send({ok:true});
  }
  const {id,input:body}=input;counts[id]=(counts[id]??0)+1;
  const group=req.headers['x-group-id']??'group-a';
  const envelope=(data:unknown,total=Array.isArray(data)?data.length:1)=>send({data,meta:{requestId:'synthetic-http',page:body?.query?.page??1,pageSize:body?.query?.pageSize??100,total}});
  if(id===ENDPOINTS.listExecutionTasks.id){const owned=(group==='group-a'?rows:[]).filter(row=>!body.query.ownerId||row.ownerId===body.query.ownerId);const page=body.query.page;return envelope(owned.slice((page-1)*100,page*100),owned.length);}
  if(id===ENDPOINTS.getLatestScriptReview.id){
   activeReviews++;maxReviews=Math.max(maxReviews,activeReviews);
   const finish=()=>{activeReviews--;envelope(report(body.params.projectId));};
   if(hold)held.push(finish);else finish();return;
  }
  if(id===ENDPOINTS.listConversations.id)return envelope([{id:`conversation-${group}`,userId:'fixture',projectId:'witness',scope:'project:witness',title:group==='group-a'?'原账号组历史':'新账号组历史',createdAt:now,updatedAt:now}]);
  if(id===ENDPOINTS.listMessages.id)return envelope([{id:`message-${group}`,conversationId:body.params.conversationId,role:'assistant',content:group==='group-a'?'原账号组：上次的完整回复已恢复。':'新账号组：这是独立的历史回复。',attachments:[],modelMetadata:{},createdAt:now}]);
  if(id===ENDPOINTS.getTask.id){
   const taskId=body.params.taskId,status=taskId.startsWith('failed')?'failed':'succeeded';
   return envelope(aiTaskResource.parse({id:taskId,userId:'fixture',projectId:'witness',contentOutputId:null,taskType:'fixture.task',status,inputData:{},modelKey:'synthetic-model',idempotencyKey:taskId,attemptId:`synthetic-attempt-${taskId}`,requestFingerprint:`sha256:${'0'.repeat(64)}`,retryOfTaskId:null,requestedAt:now,startedAt:now,completedAt:now,errorMessage:status==='failed'?'合成任务失败，原任务保留，可重试':null}));
  }
  if(id===ENDPOINTS.listTaskSteps.id)return envelope([]);
  if(id===ENDPOINTS.listAITasks.id)return envelope([]);
  if(id===ENDPOINTS.getDownloadUrl.id)return envelope({url:'/witness/preview.svg',fileName:'fixture.svg'});
  return envelope([]);
 });}}],
};
