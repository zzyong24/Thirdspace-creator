import {describe,it,expect} from "vitest";
import {articleDocument} from "../src/resources/articles";
import {graphicPostDocument} from "../src/resources/graphic-posts";

const source={kind:"output_version",sourceOutputId:"source",artifactId:"artifact",versionId:"version",
 sourceType:"video",selectionDigest:"a".repeat(64),selection:{mode:"whole"}};
const article={schemaVersion:1,title:"标题",titleSourceRefs:[source],summary:"摘要",summarySourceRefs:[source],
 sections:[{sectionId:"section",order:0,heading:"章节",body:"正文",sourceRefs:[source]}],factItems:[],visualBriefs:[],imageUses:[]};
const graphic={schemaVersion:1,title:"标题",body:"正文",summary:"简介",tags:[],imageUses:[],sourceRefs:[source],
 cardBriefs:[{cardId:"card",title:"图卡",body:"文字",sourceRefs:[source]}],ruleSnapshotRef:null};
describe("正式稿件保留严格作品历史来源",()=>{
 it("文章标题、摘要和段落均保留源作品版本及选区",()=>{
  expect(articleDocument.parse(article).sections[0]!.sourceRefs).toEqual([source]);
 });
 it("图文正文及图卡保留同一历史来源",()=>{
  expect(graphicPostDocument.parse(graphic).cardBriefs![0]!.sourceRefs).toEqual([source]);
 });
 it("不接受自报来源正文或缺少选区摘要",()=>{
  expect(articleDocument.safeParse({...article,titleSourceRefs:[{...source,body:"自报原文"}]}).success).toBe(false);
  expect(graphicPostDocument.safeParse({...graphic,sourceRefs:[{...source,selectionDigest:undefined}]}).success).toBe(false);
 });
 it("旧项目/素材引用和无来源草稿仍合法",()=>{
  expect(articleDocument.safeParse({...article,titleSourceRefs:[],summarySourceRefs:[],sections:[]}).success).toBe(true);
  expect(graphicPostDocument.safeParse({...graphic,cardBriefs:[],sourceRefs:[{kind:"project",id:"p",versionId:"v"}]}).success).toBe(true);
 });
});
