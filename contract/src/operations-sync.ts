import {z} from 'zod';
/** 统一作品同步的用户可配置能力；旧任务迁移保留各项关闭意图。 */
export const operationsSyncSchema=z.object({version:z.literal(1),capabilities:z.object({metrics:z.boolean(),comments:z.boolean(),traffic:z.boolean(),content:z.boolean()}).strict()}).strict();
export type OperationsSync=z.infer<typeof operationsSyncSchema>;
export const DEFAULT_OPERATIONS_SYNC:OperationsSync={version:1,capabilities:{metrics:true,comments:true,traffic:true,content:true}};
