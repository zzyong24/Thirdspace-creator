import {expect,it,vi} from "vitest";
import type {RequestContext} from "@creatoros/contract";
import {createChatGenerationTasks} from "./generation-tasks";

const context={userId:"user",accountId:"account",requestId:"request",source:"user"} as RequestContext;
const article={projectId:"project",outputId:"article-output",artifactId:"article-artifact",currentVersionId:"v3",current:{sections:[{sectionId:"s1",heading:"文章段",body:"真实文章正文"}],visualBriefs:[{sectionId:"s1",brief:"解释机制"}]}};
function fixture(){
 const getArticleForImage=vi.fn(async()=>structuredClone(article));
 const readCurrentArtifactTruth=vi.fn(async()=>{throw new Error("不应读取视频脚本");});
 const submit=vi.fn(async(_ctx:RequestContext,request:{inputData:Record<string,unknown>},options:{prepareSnapshot:(ctx:RequestContext,data:Readonly<Record<string,unknown>>)=>Promise<Record<string,unknown>>})=>({id:"asset-task",inputData:{...request.inputData,...await options.prepareSnapshot(_ctx,request.inputData)}}));
 const tasks=createChatGenerationTasks({getArticleForImage,readCurrentArtifactTruth,chatTaskSubmissions:{submit},createAiTaskAttemptId:()=>"attempt"} as never);
 return {tasks,getArticleForImage,readCurrentArtifactTruth,submit};
}
it("普通文章配图提交当前段落快照，不读取同项目视频脚本",async()=>{
 const f=fixture();
 await expect(f.tasks.dispatchGenerateAsset(context,{kind:"image",prompt:"为这段配图",projectId:"project",articleImageAnchor:{outputId:"article-output",versionId:"v3",sectionId:"s1"}})).resolves.toEqual({taskId:"asset-task"});
 expect(f.getArticleForImage).toHaveBeenCalledExactlyOnceWith(context,{outputId:"article-output"});
 expect(f.readCurrentArtifactTruth).not.toHaveBeenCalled();
 const submitted=await f.submit.mock.results[0]!.value;
 expect(submitted.inputData).toMatchObject({articleImageAnchor:{outputId:"article-output",versionId:"v3",sectionId:"s1"},articleSnapshot:{body:"真实文章正文",visualBrief:"解释机制"}});
 expect(submitted.inputData).not.toHaveProperty("scriptSnapshot");
});
it("普通文章配图拒绝旧版本，不提交旧段落快照",async()=>{
 const f=fixture();
 await expect(f.tasks.dispatchGenerateAsset(context,{kind:"image",prompt:"旧段配图",projectId:"project",articleImageAnchor:{outputId:"article-output",versionId:"v2",sectionId:"s1"}})).rejects.toThrow("文章配图目标已变化");
 expect(f.readCurrentArtifactTruth).not.toHaveBeenCalled();
});
