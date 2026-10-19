import {writeFileSync,readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {buildChatTools} from '../../../../backend/src/modules/ai-runtime/chat-tools';
import {prepareChatToolDefinitions} from '../../../../backend/src/modules/ai-runtime/chat-tool-definitions';
const historical=JSON.parse(gunzipSync(readFileSync(new URL('./legacy-definitions.json.gz',import.meta.url))).toString());
const result={baseline:'d606c0c612197a5c5186d75175c0934c6d992536',measurement:'实际冻结description/schema UTF8字节；不是wire、token或时延',legacy:{} as Record<string,unknown>,owners:{} as Record<string,unknown>};
for(const protocol of ['director-v1','director-v2','markdown-v1']){
 const options={legacyWorkEditorProtocol:protocol!=='markdown-v1',workWritingContext:protocol==='director-v2'};
 const actual=(await prepareChatToolDefinitions(buildChatTools(['work.editor.read','work.editor.propose'],{humanizeError:()=>null,...options} as never),options)).definitions;
 result.legacy[protocol]={equalBeforeChange:JSON.stringify(actual)===JSON.stringify(historical[protocol]),sha256:createHash('sha256').update(JSON.stringify(actual)).digest('hex'),definitionBytes:Buffer.byteLength(JSON.stringify(actual)),proposeSchemaBytes:Buffer.byteLength(JSON.stringify(actual[1]!.parameters))};
}
for(const owner of ['wechat_article','graphic_post','production'] as const){
 const options={workEditorOwner:owner};
 const definitions=(await prepareChatToolDefinitions(buildChatTools(['work.editor.read','work.editor.propose'],{humanizeError:()=>null,...options} as never),options)).definitions;
 result.owners[owner]={definitionsBytes:Buffer.byteLength(JSON.stringify(definitions)),readSchemaBytes:Buffer.byteLength(JSON.stringify(definitions[0]!.parameters)),proposeSchemaBytes:Buffer.byteLength(JSON.stringify(definitions[1]!.parameters)),versions:definitions.map(def=>def.version)};
}
writeFileSync(new URL('./owner-definition-measurements.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
