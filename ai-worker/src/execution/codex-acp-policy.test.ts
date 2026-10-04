import {afterEach, expect, it, vi} from 'vitest';
const connectionSource = '../../vendor/codex-acp/src/CodexJsonRpcConnection';
const clientSource = '../../vendor/codex-acp/src/CodexAcpClient';
const adapter = await import(connectionSource);
const {CodexAcpClient} = await import(clientSource);

// 只使用原适配器公开入口与原生响应替身，不启动进程或调用模型。
const policyApi = adapter as typeof adapter & {
  readCreatorOsPolicy(env: NodeJS.ProcessEnv): any;
  creatorOsStartupArguments(policy: any): string[];
  assertCreatorOsConfigResponse(policy: any, response: unknown): void;
  assertCreatorOsThreadResponse(response: unknown, cwd: string): string;
  creatorOsTurnMeta(meta: unknown, threadId: string, turn: unknown): any;
};
const disabled = ['apps','plugins','hooks','multi_agent','multi_agent_v2','browser_use','computer_use','code_mode','code_mode_host','tool_suggest','shell_tool','unified_exec','view_image','skill_search','skill_mcp_dependency_install'];
function config() {
  return {sandbox_mode:'read-only', approval_policy:'on-request', approvals_reviewer:'user', web_search:'disabled',
    features:{...Object.fromEntries(disabled.map(name => [name, false])),image_generation:true},
    mcp_servers:{personal:{enabled:false}}};
}
function environment() {
  return {CREATOROS_ACP_POLICY:'creatoros-acp-readonly-v1',CODEX_PATH:'/tmp/native codex',INITIAL_AGENT_MODE:'read-only',
    CODEX_CONFIG:JSON.stringify(config()),CREATOROS_ACP_TOOL_NAMES:JSON.stringify(['read_project']),
    CREATOROS_CODEX_START_ARGS:JSON.stringify(['app-server','--stdio',...['web_search="disabled"',...disabled.map(name=>`features.${name}=false`),'features.image_generation=true','mcp_servers={"personal"={enabled=false}}','sandbox_mode="read-only"','approval_policy="on-request"','approvals_reviewer="user"'].flatMap(value=>['-c',value])])};
}
function nativeThread() {
  return {thread:{id:'thread-actual'},cwd:'/tmp/task',model:'gpt-model',modelProvider:'openai',reasoningEffort:null,
    approvalPolicy:'on-request',approvalsReviewer:'user',sandbox:{type:'readOnly',networkAccess:false}};
}
function activeServer(tools: Record<string,unknown> = {read_project:{name:'read_project'}}) {
  return {name:'creatoros_task',runtimeStatus:'connected',pluginId:null,tools,toolsError:null};
}
function clientFixture(pages: any[] = [{data:[activeServer()],nextCursor:null}]) {
  for (const [name,value] of Object.entries(environment())) vi.stubEnv(name,value);
  const native:any = {configRead:vi.fn(async() => ({config:config()})),
    threadStart:vi.fn(async() => nativeThread()), listMcpServerStatus:vi.fn(async() => pages.shift()),
    getThreadSettings:vi.fn(() => ({collaborationMode:{mode:'default'}})), threadUnsubscribe:vi.fn(async()=>({})),
    clearThreadHandlers:vi.fn(),getMcpServerStartupVersion:vi.fn(()=>0),
    awaitMcpServerStartup:vi.fn(async()=>({ready:['creatoros_task'],failed:[],cancelled:[]}))};
  const client = new CodexAcpClient(native,config());
  vi.spyOn(client,'fetchAvailableModels').mockResolvedValue([{} as any]);
  (client as any).createModelId = () => ({toString:()=>'gpt-model'});
  return {native,client,request:{cwd:'/tmp/task',mcpServers:[{name:'creatoros_task',type:'http' as const,
    url:'http://127.0.0.1:1234/mcp',headers:[{name:'Authorization',value:'Bearer test-secret'}]}]}};
}
afterEach(() => {vi.unstubAllEnvs();vi.restoreAllMocks();});

