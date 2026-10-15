import {access, readFile, realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
import {execFile} from 'node:child_process';
import {CodexHostError,CodexRpcSession} from './codex-app-server-protocol';
export {CodexHostError,CodexRpcSession};
export const CODEX_RUNTIME_VERSION='0.159.3';
export interface CodexDynamicTool {name:string;description:string;inputSchema:Record<string,unknown>}
const DISABLED_FEATURES=['apps','plugins','hooks','multi_agent','multi_agent_v2','image_generation','browser_use','computer_use','code_mode','code_mode_host','tool_suggest','shell_tool','unified_exec','view_image','skill_search','skill_mcp_dependency_install'];
const record=(value:unknown):Record<string,unknown>=>value && typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
export function codexProcessArguments(mcpNames:readonly string[]=[],imageGeneration=false):string[]{
  const configs=['web_search="disabled"',...DISABLED_FEATURES.map(name=>name==='code_mode'&&imageGeneration?'features.code_mode={enabled=false,direct_only_tool_namespaces=["image_gen"]}':`features.${name}=${name==='image_generation'&&imageGeneration?'true':'false'}`), 'features.omit_app_server_notification_media=false',
    ...(mcpNames.length ? [`mcp_servers={${mcpNames.map(name=>`${JSON.stringify(name)}={enabled=false}`).join(",")}}`] : [])];
  return ['app-server','--stdio',...configs.flatMap(config=>['-c',config])];
}
export function codexThreadParameters(cwd:string,tools:readonly CodexDynamicTool[]){
  return {cwd,ephemeral:true,approvalPolicy:'never',sandbox:'read-only',environments:[],
    dynamicTools:tools.map(tool=>({name:tool.name,description:tool.description,inputSchema:tool.inputSchema}))};
}
/** SEMANTIC_BOUNDARY_ALLOW: protocol projection rejects permission overrides;
 * it does not select or interpret creative content. */
export function codexTurnParameters(threadId:string,text:string,_untrusted?:unknown){return {threadId,input:[{type:'text',text}]};}
export function readCodexConfigSummary(raw:unknown){
  const config=record(record(raw).config),features=record(config.features),servers=record(config.mcp_servers);
  return {mcpServers:Object.entries(servers).map(([name,value])=>({name,enabled:record(value).enabled!==false})),
    webSearch:config.web_search=== 'disabled'?'disabled':'unknown',notificationMedia:features.omit_app_server_notification_media===false,directNamespaces:Array.isArray(record(features.code_mode).direct_only_tool_namespaces)?record(features.code_mode).direct_only_tool_namespaces:[],
    features:Object.fromEntries(DISABLED_FEATURES.map(name=>[name,(features[name]===false||name==='code_mode'&&record(features[name]).enabled===false)?false:features[name]===true?true:null]))};
}
function assertConfiguration(raw:unknown,imageGeneration=false){
  const summary=readCodexConfigSummary(raw);
  if(imageGeneration&&JSON.stringify(summary.directNamespaces)!=='["image_gen"]'||!summary.notificationMedia||summary.webSearch!=='disabled'||summary.mcpServers.some(server=>server.enabled)||DISABLED_FEATURES.some(name=>summary.features[name]!==(name==='image_generation'&&imageGeneration?true:false)))throw new CodexHostError('CODEX_CAPABILITY_UNVERIFIED');
  return summary;
}
export function assertCodexMcpDisabled(raw:unknown,expectedNames:readonly string[]){
  const data=record(raw).data;
  if(!Array.isArray(data))throw new CodexHostError('CODEX_CAPABILITY_UNVERIFIED');
  const statuses=data.map(row=>record(row));
  if(statuses.some(row=>typeof row.name!=='string'||row.runtimeStatus!=='disabled')||expectedNames.some(name=>!statuses.some(row=>row.name===name)))throw new CodexHostError('CODEX_CAPABILITY_UNVERIFIED');
}
export function codexRuntimeEnvironment(source:NodeJS.ProcessEnv=process.env):NodeJS.ProcessEnv{
  const env={} as NodeJS.ProcessEnv;
  for(const key of ['HOME','USERPROFILE','PATH','SYSTEMROOT','WINDIR','TEMP','TMP','TMPDIR','LANG','LC_ALL','LC_CTYPE','CODEX_HOME','HTTP_PROXY','HTTPS_PROXY','NO_PROXY','SSL_CERT_FILE','SSL_CERT_DIR'])if(source[key]!==undefined)env[key]=source[key];
  return env;
}
export async function resolveBundledCodex():Promise<string>{
  const require=createRequire(typeof __filename === "string" ? __filename : import.meta.url);
  const main=require.resolve('@openai/codex/package.json');
  const metadata=JSON.parse(await readFile(main,'utf8')) as {version?:string};
  if(metadata.version!==CODEX_RUNTIME_VERSION)throw new CodexHostError('CODEX_VERSION_UNSUPPORTED');
  const target=({darwin:{arm64:'aarch64-apple-darwin',x64:'x86_64-apple-darwin'},linux:{arm64:'aarch64-unknown-linux-musl',x64:'x86_64-unknown-linux-musl'},win32:{arm64:'aarch64-pc-windows-msvc',x64:'x86_64-pc-windows-msvc'}} as Record<string,Record<string,string>>)[process.platform]?.[process.arch];
  if(!target)throw new CodexHostError('CODEX_PLATFORM_UNSUPPORTED');
  const platformRequire=createRequire(main);
  const packagePath=platformRequire.resolve(`@openai/codex-${process.platform}-${process.arch}/package.json`);
  const binary=await realpath(join(dirname(packagePath),'vendor',target,'bin',process.platform==='win32'?'codex.exe':'codex'));
  await access(binary,process.platform==='win32'?constants.F_OK:constants.X_OK);
  await new Promise<void>((resolve,reject)=>execFile(binary,['--version'],{timeout:120000,maxBuffer:4096,env:codexRuntimeEnvironment()},(error,stdout)=>{
    if(error)reject(new CodexHostError('CODEX_RUNTIME_UNAVAILABLE'));
    else if(stdout.trim()!==`codex-cli ${CODEX_RUNTIME_VERSION}`)reject(new CodexHostError('CODEX_VERSION_UNSUPPORTED'));else resolve();
  }));
  return binary;
}
async function initialized(binary:string,cwd:string,names:readonly string[],signal:AbortSignal,env:NodeJS.ProcessEnv,imageGeneration=false){
  const rpc=new CodexRpcSession(binary,codexProcessArguments(names,imageGeneration),{cwd,env,signal});
  try {await rpc.request('initialize',{clientInfo:{name:'creatoros',title:'CreatorOS',version:'1'},capabilities:{experimentalApi:true}});rpc.initialized();return rpc;}
  catch(error){await rpc.close();throw error;}
}
/** The only executable path is the locked bundled artifact. Test probes may
 * inject a fake HOME; production callers never accept artifact/argv from UI. */
export async function createControlledCodexSession(cwd:string,signal:AbortSignal,probeEnv?:NodeJS.ProcessEnv,imageGeneration=false):Promise<{rpc:CodexRpcSession;authenticated:boolean;loginStatus:"authenticated"|"not-required"|"unauthenticated";mcpNames:string[]}>{
  const binary=await resolveBundledCodex(),env=codexRuntimeEnvironment(probeEnv),first=await initialized(binary,cwd,[],signal,env,imageGeneration);
  let names:string[];
  try {const summary=readCodexConfigSummary(await first.request('config/read',{includeLayers:false,cwd}));names=summary.mcpServers.map(server=>server.name);}
  finally {await first.close();}
  signal.throwIfAborted();
  const rpc=await initialized(binary,cwd,names,signal,env,imageGeneration);
  try {
    const summary=assertConfiguration(await rpc.request('config/read',{includeLayers:false,cwd}),imageGeneration);
    if(summary.mcpServers.some(server=>!names.includes(server.name)))throw new CodexHostError('CODEX_CONFIG_CHANGED');
    const accountParams={refreshToken:false};
    let accountResponse:unknown;
    try {accountResponse=await rpc.request('account/read',accountParams);}
    catch(error){
      // SEMANTIC_BOUNDARY_ALLOW: 固定非付费协议错误只决定一次原RPC重读，不做内容选择。
      if(!(error instanceof CodexHostError)||error.code!=='CODEX_RPC_REJECTED'||error.rpcMethod!=='account/read'||error.rpcCode!==-32603)throw error;
      signal.throwIfAborted();
      accountResponse=await rpc.request('account/read',accountParams);
    }
    const account=record(accountResponse);
    if(imageGeneration){
      const capabilities=record(await rpc.request('modelProvider/capabilities/read',{}));
      const identity=record(account.account);
      if(identity.type!=='chatgpt'||identity.planType==='free'||capabilities.imageGeneration!==true||capabilities.namespaceTools!==true)throw new CodexHostError(!account.account?'CODEX_LOGIN_REQUIRED':'CODEX_IMAGE_CAPABILITY_UNAVAILABLE');
      const models=record(await rpc.request('model/list',{includeHidden:false}));
      if(!Array.isArray(models.data)||!models.data.some(raw=>{const model=record(raw);return model.isDefault===true&&Array.isArray(model.inputModalities)&&model.inputModalities.includes('image');}))throw new CodexHostError('CODEX_IMAGE_MODEL_UNAVAILABLE');
    }
    return {rpc,loginStatus:account.account?"authenticated":account.requiresOpenaiAuth===false?"not-required":"unauthenticated",authenticated:Boolean(account.account)||account.requiresOpenaiAuth===false,mcpNames:summary.mcpServers.map(server=>server.name)};
  }catch(error){await rpc.close();throw error;}
}
export async function verifyCodexThreadMcp(rpc:CodexRpcSession,threadId:string,expectedNames:readonly string[]){
  const rows:unknown[]=[];let cursor:unknown=null;
  for(let page=0;page<20;page++){
    const result=record(await rpc.request('mcpServerStatus/list',{threadId,detail:'toolsAndAuthOnly',limit:100,cursor}));
    if(!Array.isArray(result.data))throw new CodexHostError('CODEX_CAPABILITY_UNVERIFIED');
    rows.push(...result.data);cursor=result.nextCursor;
    if(cursor==null){assertCodexMcpDisabled({data:rows},expectedNames);return;}
  }
  throw new CodexHostError('CODEX_CAPABILITY_UNVERIFIED');
}
