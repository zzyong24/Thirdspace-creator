import {describe,it,expect} from "vitest";
import {fillScriptMetadata} from "./script-derived-metadata";
const context={state:"ready" as const,scriptRef:null,scriptText:"主脚本",metadata:{title:"脚本标题",summary:"脚本简介",tags:["AI"]},metadataSource:{kind:"project" as const,projectId:"p",updatedAt:"2026-10-04"}};
describe("脚本元数据首次填空",()=>{
 it("只填空字段并记录真实出处，不修改输入",()=>{const doc={title:"",summary:"",tags:[]};expect(fillScriptMetadata(doc,context)).toEqual({title:"脚本标题",summary:"脚本简介",tags:["AI"],metadataSource:context.metadataSource});expect(doc.title).toBe("");});
 it("保留用户已填值和原出处",()=>{const doc={title:"我的标题",summary:"我的简介",tags:["手工"]};expect(fillScriptMetadata(doc,context)).toBe(doc);});
 it("部分空字段可填，但已有字段不被覆盖",()=>expect(fillScriptMetadata({title:"保留",summary:"",tags:["已有"]},context)).toMatchObject({title:"保留",summary:"脚本简介",tags:["已有"]}));
 it("缺失或读取失败不伪造信息或来源",()=>{const doc={title:"",summary:"",tags:[]};expect(fillScriptMetadata(doc,undefined)).toBe(doc);expect(fillScriptMetadata(doc,{...context,state:"unavailable"})).toBe(doc);});
});
