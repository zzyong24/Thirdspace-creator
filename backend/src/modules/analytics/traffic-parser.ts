import {trafficSourcePayloadSchema,type TrafficSourcePayload} from '@creatoros/contract';
/** SEMANTIC_BOUNDARY_ALLOW: 平台表头和百分数字符串的协议解析，不做内容选择或限流诊断。 */
export function parseTrafficTables(tables:Array<{rows:string[][]}>,options:{windowLabel?:string|null;complete?:boolean}={}):TrafficSourcePayload {
 const table=tables.find(t=>t.rows[0]?.some(c=>c.trim()==='来源占比'));
 if(!table)throw new Error('流量来源表尚未加载或页面结构已变化');
 const header=table.rows[0]!,index=header.findIndex(c=>c.trim()==='来源占比');
 const entries=table.rows.slice(1).filter(r=>r[0]?.trim()).map(r=>{
  const value=r[index]?.trim()??'';
  if(!value||/^[-—]+$/.test(value))return {label:r[0]!.trim(),percentage:null};
  if(!/^\d+(?:\.\d+)?%$/.test(value))throw new Error('流量来源比例格式已变化');
  return {label:r[0]!.trim(),percentage:Number(value.slice(0,-1))};
 });
 if(new Set(entries.map(e=>e.label)).size!==entries.length)throw new Error('流量来源出现重复标签');
 return trafficSourcePayloadSchema.parse({app:header[0]?.trim(),windowLabel:options.windowLabel??null,complete:options.complete??true,entries});
}
