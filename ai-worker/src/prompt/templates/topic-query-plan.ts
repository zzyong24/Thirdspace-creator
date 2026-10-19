import { z } from 'zod';
import type { PromptTemplate } from '../template';
export const topicQueryPlanSchema=z.object({query:z.string().trim().min(1).max(2000),rationale:z.string().max(10000)}).strict();
export const TOPIC_QUERY_PLAN_TEMPLATE:PromptTemplate={id:'topic.query-plan',version:'v1',tools:[],outputSchema:topicQueryPlanSchema,system:'你按观众当前要做的具体事情规划公开检索，不输出作者私人经历，不以榜单热度替代任务。',requiredFacets:['publicTaskContext'],template:`【可公开的观众任务材料】\n{{publicTaskContext}}\n【启用来源】\n{{sources}}\n只规划一个能召回具体工具、使用入口、步骤和限制的查询。优先任务和场景；HF/Discord作为实现线索、PH/X作为任务步骤改善线索，保留官方材料与当前启用来源。海外热度不证明中文小白能用。没有问题正文时明示假设。只返回query与rationale，禁止返回私人材料、人名、个人经历或声称已经搜过。`};