it('可信配置形成独立 argv，路径含空格仍不拼 shell，禁用项先于会话生效',() => {
  const policy = policyApi.readCreatorOsPolicy(environment());
  const argv = policyApi.creatorOsStartupArguments(policy);
  expect(argv.slice(0,2)).toEqual(['app-server','--stdio']);
  expect(argv).toContain('sandbox_mode="read-only"');
  expect(argv).toContain('features.shell_tool=false');
  expect(argv).toContain('mcp_servers={"personal"={enabled=false}}');
  expect(argv.join('\n')).not.toContain('Bearer');
  expect(policyApi.readCreatorOsPolicy({})).toBeNull();
  const empty = environment();
  empty.CODEX_CONFIG = JSON.stringify({...config(),mcp_servers:{}});
  const values = JSON.parse(empty.CREATOROS_CODEX_START_ARGS) as string[];
  const mcpArg = values.findIndex(value=>value.startsWith('mcp_servers='));
  values.splice(mcpArg-1,2);
  empty.CREATOROS_CODEX_START_ARGS = JSON.stringify(values);
  expect(policyApi.creatorOsStartupArguments(policyApi.readCreatorOsPolicy(empty))).toEqual(values);
  expect(values.some(value=>value.startsWith('mcp_servers='))).toBe(false);
  expect(() => policyApi.readCreatorOsPolicy({...empty,CREATOROS_CODEX_START_ARGS:JSON.stringify([...values,'-c','features.hooks=true'])})).toThrow('CODEX_CAPABILITY_UNVERIFIED');
  expect(() => policyApi.readCreatorOsPolicy({...environment(),INITIAL_AGENT_MODE:'agent-full-access'})).toThrow('CODEX_CAPABILITY_UNVERIFIED');
  expect(() => policyApi.readCreatorOsPolicy({...environment(),DEFAULT_AUTH_REQUEST:'{}'})).toThrow('CODEX_CAPABILITY_UNVERIFIED');
  expect(() => policyApi.readCreatorOsPolicy({...environment(),CODEX_CONFIG:JSON.stringify({...config(),extra:123})})).toThrow('CODEX_CAPABILITY_UNVERIFIED');
});

it('真实 config/read 缺字段或开启功能均拒绝，不能以本地请求证明有效权限',() => {
  const policy = policyApi.readCreatorOsPolicy(environment());
  expect(() => policyApi.assertCreatorOsConfigResponse(policy,{config:config()})).not.toThrow();
  for (const changed of [{web_search:'enabled'},{features:{}},{approval_policy:'never'},
    {mcp_servers:{personal:{enabled:true}}}]) {
    expect(() => policyApi.assertCreatorOsConfigResponse(policy,{config:{...config(),...changed}})).toThrow('CODEX_CAPABILITY_UNVERIFIED');
  }
  expect(() => policyApi.assertCreatorOsConfigResponse(policy,{})).toThrow('CODEX_CAPABILITY_UNVERIFIED');
});

it('只接受 ThreadStartResponse 实際只读与相同工作目录，不信任请求 sandbox',() => {
  expect(policyApi.assertCreatorOsThreadResponse(nativeThread(),'/tmp/task')).toBe('thread-actual');
  for (const changed of [{sandbox:{type:'workspaceWrite',networkAccess:false,writableRoots:[]}},
    {sandbox:{type:'readOnly',networkAccess:true}},{sandbox:{type:'readOnly',networkAccess:false,writableRoots:['/tmp']}},
    {approvalsReviewer:'auto_review'},{cwd:'/tmp/other'},{thread:{}}]) {
    expect(() => policyApi.assertCreatorOsThreadResponse({...nativeThread(),...changed},'/tmp/task')).toThrow('CODEX_CAPABILITY_UNVERIFIED');
  }
});

