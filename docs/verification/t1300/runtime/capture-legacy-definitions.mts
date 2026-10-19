import {writeFileSync} from 'node:fs';
import {buildChatTools} from '../../../../backend/src/modules/ai-runtime/chat-tools';
import {prepareChatToolDefinitions} from '../../../../backend/src/modules/ai-runtime/chat-tool-definitions';
const rows:Record<string,unknown>={};
for(const protocol of ['director-v1','director-v2','markdown-v1']){
 const options={legacyWorkEditorProtocol:protocol!=='markdown-v1',workWritingContext:protocol==='director-v2'};
 rows[protocol]=(await prepareChatToolDefinitions(buildChatTools(['work.editor.read','work.editor.propose'],{humanizeError:()=>null,...options} as never),options)).definitions;
}
writeFileSync(new URL('./legacy-definitions.json',import.meta.url),JSON.stringify(rows,null,2)+'\n');
