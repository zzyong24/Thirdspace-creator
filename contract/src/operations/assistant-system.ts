import {z} from 'zod';
import {defineEndpoint} from '../endpoint-definition';
import {assistantProposalSourceSchema,assistantAdoptionReceiptSchema} from '../resources/assistant-system';
export const assistantSystemOperations={
 adoptAssistantAction:defineEndpoint({id:'ai.assistantActions.adopt',method:'POST',path:'/ai/assistant-actions/adopt',body:assistantProposalSourceSchema,response:assistantAdoptionReceiptSchema,fr:['FR-ASSISTANT-ADOPT']}),
 getAssistantActionReceipt:defineEndpoint({id:'ai.assistantActions.receipt',method:'GET',path:'/ai/assistant-actions/receipt',query:assistantProposalSourceSchema,response:z.object({receipt:assistantAdoptionReceiptSchema.nullable()}).strict(),fr:['FR-ASSISTANT-RECEIPT']}),
 adoptCanvasCreate:defineEndpoint({id:'canvas.create.adopt',method:'POST',path:'/canvases/create/adopt',body:assistantProposalSourceSchema,response:assistantAdoptionReceiptSchema,fr:['FR-CANVAS-CREATE-ADOPT']}),
 confirmCanvasGeneration:defineEndpoint({id:'canvas.generation.confirm',method:'POST',path:'/canvases/:canvasId/nodes/:nodeId/confirm',params:z.object({canvasId:z.string().min(1),nodeId:z.string().min(1)}).strict(),body:assistantProposalSourceSchema,response:assistantAdoptionReceiptSchema,fr:['FR-CANVAS-GENERATION-CONFIRM']}),
} as const;
