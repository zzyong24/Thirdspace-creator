import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {localCodexStatusRequestSchema,localCodexStatusSchema} from '@creatoros/contract/execution-worker';
import {createControlledCodexSession,resolveBundledCodex,CODEX_RUNTIME_VERSION,CodexHostError} from './codex-app-server';
import {createCodexAcpHost} from './codex-acp-host';
if(!process.send)throw Error('LOCAL_CODEX_STATUS_PRIVATE_IPC_REQUIRED');
const active=new Map<string,AbortController>();
process.on('message',async raw=>{
 const parsed=localCodexStatusRequestSchema.safeParse(raw);if(!parsed.success)return;
 const request=parsed.data;
 if(request.type==='cancel'){active.get(request.requestId)?.abort();return;}
 if(active.size>=2||active.has(request.requestId))return;
 const controller=new AbortController();active.set(request.requestId,controller);
 const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(Math.max(1,request.deadlineAt-Date.now()))]);
 let acp:Awaited<ReturnType<typeof createCodexAcpHost>>|undefined;
 let installed=false,owned:Awaited<ReturnType<typeof createControlledCodexSession>>|undefined,cwd:string|undefined;
 try{
  await resolveBundledCodex();installed=true;signal.throwIfAborted();
  cwd=await mkdtemp(join(tmpdir(),'creatoros-codex-status-'));
  owned=await createControlledCodexSession(cwd,signal);
  if(owned.authenticated){acp=await createCodexAcpHost(cwd,signal,[],[]);await acp.client.createSession(cwd,{signal});}
  process.send!({type:'result',requestId:request.requestId,value:localCodexStatusSchema.parse({engine:'codex',installed,available:owned.authenticated,version:CODEX_RUNTIME_VERSION,loginStatus:owned.loginStatus,...(!owned.authenticated?{errorCode:'CODEX_LOGIN_REQUIRED'}:{})})});
 }catch(error){
  if(process.connected)process.send!({type:'result',requestId:request.requestId,value:{engine:'codex',installed,available:false,version:installed?CODEX_RUNTIME_VERSION:null,loginStatus:'unchecked',errorCode:error instanceof CodexHostError?error.code:signal.aborted?'CODEX_STATUS_CANCELLED':'CODEX_STATUS_UNAVAILABLE'}});
 }finally{await acp?.client.close();await owned?.rpc.close();if(cwd)await rm(cwd,{recursive:true,force:true});active.delete(request.requestId);}
});
process.on('disconnect',()=>{for(const controller of active.values())controller.abort();setTimeout(()=>process.exit(0),1200).unref();});
process.send!({type:'ready'});
