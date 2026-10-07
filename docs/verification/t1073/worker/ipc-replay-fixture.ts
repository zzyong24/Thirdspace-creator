import { workerCallRequestId, type ExecutionRef, type HostMessage, type WorkerMessage } from '../../../../contract/src/internal/execution-worker';
declare const LEGACY: boolean;
const waiting=new Map<string,{resolve(messages:HostMessage[]):void;replies:HostMessage[];count:number}>();
let execution:ExecutionRef;
const send=(message:WorkerMessage)=>process.send!(message);
const call=(sequence:number,overrides:object={})=>({version:1,type:'call',requestId:LEGACY?`legacy-${sequence}`:workerCallRequestId(execution,sequence),execution,port:'heartbeat',data:{},...(!LEGACY?{callSeq:sequence}:{}),...overrides} as Extract<WorkerMessage,{type:'call'}>);
const exchange=(message:Extract<WorkerMessage,{type:'call'}>,count=1)=>new Promise<HostMessage[]>(resolve=>{
 waiting.set(message.requestId,{resolve,replies:[],count});for(let index=0;index<count;index++)send(message);
});
const consume=(throughSeq:number,overrides:object={})=>send({version:1,type:'consumed',requestId:'consume',execution,throughSeq,...overrides} as WorkerMessage);
async function exercise(){
 const first=call(1),original=await exchange(first,2);
 const errors:string[]=[];
 if(LEGACY){
  const again=await exchange(first);
  send({version:1,type:'progress',requestId:'progress',execution,seq:1,text:JSON.stringify({legacy:true,replies:original.length+again.length,byteLength:(again[0] as {data:{bytes:Uint8Array}}).data.bytes.byteLength})});
  return;
 }
 consume(1,{execution:{...execution,fenceToken:'stale'}});
 const afterStale=await exchange(first);
 if(!(afterStale[0] as {ok:boolean}).ok)throw Error('陈旧 fence 删除了原回执');
 consume(1);
 const consumed=(await exchange(first))[0] as Extract<HostMessage,{type:'reply'}>;errors.push(consumed.errorCode!);
 errors.push(((await exchange(call(2,{requestId:first.requestId})))[0] as Extract<HostMessage,{type:'reply'}>).errorCode!);
 errors.push(((await exchange(call(3)))[0] as Extract<HostMessage,{type:'reply'}>).errorCode!);
 const second=(await exchange(call(2)))[0] as Extract<HostMessage,{type:'reply'}>;
 consume(1,{consumedRanges:[{fromSeq:2,toSeq:2}]});
 errors.push(((await exchange(call(2)))[0] as Extract<HostMessage,{type:'reply'}>).errorCode!);
 send(call(3,{execution:{...execution,fenceToken:'stale'}}));
 const third=(await exchange(call(3)))[0] as Extract<HostMessage,{type:'reply'}>;
 consume(3,{consumedRanges:[{fromSeq:4,toSeq:100}]});
 const afterInvalid=(await exchange(call(3)))[0] as Extract<HostMessage,{type:'reply'}>;
 if(!afterInvalid.ok)throw Error('无效确认删除了仍需保留的回执');
 consume(3);
 send({version:1,type:'progress',requestId:'progress',execution,seq:1,text:JSON.stringify({legacy:false,errors,byteLength:(second.data as {bytes:Uint8Array}).bytes.byteLength,thirdOk:third.ok})});
}
process.on('message',(message:HostMessage)=>{
 if(message.type==='run'){execution=message.execution;void exercise().catch(error=>send({version:1,type:'progress',requestId:'failure',execution,seq:1,text:JSON.stringify({error:String(error)})}));}
 if(message.type==='reply'){
  const held=waiting.get(message.requestId);if(!held)return;held.replies.push(message);
  if(held.replies.length===held.count){waiting.delete(message.requestId);held.resolve(held.replies);}
 }
 if(message.type==='cancel')send({version:1,type:'stopped',requestId:message.requestId,execution,reason:'cancelled'});
});
process.on('SIGTERM',()=>process.exit(0));
process.on('disconnect',()=>process.exit(0));
send({version:1,type:'ready',requestId:'ready',capabilities:['model.generate'],...(!LEGACY?{receiptProtocol:'consumed-v1' as const}:{})});
