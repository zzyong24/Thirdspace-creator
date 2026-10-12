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
