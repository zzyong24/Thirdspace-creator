import {createServer} from 'node:http';
import {expect,it,vi} from 'vitest';
import {exceptionCapture} from '@creatoros/contract';
import {createPiProviderModel} from './pi-provider';
import {observeModelStreamFailure,withModelStreamObservation} from './model-stream-observation';

it('并发观察只关联原任务，日志仅包含固定分类和数值且观察失败不改变执行',async()=>{
 const eventsA:unknown[]=[],eventsB:unknown[]=[];
 await Promise.all([
  withModelStreamObservation('task-a',event=>eventsA.push(event),async()=>{
   await Promise.resolve();observeModelStreamFailure({message:'ECONNRESET secret prompt https://private.example',statusCode:200,output:true});
  }),
  withModelStreamObservation('task-b',event=>eventsB.push(event),async()=>{
   observeModelStreamFailure({message:'secret bearer value',statusCode:401,output:false});
  }),
 ]);
 expect(eventsA).toHaveLength(1);expect(eventsB).toHaveLength(1);
 expect(exceptionCapture.parse(eventsA[0])).toMatchObject({module:'worker',code:'WORKER_MODEL_STREAM_INTERRUPTED',referenceId:'task-a',stack:'',message:'status=200 output=true hint=transport'});
 expect(eventsB[0]).toMatchObject({referenceId:'task-b',message:'status=401 output=false hint=http_rejected'});
 expect(JSON.stringify([eventsA,eventsB])).not.toMatch(/secret|private|prompt|bearer/);
 expect(()=>withModelStreamObservation('task-c',()=>{throw Error('observer');},()=>observeModelStreamFailure({message:'unclassified private body',output:false}))).not.toThrow();
});

it('正式 Pi HTTP 失败经观察通道上报，仍只请求一次且不暴露正文',async()=>{
 const events:unknown[]=[];let requests=0;
 const warn=vi.spyOn(console,'warn').mockImplementation(()=>{});
 const server=createServer((req,res)=>{requests++;req.resume();res.writeHead(401,{'content-type':'application/json'});res.end(JSON.stringify({error:{message:'fixture-secret private prompt'}}));});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const model=createPiProviderModel({apiFormat:'openai_chat',baseUrl:`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`,model:'fixture',token:'fixture-secret'});
  await expect(withModelStreamObservation('execution-original',event=>events.push(event),()=>model.doStream({prompt:[{role:'user',content:[{type:'text',text:'private prompt'}]}],maxOutputTokens:32,abortSignal:AbortSignal.timeout(5000)}))).rejects.toThrow();
  expect(requests).toBe(1);expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({referenceId:'execution-original',message:'status=401 output=false hint=http_rejected'});
  expect(JSON.stringify(events)).not.toMatch(/fixture-secret|private prompt|127\.0\.0\.1/);
 }finally{warn.mockRestore();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
