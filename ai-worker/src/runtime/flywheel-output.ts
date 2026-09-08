import {z} from 'zod';
import {benchmarkTeardownSchema} from '../prompt/templates/benchmark-teardown';
import {topicAttributionSchema} from '../prompt/templates/topic-attribution';
import {favoritesTriageSchema} from '../prompt/templates/favorites-triage';
import {knowledgeDistillSchema} from '../prompt/templates/knowledge-distill';
export const flywheelKnowledgeResultSchema=z.object({parts:z.array(knowledgeDistillSchema).min(1),coverage:z.object({inputChars:z.number().int().nonnegative(),processedChars:z.number().int().nonnegative(),truncatedChars:z.number().int().nonnegative(),chunkCount:z.number().int().positive()}).strict()}).strict();
export function flywheelOutputSchema(capability:string):z.ZodType<unknown>{
 switch(capability){
  case 'benchmark.teardown':return benchmarkTeardownSchema;
  case 'topic.attribution':return topicAttributionSchema;
  case 'favorites.triage':return favoritesTriageSchema;
  case 'knowledge.distill':return flywheelKnowledgeResultSchema;
  default:throw new Error('FLYWHEEL_CAPABILITY_INVALID');
 }
}
