import {it,expect,vi} from 'vitest';
import {createServer} from 'node:http';
import {runCoverInWorker} from './cover-worker-run';
import {structuredGenerationInputSchema} from '@creatoros/contract/execution-worker';
const referenceBytes=new Uint8Array([71,72,73,74,75]);
const spec={apiFormat:'openai_chat' as const,baseUrl:'https://never-network.invalid',model:'fixture',token:'synthetic'};
it.each([false,true])('T1413正式封面复用已结算文案、原参考与同key，未知=%s不重提',async unknown=>{
 const requests:Array<{path:string|undefined;key:string|string[]|undefined;body:Buffer}>=[];
 const server=createServer((req,res)=>{const chunks:Buffer[]=[];req.on('data',chunk=>chunks.push(chunk));req.on('end',()=>{requests.push({path:req.url,key:req.headers['idempotency-key'],body:Buffer.concat(chunks)});if(unknown){req.socket.destroy();return;}res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({data:[{b64_json:Buffer.from([1,2,3]).toString('base64')}]}));});});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const baseUrl=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
 const input=structuredGenerationInputSchema.parse({kind:'model.structured',skillId:'cover.brief',capability:'copy.generate',operationKey:'cover-original',maxOutputTokens:128,facets:{},skillSnapshot:{snapshotVersion:1,userId:'u',accountId:'a',resolvedAt:'now',platformPolicyVersion:'1',platformPolicy:'候选',skills:[{skillId:'cover.brief',baseVersion:'1',overlayRevision:null,overlayVersion:null,effective:{methodSystem:'封面',template:'{{topic}}',tools:[],requiredFacets:[],contextRequirements:[],outputSchema:{type:'object'},completionPolicy:null,completionPolicyAdapter:null}}]}});
 const prepared={input:{kind:'asset.generate',mediaKind:'image',capability:'image.edit',operationKey:'cover-original/image',prompt:'真实参考封面',provider:'openai',model:'image',baseUrl},reference:{assetId:'ref',checksum:'checksum',mimeType:'image/png'},resultData:{name:'原封面候选'}};
 const calls:string[]=[];let status='reserved',saved=0;
 const receipt={assetId:'one-asset',fileId:'file',assetType:'image',name:'原封面候选',checksum:'checksum',byteLength:3,committedAt:'now'};
 const call=vi.fn(async(port:string,data:unknown)=>{
  calls.push(port);if(port==='prepareCoverImage')return {status:'prepared',value:prepared};
  if(port==='reserveAssetCall')return {callId:'same-image-call',status};
  if(port==='resolveAssetCredential')return {provider:'openai',model:'image',kind:'image',baseUrl,token:'synthetic'};
  if(port==='startAssetCall'){status='started';return {callId:'same-image-call',status};}
  if(port==='readCoverReference')return {bytes:referenceBytes,mimeType:'image/png'};
  if(port==='saveAssetResult'){expect((data as {bytes:Uint8Array}).bytes).toEqual(new Uint8Array([1,2,3]));saved++;status='settled';return receipt;}
  if(port==='settleAssetCall'){expect(data).toEqual({callId:'same-image-call',status:'unknown'});status='unknown';return {};}
  if(port==='recoverAssetResult')return unknown?{status:'missing'}:{status:'committed',receipt};
  if(port==='readAssetProviderJob')return null;
  throw Error(`不得重跑文案或旁路 ${port}`);
 });
 try{
  if(unknown){await expect(runCoverInWorker(input,spec,new AbortController().signal,call)).rejects.toMatchObject({outcome:'unknown_result'});await expect(runCoverInWorker(input,spec,new AbortController().signal,call)).rejects.toMatchObject({outcome:'unknown_result'});}
  else{expect(await runCoverInWorker(input,spec,new AbortController().signal,call)).toEqual({callId:'same-image-call',text:JSON.stringify(receipt)});expect(await runCoverInWorker(input,spec,new AbortController().signal,call)).toEqual({callId:'same-image-call',text:JSON.stringify(receipt)});}
  expect(requests).toHaveLength(1);expect(requests[0]).toMatchObject({path:'/v1/images/edits',key:'execution-asset:same-image-call'});expect(requests[0]!.body.includes(Buffer.from(referenceBytes))).toBe(true);
  expect(saved).toBe(unknown?0:1);expect(calls.some(port=>['reserveCoverModel','startCoverModel','settleCoverModel'].includes(port))).toBe(false);
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
},120000);
