import {expect,it} from 'vitest';
import {convertToModelMessages,type UIMessage} from 'ai';
import {freezeChatModelMessages} from './chat-model-message-snapshot';
it('真实SDK附件转换后冻结保原图片字节，不丢成数字对象',async()=>{
 const original=await convertToModelMessages([{id:'u',role:'user',parts:[{type:'text',text:'看图'},{type:'file',mediaType:'image/png',url:'data:image/png;base64,AQID'}]}] as UIMessage[]);
 const frozen=freezeChatModelMessages(original);expect(frozen[0].content).toContainEqual({type:'file',data:{type:'url',url:'data:image/png;base64,AQID'},mediaType:'image/png'});
});
it('URL不触发读取，普通历史工具内容不改变',()=>{
 const messages=[{role:'user',content:[{type:'image',image:'https://foreign.invalid/image.png',mediaType:'image/png'}]},{role:'assistant',content:[{type:'tool-call',toolCallId:'t',toolName:'read_project',input:{}}]}] as any;
 expect(freezeChatModelMessages(messages)).toEqual(messages);
});

it('SDK已取得data字节以base64持久化，原mediaType及data协议保持',()=>{expect(freezeChatModelMessages([{role:'user',content:[{type:'file',mediaType:'image/png',data:{type:'data',data:new Uint8Array([1,2,3])}}]}] as any)[0].content[0]).toEqual({type:'file',mediaType:'image/png',data:{type:'data',data:'AQID'}});});
