import {describe,it,expect} from "vitest";
import {codexProcessArguments,codexThreadParameters,codexTurnParameters,assertCodexMcpDisabled,readCodexConfigSummary} from "./codex-app-server";

describe("T-1044 Codex 原生接口权限边界",()=>{
 it("不经 shell，按实际名称禁用MCP，关闭hosted search和非任务数据工具",()=>{
  const args=codexProcessArguments(['含 空格','evil.name']);
  expect(args.slice(0,2)).toEqual(['app-server','--stdio']);
  expect(args).toContain('web_search="disabled"');
  expect(args).toContain('mcp_servers={"含 空格"={enabled=false},"evil.name"={enabled=false}}');
  expect(args.some(arg=>arg.startsWith("mcp_servers."))).toBe(false);
  expect(args).toContain('features.multi_agent=false');
  expect(args).toContain('features.image_generation=false');
 });
 it("后续turn只由宿主构造，不接模型的环境、目录、权限升级",()=>{
  const thread=codexThreadParameters('/tmp/private-task',[{name:'read_project',description:'读取已授权项目',inputSchema:{type:'object'}}]);
  expect(thread).toMatchObject({environments:[],approvalPolicy:'never',sandbox:'read-only',ephemeral:true});
  const turn=codexTurnParameters('thread-real','任务', {environments:['full'],additionalDirectories:['/'],permissionProfile:'danger'} as never);
  expect(turn).toEqual({threadId:'thread-real',input:[{type:'text',text:'任务'}]});
 });
 it("只提取配置名称与能力布尔值，不携带全局密钥/头/env",()=>{
  const result=readCodexConfigSummary({config:{mcp_servers:{private:{enabled:true,headers:{Authorization:'secret'},env:{TOKEN:'secret'}}},web_search:'disabled',features:{apps:false,plugins:false,hooks:false,multi_agent:false,image_generation:false},model_providers:{secret:{api_key:'secret'}}}});
  expect(result.mcpServers).toEqual([{name:'private',enabled:true}]);
  expect(JSON.stringify(result)).not.toContain('secret');
 });
 it("有效MCP必须逐项disabled，无状态/未知/仍启用拒绝启动",()=>{
  expect(()=>assertCodexMcpDisabled({data:[{name:'private',runtimeStatus:'disabled'}]},['private'])).not.toThrow();
  for(const runtimeStatus of ['ready','starting',undefined]) expect(()=>assertCodexMcpDisabled({data:[{name:'private',runtimeStatus}]},['private'])).toThrow();
  expect(()=>assertCodexMcpDisabled({data:[]},['private'])).toThrow();
  expect(()=>assertCodexMcpDisabled({data:[{name:'surprise',runtimeStatus:'ready'}]},[])).toThrow();
 });
});

// T1294：真实子进程错误帧仅投影固定方法和有限整数，绝不携带原始元数据。
it.each([-32602,-32000,undefined,1.5,'secret-code'])('RPC拒绝保安全method/code且不泄露帧（%s）',async upstreamCode=>{
 const {CodexRpcSession}=await import('./codex-app-server-protocol');
 const script=`const readline=require('node:readline');readline.createInterface({input:process.stdin}).on('line',line=>{const frame=JSON.parse(line);if(frame.id)process.stdout.write(JSON.stringify({id:frame.id,error:{code:${JSON.stringify(upstreamCode)??'undefined'},message:'secret-provider-key-and-account',data:{token:'private-token'}}})+'\\n');});`;
 const rpc=new CodexRpcSession(process.execPath,['-e',script],{cwd:process.cwd(),env:{PATH:process.env.PATH},signal:AbortSignal.timeout(120000)});
 try{
  const failure=await rpc.request('account/read',{refreshToken:false}).catch(error=>error);
  expect(failure).toMatchObject({code:'CODEX_RPC_REJECTED',rpcMethod:'account/read'});
  expect((failure as {rpcCode?:number}).rpcCode).toBe(Number.isSafeInteger(upstreamCode)?upstreamCode:undefined);
  expect(String(failure)).toBe('CodexHostError: CODEX_RPC_REJECTED');
  expect(JSON.stringify(failure)).not.toMatch(/secret-provider|private-token|message|data/);
 }finally{await rpc.close();}
},180000);

it.each(['delayed-term','ignore-term'] as const)('close等待owned进程真实结束，%s清理不提前完成',async mode=>{
 const {CodexRpcSession}=await import('./codex-app-server-protocol');
 const source=`process.on('SIGTERM',()=>{${mode==='delayed-term'?"setTimeout(()=>process.exit(0),80)":""}});process.stdout.write(JSON.stringify({method:'fixture/ready'})+'\\n');setInterval(()=>{},1000);`;
 const rpc=new CodexRpcSession(process.execPath,['-e',source],{cwd:process.cwd(),env:{PATH:process.env.PATH},signal:AbortSignal.timeout(120000)});
 const child=(rpc as unknown as {child:import('node:child_process').ChildProcess}).child;
 let closed=false;const stopped=new Promise<void>(resolve=>child.once('close',()=>{closed=true;resolve();}));
 try{
  await new Promise<void>(resolve=>{rpc.onNotification=method=>{if(method==='fixture/ready')resolve();};});
  const closing=rpc.close(),joined=rpc.close();
  await joined;expect(closed,'重复close也必须等待同一个真实退出屏障').toBe(true);await closing;
  expect(child.exitCode!==null||child.signalCode!==null).toBe(true);
  if(mode==='ignore-term')expect(child.signalCode).toBe('SIGKILL');
 }finally{await rpc.close();await stopped;}
},180000);

it('T1298 动态任务工具显式直连，默认ACP参数和图片通道保持',()=>{
 expect(codexProcessArguments()).toContain('features.code_mode=false');
 expect(codexProcessArguments([],false,true)).toContain('features.code_mode={enabled=false,direct_only_tool_namespaces=["functions"]}');
 expect(codexProcessArguments([],true,true)).toContain('features.code_mode={enabled=false,direct_only_tool_namespaces=["image_gen","functions"]}');
 expect(codexProcessArguments([],true)).toContain('features.code_mode={enabled=false,direct_only_tool_namespaces=["image_gen"]}');
 expect(codexProcessArguments([],false,true)).toContain('features.code_mode_host=false');
});

it('T1337 仅明确opt-in关闭自动Skill目录，原默认和任务工具开关不扩大范围',()=>{
 for(const [image,tools] of [[false,false],[false,true],[true,false],[true,true]]){
  const original=codexProcessArguments([],image,tools);
  expect(original.some(value=>value.startsWith('skills.'))).toBe(false);
  expect(codexProcessArguments([],image,tools,false)).toEqual(original);
  const opted=codexProcessArguments([],image,tools,true);
  expect(opted.filter(value=>value==='skills.include_instructions=false')).toHaveLength(1);
  const index=opted.indexOf('skills.include_instructions=false');expect(opted[index-1]).toBe('-c');
  expect([...opted.slice(0,index-1),...opted.slice(index+1)]).toEqual(original);
 }
});
