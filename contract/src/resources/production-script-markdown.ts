import {z} from 'zod';
const id=z.string().min(1).max(256),digest=z.string().regex(/^sha256:[a-f0-9]{64}$/);
export const productionScriptMarkdown=z.object({formatVersion:z.literal(1),sceneId:id,stateStamp:digest,libraryStamp:digest,markdown:z.string(),libraryDocs:z.array(z.object({mediaId:id,assetId:id,content:z.string()}).strict()),tracks:z.array(z.object({alias:z.string(),trackId:id,type:z.string(),editableElementIds:z.array(id),protectedElementIds:z.array(id)}).strict()),scopeComplete:z.literal(true)}).strict();
export const productionScriptMarkdownCandidate=z.object({kind:z.literal('markdown_timeline'),owner:z.literal('production'),sceneId:id,markdown:z.string().max(2_000_000),declaredTrackIds:z.array(id).max(1000),stateStamp:digest,libraryStamp:digest}).strict();
export const productionScriptDiagnostics=z.object({warnings:z.array(z.string()),errors:z.array(z.object({line:z.number().int().nonnegative(),message:z.string(),hint:z.string().optional()}).strict()),operations:z.array(z.object({kind:z.string(),trackId:id,elementId:id}).strict())}).strict();
export type ProductionScriptMarkdown=z.infer<typeof productionScriptMarkdown>;
