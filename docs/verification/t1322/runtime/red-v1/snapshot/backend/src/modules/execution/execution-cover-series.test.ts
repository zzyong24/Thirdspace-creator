import {beforeEach,describe,it,expect,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {canonicalJson} from '../ai/canonical-json';
const h=vi.hoisted(()=>({scope:null as any,state:null as any,object:{imagePrompt:'一位创作者在纸上画出起因与结果的关系，保持统一的铅笔色调和清晰构图。',altText:'结果页'},rows:[] as any[]}));
vi.mock('./execution-lease.service',()=>({createExecutionLeaseService:()=>({withLease:async(_ref:any,_mode:any,fn:any)=>fn(h.scope)})}));
vi.mock('./cover-execution-binding',()=>({bindCoverExecution:async()=>h.state,readCoverImageBinding:async()=>({...h.state,...h.state.payload.coverImage.value})}));
vi.mock('@creatoros/ai-worker/chat',async(importOriginal)=>({...await importOriginal<any>(),replayStructuredGeneration:async()=>({status:'complete',value:{object:h.object}})}));
vi.mock('@creatoros/ai-worker',async(importOriginal)=>({...await importOriginal<any>(),runWithEffectiveSkillSnapshot:async(_s:any,fn:any)=>fn()}));
import {createExecutionCoverService} from './execution-cover.service';
const ref={executionTaskId:'exec-1',attempt:1,fenceToken:'fence'};
const bytes=new Uint8Array([1,2,3]),checksum=createHash('sha256').update(bytes).digest('hex');
const context={positioningBrief:'',projectBriefHard:'',reviewScript:'真实页',userMaterialHardBrief:'',userMaterialRefBrief:'',knowledgeBrief:'',orientationHint:'',topic:{title:'主题',angle:''}};
function fixture(source:any,skillId='graphic.card-brief'){
 h.state={sourceDigest:'digest-original',payload:{modelIdentity:{model:'MiniMax-M3',capability:'copy.generate',apiFormat:'openai_chat',schemaVersion:1,baseUrlDigest:'sha256:'+ 'a'.repeat(64),customEndpoint:false}},input:{capability:'copy.generate',operationKey:'series-op',skillId,skillSnapshot:{},facets:{__coverContext:JSON.stringify(source)}} ,business:{id:'task-1'}};
 h.rows=[];
 const tx={select:()=>({from:()=>({where:()=>({orderBy:async()=>h.rows})})}),update:()=>({set:(v:any)=>({where:async()=>{h.state.payload=v.payload;}})})};
 h.scope={tx,context:{userId:'u',accountId:'a'},task:{id:'exec-1',retryOfCallId:null}};
 const getReferenceBytes=vi.fn(async()=>({bytes,mimeType:'image/png'}));
 const resolveImageSpec=vi.fn(async()=>({provider:'minimax',model:'image-01',baseUrl:null,token:'fixture',kind:'image'}));
 const service=createExecutionCoverService(tx as never,{now:()=>new Date().toISOString(),getReferenceBytes,resolveImageSpec} as never);
 return {service,getReferenceBytes,resolveImageSpec};
}
// Tests inject settled model object fixtures. They exercise public image preparation/reference ports, not real model acceptance.
describe('组图沿原封面持久调用传精确参考和画幅',()=>{
 it('按原file读字节、原画幅入图片调用、重复prepare复用已存回执',async()=>{
  const f=fixture({context,visualRequirements:'',referenceAssetId:'ref',referenceFileId:'file-old',referenceChecksum:checksum,aspectRatio:'3:4'});
  const first=await f.service.prepareImage(ref,{});
  expect(first).toMatchObject({status:'prepared',value:{input:{capability:'image.edit',aspectRatio:'3:4'},reference:{assetId:'ref',assetFileId:'file-old',checksum},resultData:{referenceImage:{used:true}}}});
  expect(f.getReferenceBytes).toHaveBeenCalledWith(h.scope.context,'ref','file-old');
  expect(await f.service.prepareImage(ref,{})).toEqual(first);expect(f.getReferenceBytes).toHaveBeenCalledOnce();
  const input=(first as any).value.input;
  h.rows.push({id:'image-call',operationKey:input.operationKey,inputDigest:`sha256:${createHash('sha256').update(canonicalJson(input)).digest('hex')}`});
  expect(await f.service.readReference(ref,{callId:'image-call'})).toEqual({bytes,mimeType:'image/png'});
  expect(f.getReferenceBytes).toHaveBeenLastCalledWith(h.scope.context,'ref','file-old');
 });
 it('精确参考读取失败或checksum变化不能偷偷变文生图',async()=>{
  const f=fixture({context,visualRequirements:'',referenceAssetId:'ref',referenceFileId:'file-old',referenceChecksum:checksum});
  f.getReferenceBytes.mockRejectedValue(new Error('old-file-missing'));
  await expect(f.service.prepareImage(ref,{})).rejects.toThrow();expect(f.resolveImageSpec).not.toHaveBeenCalled();
  f.getReferenceBytes.mockResolvedValue({bytes:new Uint8Array([9]),mimeType:'image/png'});
  await expect(f.service.prepareImage(ref,{})).rejects.toThrow();expect(f.resolveImageSpec).not.toHaveBeenCalled();
 });
 it('旧cover只指定Asset的读取失败继续合法降级',async()=>{
  const f=fixture({context,visualRequirements:'',referenceAssetId:'ref'},'cover.brief');
  h.object={headline:'封面',subheadline:'',keyPoints:[],visualConcept:'真实画面',composition:'留白',palette:'蓝'} as never;
  f.getReferenceBytes.mockRejectedValue(new Error('legacy unavailable'));
  expect(await f.service.prepareImage(ref,{})).toMatchObject({status:'prepared',value:{input:{capability:'image.generate'},reference:null}});
 });
 it('用户明确的unsupported画幅给出真实模型原因',async()=>{
  const f=fixture({context,visualRequirements:'',referenceAssetId:null,aspectRatio:'7:11'});
  await expect(f.service.prepareImage(ref,{})).rejects.toThrow('画幅');
 });
});
beforeEach(()=>{h.object={imagePrompt:'一位创作者在纸上画出起因与结果的关系，保持统一的铅笔色调和清晰构图。',altText:'结果页'};});
