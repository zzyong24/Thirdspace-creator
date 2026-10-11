import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createControlledCodexSession} from '../../../ai-worker/src/execution/codex-app-server';
import {runCodexNativeTurn} from '../../../ai-worker/src/execution/codex-native-turn';
async function main(){
const cwd=await mkdtemp(join(tmpdir(),'creatoros-t1238-text-'));
const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),180000);
let threadId:string|undefined,turnId:string|undefined;
try{
 const session=await createControlledCodexSession(cwd,controller.signal);
 try{
  if(!session.authenticated)throw Error('CODEX_LOGIN_REQUIRED');
  const result=await runCodexNativeTurn({rpc:session.rpc,mcpNames:session.mcpNames,cwd,signal:controller.signal,tools:[],prompt:'请返回结构化结果：status为ok，engine为codex。',outputSchema:{type:'object',properties:{status:{type:'string'},engine:{type:'string'}},required:['status','engine'],additionalProperties:false},onThread:async id=>{threadId=id;},onTurn:async id=>{turnId=id;},onAdmission:async()=>{},onTool:async()=>{throw Error('NO_TOOLS');}});
  console.log(JSON.stringify({status:'PASS',threadId,turnId,model:result.model??null,usage:result.usage,text:result.text}));
 }finally{await session.rpc.close();}
}catch(error){console.log(JSON.stringify({status:'FAIL',threadId,turnId,error:error instanceof Error?error.message:'UNKNOWN'}));process.exitCode=1;}
finally{clearTimeout(timer);await rm(cwd,{recursive:true,force:true});}

}
void main();
