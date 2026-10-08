import { z } from "zod";
import {asSchema,type FlexibleSchema} from "ai";
type Node=Record<string,z.infer<ReturnType<typeof z.json>>>;
const object=z.record(z.string(),z.json());
const common=["type","description","title","enum"];
const keys:Record<string,string[]>={object:["properties","required","additionalProperties"],array:["items","minItems","maxItems"],string:["minLength","maxLength","format"],number:["minimum","maximum"],integer:["minimum","maximum"],boolean:[],null:[]};
const stringFormats=new Set(["uri"]);
/** SEMANTIC_BOUNDARY_ALLOW: 只校验明确参数契约，不判断意图或创作选择；未支持约束不能静默放行。 */
function checked(node:Node):Node{
 // JSON Schema 方言声明是元数据，不是新增业务约束。只接受本转换器实际支持的 draft-7。
 if(node.$schema!==undefined){
  if(node.$schema!=="http://json-schema.org/draft-07/schema#" && node.$schema!=="https://json-schema.org/draft-07/schema#")throw new Error("工具参数JSON Schema方言尚不支持");
  const {$schema: _dialect,...constraints}=node;
  return checked(constraints);
 }
 const type=node.type;
 if(type!==undefined && (typeof type!=="string" || !Object.hasOwn(keys,type)))throw new Error("工具参数类型尚不支持");
 const allowed=[...common,...(typeof type==="string"?keys[type]!:[])];
 for(const key of Object.keys(node))if(!allowed.includes(key))throw new Error(`工具参数约束尚不支持：${key}`);
 for(const key of ["title","description"])if(node[key]!==undefined && typeof node[key]!=="string")throw new Error("工具参数描述格式无效");
 if(node.format!==undefined && (typeof node.format!=="string" || !stringFormats.has(node.format)))throw new Error("工具参数字符串格式尚不支持");
 const result={...node};
 for(const key of ["minLength","maxLength","minItems","maxItems","minimum","maximum"]){
  const value=node[key];if(value===undefined)continue;
  if(typeof value!=="number" || !Number.isFinite(value) || (!["minimum","maximum"].includes(key) && (!Number.isInteger(value) || value<0)))throw new Error("工具参数范围无效");
 }
 for(const [min,max] of [["minLength","maxLength"],["minItems","maxItems"],["minimum","maximum"]])if(typeof node[min!]==="number" && typeof node[max!]==="number" && node[min!]!>node[max!]!)throw new Error("工具参数范围相反");
 if(node.enum!==undefined){
  if(!Array.isArray(node.enum) || !node.enum.length || !["string","number","integer","boolean","null"].includes(String(type)) || Object.keys(node).some(key=>!common.includes(key)))throw new Error("工具参数枚举组合尚不支持");
  for(const value of node.enum)if(type==="null"?value!==null:type==="integer"?typeof value!=="number" || !Number.isInteger(value):typeof value!==type)throw new Error("工具参数枚举类型不符");
 }
 if(type==="object"){
  const properties=object.parse(node.properties??{}),required=z.array(z.string()).parse(node.required??[]);
  if(new Set(required).size!==required.length || required.some(key=>!Object.hasOwn(properties,key)))throw new Error("工具参数必填字段未定义");
  if(node.additionalProperties!==undefined && typeof node.additionalProperties!=="boolean")throw new Error("额外字段约束尚不支持");
  result.properties=Object.fromEntries(Object.entries(properties).map(([key,value])=>[key,checked(object.parse(value))]));
 }
 if(type==="array")result.items=checked(object.parse(node.items??{}));
 if(type==="integer")result.type="number";
 // Zod 的字符串长度按 UTF16 计数；移除此转换项，在下面按 JSON Schema 字符语义检查。
 delete result.minLength;delete result.maxLength;
 return result;
}
function checkValues(node:Node,value:unknown,ctx:z.RefinementCtx,path:Array<string|number>=[]){
 if(node.type==="integer" && typeof value==="number" && !Number.isInteger(value))ctx.addIssue({code:"custom",path,message:"工具参数必须是整数"});
 if(typeof value==="string" && node.type==="string"){
  const count=Array.from(value).length;
  if((typeof node.minLength==="number" && count<node.minLength) || (typeof node.maxLength==="number" && count>node.maxLength))ctx.addIssue({code:"custom",path,message:"字符串长度不符合工具参数约束"});
 }
 if(Array.isArray(value) && node.type==="array" && node.items) value.forEach((item,index)=>checkValues(node.items as Node,item,ctx,[...path,index]));
 if(value && typeof value==="object" && !Array.isArray(value) && node.type==="object")for(const [key,child] of Object.entries((node.properties??{}) as Node))checkValues(child as Node,(value as Record<string,unknown>)[key],ctx,[...path,key]);
}
export async function prepareChatToolParameters(inputSchema:FlexibleSchema<unknown>){
 const schema=object.parse(await asSchema(inputSchema).jsonSchema);
 if(schema.type!=="object")throw new Error("工具参数必须是对象");
 // 真实工具的 Zod 契约已有完整校验能力。复用它，避免 JSON 子集转换器拒绝
 // 标准元数据、nullable/default 等合法工具定义；权限仍由工具宿主独立检查。
 if(inputSchema instanceof z.ZodType){
  const original=inputSchema as z.ZodType<unknown,z.infer<ReturnType<typeof z.json>>>;
  return {schema:structuredClone(schema),parameters:z.json().pipe(original)};
 }
 const supported=checked(schema);
 const converted=z.fromJSONSchema(supported as Parameters<typeof z.fromJSONSchema>[0],{defaultTarget:"draft-7"}) as z.ZodType<unknown,z.infer<ReturnType<typeof z.json>>>;
 const parameters=z.json().pipe(converted).superRefine((value,ctx)=>checkValues(schema,value,ctx));
 return {schema:structuredClone(schema),parameters};
}
