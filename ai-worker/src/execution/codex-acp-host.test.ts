import {describe,it,expect} from 'vitest';
const hostModule='./codex-acp-host';

describe('Codex ACP 回环 MCP 环境',()=>{
 it('同时保留原大小写绕过配置和远程代理，并只追加回环地址',async()=>{
  const host=await import(hostModule);
  const source={HTTPS_PROXY:'http://proxy.invalid:8080',HTTP_PROXY:'http://proxy.invalid:8080',NO_PROXY:'corp.invalid',no_proxy:'internal.invalid',PATH:'/fixture/bin'};
  const before={...source};
  const env=host.codexAcpRuntimeEnvironment(source);
  expect(env).toMatchObject({HTTPS_PROXY:source.HTTPS_PROXY,HTTP_PROXY:source.HTTP_PROXY,PATH:source.PATH});
  expect(env.NO_PROXY).toBe('corp.invalid,internal.invalid,127.0.0.1,localhost,::1');
  expect(env.no_proxy).toBe(env.NO_PROXY);
  expect(source).toEqual(before);
 });
 it('没有原绕过配置时仅加入回环，不扩大为全网绕过',async()=>{
  const host=await import(hostModule);
  const env=host.codexAcpRuntimeEnvironment({HTTPS_PROXY:'http://proxy.invalid:8080'});
  expect(env.NO_PROXY).toBe('127.0.0.1,localhost,::1');
  expect(env.no_proxy).toBe(env.NO_PROXY);
  expect(env.HTTPS_PROXY).toBe('http://proxy.invalid:8080');
 });
 it('继续沿原环境白名单，不传递额外 Agent 配置或无关变量',async()=>{
  const host=await import(hostModule);
  const env=host.codexAcpRuntimeEnvironment({HOME:'/fixture/home',CODEX_HOME:'/fixture/codex',APP_SERVER_LOGS:'/fixture/log',MODEL_PROVIDER:'fixture-override',UNRELATED:'fixture-value',NO_PROXY:''});
  expect(env).toMatchObject({HOME:'/fixture/home',CODEX_HOME:'/fixture/codex'});
  expect(env).not.toHaveProperty('APP_SERVER_LOGS');
  expect(env).not.toHaveProperty('MODEL_PROVIDER');
  expect(env).not.toHaveProperty('UNRELATED');
  expect(env.NO_PROXY).toBe('127.0.0.1,localhost,::1');
 });
});

it('v2 仅许可同一会话真实 MCP start 关联的冻结工具一次；旧 v1 和缺关联继续取消',async()=>{
 const host=await import(hostModule),signal=new AbortController().signal;
 const make=(profile='creatoros-acp-readonly-v2')=>host.createCodexAcpPermissions(profile,['creatoros-task-abcdefghijkl'],['context.project.detail']);
 const event=(changes:any={})=>({sessionId:'s',update:{sessionUpdate:'tool_call',toolCallId:'call',status:'in_progress',kind:'execute',rawInput:{server:'creatoros-task-abcdefghijkl',tool:'context.project.detail'},...changes}});
 const request=(changes:any={})=>({sessionId:'s',raw:{sessionId:'s',_meta:{is_mcp_tool_approval:true},toolCall:{toolCallId:'call'},options:[{optionId:'allow-once',kind:'allow_once',name:'Allow'}],...changes},inferredKind:'execute'});
 const guard=make();
 expect(await guard.onPermissionRequest(request(),{signal})).toEqual({outcome:'cancel'});
 guard.accept(event());
 expect(await guard.onPermissionRequest(request(),{signal})).toEqual({outcome:'allow_once'});
 expect(await guard.onPermissionRequest(request(),{signal})).toEqual({outcome:'cancel'});
 guard.accept(event());
 expect(await guard.onPermissionRequest(request(),{signal})).toEqual({outcome:'cancel'});
 for(const changed of [{_meta:{}},{sessionId:'other'},{options:[{optionId:'always',kind:'allow_always',name:'Always'}]},
   {toolCall:{toolCallId:'other'}}, {_meta:{is_mcp_tool_approval:false}}]){
  const g=make();g.accept(event());expect(await g.onPermissionRequest(request(changed),{signal})).toEqual({outcome:'cancel'});
 }
 for(const changed of [{rawInput:{server:'foreign',tool:'context.project.detail'}},
   {rawInput:{server:'creatoros-task-abcdefghijkl',tool:'publish'}},{status:'completed'},{status:'failed'},
   {sessionUpdate:'agent_message_chunk'}, {kind:'read'}]){
  const g=make();g.accept(event(changed));expect(await g.onPermissionRequest(request(),{signal})).toEqual({outcome:'cancel'});
 }
 const old=make('creatoros-acp-readonly-v1');old.accept(event());
 expect(await old.onPermissionRequest(request(),{signal})).toEqual({outcome:'cancel'});
 const aborted=new AbortController();aborted.abort();const cancelled=make();cancelled.accept(event());
 expect(await cancelled.onPermissionRequest(request(),{signal:aborted.signal})).toEqual({outcome:'cancel'});
 const terminal=make();terminal.accept(event());terminal.accept(event({sessionUpdate:'tool_call_update',status:'completed'}));
 expect(await terminal.onPermissionRequest(request(),{signal})).toEqual({outcome:'cancel'});
});
