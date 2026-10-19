import {isDeepStrictEqual} from 'node:util';
import {ENDPOINTS} from '@creatoros/contract';
import {workerProviderReceiptSchema} from '@creatoros/contract/execution-worker';

type Call=typeof ENDPOINTS.readWorkbenchModelCallSummary.response['_output']['calls'][number];
type Summary=Omit<Call,'callId'|'sequence'>;
type Tool=Call['tools'][number];
const record=(value:unknown):Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const identity=(value:unknown)=>typeof value==='string'&&value.length>0&&value.length<=256?value:null;
function strictObject(input:string){
 try{const value:unknown=JSON.parse(input);return value!==null&&typeof value==='object'&&!Array.isArray(value)?{value}:null;}
 catch{return null;}
}

/** SEMANTIC_BOUNDARY_ALLOW:仅比较同一已结算回执的机械身份、顺序和严格JSON值；
 * 不修补JSON、不判断创作完整性，不把已保存分片当成供应商原wire。 */
export function summarizeModelReceipt(raw:unknown):Summary{
 const parsed=workerProviderReceiptSchema.safeParse(raw);
 if(!parsed.success)return {receiptState:'invalid',finishReason:null,toolCount:null,toolsTruncated:null,tools:[]};
 const receipt=parsed.data,content=receipt.content.map(record).filter(part=>part.type==='tool-call');
 const parts=receipt.stream?.parts.map(record);
 const tools:Tool[]=content.slice(0,100).map((final,index)=>{
  const id=identity(final.toolCallId),input=typeof final.input==='string'?final.input:null;
  const base:Tool={index,toolCallId:id,streamPartCount:0,streamUtf8Bytes:null,finalUtf8Bytes:input===null?null:Buffer.byteLength(input),streamStrictObject: null,finalStrictObject:input===null?null:strictObject(input)!==null,observedConsistency:'unavailable',reason:'invalid_identity'};
  if(!id||typeof final.toolName!=='string'||!final.toolName||content.filter(part=>part.toolCallId===id).length!==1)return base;
  if(input===null)return {...base,reason:'invalid_content'};
  if(!parts)return {...base,reason:'no_stream'};
  const related=parts.filter(part=>part.id===id&&['tool-input-start','tool-input-delta','tool-input-end'].includes(String(part.type)));
  base.streamPartCount=related.length;
  const starts=related.filter(part=>part.type==='tool-input-start'),ends=related.filter(part=>part.type==='tool-input-end'),deltas=related.filter(part=>part.type==='tool-input-delta');
  if(starts.length>1||ends.length>1)return {...base,reason:'duplicate_segments'};
  if(starts.length!==1||ends.length!==1||!deltas.length)return {...base,reason:'missing_segments'};
  if(related[0]!==starts[0]||related.at(-1)!==ends[0])return {...base,reason:'unordered_segments'};
  if(starts[0]!.toolName!==final.toolName)return {...base,reason:'invalid_identity'};
  // 无身份段不能可靠归到任何tool；同id stream final也不能与content冲突。
  const malformed=parts.some(part=>['tool-input-start','tool-input-delta','tool-input-end'].includes(String(part.type))&&identity(part.id)===null);
  const streamFinal=parts.filter(part=>part.type==='tool-call'&&part.toolCallId===id);
  if(malformed||deltas.some(part=>typeof part.delta!=='string')||streamFinal.length>1)return {...base,reason:'invalid_segments'};
  if(streamFinal.length===1&&(streamFinal[0]!.toolName!==final.toolName||streamFinal[0]!.input!==input))return {...base,reason:'invalid_content'};
  const stream=deltas.map(part=>part.delta as string).join(''),a=strictObject(stream),b=strictObject(input);
  base.streamUtf8Bytes=Buffer.byteLength(stream);base.streamStrictObject=a!==null;
  if(!a)return {...base,reason:'stream_not_object'};
  if(!b)return {...base,reason:'final_not_object'};
  // JSON roundtrip规范化负零，仅比较严格解析后的JSON值，不按字符串格式选择内容。
  const equal=isDeepStrictEqual(JSON.parse(JSON.stringify(a.value)),JSON.parse(JSON.stringify(b.value)));
  return {...base,observedConsistency:equal?'equal':'different',reason:equal?'matched':'different'};
 });
 return {receiptState:'valid',finishReason:receipt.finishReason.unified,toolCount:content.length,toolsTruncated:content.length>100,tools};
}
