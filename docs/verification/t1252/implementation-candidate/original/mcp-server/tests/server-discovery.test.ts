import {expect,it,vi} from "vitest";
import {Client} from "@modelcontextprotocol/sdk/client/index.js";
import {InMemoryTransport} from "@modelcontextprotocol/sdk/inMemory.js";
import {ENDPOINTS} from "@creatoros/contract";
import {createCreatorOsMcpServer} from "../src/server";
import {DispatchClient} from "../src/dispatch";

it("实际MCP发现不请求用户数据，保留全部原工具和正式调用权限",async()=>{
 const fetchImpl=vi.fn(async()=>new Response(JSON.stringify({data:[],meta:{}}),{status:200}));
 const server=createCreatorOsMcpServer({dispatchClient:new DispatchClient({baseUrl:"http://localhost",fetchImpl:fetchImpl as typeof fetch})});
 const client=new Client({name:"discovery-test",version:"1"}),[a,b]=InMemoryTransport.createLinkedPair();
 try{
  await server.connect(a);await client.connect(b);
  const tools=await client.listTools();
  expect(tools.tools).toHaveLength(Object.keys(ENDPOINTS).length+3);
  expect(tools.tools.find(tool=>tool.name==="creatoros_operations_list")?.annotations).toMatchObject({readOnlyHint:true,openWorldHint:false});
  expect(tools.tools.some(tool=>tool.name==="projects_list")).toBe(true);
  const listed=await client.callTool({name:"creatoros_operations_list",arguments:{domain:"projects",effect:"read",limit:1}}) as any;
  expect(listed.isError).not.toBe(true);
  const page=JSON.parse(listed.content[0].text);expect(page).toMatchObject({offset:0,limit:1,hasMore:true});
  expect(page.rows[0]).not.toHaveProperty("inputSchema");
  const described=await client.callTool({name:"creatoros_operations_describe",arguments:{operation:page.rows[0].operation}}) as any;
  expect(JSON.parse(described.content[0].text)).toHaveProperty("inputSchema");
  const invalid=await client.callTool({name:"creatoros_operations_list",arguments:{operationId:"projects.delete",limit:100}}) as any;
  expect(invalid.isError).toBe(true);
  expect(fetchImpl).not.toHaveBeenCalled();
  const refused=await client.callTool({name:"projects_create",arguments:{body:{title:"不能由发现赋权"}}}) as any;
  expect(refused.isError).toBe(true);expect(fetchImpl).not.toHaveBeenCalled();
 }finally{await client.close();await server.close();}
});
