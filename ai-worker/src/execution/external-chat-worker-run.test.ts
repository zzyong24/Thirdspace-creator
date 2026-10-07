import {describe,it,expect} from 'vitest';
import {convertToModelMessages,type UIMessage} from 'ai';
import {externalChatPrompt} from './external-chat-worker-run';
const prompt=(messages:unknown[])=>externalChatPrompt({system:'当前动态工具',messages} as Parameters<typeof externalChatPrompt>[0]);
describe('原Codex prompt历史消费者',()=>{
 it('真实SDK两回合转换保原工具调用/JSON回执与顺序，不把合法历史当附件',async()=>{
  const output={kind:'work.editor.candidate',candidate:{kind:'native_scene',tracks:[{id:'track',elements:[{id:'clip',trimStart:120000,duration:600000}]}]},summary:'仅候选，尚未采纳'};
  const messages=await convertToModelMessages([
   {id:'u1',role:'user',parts:[{type:'text',text:'裁头一秒'}]},
   {id:'a1',role:'assistant',parts:[{type:'text',text:'先读真实作品'},{type:'tool-work.editor.propose',toolCallId:'original-call',state:'output-available',input:{baseDigest:'sha256:real',candidate:{kind:'typed_patch'}},output}]},
   {id:'u2',role:'user',parts:[{type:'text',text:'同一脚本继续生成文章图文'}]},
  ] as UIMessage[],{ignoreIncompleteToolCalls:true});
  const result=prompt(messages);expect(result).toContain('历史工具调用记录');expect(result).toContain('历史工具回执记录');
  for(const message of messages)if(Array.isArray(message.content))for(const part of message.content)if(part.type==='tool-call'||part.type==='tool-result')expect(result).toContain(JSON.stringify(part));
  expect(result.indexOf('裁头一秒')).toBeLessThan(result.indexOf('original-call'));
  expect(result.indexOf('original-call')).toBeLessThan(result.lastIndexOf('同一脚本继续生成文章图文'));
  expect(result).toContain('不是本轮执行或授权');
 });
 it('普通string/text原样保留，混合assistant文字与原调用保序',()=>{
  const result=prompt([{role:'user',content:'完整原文\n不改'},{role:'assistant',content:[{type:'text',text:'先说明'},{type:'tool-call',toolCallId:'call',toolName:'work.editor.read',input:{scope:'selection'}},{type:'text',text:'后说明'}]}]);
  expect(result).toContain('user：\n完整原文\n不改');expect(result.indexOf('先说明')).toBeLessThan(result.indexOf('历史工具调用记录'));expect(result.indexOf('历史工具调用记录')).toBeLessThan(result.indexOf('后说明'));
 });
 it.each([
  {role:'user',content:[{type:'image',image:'data:image/png;base64,AA=='}]},
  {role:'user',content:[{type:'file',data:'abc',mediaType:'audio/wav'}]},
  {role:'user',content:[{type:'tool-call',toolCallId:'x',toolName:'work.editor.read',input:{}}]},
  {role:'assistant',content:[{type:'tool-result',toolCallId:'x',toolName:'work.editor.read',output:{type:'json',value:{}}}]},
  {role:'tool',content:[{type:'tool-result',toolCallId:'x',toolName:'work.editor.read',output:{type:'content',value:[{type:'media',data:'AA==',mediaType:'image/png'}]}}]},
  {role:'assistant',content:[{type:'future-part',text:'未知协议'}]},
  {role:'assistant',content:[{type:'tool-call',toolCallId:' ',toolName:'work.editor.read',input:{}}]},
  {role:'assistant',content:[{type:'tool-call',toolCallId:'x',toolName:'',input:{}}]},
  {role:'tool',content:[{type:'tool-result',toolCallId:'',toolName:'work.editor.read',output:{type:'json',value:{}}}]},
  {role:'tool',content:[{type:'tool-result',toolCallId:'x',toolName:'  ',output:{type:'text',value:'原回执'}}]},
 ])('直接多媒体/结果媒体/未知/错角色仍明确拒绝 %#',message=>{
  expect(()=>prompt([message])).toThrow(expect.objectContaining({outcome:'waiting_user',errorCode:'CODEX_INPUT_MODALITY_UNSUPPORTED'}));
 });
});
