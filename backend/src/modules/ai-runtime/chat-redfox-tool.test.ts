import {describe,it,expect} from 'vitest';
import {buildChatTools,ALL_CHAT_TOOL_NAMES,getSurfaceToolScope,type ChatToolDeps} from './chat-tools';
import {prepareChatToolDefinitions} from './chat-tool-definitions';
import {CHAT_READ_TOOL_NAMES} from './chat-read-tool-names';
import {registerAllTemplates,getTemplate} from '@creatoros/ai-worker';
describe('RedFox real tool wiring',()=>{
 it('is registered and frozen as a Worker tool, outside host read list',async()=>{expect(ALL_CHAT_TOOL_NAMES).toContain('redfox.query');expect(CHAT_READ_TOOL_NAMES).not.toContain('redfox.query');const tools=buildChatTools(['redfox.query'],{} as ChatToolDeps);const result=await prepareChatToolDefinitions(tools);expect(result.definitions[0]).toMatchObject({name:'redfox.query',execution:'worker.redfox',effect:'committed'});expect(JSON.stringify(result)).not.toContain('REDFOX_API_KEY');});
 it('registers all three on-demand methods',()=>{registerAllTemplates();for(const id of ['method.redfox.topic-research','method.redfox.benchmark','method.operations.review'])expect(getTemplate(id)).toBeDefined();});
});
