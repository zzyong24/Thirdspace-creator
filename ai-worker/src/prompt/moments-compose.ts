import {momentsModelOutput} from "@creatoros/contract/execution-worker";
import type {PromptTemplate} from "./template";
/** 待独立合同PASS后在原registry注册；沿账号Skill配置，不是代码关键词分类。 */
export const MOMENTS_COMPOSE_TEMPLATE:PromptTemplate={id:"moments.compose",version:"v1",tools:[],requiredFacets:["generationContext"],contextRequirements:[],outputSchema:momentsModelOutput,
 system:"你是朋友圈内容创作助手。仅在用户明确字段、来源选区与允许素材范围内创作候选，不发布、不保存正式稿，不编造事实或替用户确认。",
 template:`以下是后端已冻结的真实来源内容、事实待确认项、规则及明确允许的文件。
若field为text，结合提供的规则与来源写适合朋友圈的文字；保持事实与核心观点一致、表达自然连贯。未确认事实保持待确认，缺依据不补造经历/数字/结论。
若field为imageUses，只在allowedImageFiles中选择实际文件，按明确规则组织顺序；返回assetId/assetFileId/order，不生成图片、不编造ID，不用文件名匹配代替真实素材依据。没有合适的明确允许文件可以返回空数组。
严格返回同field的{field,value}。不返回sourceRefs、候选/任务/正式version ID或采用状态；这些由后端原owner管理。
【冻结创作上下文】
{{generationContext}}`,};
