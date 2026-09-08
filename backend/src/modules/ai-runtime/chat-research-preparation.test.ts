import {expect,it} from "vitest";
import {prepareChatResearchQuery,projectChatSearchResults} from "./chat-research-preparation";
it("显式查询不被资料词污染，空查询仅使用真实主题兜底",()=>{
 const context={selectionTitle:"原主题",userMaterialQueryTerms:["原资料实体","原资料术语"]};
 expect(prepareChatResearchQuery(context,{query:"  用户  查询\n"})).toBe("用户 查询");
 expect(prepareChatResearchQuery(context,{})).toBe("原主题");
 expect(prepareChatResearchQuery({selectionTitle:"",userMaterialQueryTerms:[]},{})).toBe("");
});
it("搜索卡仅使用真实 URL、标题和摘要，空结果保持空",()=>{
 expect(projectChatSearchResults([{title:"原页面",url:"https://example.com/a",snippet:"原摘要"}])).toEqual({kind:"material.gather",grounding:"web",items:[{title:"原页面",url:"https://example.com/a",source:"example.com",whyRelevant:"原摘要",category:"联网资料",sourceUrl:"https://example.com/a"}]});
 expect(projectChatSearchResults([]).items).toEqual([]);
});
