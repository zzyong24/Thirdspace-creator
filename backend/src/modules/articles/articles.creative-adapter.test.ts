import {expect,it} from "vitest";
import {createArticleCreativeResultAdapter} from "./articles.creative-adapter";
import type {ArticlesService} from "./articles.service";
import type {ArticleTextResultsService} from "./articles.text-results";
import type {RequestContext} from "@creatoros/contract";
const ctx:RequestContext={userId:"u",accountId:"a",requestId:"r",source:"user"};
const context={request:{sourceOutputId:"source",sourceVersionId:"source-v",targetType:"article" as const,mode:"whole" as const,clientRequestId:"conversion-original-request",reuseImages:[]},sourceAnchor:{kind:"output_version" as const,sourceOutputId:"source",artifactId:"source-artifact",versionId:"source-v",sourceType:"video" as const,selectionDigest:"a".repeat(64),selection:{mode:"whole" as const}}};
const sections=[{op:"insert" as const,sectionId:"s",order:0,afterSectionId:null,heading:"原小标题",body:"原正文",sourceRefs:[]}];
it("原结构任务投影标题/完整段落并落实人工编辑，字段结果不产生第二个模型任务",async()=>{
 const attempts:string[]=[],adoptions:unknown[]=[];
 const articles={generateCandidate:async(_c:RequestContext,_id:string,key:string)=>{attempts.push(key);return {taskId:"task",candidateId:"task",status:"queued"};},
  readCandidateState:async()=>({status:"succeeded",outputId:"output",baseVersionId:"base",sourceRefs:[context.sourceAnchor],errorCode:null,candidate:{candidateId:"task",proposedTitle:"候选标题",proposedSummary:"摘要",proposedSections:sections}}),
  adoptCandidate:async(_c:RequestContext,_id:string,input:Parameters<ArticlesService["adoptCandidate"]>[2])=>{adoptions.push(input);return {versionId:"saved"};}} as unknown as ArticlesService;
 const adapter=createArticleCreativeResultAdapter({service:{generate:async()=>{throw Error("不借单字段模型");}} as unknown as ArticleTextResultsService,
  articles,readTaskType:async()=>"wechat.article-draft",probeTextGeneration:async()=>({ready:true})});
 for(const kind of ["title","sections"] as const)await adapter.enqueue(ctx,{outputId:"output",projectId:"p",kind,targetPlatform:null,clientRequestId:`conversion-field-${kind}`,conversion:context});
 expect(attempts).toHaveLength(2);expect(attempts[0]).toBe(attempts[1]);
 expect(await adapter.read(ctx,"task",{kind:"sections"})).toMatchObject({status:"succeeded",value:sections});
 expect(await adapter.read(ctx,"task",{kind:"title"})).toMatchObject({value:"候选标题"});
 await adapter.adopt(ctx,{candidateId:"task",kind:"sections",expected:{owner:"wechat_article",versionId:"base"},editedValue:sections.map(s=>({...s,body:"人工正文"})),clientRequestId:"adopt-sections-field",includeFactItems:true});
 expect(adoptions[0]).toMatchObject({selectedSectionIds:["s"],selectedMetadataFields:["factItems"],editedSections:[{body:"人工正文"}]});
 await expect(adapter.adopt(ctx,{candidateId:"task",kind:"sections",expected:{owner:"wechat_article",versionId:"base"},editedValue:[],clientRequestId:"adopt-empty-field"})).rejects.toThrow();
});

it("结构任务公共重试路由原结构owner，不借旧单字段候选",async()=>{
 const receipt={candidateId:"retry",taskId:"retry",status:"queued" as const,baseVersionId:"base",sourceRefs:[context.sourceAnchor],ruleSnapshotRef:null,appliedRules:"not_applied" as const};let calls=0;
 const adapter=createArticleCreativeResultAdapter({service:{retryFrozen:async()=>{throw Error("不能路由单字段重试");}} as unknown as ArticleTextResultsService,
  articles:{retryFrozenCandidate:async(_c:RequestContext,id:string,key:string)=>{expect(id).toBe("original");expect(key).toBe("retry-original-key");calls++;return receipt;}} as unknown as ArticlesService,
  readTaskType:async()=>"wechat.article-draft",probeTextGeneration:async()=>({ready:true})});
 expect(await adapter.retryFrozen!(ctx,{candidateId:"original",clientRequestId:"retry-original-key"})).toEqual(receipt);expect(calls).toBe(1);
});
