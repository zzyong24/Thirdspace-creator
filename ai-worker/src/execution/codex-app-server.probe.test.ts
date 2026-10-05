import {it,expect} from 'vitest';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createControlledCodexSession,codexThreadParameters,verifyCodexThreadMcp,CODEX_RUNTIME_VERSION,resolveBundledCodex} from './codex-app-server';
it('锁定官方本地运行时：隔离假配置禁用MCP、无执行环境线程，未发送模型回合',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'creatoros-native-codex-probe-')),configDir=join(dir,'config'),cwd=join(dir,'workspace');
 await mkdir(configDir,{mode:0o700});await mkdir(cwd,{mode:0o700});
 await writeFile(join(configDir,'config.toml'),'[mcp_servers.probe]\nurl = "http://127.0.0.1:9/mcp"\n[mcp_servers."evil.name"]\nurl = "http://127.0.0.1:9/mcp"\n[mcp_servers."含 空格"]\nurl = "http://127.0.0.1:9/mcp"\n[features]\nplugins = true\n',{mode:0o600});
 let owned:Awaited<ReturnType<typeof createControlledCodexSession>>|undefined;
 try{
  expect(CODEX_RUNTIME_VERSION).toBe('0.159.3');expect(await resolveBundledCodex()).toMatch(/codex$/);
  owned=await createControlledCodexSession(cwd,AbortSignal.timeout(20000),{PATH:process.env.PATH,HOME:dir,CODEX_HOME:configDir});
  expect(owned.authenticated).toBe(false);expect([...owned.mcpNames].sort()).toEqual(['evil.name','probe','含 空格'].sort());
  const thread=await owned.rpc.request('thread/start',codexThreadParameters(cwd,[{name:'creatoros_probe',description:'No action; protocol probe only',inputSchema:{type:'object',properties:{}}}])) as {thread:{id:string};approvalPolicy:string;sandbox:{type:string;networkAccess:boolean}};
  expect(thread.thread.id).toBeTruthy();expect(thread.approvalPolicy).toBe('never');expect(thread.sandbox).toMatchObject({type:'readOnly',networkAccess:false});
  await verifyCodexThreadMcp(owned.rpc,thread.thread.id,owned.mcpNames);
 }finally{await owned?.rpc.close();await rm(dir,{recursive:true,force:true});}
},30000);
