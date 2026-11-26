import {describe,it,expect} from 'vitest';
import {ALL_CHAT_TOOL_NAMES} from './chat-tools';
import {buildRedfoxTool} from './chat-redfox-tool';
import {prepareChatToolDefinitions} from './chat-tool-definitions';
import {CHAT_READ_TOOL_NAMES} from './chat-read-tool-names';
import {redfoxInputSchema} from '@creatoros/contract/execution-worker';
describe('RedFox real tool wiring',()=>{
 it('rejects incomplete action parameters before starting the Worker tool',async()=>{
  const result=await prepareChatToolDefinitions({'redfox.query':buildRedfoxTool()});
  const parameters=result.parameters['redfox.query']!.parameters;
  for(const input of [{action:'hotspots'},{action:'hotspots',startDate:'',endDate:''},{action:'detail',workId:'abcde'},{action:'accountWorks',authorUrl:'invalid',offset:1}]){
   expect(parameters.safeParse(input).success).toBe(false);
  }
  for(const input of [{action:'hotspots',startDate:'2026-09-13',endDate:'2026-09-13'},{action:'search',keyword:'AI'},{action:'accountWorks',authorUrl:'https://www.douyin.com/user/test'},{action:'detail',workId:'12345678'},{action:'transcriptSubmit',url:'https://www.douyin.com/video/12345678'},{action:'transcriptResult',taskId:'task-123'}]){
   expect(parameters.parse(input)).toEqual(redfoxInputSchema.parse(input));
  }
 });
 it('冻结的历史工具保留 Worker 解析，退出新工具目录',async()=>{expect(ALL_CHAT_TOOL_NAMES).not.toContain('redfox.query');expect(CHAT_READ_TOOL_NAMES).not.toContain('redfox.query');const tools={'redfox.query':buildRedfoxTool()};const result=await prepareChatToolDefinitions(tools);expect(result.definitions[0]).toMatchObject({name:'redfox.query',execution:'worker.redfox',effect:'committed'});expect(JSON.stringify(result)).not.toContain('REDFOX_API_KEY');});
});
