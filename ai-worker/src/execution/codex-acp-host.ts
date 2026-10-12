import {access} from 'node:fs/promises';
import {constants} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {AcpClient} from '../../vendor/acpx';
import type {SessionNotification} from '@agentclientprotocol/sdk';
import {CREATOROS_ACP_POLICY_V2,creatorOsMcpNamespace,type CreatorOsPolicyProfile} from '../../vendor/codex-acp/src/CreatorOsPolicy';
import {createControlledCodexSession,resolveBundledCodex,codexProcessArguments,codexRuntimeEnvironment,CodexHostError} from './codex-app-server';

export async function resolveCodexAcpEntry(){
 const directory=typeof __filename==='string'?dirname(__filename):dirname(fileURLToPath(import.meta.url));
 const path=join(directory,directory.endsWith(join('src','execution'))?'../../dist/codex-acp.cjs':'codex-acp.cjs');
 try{await access(path,constants.R_OK);}catch{throw new CodexHostError('CODEX_ACP_ARTIFACT_UNAVAILABLE');}
 return path;
}
/** SEMANTIC_BOUNDARY_ALLOW: 只固定回环 MCP 的代理绕过路径，不作内容或工具选择。 */
export function codexAcpRuntimeEnvironment(source:NodeJS.ProcessEnv=process.env):Record<string,string>{
 const env=Object.fromEntries(Object.entries(codexRuntimeEnvironment(source)).filter((entry):entry is [string,string]=>typeof entry[1]==='string'));
 const bypass=[source.NO_PROXY,source.no_proxy,'127.0.0.1','localhost','::1'].filter((value):value is string=>typeof value==='string'&&value.length>0).join(',');
 env.NO_PROXY=bypass;env.no_proxy=bypass;
 return env;
}
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
/** SEMANTIC_BOUNDARY_ALLOW: 关联原 ACP 事实与后台冻结清单，仅落实单次许可，不判断工具语义。 */
export function createCodexAcpPermissions(profile:CreatorOsPolicyProfile,serverNames:string[],toolNames:string[]){
 const pending=new Map<string,{server:string;tool:string}>(),consumed=new Set<string>();
 const key=(sessionId:string,toolCallId:string)=>JSON.stringify([sessionId,toolCallId]);
 function accept(notification:SessionNotification){
  if(profile!==CREATOROS_ACP_POLICY_V2)return;
  const update=object(notification.update);
  if(!['tool_call','tool_call_update'].includes(String(update.sessionUpdate))||typeof update.toolCallId!=='string')return;
  const id=key(notification.sessionId,update.toolCallId),raw=object(update.rawInput);
  if(update.status==='completed'||update.status==='failed'){pending.delete(id);if(consumed.size<1000)consumed.add(id);return;}
  // 原 started 事实才可创建关联，progress/permission update 不能创建另一份授权。
  if(update.sessionUpdate!=='tool_call'||update.kind!=='execute'||update.status!=='in_progress'||consumed.has(id))return;
  if(typeof raw.server!=='string'||!serverNames.includes(raw.server)||typeof raw.tool!=='string'||!toolNames.includes(raw.tool))return;
  if(pending.size+consumed.size>=1000)return;
  pending.set(id,{server:raw.server,tool:raw.tool});
 }
 const onPermissionRequest:NonNullable<ConstructorParameters<typeof AcpClient>[0]['onPermissionRequest']>=async(request,{signal})=>{
  if(signal.aborted||profile!==CREATOROS_ACP_POLICY_V2)return {outcome:'cancel'};
  const raw=request.raw,call=raw.toolCall;
  if(raw.sessionId!==request.sessionId||raw._meta?.is_mcp_tool_approval!==true
    ||typeof call.toolCallId!=='string'||!raw.options.some(option=>option.kind==='allow_once'))return {outcome:'cancel'};
  const id=key(request.sessionId,call.toolCallId),fact=pending.get(id);
  if(!fact||!serverNames.includes(fact.server)||!toolNames.includes(fact.tool))return {outcome:'cancel'};
  // 原 AcpClient 再核当前 prompt owner 和取消状态；绝不返回持久许可。
  pending.delete(id);consumed.add(id);
  return {outcome:'allow_once'};
 };
 return {accept,onPermissionRequest};
}
/** 复用原 native 配置读取与登录核对；历史任务仍使用创建时冻结的权限版本。 */
export async function createCodexAcpHost(cwd:string,signal:AbortSignal,mcpServers:NonNullable<ConstructorParameters<typeof AcpClient>[0]['mcpServers']>,toolNames:string[],onSessionUpdate?:ConstructorParameters<typeof AcpClient>[0]['onSessionUpdate'],profile:CreatorOsPolicyProfile='creatoros-acp-readonly-v1'){
 const entry=await resolveCodexAcpEntry(),binary=await resolveBundledCodex();
 const preflight=await createControlledCodexSession(cwd,signal);
 const {mcpNames,authenticated,loginStatus}=preflight;
 await preflight.rpc.close();signal.throwIfAborted();
 if(!authenticated)throw new CodexHostError('CODEX_LOGIN_REQUIRED');
 const disabled=['apps','plugins','hooks','multi_agent','multi_agent_v2','browser_use','computer_use','code_mode','code_mode_host','tool_suggest','shell_tool','unified_exec','view_image','skill_search','skill_mcp_dependency_install'];
 const config={sandbox_mode:'read-only',approval_policy:'on-request',approvals_reviewer:'user',web_search:'disabled',features:Object.fromEntries([...disabled.map(name=>[name,false]),['image_generation',true],['omit_app_server_notification_media',false]]),mcp_servers:Object.fromEntries(mcpNames.map(name=>[name,{enabled:false}]))};
 const args=codexProcessArguments(mcpNames).map(arg=>arg==='features.image_generation=false'?'features.image_generation=true':arg);
 if(profile===CREATOROS_ACP_POLICY_V2){
  const directNamespaces=['image_gen',...mcpServers.map(server=>creatorOsMcpNamespace(server.name))];
  config.features.code_mode={enabled:false,direct_only_tool_namespaces:directNamespaces};
  config.features.non_prefixed_mcp_tool_names=false;
  args[args.indexOf('features.code_mode=false')]=`features.code_mode={enabled=false,direct_only_tool_namespaces=${JSON.stringify(directNamespaces)}}`;
  args.push('-c','features.non_prefixed_mcp_tool_names=false');
 }
 args.push('-c','sandbox_mode="read-only"','-c','approval_policy="on-request"','-c','approvals_reviewer="user"');
 const env=codexAcpRuntimeEnvironment();
 Object.assign(env,{CODEX_PATH:binary,CODEX_CONFIG:JSON.stringify(config),INITIAL_AGENT_MODE:'read-only',CREATOROS_ACP_POLICY:profile,CREATOROS_CODEX_START_ARGS:JSON.stringify(args),CREATOROS_ACP_TOOL_NAMES:JSON.stringify(toolNames)});
 const argv=[process.execPath,entry];
 const permissions=createCodexAcpPermissions(profile,mcpServers.map(server=>server.name),toolNames);
 // 没有当前 prompt owner 的请求只会走这个拒绝回调；单次许可仅交给本轮 prompt。
 const client=new AcpClient({agentCommand:process.execPath,agentArgv:argv,agentProcessEnv:env,cwd,mcpServers,permissionMode:'deny-all',nonInteractivePermissions:'deny',authPolicy:'skip',fs:false,terminal:false,suppressSdkConsoleErrors:true,onPermissionRequest:async()=>({outcome:'cancel'}),onSessionUpdate:notification=>{permissions.accept(notification);onSessionUpdate?.(notification);}});
 try{await client.start({signal});signal.throwIfAborted();const initialized=client.initializeResult;if(initialized?.protocolVersion!==1)throw new CodexHostError("CODEX_ACP_VERSION_UNSUPPORTED");return {client,protocolVersion:initialized.protocolVersion,loginStatus,onPermissionRequest:permissions.onPermissionRequest};}
 catch{await client.close();throw new CodexHostError('CODEX_ACP_INITIALIZATION_FAILED');}
}
