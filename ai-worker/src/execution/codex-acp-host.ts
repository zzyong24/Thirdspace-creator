import {access} from 'node:fs/promises';
import {constants} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {AcpClient} from '../../vendor/acpx';
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
/** 复用原 native 配置读取与登录核对；只把禁用名称传给固定 ACP 子进程。 */
export async function createCodexAcpHost(cwd:string,signal:AbortSignal,mcpServers:NonNullable<ConstructorParameters<typeof AcpClient>[0]['mcpServers']>,toolNames:string[],onSessionUpdate?:ConstructorParameters<typeof AcpClient>[0]['onSessionUpdate']){
 const entry=await resolveCodexAcpEntry(),binary=await resolveBundledCodex();
 const preflight=await createControlledCodexSession(cwd,signal);
 const {mcpNames,authenticated,loginStatus}=preflight;
 await preflight.rpc.close();signal.throwIfAborted();
 if(!authenticated)throw new CodexHostError('CODEX_LOGIN_REQUIRED');
 const disabled=['apps','plugins','hooks','multi_agent','multi_agent_v2','browser_use','computer_use','code_mode','code_mode_host','tool_suggest','shell_tool','unified_exec','view_image','skill_search','skill_mcp_dependency_install'];
 const config={sandbox_mode:'read-only',approval_policy:'on-request',approvals_reviewer:'user',web_search:'disabled',features:Object.fromEntries([...disabled.map(name=>[name,false]),['image_generation',true]]),mcp_servers:Object.fromEntries(mcpNames.map(name=>[name,{enabled:false}]))};
 const args=codexProcessArguments(mcpNames).map(arg=>arg==='features.image_generation=false'?'features.image_generation=true':arg);
 args.push('-c','sandbox_mode="read-only"','-c','approval_policy="on-request"','-c','approvals_reviewer="user"');
 const env=codexAcpRuntimeEnvironment();
 Object.assign(env,{CODEX_PATH:binary,CODEX_CONFIG:JSON.stringify(config),INITIAL_AGENT_MODE:'read-only',CREATOROS_ACP_POLICY:'creatoros-acp-readonly-v1',CREATOROS_CODEX_START_ARGS:JSON.stringify(args),CREATOROS_ACP_TOOL_NAMES:JSON.stringify(toolNames)});
 const argv=[process.execPath,entry];
 const client=new AcpClient({agentCommand:process.execPath,agentArgv:argv,agentProcessEnv:env,cwd,mcpServers,permissionMode:'deny-all',nonInteractivePermissions:'deny',authPolicy:'skip',fs:false,terminal:false,suppressSdkConsoleErrors:true,onPermissionRequest:async()=>({outcome:'cancel'}),onSessionUpdate});
 try{await client.start({signal});signal.throwIfAborted();const initialized=client.initializeResult;if(initialized?.protocolVersion!==1)throw new CodexHostError("CODEX_ACP_VERSION_UNSUPPORTED");return {client,protocolVersion:initialized.protocolVersion,loginStatus};}
 catch{await client.close();throw new CodexHostError('CODEX_ACP_INITIALIZATION_FAILED');}
}
