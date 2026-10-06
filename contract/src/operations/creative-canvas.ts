import {z} from "zod";
import {publicationResource,publicationRevisionResource} from "../resources/publishing";
import {defineEndpoint} from "../endpoint-definition";
import {canvasDocumentSchema,creativeCanvasResource,canvasGenerationLinkResource,canvasProposalResource,canvasGenerationCapabilitiesResource} from "../resources/creative-canvas";

import {canvasMaterialSelectorParams,canvasMaterialSelectionResource} from "../resources/canvas-material-selection";

const id=z.string().min(1).max(128);
const params=z.object({canvasId:id}).strict();
export const creativeCanvasOperations={
 adoptCanvasMaterial:defineEndpoint({id:"canvas.material.adopt",method:"POST",path:"/canvases/:canvasId/material/adopt",params,body:z.object({expectedRevision:z.number().int().positive(),groupId:id,outputId:id,publicationId:id.optional(),expectedCurrentRevisionId:id.optional(),platform:z.string().min(1),title:z.string().trim().min(1).max(300),selections:z.array(z.object({nodeId:id,taskId:id.optional(),resultId:id.optional()}).strict()).min(1).max(20),attemptId:z.string().min(16).max(128)}).strict().superRefine((v,c)=>{if(Boolean(v.publicationId)!==Boolean(v.expectedCurrentRevisionId))c.addIssue({code:"custom",message:"选择发布草稿必须同时提供当前版本"});}),response:z.object({publication:publicationResource,revision:publicationRevisionResource}),fr:["FR-CANVAS-MATERIAL-ADOPT"]}),
 getCanvasGenerationMaterial:defineEndpoint({id:"canvas.generations.material.get",method:"GET",path:"/canvases/:canvasId/generations/:generationLinkId/material",params:canvasMaterialSelectorParams,response:canvasMaterialSelectionResource,fr:["FR-CANVAS-EXACT-MATERIAL"]}),
 getCanvasGenerationCapabilities:defineEndpoint({id:"canvas.capabilities",method:"GET",path:"/canvases/capabilities",response:canvasGenerationCapabilitiesResource,fr:["FR-CANVAS-CAPABILITIES"]}),
 listCanvases:defineEndpoint({id:"canvas.list",method:"GET",path:"/canvases",response:creativeCanvasResource,isList:true,fr:["FR-CANVAS-LIST"]}),
 createCanvas:defineEndpoint({id:"canvas.create",method:"POST",path:"/canvases",body:z.object({title:z.string().min(1).max(160),projectId:id.nullable().optional()}).strict(),response:creativeCanvasResource,fr:["FR-CANVAS-CREATE"]}),
 getCanvas:defineEndpoint({id:"canvas.get",method:"GET",path:"/canvases/:canvasId",params,response:creativeCanvasResource,fr:["FR-CANVAS-GET"]}),
 saveCanvas:defineEndpoint({id:"canvas.save",method:"POST",path:"/canvases/:canvasId/save",params,body:z.object({expectedRevision:z.number().int().positive(),title:z.string().min(1).max(160).optional(),projectId:id.nullable().optional(),document:canvasDocumentSchema}).strict(),response:creativeCanvasResource,fr:["FR-CANVAS-SAVE"]}),
 archiveCanvas:defineEndpoint({id:"canvas.archive",method:"POST",path:"/canvases/:canvasId/archive",params,response:creativeCanvasResource,fr:["FR-CANVAS-ARCHIVE"]}),
 generateCanvasNode:defineEndpoint({id:"canvas.node.generate",method:"POST",path:"/canvases/:canvasId/nodes/:nodeId/generate",params:z.object({canvasId:id,nodeId:id}).strict(),body:z.object({expectedRevision:z.number().int().positive(),attemptId:z.string().min(16).max(128)}).strict(),response:canvasGenerationLinkResource,fr:["FR-CANVAS-NODE-GENERATE"]}),
 listCanvasNodeTasks:defineEndpoint({id:"canvas.node.tasks",method:"GET",path:"/canvases/:canvasId/tasks",params,response:canvasGenerationLinkResource,isList:true,fr:["FR-CANVAS-NODE-TASKS"]}),
 getCanvasNodePreview:defineEndpoint({id:"canvas.node.preview",method:"GET",path:"/canvases/:canvasId/nodes/:nodeId/preview",params:z.object({canvasId:id,nodeId:id}).strict(),response:z.object({url:z.string(),fileName:z.string()}).strict(),fr:["FR-CANVAS-NODE-PREVIEW"]}),
 listCanvasProposals:defineEndpoint({id:"canvas.agent.proposals",method:"GET",path:"/canvases/:canvasId/proposals",params,response:canvasProposalResource,isList:true,fr:["FR-CANVAS-AGENT-PROPOSALS"]}),
 applyCanvasProposal:defineEndpoint({id:"canvas.agent.apply",method:"POST",path:"/canvases/:canvasId/proposals/:proposalId/apply",params:z.object({canvasId:id,proposalId:id}).strict(),body:z.object({expectedRevision:z.number().int().positive()}).strict(),response:creativeCanvasResource,fr:["FR-CANVAS-AGENT-APPLY"]}),
} as const;
