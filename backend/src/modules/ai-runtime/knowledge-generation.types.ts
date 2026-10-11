import type {RequestContext} from '@creatoros/contract';
export type KnowledgeGenerationSkill='knowledge.classify'|'knowledge.distill'|'knowledge.relate'|'comment.qa-sift';
/** 同步公共响应只是原持久任务候选的观察；模型与凭据仍仅在Worker执行。 */
export type KnowledgeGenerationPort=(ctx:RequestContext,input:{skillId:KnowledgeGenerationSkill;inputData:Record<string,unknown>},signal?:AbortSignal)=>Promise<unknown>;
