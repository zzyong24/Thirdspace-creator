/** 仅表示已核对的资料工具没有结构化字段；不是完成、模型重试授权或未知回执的兜底。 */
export class ProjectPreparationInputRequired extends Error {
 readonly code='BRIEF_INPUT_REQUIRED' as const;
 constructor(){super('本轮未形成资料候选。请在项目补充观众、目标或核心信息，再点继续；原会话与已完成步骤保留。');this.name='ProjectPreparationInputRequired';}
}
