import {describe,it,expect} from 'vitest';
import {buildChatTools,ALL_CHAT_TOOL_NAMES,getSurfaceToolScope,type ChatToolDeps} from './chat-tools';
import {prepareChatToolDefinitions} from './chat-tool-definitions';
import {CHAT_READ_TOOL_NAMES} from './chat-read-tool-names';
import {registerAllTemplates,getTemplate} from '@creatoros/ai-worker';
import {redfoxInputSchema} from '@creatoros/contract/execution-worker';
describe('RedFox real tool wiring',()=>{
 it('rejects incomplete action parameters before starting the Worker tool',async()=>{
  const result=await prepareChatToolDefinitions(buildChatTools(['redfox.query'],{} as ChatToolDeps));
  const parameters=result.parameters['redfox.query']!.parameters;
  for(const input of [{action:'hotspots'},{action:'hotspots',startDate:'',endDate:''},{action:'detail',workId:'abcde'},{action:'accountWorks',authorUrl:'invalid',offset:1}]){
   expect(parameters.safeParse(input).success).toBe(false);
  }
  for(const input of [{action:'hotspots',startDate:'2026-09-13',endDate:'2026-09-13'},{action:'search',keyword:'AI'},{action:'accountWorks',authorUrl:'https://www.douyin.com/user/test'},{action:'detail',workId:'12345678'},{action:'transcriptSubmit',url:'https://www.douyin.com/video/12345678'},{action:'transcriptResult',taskId:'task-123'}]){
   expect(parameters.parse(input)).toEqual(redfoxInputSchema.parse(input));
  }
 });
 it('is registered and frozen as a Worker tool, outside host read list',async()=>{expect(ALL_CHAT_TOOL_NAMES).toContain('redfox.query');expect(CHAT_READ_TOOL_NAMES).not.toContain('redfox.query');const tools=buildChatTools(['redfox.query'],{} as ChatToolDeps);const result=await prepareChatToolDefinitions(tools);expect(result.definitions[0]).toMatchObject({name:'redfox.query',execution:'worker.redfox',effect:'committed'});expect(JSON.stringify(result)).not.toContain('REDFOX_API_KEY');});
 it('registers all three on-demand methods',()=>{registerAllTemplates();for(const id of ['method.redfox.topic-research','method.redfox.benchmark','method.operations.review'])expect(getTemplate(id)).toBeDefined();});
});
