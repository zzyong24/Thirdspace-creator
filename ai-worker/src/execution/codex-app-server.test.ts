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
  expect(thread).toMatchObject({environments:[],approvalPolicy:'never',sandbox:'read-only',ephemeral:false});
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
