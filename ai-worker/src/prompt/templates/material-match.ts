import { z } from "zod";
import type { PromptTemplate } from "../template";

/**
 * 素材匹配 skill 模板(material.match)—— 从 material-match-runner 的内联 buildMatchPrompt 提取而来。
 * 从创作者已有素材库里挑出适合本条内容的真实素材(assetId + role + reason)。
 * facets 由 CreativeContext + task 映射:
 *   positioning(必需,调用方已默认兜底)· topic(选填:本条内容主题,调用方按 topic 兜底)·
 *   library(必需:可用素材库清单「id | 名称 (类型)」,调用方按 assetsBrief 兜底)。
 * 保持原 prompt 文字、硬约束(assetId 必来自列表、不编造)与输出 JSON 约定不变,只把上下文占位化。
 *
 * T-025 跨模型健壮性:加 outputSchema(runStructuredNode 绑 generateObject,落空→文本兜底),让用户
 * 默认的 MiniMax 也稳定吐可解析匹配(旧 LlmCompleter + parseJsonArray 自由文本路径 MiniMax 下常吐不出
 * →parseJsonArray 返回 []→任务 cancelled)。**产物是数组,故顶层用对象包一层**(matches 数组)——
 * generateObject 要顶层对象、裸数组在部分 provider 不可靠。字段各给默认值让缺字段也过校验;runner 侧
 * 滤掉缺 assetId 的项(保留"assetId 必须真实"的容错语义)。
 */
export const materialMatchItemSchema = z.object({
  assetId: z.string().default(""),
  role: z.string().default(""),
  reason: z.string().default(""),
  /** 视频制作场景下由 AI 给出；普通素材匹配任务可不填，保持旧调用兼容。 */
  sceneIdx: z.number().int().optional(),
  at: z.number().optional(),
  durationSec: z.number().optional(),
  /** 视频制作里的呈现层级由 AI 按素材内容和叙事作用决定；渲染器只执行并守可读性。 */
  presentation: z
    .enum(["full_frame", "large_stage", "overlay"])
    .optional(),
  /** 素材的视觉角色必须由 AI 结合内容与元数据判断，代码不得用文件名冒充判断。 */
  visualRole: z
    .enum(["screen_recording", "still_image", "live_footage", "cover"])
    .optional(),
  /** 轻量镜头运动；界面截图/录屏通常保持 static，照片可推拉平移。 */
  motion: z.enum(["static", "push_in", "pan_left", "pan_right"]).optional(),
});
// 顶层输出契约:一个 matches 数组(顶层对象,非裸数组)。
export const materialMatchSchema = z.object({
  matches: z.array(materialMatchItemSchema).default([]),
});
export type MaterialMatchOutput = z.infer<typeof materialMatchSchema>;

