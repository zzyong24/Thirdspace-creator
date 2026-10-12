import {afterEach,expect,it,vi} from 'vitest';
import {build} from 'esbuild';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {AcpClient} from '../../vendor/acpx/index';

const ports=vi.hoisted(()=>({host:vi.fn(),bridge:vi.fn(),directory:vi.fn(),prompt:vi.fn()}));
vi.mock('./codex-acp-host',()=>({createCodexAcpHost:ports.host}));
vi.mock('./external-task-mcp-bridge',()=>({startExternalTaskMcpBridge:ports.bridge}));
vi.mock('./external-chat-worker-run',()=>({externalAgentWorkingDirectory:ports.directory,externalChatPrompt:ports.prompt}));
import {runCodexAcpInWorker} from './codex-acp-worker-run';

const cleanups:Array<()=>Promise<unknown>>=[];
afterEach(async()=>{await Promise.allSettled(cleanups.splice(0).map(fn=>fn()));vi.restoreAllMocks();});
it('复用真实客户端和上游 stdio fixture：结算等待客户端通知尾队列，不漏最终正文',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'t1060-acpx-stdio-'));
 cleanups.push(()=>rm(directory,{recursive:true,force:true}));
 const source=await readFile(fileURLToPath(new URL('../../vendor/acpx/test-fixtures/upstream-mock-agent.ts',import.meta.url)),'utf8');
 const needle='    if (text.startsWith("echo ")) {';
 expect(source.split(needle)).toHaveLength(2);
 const fixture=source.replace(needle,`    // 只增加 fixture 行为；协议继续使用上游 SDK。
    if (text === "creatoros-review-burst") {
      await Promise.all(Array.from({length:4096}, (_, i) => this.sendAssistantMessage(sessionId, \`burst-\${i}\`)));
      return "burst-complete";
    }
\n`+needle);
 const entry=join(directory,'upstream-mock-agent.cjs');
 const require=createRequire(import.meta.url);
 await build({stdin:{contents:fixture,sourcefile:'upstream-mock-agent.ts',loader:'ts'},outfile:entry,bundle:true,platform:'node',format:'cjs',alias:{'@agentclientprotocol/sdk':require.resolve('@agentclientprotocol/sdk')},logLevel:'silent'});
 const client=new AcpClient({agentCommand:process.execPath,agentArgv:[process.execPath,entry],cwd:directory,agentProcessEnv:{PATH:process.env.PATH??'/usr/bin:/bin'},authPolicy:'skip',permissionMode:'deny-all',nonInteractivePermissions:'deny',fs:false,terminal:false,suppressSdkConsoleErrors:true});
 cleanups.push(()=>client.close());
 await client.start();
 ports.directory.mockResolvedValue(directory);ports.prompt.mockReturnValue('creatoros-review-burst');
 ports.bridge.mockResolvedValue({configuration:{type:'http',name:'fixture',url:'http://127.0.0.1:1'},close:vi.fn()});
 ports.host.mockImplementation(async(_cwd,_signal,_servers,_names,onSessionUpdate)=>{client.setEventHandlers({onSessionUpdate});return {client,protocolVersion:1,loginStatus:'authenticated'};});
 let receipt:any;
 const call=vi.fn(async(port:string,data:any)=>{
  if(port==='reserveExternalChatTurn')return {callId:'call-real',status:'reserved'};
  if(port==='listExternalTaskTools')return {tools:[]};
  if(port==='bindCodexCall'){expect(data).toMatchObject({callId:'call-real',threadId:expect.any(String)});return {callId:'call-real',threadId:data.threadId};}
  if(port==='startExternalChatTurn')return {callId:'call-real',status:'started',sessionId:data.sessionId,protocolKind:'acp',protocolVersion:1};
  if(port==='settleExternalChatTurn'){receipt=data.receipt;return {callId:'call-real',status:data.status};}
  throw Error('Unexpected isolated port '+port);
 });
 const result=await runCodexAcpInWorker({userId:'fixture-user',accountId:'fixture-account',sourceMessageId:'fixture-message',messages:[]} as never,new AbortController().signal,call as never);
 expect(result).toEqual({callId:'call-real'});
 expect(receipt.text).toBe(Array.from({length:4096},(_,i)=>`burst-${i}`).join('')+'burst-complete');
 expect(receipt.stopReason).toBe('end_turn');
 expect(call.mock.calls.filter(([name])=>name==='bindCodexCall')).toHaveLength(1);
 expect(call).toHaveBeenCalledWith('bindCodexCall',{callId:'call-real',threadId:receipt.sessionId},expect.any(AbortSignal));
 expect(call.mock.calls.filter(([name])=>name==='settleExternalChatTurn')).toHaveLength(1);
},180000);
