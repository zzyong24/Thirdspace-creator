import {z} from 'zod';
const variables=z.record(z.string().min(1).max(64),z.string().max(2000)).superRefine((value,ctx)=>{
 if(Object.keys(value).length>32||new TextEncoder().encode(JSON.stringify(value)).length>16384)ctx.addIssue({code:'custom',message:'NoteRelay 变量超出范围'});
});
const dimensions=(min:number,max:number)=>z.record(z.string().min(1).max(512),z.number().finite().min(min).max(max)).refine(value=>Object.keys(value).length<=256,'图片版式最多256项');
export const noteRelayLayout=z.object({
 schemaVersion:z.literal(1),editor:z.literal('noterelay'),editorVersion:z.literal('0.1.8'),themeId:z.string().min(1).max(128),
 authorName:z.string().max(120),authorBio:z.string().max(500),variables,fontSize:z.number().int().min(12).max(32),splitHeading:z.union([z.literal(1),z.literal(2)]),templateId:z.enum(['default','notes']),imageWidths:dimensions(30,100),imageRadii:dimensions(0,32),
}).strict();
export type NoteRelayLayout=z.infer<typeof noteRelayLayout>;
