import {z} from 'zod';
import {id} from '../primitives';
import {workEditorTarget,type WorkEditorTarget} from './work-editor';
import {workCreationTarget,type WorkCreationTarget} from './work-creation';

// 公开调用只能选择已保存目标；来源确认由验证过的用户请求属主补齐。
export const aiPublicChatContext=z.union([
 z.object({editorTarget:workEditorTarget}).strict(),
 z.object({creationTarget:workCreationTarget.omit({scriptConfirmation:true})}).strict(),
]);
export const aiPublicMessageBody=z.object({
 content:z.string().min(1),attachments:z.array(id).optional(),
 executionEngine:z.enum(['pi','codex']).optional(),chatContext:aiPublicChatContext.optional(),
}).strict();
export type AiPublicMessageBody=z.infer<typeof aiPublicMessageBody>;

/** 后端向组合根传真实目标，页面、项目和工具仍由既有准备链派生。 */
export type AiPublicChatPrepareOptions={
 executionEngine:'pi'|'codex';
 chatContext?:{editorTarget:WorkEditorTarget}|{creationTarget:WorkCreationTarget};
};
