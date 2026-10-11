import {generateText} from 'ai';
import {z} from 'zod';
import type {executionModelSpecSchema,modelGenerationInputSchema} from '@creatoros/contract/execution-worker';
import {modelFor} from '../runtime/provider-factory';
import {generationFailure} from './generation-error';
const image=z.object({mimeType:z.literal('image/jpeg'),base64:z.string().min(1),prompt:z.string().min(1)}).strict();
/** 只读取后端固化的成片接触表；模型请求仍由原Worker-runtime预约、绑定与结算。 */
export async function runVideoVisualReviewInWorker(input:z.infer<typeof modelGenerationInputSchema>,spec:z.infer<typeof executionModelSpecSchema>,signal:AbortSignal){
 try{
  if(input.capability!=='asset.classify'||input.operationKey!=='video.visual-review')throw Error('VIDEO_VISUAL_REVIEW_CAPABILITY_INVALID');
  const source=image.parse(JSON.parse(input.prompt));signal.throwIfAborted();
  const result=await generateText({model:modelFor(spec),messages:[{role:'user',content:[{type:'image',image:Buffer.from(source.base64,'base64'),mediaType:source.mimeType},{type:'text',text:source.prompt}]}],maxOutputTokens:input.maxOutputTokens,maxRetries:0,abortSignal:signal});
  signal.throwIfAborted();if(!result.text.trim())throw Error('VIDEO_VISUAL_REVIEW_RESULT_UNAVAILABLE');
  return {text:result.text,usage:result.totalUsage};
 }catch(error){throw generationFailure(error,false);}
}
