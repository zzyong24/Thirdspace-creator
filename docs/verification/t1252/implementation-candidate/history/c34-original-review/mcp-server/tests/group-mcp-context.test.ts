import {describe,expect,it,vi} from 'vitest';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createCreatorOsMcpServer} from '../src/server';import {DispatchClient} from '../src/dispatch';
describe('MCP固定组范围',()=>{it('serve固定组传真实header；显式切组不继承旧平台账号',async()=>{
 const fetchImpl=vi.fn(async(_input:RequestInfo|URL,_init?:RequestInit)=>new Response(JSON.stringify({data:[],meta:{}}),{status:200}));
 const server=createCreatorOsMcpServer({dispatchClient:new DispatchClient({baseUrl:'http://localhost',fetchImpl:fetchImpl as typeof fetch}),defaultGroupId:'group-a',defaultAccountId:'acct-a'});
 const client=new Client({name:'group-scope-test',version:'1'}),[a,b]=InMemoryTransport.createLinkedPair();
 try{await server.connect(a);await client.connect(b);await client.callTool({name:'projects_list',arguments:{}});expect(fetchImpl.mock.calls[0]?.[1]?.headers).toMatchObject({'x-group-id':'group-a','x-account-id':'acct-a'});
 await client.callTool({name:'projects_list',arguments:{_creatoros:{groupId:'group-b'}}});expect(fetchImpl.mock.calls[1]?.[1]?.headers).toMatchObject({'x-group-id':'group-b'});expect(fetchImpl.mock.calls[1]?.[1]?.headers).not.toHaveProperty('x-account-id');}
 finally{await client.close();await server.close()}
})});

it('T1252 MCP SDK取消沿原scope私有signal，不重发或扩大组权限',async()=>{
 const {Agent}=await import('undici');
 let received!:AbortSignal;
 const fetchImpl=vi.fn(async(_url:unknown,init?:RequestInit)=>{
  received=init!.signal!;
  expect(init!.headers).toMatchObject({'x-group-id':'group-original','x-account-id':'account-original'});
  expect((init as RequestInit&{dispatcher:unknown}).dispatcher).toBeInstanceOf(Agent);
  return await new Promise<Response>((_resolve,reject)=>received.addEventListener('abort',()=>reject(Error('SDK cancel')),{once:true}));
 });
 const server=createCreatorOsMcpServer({dispatchClient:new DispatchClient({baseUrl:'http://localhost',fetchImpl:fetchImpl as typeof fetch}),defaultGroupId:'group-original',defaultAccountId:'account-original'});
 const client=new Client({name:'cancel-scope',version:'1'}),[a,b]=InMemoryTransport.createLinkedPair();const controller=new AbortController();
 try{await server.connect(a);await client.connect(b);
  const pending=client.callTool({name:'projects_list',arguments:{}},undefined,{signal:controller.signal,timeout:120000});
  const rejected=expect(pending).rejects.toBeTruthy();await vi.waitFor(()=>expect(fetchImpl).toHaveBeenCalledTimes(1),{timeout:120000});controller.abort();await rejected;
  await vi.waitFor(()=>expect(received.aborted).toBe(true),{timeout:120000});expect(fetchImpl).toHaveBeenCalledTimes(1);
 }finally{await client.close();await server.close();}
},180000);
