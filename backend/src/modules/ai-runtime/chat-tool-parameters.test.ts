import {it,expect} from "vitest";
import {jsonSchema} from "ai";
import {prepareChatToolParameters} from "./chat-tool-parameters";
it("执行前实际拒绝必填、额外字段和数值范围，不改输入",async()=>{
 const raw={type:"object",properties:{name:{type:"string",minLength:1},count:{type:"integer",minimum:1,maximum:3}},required:["name","count"],additionalProperties:false} as const;
 const prepared=await prepareChatToolParameters(jsonSchema(raw as never));
 expect(prepared.schema).toEqual(raw);
 for(const input of [{},{name:"x",count:0},{name:"x",count:4},{name:"x",count:1.5},{name:"",count:1},{name:"x",count:1,extra:true}])expect(prepared.parameters.safeParse(input).success).toBe(false);
 const input={name:"合法",count:2};expect(prepared.parameters.parse(input)).toEqual(input);
});
it.each(["uniqueItems","contains","minProperties","patternProperties","dependencies","format","default"])("不能静默忽略约束 %s",async key=>{
 await expect(prepareChatToolParameters(jsonSchema({type:"object",properties:{value:{type:"string",[key]:key==="default"?"伪默认":true}}} as never))).rejects.toThrow();
});
it("字符串长度按Unicode字符计算而非UTF16单元",async()=>{
 const {parameters}=await prepareChatToolParameters(jsonSchema({type:"object",properties:{label:{type:"string",minLength:2,maxLength:2}},required:["label"],additionalProperties:false}));
 expect(parameters.safeParse({label:"😀😀"}).success).toBe(true);
 expect(parameters.safeParse({label:"😀"}).success).toBe(false);
 expect(parameters.safeParse({label:"😀😀😀"}).success).toBe(false);
});

it("异步schema、嵌套数组和枚举沿原定义执行",async()=>{
 const raw={type:"object",properties:{rows:{type:"array",minItems:1,maxItems:2,items:{type:"object",properties:{state:{type:"string",enum:["a","b"]},label:{type:"string",maxLength:1}},required:["state","label"],additionalProperties:false}}},required:["rows"],additionalProperties:false};
 const p=await prepareChatToolParameters(jsonSchema(Promise.resolve(raw) as never));
 expect(p.parameters.parse({rows:[{state:"a",label:"😀"}]})).toEqual({rows:[{state:"a",label:"😀"}]});
 for(const rows of [[],[{state:"c",label:"x"}],[{state:"a",label:"xx"}],[{state:"a",label:"x",extra:1}],Array.from({length:3},()=>({state:"a",label:"x"}))])expect(p.parameters.safeParse({rows}).success).toBe(false);
});
it.each([
 {type:"object",required:["unknown"]},
 {type:"object",properties:{x:{type:"string",enum:[1]}}},
 {type:"object",properties:{x:{type:"string",enum:["x"],maxLength:0}}},
 {type:"object",properties:{x:{type:"string",minLength:3,maxLength:2}}},
 {type:"object",properties:{x:{type:"number",maximum:"3"}}},
 {type:"object",properties:{x:{type:"array",items:[]}}},
])("无效或未支持的约束组合不得伪装成完整校验：%j",async raw=>{
 await expect(prepareChatToolParameters(jsonSchema(raw as never))).rejects.toThrow();
});

it("未声明items的数组仍执行数量上下界",async()=>{
 const raw={type:"object",properties:{rows:{type:"array",minItems:1,maxItems:2}},required:["rows"]};
 const {schema,parameters}=await prepareChatToolParameters(jsonSchema(raw as never));
 expect(schema).toEqual(raw);
 expect(parameters.safeParse({rows:[]}).success).toBe(false);
 expect(parameters.safeParse({rows:[1,2,3]}).success).toBe(false);
 expect(parameters.safeParse({rows:[{any:"合法JSON"}]}).success).toBe(true);
});
it("integer沿JSON Schema语义校验，不添加隐含安全整数上限",async()=>{
 const {parameters}=await prepareChatToolParameters(jsonSchema({type:"object",properties:{index:{type:"integer"}},required:["index"]}));
 expect(parameters.safeParse({index:9007199254740992}).success).toBe(true);
 expect(parameters.safeParse({index:1.5}).success).toBe(false);
});
it("公开schema副本的修改不能改变已建立的校验约束",async()=>{
 const p=await prepareChatToolParameters(jsonSchema({type:"object",properties:{label:{type:"string",maxLength:1}}}));
 ((p.schema.properties as Record<string,unknown>).label as Record<string,unknown>).maxLength=99;
 expect(p.parameters.safeParse({label:"xx"}).success).toBe(false);
});
