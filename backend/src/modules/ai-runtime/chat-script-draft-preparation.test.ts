import {describe,it,expect} from "vitest";
import {createHash} from "node:crypto";
import {prepareScriptDraftInput,finalizeScriptDraftImport} from "./chat-script-draft-preparation";
const source={ref:"message:1",label:"原稿",text:"说明。第一句正文。\n最后一句。",truncated:false};
describe("宿主整稿输入准备",()=>{
 it("generate 保留原清洗与真实多源顺序，不需要授权请求",()=>{
  const second={...source,ref:"attachment:2",text:"第二份完整资料"};
  const result=prepareScriptDraftInput({topic:" 主题 ",angle:" 角度 ",targetDurationSeconds:180,instruction:" 修改方向 ",sourceRefs:[second.ref,source.ref]},[source,second],"真实指令");
  expect(result.mode).toBe("generate");if(result.mode!=="generate")throw new Error();
  expect(result.dispatchInput).toMatchObject({topic:"主题",angle:"角度",targetDurationSeconds:180,instruction:"修改方向"});
  expect(result.dispatchInput.sourceSnapshots?.map(s=>[s.body,s.order,s.sha256])).toEqual([second,source].map((s,i)=>[s.text,i,createHash("sha256").update(s.text).digest("hex")]));
  expect(result).not.toHaveProperty("authorization");
 });
 it("资料缺指令和失效引用保留原错误",()=>{
  expect(()=>prepareScriptDraftInput({sourceRefs:[source.ref]},[source],"")).toThrow("基于资料创作时需要保留用户本轮调整方向，请重新发起。");
  expect(()=>prepareScriptDraftInput({mode:"verbatim",sourceRef:"lost"},[source],"")).toThrow("原稿引用已失效");
 });
 it("冻结来源，模型只提供授权锚点而不能替换正文",()=>{
  const original={...source};const prepared=prepareScriptDraftInput({mode:"verbatim",sourceRef:" message:1 ",startAnchor:"建议"},[original],"把原稿写进稿面");
  if(prepared.mode!=="verbatim")throw new Error();original.text="后来改变";
  expect(prepared.authorization.prompt).toContain(source.text);expect(prepared.authorization.prompt).toContain("把原稿写进稿面");
  const result=finalizeScriptDraftImport(prepared,JSON.stringify({authorized:true,startAnchor:"第一句正文。",endAnchor:null,text:"伪造正文"}));
  expect(result.verbatimSourceText).toBe("第一句正文。\n最后一句。");
  expect(result.verbatimSourceLength).toBe(result.verbatimSourceText.length);
  expect(result.verbatimSourceSha256).toBe(createHash("sha256").update(result.verbatimSourceText).digest("hex"));
 });
 it("拒绝未授权、坏决策、伪锚点与截断来源",()=>{
  const prepared=prepareScriptDraftInput({mode:"verbatim",sourceRef:source.ref},[source],"只发稿件");if(prepared.mode!=="verbatim")throw new Error();
  expect(()=>finalizeScriptDraftImport(prepared,'{"authorized":false,"reason":"尚未授权"}')).toThrow("尚未授权");
  expect(()=>finalizeScriptDraftImport(prepared,'{"authorized":"true"}')).toThrow("AI 没能可靠识别完整稿件边界");
  expect(()=>finalizeScriptDraftImport(prepared,'{"authorized":true,"startAnchor":"不存在"}')).toThrow();
  const truncated=prepareScriptDraftInput({mode:"verbatim",sourceRef:source.ref},[{...source,truncated:true}],"导入");if(truncated.mode!=="verbatim")throw new Error();
  expect(()=>finalizeScriptDraftImport(truncated,'{"authorized":true}')).toThrow();
 });
});
