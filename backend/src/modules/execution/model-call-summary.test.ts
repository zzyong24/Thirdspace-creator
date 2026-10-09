import {expect,it} from 'vitest';
import {summarizeModelReceipt} from './model-call-summary';
const tool=(id='tool',input='{"text":"中文😀","count":2}')=>({type:'tool-call',toolCallId:id,toolName:'write',input});
const start=(id='tool')=>({type:'tool-input-start',id,toolName:'write'});
const delta=(value:string,id='tool')=>({type:'tool-input-delta',id,delta:value});
const end=(id='tool')=>({type:'tool-input-end',id});
const receipt=(parts:unknown[]|undefined,content:unknown[]=[tool()])=>({content,...(parts?{stream:{schemaVersion:1,parts}}:{}),finishReason:{unified:'tool-calls'},usage:{inputTokens:{total:1},outputTokens:{total:1}},warnings:[]});

it('完整中文分片只证明保存值等价，JSON键顺序和负零不构成假冲突',()=>{
 const input='{"count":2,"text":"中文😀"}',r=summarizeModelReceipt(receipt([start(),delta(input.slice(0,8)),delta(input.slice(8)),end()]));
 expect(r).toMatchObject({receiptState:'valid',toolCount:1,toolsTruncated:false,tools:[{toolCallId:'tool',streamPartCount:4,streamUtf8Bytes:Buffer.byteLength(input),streamStrictObject:true,finalStrictObject:true,observedConsistency:'equal',reason:'matched'}]});
 expect(summarizeModelReceipt(receipt([start(),delta('{"n":-0}'),end()],[tool('tool','{"n":0}')])).tools[0]?.observedConsistency).toBe('equal');
});
it('合法小对象不替模型补图文，非法截断保持不合法而不被修成前缀',()=>{
 expect(summarizeModelReceipt(receipt([start(),delta('{"article":{}}'),end()],[tool('tool','{"article":{}}')])).tools[0]?.observedConsistency).toBe('equal');
 const r=summarizeModelReceipt(receipt([start(),delta('{"article":{},"graphic":'),end()],[tool('tool','{"article":{}}')]));
 expect(r.tools[0]).toMatchObject({streamStrictObject:false,finalStrictObject:true,observedConsistency:'unavailable',reason:'stream_not_object'});
});
it('真实对象值不同返回different，合法非对象不当完整工具对象',()=>{
 expect(summarizeModelReceipt(receipt([start(),delta('{"n":1}'),end()],[tool('tool','{"n":2}')])).tools[0]).toMatchObject({observedConsistency:'different',reason:'different'});
 for(const value of ['[]','null','42','"text"'])expect(summarizeModelReceipt(receipt([start(),delta(value),end()],[tool('tool',value)])).tools[0]?.streamStrictObject).toBe(false);
 expect(summarizeModelReceipt(receipt([start(),delta('{}'),end()],[tool('tool','{"unfinished":')])).tools[0]?.reason).toBe('final_not_object');
});
it.each([
 {parts:undefined,reason:'no_stream'},
 {parts:[start(),end()],reason:'missing_segments'},
 {parts:[delta('{}'),end()],reason:'missing_segments'},
 {parts:[start(),delta('{}')],reason:'missing_segments'},
 {parts:[start(),start(),delta('{}'),end()],reason:'duplicate_segments'},
 {parts:[start(),delta('{}'),end(),end()],reason:'duplicate_segments'},
 {parts:[delta('{}'),start(),end()],reason:'unordered_segments'},
 {parts:[start(),end(),delta('{}')],reason:'unordered_segments'},
 {parts:[{...start(),toolName:'other'},delta('{}'),end()],reason:'invalid_identity'},
 {parts:[start(),{type:'tool-input-delta',id:'tool',delta:42},end()],reason:'invalid_segments'},
])('缺失或有冲突证据 $reason 不能证明一致',({parts,reason})=>{
 expect(summarizeModelReceipt(receipt(parts,[tool('tool','{}')])).tools[0]).toMatchObject({observedConsistency:'unavailable',reason});
});
it('同model多tool交错按真实ID分开，重复final身份不混合，另一model不继承串',()=>{
 const r=summarizeModelReceipt(receipt([start('a'),start('b'),delta('{"n":1}','a'),delta('{"n":2}','b'),end('b'),end('a')],[tool('a','{"n":1}'),tool('b','{"n":2}')]));
 expect(r.tools.map(x=>x.observedConsistency)).toEqual(['equal','equal']);
 expect(summarizeModelReceipt(receipt([start(),delta('{}'),end()],[tool('tool','{}'),tool('tool','{}')])).tools.every(x=>x.reason==='invalid_identity')).toBe(true);
 expect(summarizeModelReceipt(receipt([end()],[tool('tool','{}')])).tools[0]?.reason).toBe('missing_segments');
});
it('未知JSON/不合法receipt不被宽松遍历或回显；有效回执正文和metadata也不回显',()=>{
 const secret='CANARY_PRIVATE_PARAMETER';
 const invalid=summarizeModelReceipt({content:[tool('tool',secret)],stream:{parts:[{token:secret}]},headers:{authorization:secret}});
 expect(invalid).toEqual({receiptState:'invalid',finishReason:null,toolCount:null,toolsTruncated:null,tools:[]});
 const valid=summarizeModelReceipt({...receipt([start(),delta(JSON.stringify({secret})),end()],[tool('tool',JSON.stringify({secret}))]),warnings:[{secret}],providerMetadata:{vendor:{token:secret}}});
 expect(JSON.stringify(valid)).not.toContain(secret);expect(valid.tools[0]?.observedConsistency).toBe('equal');
 const bad=summarizeModelReceipt(receipt([],[{type:'tool-call',toolCallId:42,input:{secret}}]));
 expect(bad.tools[0]?.toolCallId).toBeNull();expect(bad.tools[0]?.reason).toBe('invalid_identity');
});
it('超过100个工具明确截断统计，不把部分分析说成全部',()=>{
 const r=summarizeModelReceipt(receipt(undefined,Array.from({length:101},(_,i)=>tool(`tool-${i}`,'{}'))));
 expect(r).toMatchObject({toolCount:101,toolsTruncated:true});expect(r.tools).toHaveLength(100);
});
