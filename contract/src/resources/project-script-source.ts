import { z } from "zod";
import { id } from "../primitives";

/** 原主脚本/大纲的不可变版本。正文只能经 service port 读取。 */
export const projectScriptSourceRef = z.object({
  kind: z.literal("project_script"), id, versionId: id,
}).strict();
export type ProjectScriptSourceRef = z.infer<typeof projectScriptSourceRef>;


/** 复用元数据的实际属主；不把发布稿伪装成脚本版本。 */
export const scriptMetadataSource = z.discriminatedUnion("kind", [
  z.object({kind:z.literal("project"),projectId:id,updatedAt:z.string().min(1)}).strict(),
  z.object({kind:z.literal("publication_revision"),projectId:id,sourceOutputId:id,publicationId:id,revisionId:id}).strict(),
]);
export type ScriptMetadataSource = z.infer<typeof scriptMetadataSource>;
export const projectScriptContext = z.object({
  state:z.enum(["ready","empty","unavailable"]),
  scriptRef:projectScriptSourceRef.nullable(),scriptText:z.string(),
  metadata:z.object({title:z.string(),summary:z.string(),tags:z.array(z.string())}).strict(),
  metadataSource:scriptMetadataSource.optional(),message:z.string().optional(),
}).strict();
export type ProjectScriptContext = z.infer<typeof projectScriptContext>;

/** 目录只有真实文件身份和原描述；选择由原创作 Skill 决定。 */
export const projectImageSource = z.object({assetId:id,assetFileId:id,name:z.string(),description:z.string()}).strict();
export type ProjectImageSource = z.infer<typeof projectImageSource>;
export const proposedProjectImage = projectImageSource.pick({assetId:true,assetFileId:true});