it('原 newSession 保留全局禁用 MCP，查询真实线程全部分页后才返回',async() => {
  const f = clientFixture([{data:[{name:'personal',runtimeStatus:'disabled',pluginId:null,tools:{},toolsError:null}],nextCursor:'next'},
    {data:[activeServer()],nextCursor:null}]);
  expect(await f.client.newSession(f.request)).toMatchObject({sessionId:'thread-actual'});
  expect(f.native.configRead).toHaveBeenCalledWith({includeLayers:true,cwd:'/tmp/task'});
  const submitted = f.native.threadStart.mock.calls[0][0];
  expect(submitted).toMatchObject({approvalPolicy:'on-request',approvalsReviewer:'user',sandbox:'read-only',cwd:'/tmp/task',
    config:{mcp_servers:{personal:{enabled:false},creatoros_task:{url:f.request.mcpServers[0]!.url}}}});
  expect(f.native.listMcpServerStatus).toHaveBeenCalledTimes(2);
  expect(f.native.listMcpServerStatus).toHaveBeenLastCalledWith({threadId:'thread-actual',detail:'toolsAndAuthOnly',limit:100,cursor:'next'});
  expect(f.client.fetchAvailableModels).toHaveBeenCalledTimes(1);
});

it('额外工具、未连接 MCP、缺目录权限回执和分页循环拒绝入场，不枚举模型',async() => {
  for (const pages of [[{data:[activeServer({read_project:{},shell:{}})],nextCursor:null}],
    [{data:[{...activeServer(),runtimeStatus:'starting'}],nextCursor:null}],
    [{data:[activeServer(),{name:'unexpected',runtimeStatus:'connected',tools:{}}],nextCursor:null}],
    [{data:[activeServer()],nextCursor:'loop'},{data:[],nextCursor:'loop'}],
    [{data:[],nextCursor:null}]]) {
    const f = clientFixture(pages);
    await expect(f.client.newSession(f.request)).rejects.toThrow('CODEX_CAPABILITY_UNVERIFIED');
    expect(f.client.fetchAvailableModels).not.toHaveBeenCalled();
    vi.unstubAllEnvs();vi.restoreAllMocks();
  }
  const f = clientFixture();
  f.native.threadStart.mockResolvedValueOnce({thread:{id:'thread-actual'}});
  await expect(f.client.newSession(f.request)).rejects.toThrow('CODEX_CAPABILITY_UNVERIFIED');
  expect(f.native.listMcpServerStatus).not.toHaveBeenCalled();
});

it('冲突的全局 MCP 不继承，额外可写根与实际配置不符在创建线程前拒绝',async() => {
  const f = clientFixture();
  await expect(f.client.newSession({...f.request,mcpServers:[{...f.request.mcpServers[0],name:'personal'}]})).rejects.toThrow('CODEX_CAPABILITY_UNVERIFIED');
  expect(f.native.threadStart).not.toHaveBeenCalled();
  await expect(f.client.newSession({...f.request,additionalDirectories:['/tmp/outside']})).rejects.toThrow('CODEX_CAPABILITY_UNVERIFIED');
  f.native.configRead.mockResolvedValueOnce({config:{...config(),features:{...config().features,hooks:true}}});
  await expect(f.client.newSession(f.request)).rejects.toThrow('CODEX_CAPABILITY_UNVERIFIED');
  expect(f.native.threadStart).not.toHaveBeenCalled();
});

it('回合元数据来自真实原生 ID 和状态，保留原 quota；缺 ID 不造终态',() => {
  expect(policyApi.creatorOsTurnMeta({quota:{remaining:2}},'thread-actual',{id:'turn-actual',status:'completed'})).toEqual({
    quota:{remaining:2},creatoros:{codex:{threadId:'thread-actual',turnId:'turn-actual',status:'completed'}}});
  for (const turn of [null,{}, {id:'',status:'completed'},{id:'turn-actual',status:'cancelled'}]) {
    expect(policyApi.creatorOsTurnMeta({quota:{}},'thread-actual',turn)).toEqual({quota:{}});
  }
});
