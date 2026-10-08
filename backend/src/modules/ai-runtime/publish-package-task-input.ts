import type {RequestContext} from "@creatoros/contract";
/** 冻结项目当前已保存正文及已有产出 ID；不生成内容、不创建发布行。 */
export async function preparePublishPackageTaskInput(ctx:RequestContext,input:{projectId:string;topic?:string},deps:{
 getScript(ctx:RequestContext,projectId:string):Promise<string>;
 listOutputIdsByProject(ctx:RequestContext,projectId:string):Promise<string[]>;
}){
 const context=structuredClone(ctx),request=structuredClone(input);
 if(!context.userId || (!context.accountId&&!context.groupId))throw new Error("发布物料准备缺少真实账号");
 const scriptText=await deps.getScript(context,request.projectId);
 if(scriptText.trim().length<40)throw new Error("当前项目还没有可用的整稿(稿面为空或太短)—— 先生成整稿并采纳写入稿面,再来生成发布物料,别给空稿打包。");
 const outputId=(await deps.listOutputIdsByProject(context,request.projectId))[0];
 if(!outputId)throw new Error("dispatchPublishPackage: 项目还没有内容产出挂点(outputId)—— 无法铸发布物料。");
 return {outputId,scriptText,platforms:["douyin"],projectId:request.projectId,...(request.topic?{topic:request.topic}:{})};
}
