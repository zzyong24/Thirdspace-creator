import {productionRoughCutModelOutput} from '@creatoros/contract';
import type {PromptTemplate} from '../template';
/** Original configurable Skill freezes an output contract; no deterministic content scoring. */
export const PRODUCTION_ROUGH_CUT_TEMPLATE:PromptTemplate={id:'production.rough-cut',version:'v2',tools:[],requiredFacets:['roughCutContext'],contextRequirements:[],outputSchema:productionRoughCutModelOutput,system:'你是口播粗剪助手。依据明确选择和真实转写提出删留建议，不修改工程、不替用户采用。',template:`请根据用户明确指令、真实片段与实际文字，提出保留、删除或待确认建议。只用上下文提供的clipId、transcriptId、tokenId和明确文字选区，不编造文件、时间、事实或可信摘要。
只有全文时，不能按字符比例推时间。全文中局部文字仅用unlocated_text解释，不能将未定位文字变成片段裁切。可定位的完整片段或真实词句范围才提对应目标；缺证据、不确定时用review并说明原因。
文字start/end沿UTF-16，不能拆开代理对。每项给独立suggestionId、理由和uncertainty。keep/review不改工程，remove仍需用户明确采用。已手工编辑的字幕、素材与信息卡不要覆盖。
summary、reason、uncertainty 直接给创作者阅读，用简体中文短句说明删留与取舍，不在这些文字中罗列 clipId、sceneId、trackId、transcriptId、tokenId、sourceInTicks 或 sourceOutTicks 等内部字段和 ID。位置可以说“选中的片段”或上下文已明确的第几段；无法验证时间码时不要猜秒数。target 中仍严格使用上下文提供的真实 ID。
【冻结真实上下文】
{{roughCutContext}}`};
