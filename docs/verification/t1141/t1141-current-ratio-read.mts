import {createDb} from '/Users/zyongzhu/.codex/worktrees/t1062-client-integration/Thirdspace-creator/backend/src/db.ts';
import {createCreativeCanvasService} from '/Users/zyongzhu/.codex/worktrees/t1062-client-integration/Thirdspace-creator/backend/src/modules/creative-canvas/creative-canvas.service.ts';
import {writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const deadline=setTimeout(()=>{process.stderr.write('独立内存诊断完整预算已耗尽\n');process.exit(124);},660_000);
const root='/Users/zyongzhu/.codex/creatoros-verification/t1117-20261009';
const source='/Users/zyongzhu/.codex/worktrees/t1062-client-integration/Thirdspace-creator/backend/src/modules/creative-canvas/creative-canvas.service.ts';
const before=createHash('sha256').update(await readFile(source)).digest('hex');
const opened=await createDb(); // 不传dataDir，真实内存库；不读取或备份用户数据。
let submitCalls=0;
try{
 const service=createCreativeCanvasService(opened.db,{
  assertProject:async()=>{throw Error('此诊断无关联项目');},
  assertMediaAsset:async()=>{throw Error('此诊断无静态媒体');},
  assertReferenceAsset:async()=>{throw Error('此诊断无参考图');},
  getMediaFileDownloadUrl:async()=>{throw Error('此诊断不下载');},
  getReference:async()=>null,
  resolveCapability:async()=>({provider:'minimax',model:'image-01'}), // 显式能力fixture，非实际模型验收。
  readTask:async()=>{throw Error('此诊断不读取模型任务');},
  readTaskResults:async()=>[],
  submitTask:async()=>{submitCalls++;throw Error('禁止诊断提交模型任务');},
 });
 const ctx={userId:'t1141-isolated-user',accountId:'t1141-isolated-account',requestId:'t1141-read',source:'user' as const};
 const result=[];
 for(const sample of [{name:'旧页缺省',inGroup:true,ratio:undefined},{name:'组内显式',inGroup:true,ratio:'3:4'},{name:'独立节点缺省',inGroup:false,ratio:undefined}]){
  const created=await service.create(ctx,{title:sample.name});
  const document={schemaVersion:1 as const,viewport:{x:0,y:0,zoom:1},edges:[],nodes:[{id:'page',type:'image_generation' as const,position:{x:0,y:0},label:'已确认图片页',prompt:'已确认的中性几何图案',mode:'text_to_image' as const,...(sample.ratio?{aspectRatio:sample.ratio}:{})}],...(sample.inGroup?{visualGroups:[{id:'group',name:'图文页组',libraryKind:'xhs' as const,aspectRatio:'3:4',caption:'已确认配文',pageOrder:['page'],templateSnapshot:{id:'template',name:'通用样式',version:1,prompt:'已确认描述',visualMode:'graphic' as const,requiredIdentity:false},generationAttempts:{}}]}:{})};
  const saved=await service.save(ctx,created.id,{expectedRevision:created.revision,document});
  const tasksBefore=await service.listTasks(ctx,created.id);
  const prepared=await service.prepareGenerateProposal(ctx,created.id,{baseRevision:saved.revision,nodeId:'page'});
  const read=await service.get(ctx,created.id);
  assert.deepEqual(read.document,saved.document);assert.equal(read.revision,saved.revision);
  assert.deepEqual(await service.listTasks(ctx,created.id),tasksBefore);
  let foreignRejected=false;try{await service.prepareGenerateProposal({...ctx,accountId:'other-isolated-account'},created.id,{baseRevision:saved.revision,nodeId:'page'});}catch{foreignRejected=true;}
  assert.equal(foreignRejected,true);
  result.push({name:sample.name,inGroup:sample.inGroup,groupRatio:sample.inGroup?'3:4':null,nodeRatio:sample.ratio??null,preparedRatio:prepared.inputData.aspectRatio??null,hasRatio:Object.hasOwn(prepared.inputData,'aspectRatio'),documentUnchanged:true,revisionUnchanged:true,tasksUnchanged:true,foreignRejected});
 }
 const after=createHash('sha256').update(await readFile(source)).digest('hex');assert.equal(before,after);assert.equal(submitCalls,0);
 const record={task:'T-1141',surface:'backend-service',scope:'实际内存持久化+正式生成候选准备端口；非HTTP/模型或原生验收',source,sourceSha256:before,sourceAfter:after,observedAt:new Date().toISOString(),modelCapabilityFixture:true,modelCalled:false,submitCalls,userDatabase:false,results:result};
 await writeFile(root+'/t1141-current-ratio-observation.json',JSON.stringify(record,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(record));
 assert.equal(result[0]!.preparedRatio,'3:4','合法旧页的新生成候选应继承明确组画幅');
}finally{await opened.client.close();clearTimeout(deadline);}
