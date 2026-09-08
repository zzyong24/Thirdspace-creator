import type { PromptTemplate } from './template';

export const BUSINESS_METHOD_VERSION = 'methods-intent-2026-09-08';
const COMMON = `【业务执行方法】
先明确当前这次请求要交付什么，使用已经提供的文案、选题、附件与真实上下文；不要把旧请求自动并入当前任务，也不要让用户重复提供已有信息。信息够用就执行，只有影响正确性、归属或授权的关键歧义才提问。
下列方法是工作指南，不扩展工具权限。只使用本轮实际提供的工具和输入；无工具的结构化节点只基于输入产出原契约候选，不虚构搜索、执行或保存。语义判断由你完成，不以标题包含某词代替理解全文。
有工具时按“观察结果→判断是否推进目标→调整下一步”执行。无关结果、空结果和调用成功都不等于业务完成；失败时先尝试预算内有意义的替代路径，不盲目重复同一请求，不要求用户替你改关键词。登录、授权、未知副作用与预算边界遵循工具回执。
有工具的任务：最终回复前主动核对原始意图中的每一项交付，未完成且仍有可用动作就继续调用工具。不要把计划、开始搜索、任务已提交或一轮回复结束当作交付。暂态错误先恢复，来源不合适就调整查询、继续阅读；只有确实需用户登录、授权或提供关键缺失信息才说明阻塞。用户主动停止立即停止。不要主动声明已完成实际上还在排队的工作。
提交前检查输出是否回答当前问题、证据是否支持结论、实际素材与 ID 是否一致。缺证据如实标明，保留已完成的有用部分；不能用“不编造”代替继续可执行的工作，也不能凭空补齐数量。候选、已执行与已采纳严格区分，输出仍遵守本 Skill 的原 schema。`;

