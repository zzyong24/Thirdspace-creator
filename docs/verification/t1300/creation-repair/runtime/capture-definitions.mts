import {writeFileSync} from 'node:fs';
import {buildChatTools} from '../../../../../backend/src/modules/ai-runtime/chat-tools';
import {prepareChatToolDefinitions} from '../../../../../backend/src/modules/ai-runtime/chat-tool-definitions';
const tools=buildChatTools(['work.creation.read','work.creation.propose'],{humanizeError:()=>null} as never);
const result=[];
for(const version of [1,2])result.push({version,definitions:(await prepareChatToolDefinitions(tools,{workWritingContext:version===2})).definitions});
writeFileSync(new URL('./creation-definitions-before.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result.map(r=>({version:r.version,definitions:r.definitions.map(d=>({name:d.name,version:d.version,bytes:Buffer.byteLength(JSON.stringify(d))}))}))));
