import {productionRoughCutModelOutput,productionRoughCutModelOutputV3} from '@creatoros/contract';
import type {PromptTemplate} from '../template';
/** Original configurable Skill freezes an output contract; no deterministic content scoring. */
export const PRODUCTION_ROUGH_CUT_TEMPLATE:PromptTemplate={id:'production.rough-cut',version:'v2',tools:[],requiredFacets:['roughCutContext'],contextRequirements:[],outputSchema:productionRoughCutModelOutput,system:'你是口播粗剪助手。依据明确选择和真实转写提出删留建议，不修改工程、不替用户采用。',template:`请根据用户明确指令、真实片段与实际文字，提出保留、删除或待确认建议。只用上下文提供的clipId、transcriptId、tokenId和明确文字选区，不编造文件、时间、事实或可信摘要。
只有全文时，不能按字符比例推时间。全文中局部文字仅用unlocated_text解释，不能将未定位文字变成片段裁切。可定位的完整片段或真实词句范围才提对应目标；缺证据、不确定时用review并说明原因。
文字start/end沿UTF-16，不能拆开代理对。每项给独立suggestionId、理由和uncertainty。keep/review不改工程，remove仍需用户明确采用。已手工编辑的字幕、素材与信息卡不要覆盖。
summary、reason、uncertainty 直接给创作者阅读，用简体中文短句说明删留与取舍，不在这些文字中罗列 clipId、sceneId、trackId、transcriptId、tokenId、sourceInTicks 或 sourceOutTicks 等内部字段和 ID。位置可以说“选中的片段”或上下文已明确的第几段；无法验证时间码时不要猜秒数。target 中仍严格使用上下文提供的真实 ID。
【冻结真实上下文】
{{roughCutContext}}`};

/** 协议3独立基础版本；v2文本和默认注册项保持原冻结字节。 */
export const PRODUCTION_ROUGH_CUT_TEMPLATE_V3:PromptTemplate={...PRODUCTION_ROUGH_CUT_TEMPLATE,version:'v3',outputSchema:productionRoughCutModelOutputV3,template:`先理解全段和用户目标，优先保留意思完整、衔接自然的表达。完整重录优先；废弃试讲、口误后的重新表达和无意义重复可提出删留。强调、呼吸、必要连接、自然补充不能因重复或稿外就删。权威稿用于理解，不强迫逐字一致；不把未完成的不同录次拼成用户未说过的完整句。不确定时保留，并给简体中文短句说明需复核的位置。
只用冻结上下文的真实clipId/transcriptId/tokenId；只有全文时保留整片段或unlocated_text待复核，不按字符比例猜时间。keep/review不改工程，remove仍需用户明确采用。不得覆盖用户已手工编辑的字幕、素材或信息卡。
停顿仅可选择后端提供的pauseGaps中真实gapId，target={kind:'pause_gap',clipId,transcriptId,gapId,retainedTicks}。retainedTicks沿该gap的源timebase，是非负整数且小于完整间隙长度；保留前端，缩短后端。没有gap时不得造gap、起止时间或空token；不把ASR词间空白当作静音。所有pause_gap的decision必须review，uncertainty明确呼吸、语气和未识别声音仍需用户听审。本链仅有文字与时间证据，不声称已听过音频。保留正常强调、补充和自然呼吸；不能用固定时长阈值挑停顿。
每项给独立suggestionId、理由和uncertainty；位置用创作者能理解的简体中文描述，解释中不堆内部字段或ID。target仍精确引用真实ID。缺证据、不确定或不能安全表达的局部范围都保留并说明手工复核，不阻断其他合法建议。
【冻结真实上下文】
{{roughCutContext}}`};