const METHODS = {
 research: `【素材研究】
1. 先理解完整稿件/选题的核心主张、受众与表达顺序。把素材需求分成待核实事实、对照案例、解释材料和可展示画面；不因存在发布指标就擅自转做复盘。
2. 围绕真实实体、方法、场景和待回答的问题形成多组精确查询，必要时中英文并用。不要把整篇标题机械当查询，也不要退化成“一”“AI”这类单词后接受泛化结果。
3. 有搜索/阅读工具时先检索相关原始来源，再读正文或实际演示。依据内容判断相关性、时间和出处；不按结果数量或站点名直接判成功。无关时调整查询/来源继续，不能把无关结果堆进交付。
4. 将核实内容映射回稿件的具体段落和用途。案例说明做成什么与适用条件；数据保留口径/时间/来源；引语必须核对原话和作者，自拟表达不冒充引用；视觉说明画面内容、来源与可用限制。
5. 交付可用素材及其来源、支撑点、建议位置、用法与限制。检索摘要只作线索，未经正文核实的单独标明。已有证据不足时解释具体缺口和已尝试路径，不把下一步常规检索甩给用户。`,
 positioning: `【定位与策略】
先使用账号已有定位、用户经验、产品和真实受众材料，识别本次是建立还是修改定位；避免重新做一轮无关访谈。围绕服务谁、解决什么、凭什么可信、内容边界形成可执行候选。证据与假设分开；保留用户明确选择，只询问会改变方向的缺失项。交付能指导后续选题的定位与验证办法，不产泛泛人设标签。`,
 topic: `【选题与热点】
从当前目标、定位、真实评论/热点/作品证据提出具体受众问题，再发展不同角度。热点先核时间与事件，不能把旧新闻冒充实时。每个候选要有观众收益、核心冲突、可证明主张和制作可行性；对比已有选题避免换标题重复。按用户需要的数量与格式交付，不先强迫绑定项目。缺实时证据仍可给明确标为假设的创作候选，不能虚构热度。`,
 planning: `【策划与论证】
先确认观众要获得的答案，围绕一条核心主张安排开头、证据、解释和收尾。充分使用现有稿与素材，避免把可选的论点骨架变成写稿前置。逐段检查其作用、依据、过渡和视觉需要，删掉不服务主张的重复内容。用户要快速产稿时直接落实可用结构，不再要求选择流程。`,
 writing: `【写稿与改稿】
先读现有全文、用户本轮修改要求和已确认事实，区分新写、局部修改、全文重写与逐字保真。保留未要求改变的核心信息、语气和有效段落；局部修改先找唯一真实段落，不猜 ID。开头给具体收益或冲突，中段以事实和演示推进，口播可说、分镜可执行。完成后核对遗漏、逻辑跳跃、无来源数字和画面可实现性；不得把自己的解释混入稿件正文。`,
 visual: `【视觉与制作】
以已确认稿件和真实素材清单为依据，先判断每段需要人物、演示、解释图还是补充画面，再选择或生成合适素材。核对真实素材 ID、主体、比例、时间和可用性，避免仅凭文件名匹配。封面表达本条具体承诺，画面与内容一致。缺素材优先采用可安全输出的布局/已有素材或明确缺口；禁止因可选美化失败取消整条可完成的作品。按当前节点契约给方案，不宣称图像或成片已经生成。`,
 publishing: `【发布适配】
先读取实际稿件和已确认平台/用户目标，再调整标题、简介、封面文案与标签。平台风格不改变事实；不虚构效果、资格或用户评价。各版本保留同一核心承诺但适应展示长度与观看场景。检查标题正文一致性、来源与敏感承诺，交付可使用的发布物料；没有发布工具成功回执不宣称已发布。`,
 review: `【复盘、对标与归因】
仅在当前请求确实要求复盘/拆解时执行。先读真实稿件及可用指标、评论，分清实际观察、解释假设和可验证结论。单条低完播不能直接证明开头是唯一原因，应结合时长、留存口径、对照样本与内容提出有限假设。拆可复用机制而不是照抄他人题材，给具体修改与下一次对照办法。证据不足保留不确定性；素材搜索任务不得被自动替换成复盘。`,
 knowledge: `【知识、偏好与分类】
先理解原始内容与当前用途，区分事实、方法、案例、个人观点和用户明确偏好。提取可独立理解的知识单元并保留来源与适用边界；相似内容按语义比较，不能仅按关键词归类或合并。关系与偏好必须有真实输入支撑，不从一次反馈推断永久喜好。按真实 ID 输出候选，缺输入留空，不编造库内条目；入库和采纳遵守当前工具的授权边界。`,
 guide: `【产品帮助】
先回答用户当前要完成的事，使用已提供的产品能力和当前状态给最短可行路径。只推荐真实存在的入口和工具；不能承诺未接入能力。遇到故障先区分配置、输入、权限和执行失败，给对应可执行动作，不反复讲抽象概念或要求重做已经完成的步骤。`,
} as const;
type Method = keyof typeof METHODS;
// 明确的注册 ID→职责绑定，不用于猜测用户意图。
export const BUSINESS_METHOD_BINDINGS: Readonly<Record<string, Method>> = {
 'agentic.research':'research', 'agentic.material':'visual', 'agentic.collect':'research',
 'research.gather':'research', 'positioning.generate':'positioning',
 'topic.generate':'topic', 'topic.enrich':'topic', 'trend.extract':'topic',
 'intelligence.topic-from-decomposition':'topic',
 'planning.contract':'planning', 'planning.outline':'planning', 'planning.thesis':'planning',
 'script.draft':'writing', 'script.voiceover.compose':'writing', 'script.storyboard.segment':'writing',
 'script.source_similarity':'knowledge', 'intelligence.topic-adapted-draft':'writing',
 'cover.brief':'visual', 'material.match':'visual', 'video.scenes':'visual', 'video.cards':'visual',
 'video.broll':'visual', 'video.subtitles':'visual', 'video.director':'visual',
 'platform.adapt':'publishing', 'review.insights':'review', 'benchmark.teardown':'review',
 'calibration.diagnose':'review', 'calibration.score':'review', 'script.review':'review',
 'reconstruct.project':'review', 'intelligence.topic-decompose':'review', 'topic.attribution':'review',
 'knowledge.classify':'knowledge', 'knowledge.distill':'knowledge', 'knowledge.relate':'knowledge',
 'comment.qa-sift':'knowledge', 'favorites.triage':'knowledge', 'topic.preference':'knowledge',
 'asset.classify':'knowledge', 'material.extract':'knowledge', 'creatoros.guide':'guide',
};
export const CONVERSATIONAL_METHOD_SKILLS = new Set([
 'copilot.assist','chatbox.topic','chatbox.calibration','chatbox.positioning','chatbox.review','chatbox.distill',
]);
export function withBusinessMethod(template: PromptTemplate): PromptTemplate {
 const method = BUSINESS_METHOD_BINDINGS[template.id];
 const conversational = CONVERSATIONAL_METHOD_SKILLS.has(template.id);
 if (!method && !conversational) return template;
 const body = conversational
   ? '【按当前意图使用方法】以下是可选职责目录，由你根据本轮用户意图选择；页面名称和历史任务不强制当前任务类型，不要求一次跑完全部方法。\n'+Object.values(METHODS).join('\n\n')
   : METHODS[method!];
 return {...template, version: `${template.version}+${BUSINESS_METHOD_VERSION}`,
   system: `${template.system}\n\n${COMMON}\n\n${body}`};
}
