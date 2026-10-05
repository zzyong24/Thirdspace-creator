import {z} from "zod";
import {defineEndpoint} from "../endpoints";
import {canvasDocumentSchema,creativeCanvasResource,canvasGenerationLinkResource,canvasProposalResource,canvasGenerationCapabilitiesResource} from "../resources/creative-canvas";

import {canvasMaterialSelectorParams,canvasMaterialSelectionResource} from "../resources/canvas-material-selection";

const id=z.string().min(1).max(128);
const params=z.object({canvasId:id}).strict();
export const creativeCanvasOperations={
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
