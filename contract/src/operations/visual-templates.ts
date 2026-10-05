import {z} from "zod";
import {defineEndpoint} from "../endpoints";
import {visualTemplateResource,visualTemplateInputSchema,visualModeSchema} from "../resources/visual-templates";
const id=z.string().min(1).max(128),attemptId=z.string().min(16).max(128);
export const visualTemplateOperations={
 listVisualTemplates:defineEndpoint({id:"assets.visualTemplates.list",method:"GET",path:"/assets/visual-templates",query:z.object({libraryKind:z.enum(["cover","xhs"]).optional(),scope:z.enum(["builtin","saved","all"]).default("all"),industry:z.string().optional(),visualMode:visualModeSchema.optional(),page:z.coerce.number().int().positive().default(1),pageSize:z.coerce.number().int().min(1).max(100).default(30)}),response:visualTemplateResource,isList:true,fr:["FR-VISUAL-TEMPLATE-LIST"]}),
 saveVisualTemplate:defineEndpoint({id:"assets.visualTemplates.save",method:"POST",path:"/assets/visual-templates/save",body:z.object({id:id.optional(),expectedRevision:z.number().int().positive().optional(),template:visualTemplateInputSchema,attemptId}).strict().superRefine((value,ctx)=>{if(Boolean(value.id)!==Boolean(value.expectedRevision))ctx.addIssue({code:"custom",message:"更新收藏必须提供ID和版本"});}),response:visualTemplateResource,fr:["FR-VISUAL-TEMPLATE-SAVE"]}),
 removeVisualTemplate:defineEndpoint({id:"assets.visualTemplates.remove",method:"POST",path:"/assets/visual-templates/:templateId/remove",params:z.object({templateId:id}),body:z.object({expectedRevision:z.number().int().positive(),attemptId}).strict(),response:z.object({id,removed:z.literal(true)}),fr:["FR-VISUAL-TEMPLATE-REMOVE"]}),
} as const;
