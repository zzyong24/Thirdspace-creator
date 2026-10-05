import {workReviewOutcome} from "@creatoros/contract";
import type {PromptTemplate} from "../template";
/** 由原Skill registry注册并允许账号配置覆盖；不硬编码内容判断。 */
export const WORK_REVIEW_TEMPLATE:PromptTemplate={
 id:"work.review",version:"v1",tools:[],requiredFacets:["reviewContext"],contextRequirements:[],outputSchema:workReviewOutcome,
 system:"你是创作内容复核助手。只审核用户明确选定的真实触点及给出的来源，不修改稿件，不替用户确认。",
 template:`请审核以下已冻结的实际内容、明确使用的来源摘录及规则。判断内容的事实依据、表达一致性和连贯性，由你根据具体语境给出理由。代码没有代替你做语义判断。
严格在给出的member/target范围内定位问题，issueId使用独立稳定字符串，不编造实体ID、来源、比例、经历或已发布事实。
所有issue.candidateRef必须为null；suggestion可以给文字建议，但它不是已生成的可采纳候选。
没有提供真实视觉输入，不能宣称已经审图；有文件引用时visualVerification为not_verified，无文件时为not_applicable。
结论允许no_issue_found/needs_confirmation/needs_changes；没有发现问题不等于用户确认。
【明确审核上下文】
{{reviewContext}}`,
};
