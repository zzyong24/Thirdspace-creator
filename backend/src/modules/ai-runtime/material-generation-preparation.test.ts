import {it,expect,vi} from "vitest";
import {buildChatTools,type ChatToolDeps} from "./chat-tools";
import {getChatToolNativeExecutor} from "./chat-tool-gate";
import {prepareMaterialGeneration} from "./material-generation-preparation";

it("素材生成读取当前稿期间取消，不再提交生成任务",async()=>{
 const controller=new AbortController(),dispatchGenerateAsset=vi.fn(async()=>({taskId:"unexpected"}));
 const getArtifactText=vi.fn(async()=>{controller.abort();return null;});
 const tool=buildChatTools(["material.generate"],{boundProjectId:"project",getArtifactText,dispatchGenerateAsset} as unknown as ChatToolDeps)["material.generate"]!;
 const result=await getChatToolNativeExecutor(tool)!({kind:"image",prompt:"单个主体"},{abortSignal:controller.signal});
 expect(dispatchGenerateAsset).not.toHaveBeenCalled();expect(result).toMatchObject({kind:"material.generate",taskId:null});
});
it("已取消的素材请求不读取当前稿或派发任务",async()=>{
 const getArtifactText=vi.fn(async()=>null),dispatchGenerateAsset=vi.fn(async()=>({taskId:"unexpected"}));
 const tool=buildChatTools(["material.generate"],{boundProjectId:"project",getArtifactText,dispatchGenerateAsset} as unknown as ChatToolDeps)["material.generate"]!;
 await getChatToolNativeExecutor(tool)!({kind:"image",prompt:"单个主体"},{abortSignal:AbortSignal.abort()});
 expect(getArtifactText).not.toHaveBeenCalled();expect(dispatchGenerateAsset).not.toHaveBeenCalled();
});
it("准备期间输入被修改，不改换原图种、段落和提示词",async()=>{
 const input={kind:"image" as const,prompt:"原始视觉方案",style:" 写实 ",sectionRef:"original",visualPurpose:"comparison" as const};
 let release!:()=>void;const hold=new Promise<void>(r=>{release=r;});
 const getArtifactText=vi.fn(async()=>{await hold;return {projectId:"project",artifactType:"output_script",artifactId:"artifact",currentVersionId:"current",contentHash:"hash",fullText:"当前正文",sections:[{sectionRef:"original",index:0,heading:"原段",body:"当前正文",sectionType:"body",startSeconds:0,endSeconds:1}]};});
 const options={boundProjectId:"project",getArtifactText};
 const prepared=prepareMaterialGeneration(input,options);input.prompt="被修改";input.sectionRef="other";options.boundProjectId="foreign";release();
 const result=await prepared;expect(result.kind).toBe("image");expect(result.style).toBe("写实");
 expect(result.prompt).toContain("版本:current");expect(result.prompt).toContain("段落原文:当前正文");expect(result.prompt).toContain("原始视觉方案");expect(result.prompt).not.toContain("被修改");
 expect(getArtifactText).toHaveBeenCalledExactlyOnceWith({projectId:"project",artifactType:"output_script"});
});
it("独立准备保留强制视频路由，无项目时无需读稿",async()=>{
 const getArtifactText=vi.fn(async()=>null);
 expect(await prepareMaterialGeneration({kind:"image",prompt:" 一个连续镜头 "},{forcedMaterialKind:"video",getArtifactText})).toEqual({kind:"video",prompt:"一个连续镜头",style:undefined});
 expect(getArtifactText).not.toHaveBeenCalled();
});
