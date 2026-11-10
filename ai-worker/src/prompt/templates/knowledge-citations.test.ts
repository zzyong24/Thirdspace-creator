import {describe,expect,it} from "vitest";
import {scriptDraftSchema,SCRIPT_DRAFT_TEMPLATE} from "./script-draft";
import {coverBriefSchema,COVER_BRIEF_TEMPLATE} from "./cover-brief";
import {bundleTitlesSchema,BUNDLE_TITLES_TEMPLATE} from "./bundle-titles";
import {getTemplate,registerAllTemplates} from "../registry";
const shot={role:"hook","口播":"一句","画面":"画面","字幕":"字幕","时长":"0-3s"};
describe("第三批步骤2：生成结果带知识来源",()=>{
 it("脚本和封面旧结果没有 sources 时补空数组，有则保留标题原文",()=>{
  expect(scriptDraftSchema.parse({shots:[shot]}).sources).toEqual([]);
  expect(scriptDraftSchema.parse({shots:[shot],sources:[" 选题三问 "]}).sources).toEqual(["选题三问"]);
  expect(coverBriefSchema.parse({headline:"标题"}).sources).toEqual([]);
 });
 it("提示词要求逐字照抄知识条目标题、不编造，并按惯例升版本",()=>{
  for(const t of [SCRIPT_DRAFT_TEMPLATE,COVER_BRIEF_TEMPLATE,BUNDLE_TITLES_TEMPLATE]){expect(t.template).toContain("逐字照抄");expect(t.template).toContain("不得编造来源");expect(t.template).toContain('"sources"');}
  expect(SCRIPT_DRAFT_TEMPLATE.version).toBe("v12");expect(COVER_BRIEF_TEMPLATE.version).toBe("v4");
 });
 it("标题模板正好3条、注入知识库并已注册",()=>{
  expect(bundleTitlesSchema.safeParse({titles:[{text:"一"},{text:"二"}]}).success).toBe(false);
  expect(bundleTitlesSchema.parse({titles:[{text:"一"},{text:"二"},{text:"三"}]}).sources).toEqual([]);
  expect(BUNDLE_TITLES_TEMPLATE.contextRequirements).toContain("knowledge");
  registerAllTemplates();expect(getTemplate("bundle.titles").version).toBe("1.0.0");
 });
});
