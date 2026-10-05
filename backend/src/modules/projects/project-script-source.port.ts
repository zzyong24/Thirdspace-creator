import { projectScriptContext,projectImageSource,type ProjectScriptSourceRef, type ProjectScriptContext, type ScriptMetadataSource, type ProjectImageSource, type RequestContext } from "@creatoros/contract";

export type SavedProjectScript = {ref: ProjectScriptSourceRef; label: string; text: string};
/** 主稿仍由 artifacts 属主服务拥有，其他模块仅接收读取与版本核验端口。 */
export interface ProjectScriptSourcePorts {
  readProjectScriptContext?: (ctx:RequestContext,projectId:string)=>Promise<ProjectScriptContext>;
  assertScriptMetadataSource?: (ctx:RequestContext,source:ScriptMetadataSource,projectId:string)=>Promise<void>;
  readProjectImageLibrary?: (ctx:RequestContext,projectId:string)=>Promise<{state:"ready"|"empty"|"unavailable";images:ProjectImageSource[];message?:string}>;
  /** 仅自动配图候选采用调用；不会扩大已有手工稿保存的图片质量门。 */
  assertProjectImageFile?: (ctx:RequestContext,assetId:string,assetFileId:string,projectId:string)=>Promise<void>;
  readProjectScript?: (ctx: RequestContext, projectId: string) => Promise<SavedProjectScript | null>;
  assertProjectScriptSource?: (ctx: RequestContext, ref: ProjectScriptSourceRef, projectId: string) => Promise<void>;
}

/** 辅助读取不改变正文/稿件可用性；缺端口保持旧响应不增加字段。 */
export async function optionalScriptContext(ctx:RequestContext,projectId:string,ports:ProjectScriptSourcePorts):Promise<ProjectScriptContext|undefined>{
  if(!ports.readProjectScriptContext)return undefined;
  try{return projectScriptContext.parse(await ports.readProjectScriptContext(ctx,projectId));}
  catch{return {state:"unavailable",scriptRef:null,scriptText:"",metadata:{title:"",summary:"",tags:[]},message:"脚本与发布物料暂不可读取，当前稿件已保留。"};}
}
export async function optionalProjectImageLibrary(ctx:RequestContext,projectId:string,ports:ProjectScriptSourcePorts){
  if(!ports.readProjectImageLibrary)return {imageLibrary:[] as ProjectImageSource[]};
  try{
    const value=await ports.readProjectImageLibrary(ctx,projectId);
    const imageLibrary=projectImageSource.array().parse(value.images);
    return {imageLibrary,...(value.message?{imageLibraryMessage:value.message}:{}),...(value.state==="unavailable"&&!value.message?{imageLibraryMessage:"图片目录暂不可读取，正文仍可生成。"}:{})};
  }
  catch{return {imageLibrary:[] as ProjectImageSource[],imageLibraryMessage:"图片目录暂不可读取，正文仍可生成。"};}
}