export const MATERIAL_MATCH_TEMPLATE: PromptTemplate = {
  id: "material.match",
  version: "v10",
  outputSchema: materialMatchSchema,
  tools: [],
  system:
    "你是这位创作者的「素材匹配 agent」,从他已有的素材库里挑最合适的真实素材配这条内容。",
  template: `你是这位创作者的「素材匹配 agent」。要为下面这条内容,从他**已有的素材库**里挑出最合适的素材。

【创作者定位】
{{positioning}}

【本条内容主题】
{{topic}}

【口播原文】
{{script}}

【视频场景】(可选；存在时每行含场景序号、时间、标题和概括)
{{scenes}}

【视觉编导提出的画面需求】(可选；存在时每行含场景序号、插点、口播锚点和具体画面)
{{visualSlots}}

【本次成片画幅与可读性】(可选)
{{orientation}}

【用户人工指定的素材】(可选；这是硬约束，必须保留并据此重算分场、插点与时长)
{{manualAssignments}}

【可用素材库】(每行包含 id、原始文件名、类型、尺寸、时长、描述与来源)
{{library}}

【任务】用 AI 理解内容语义，判断素材库里哪些素材适合用在这条内容里,以及怎么用。原始文件名是用户主动提供的高价值语义线索，必须与素材类型、尺寸/时长、描述、口播锚点和场景目的综合判断；不得只按文件名做机械关键词匹配。
【硬约束】assetId **必须**是上面素材库列表里出现过的真实 id,绝对不要编造不存在的 id。素材库为空时返回 {"matches": []}。
【视频制作模式】如果上面提供了“视频场景”和“画面需求”，你就是本次视频唯一的素材语义匹配器：
- 逐一理解用户手动上传/项目素材的真实内容、名称和描述，再与口播锚点、场景目的、画面需求匹配。
- 用户专门为本项目上传或挂载的图片/视频优先于通用素材，但语义不匹配时不要硬塞；无法确定就不选，由制作系统在当前方案内用真人主画面或信息卡自动补位，绝不能把分镜作业退给用户。
- “用户人工指定的素材”不得遗漏或替换；它会改变叙事节奏，必须让对应场景边界、插点和 durationSec 适配素材，而不是沿用旧时间线或机械截成固定 4 秒。
- 每条被选素材必须额外返回 sceneIdx、at、durationSec；sceneIdx 必须来自场景列表，at 必须落在该场景时间内。
- 每条被选素材必须返回 visualRole：screen_recording=界面/操作录屏，still_image=静态图片/截图/插画，live_footage=真人或实景拍摄，cover=只用于发布封面的设计稿。必须综合真实内容、原始文件名、类型、尺寸/时长和描述来判断；不要用扩展名或单个词机械决定。
- 每条被选素材必须返回 presentation：只有 screen_recording 在需要阅读文字或观察连续操作时可选 full_frame，人物会保留为左下角画中画；still_image 与 live_footage 绝不能 full_frame，只能 large_stage 或 overlay，并保持原始比例，不压住标题、字幕和人物。持续操作应给足看清动作的 durationSec，不要机械截成 3–4 秒；尤其是竖屏成片，口播正在解释界面步骤时，应让相关录屏连续承担主视觉直到这一信息点讲完，再切回真人或信息卡。
- presentation 取决于观众是否需要读懂素材本身：架构图、流程图、数据表、界面截图、代码截图等高信息静态图，只要它承担当前口播的解释或证据，就必须选 large_stage，让图成为当前唯一主视觉；overlay 只用于不读文字和细节也成立的辅助装饰、氛围或旁证。禁止把高信息主图缩在角落，再用一张大信息卡覆盖它。
- 任意时刻只允许一个非 overlay 主素材；下一张主素材开始前必须结束上一张，不得让横图、竖图、旧标题或旧信息卡多层叠放。
- 每条被选素材必须返回 motion：static/push_in/pan_left/pan_right。界面截图、录屏默认 static，除非轻微运动不会影响文字和操作可读性；照片、插画可按叙事选择轻推近或平移。不要为了“有动效”牺牲可读性。
- 新生成素材必须直接按本次交付画幅构图：竖屏 9:16 使用竖向主体和手机安全区，横屏 16:9 使用宽屏构图；不得先生成相反画幅再靠强行裁切、拉伸或缩成小图补救。
- 开场前三秒优先使用与第一句语义直接相关的真实素材留人：若清单中存在合适的真实操作、结果、案例或证据，必须把它安排在第一场第一句的 SRT 起秒，durationSec 连续覆盖前三秒（受素材真实时长和场景边界限制）。产品界面/操作录屏需要看清时使用 full_frame，让素材成为开场主画面，真人不作为主视觉；不要把合适素材拖到三秒以后才进入。若清单中没有语义匹配的真实素材，宁可不选，由可溯信息卡补位，禁止用随机库存或通用氛围画面填满前三秒。
- 同一素材不要重复选择；不要用 cover 角色的封面进入 B-roll 时间线。
【输出】只输出一个 JSON 对象 {"matches": [...]}(不要多余文字、不要代码块包裹),matches 是数组,每条:
{"assetId"(必须来自上面列表的真实 id),"role"(broll空镜/clip片段/cover封面 三选一),"reason"(为什么用它、用在哪里,一句中文),"sceneIdx"(视频模式必填),"at"(视频模式必填),"durationSec"(视频模式必填),"visualRole"(视频模式必填:screen_recording/still_image/live_footage/cover),"presentation"(视频模式必填:full_frame/large_stage/overlay),"motion"(视频模式必填:static/push_in/pan_left/pan_right)}。`,
  requiredFacets: ["positioning", "library"],
};
