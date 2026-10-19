// 独立只读协议探针：不是业务旅程；固定探针工具仅返回本地观察，不操作作品。
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createControlledCodexSession} from '../../../../ai-worker/src/execution/codex-app-server';
import {runCodexNativeTurn} from '../../../../ai-worker/src/execution/codex-native-turn';
async function main(){
 const cwd=await mkdtemp(join(tmpdir(),'t1298-tool-probe-')),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),600_000),events:any[]=[];
 const owned=await createControlledCodexSession(cwd,controller.signal);let handler:any;
 Object.defineProperty(owned.rpc,'onRequest',{configurable:true,get:()=>handler,set:fn=>{handler=fn?async(method:string,p:any)=>{events.push({method,threadId:p.threadId,turnId:p.turnId,callId:p.callId,tool:p.tool,namespace:p.namespace,argumentKeys:Object.keys(p.arguments??{})});try{return await fn(method,p);}catch(error){events.push({rejection:(error as any).code??(error as Error).name});throw error;}}:undefined;}});
 try{const result=await runCodexNativeTurn({rpc:owned.rpc,mcpNames:owned.mcpNames,cwd,prompt:'请调用一次 read_probe 工具。它是本地只读协议测试，只返回固定观测值。工具成功后回复值；失败请如实说明。不要调用任何其他工具。',signal:controller.signal,tools:[{name:'read_probe',description:'只读协议探针，返回本地固定观测值，不读写业务数据。',inputSchema:{type:'object',properties:{},additionalProperties:false}}],onThread:async id=>{events.push({threadId:id});},onAdmission:async()=>{},onTurn:async id=>{events.push({turnId:id});},onTool:async(callId,name)=>{events.push({executed:true,callId,name});return {text:'probe-observed',success:true};}});events.push({text:result.text});}
 catch(error){events.push({error:(error as any).code??(error as Error).name});}
 finally{clearTimeout(timer);await owned.rpc.close();await writeFile(join(process.cwd(),'docs/verification/t1298/diagnostic/native-tool-probe-result.json'),JSON.stringify(events,null,2));console.log(JSON.stringify(events));}
}
void main();
