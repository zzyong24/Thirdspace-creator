import { type ChatResearchContext } from "./chat-research-preparation";
import type { ChatStructuredContext } from "./chat-structured-tool-nodes";
import type { ScriptHooksContext } from "@creatoros/contract/execution-worker";
import { resolveChatGuideSnapshot } from "./chat-guide-snapshot";
import { type ToolSet } from "ai";
import type { RequestContext } from "@creatoros/contract";
import { assembleCreativeContext, formatProjectStageBlock } from "./creative-context";
import { resolveSkillForSurface, applyFunctionKey, assembleChatSystem, assembleSelectionContext, wrapUserData, selectRecentChatTasks, formatRecentTasksBlock, type ChatContext, type RecentTaskTruth } from "./chat-context";
import { buildChatTools, ALL_CHAT_TOOL_NAMES, getSurfaceToolScope, type VerbatimSource } from "./chat-tools";
import { buildSkillsBrief } from "@creatoros/contract";
import type { AssembleChatDeps } from './chat-assembly-types';
import { formatVerbatimSourceInventory, type CopilotMediaRoute } from './chat-assembly-context';
import { createChatAssemblyToolDeps } from './chat-assembly-tool-deps';
const SKILL_PRIMARY_CAPABILITY: Record<string, string> = {
    "chatbox.topic": "topic.generate",
    "chatbox.calibration": "calibration.diagnose",
    "chatbox.positioning": "positioning.generate",
    "chatbox.review": "review.insights",
    // [T-094] 蒸馏对话面:基础档 + 工具都走 knowledge.distill capability(与倾倒场旧管线同档)。
    "chatbox.distill": "knowledge.distill",
};
export interface ChatAssembly {
    skillId: string;
    system: string;
    tools: ToolSet;
    /**
     * [T-117 确定性修] functionKey 命中真工具(深链/按钮明确要某工具,如「补全选题卡」→
     * `topic.enrich`)时,本轮**强制**模型调该工具 —— 光靠 skill 提示词压不住弱 tool-calling
     * 的模型(它会把卡当文本吐 + 谎称已渲卡)。Worker 用 prepareStep 在第 0 步 toolChoice
     * 强制它,之后步恢复 auto。undefined = 不强制(自由对话)。
     */
    forcedTool?: string;
    /** [T-779] 明确的只读→生成组合请求需要按顺序执行的工具。 */
    forcedToolSequence?: string[];
}
export type ChatAssemblyPreparation = ChatAssembly & {
    capability: string;
    researchContext?: ChatResearchContext;
    structuredContext?: ChatStructuredContext;
    scriptHooksContext?: ScriptHooksContext;
};
/** 准备上下文与真实工具，不取得主模型凭据；工具执行迁移仍由各真实端口承担。 */
export async function prepareChatAssembly(ctx: RequestContext, chatContext: ChatContext, deps: AssembleChatDeps, mediaRoute: CopilotMediaRoute | null = null, options: {
    positioningScratch?: boolean;
    verbatimSources?: readonly VerbatimSource[];
    latestUserInstruction?: string;
} = {}): Promise<ChatAssemblyPreparation> {
    // 1) 页面层:surface → 基础 skill。
    const skillId = resolveSkillForSurface(chatContext.surface);
    // 2) registry 取 skill(模板 system + 工具白名单)。懒加载 ai-worker(AI SDK 不进顶层 bundle)。
    const { getEffectiveTemplate, getEffectiveTools, getTemplate, getTools, hasActiveEffectiveSkillSnapshot, } = await import("@creatoros/ai-worker");
    const hasEffectiveScope = hasActiveEffectiveSkillSnapshot();
    const skill = hasEffectiveScope
        ? getEffectiveTemplate(skillId)
        : getTemplate(skillId);
    // [T-770] 在当前 ALS scope 内一次性校验并冻结代码随版的产品说明。正文只留在服务端闭包，
    // 不拼进 system；模型真正调用 creatoros.guide 时才进入 tool result。批准 surface 缺失/
    // 错版本/账号 overlay 一律让本轮显式失败，不等工具调用后再用模型记忆兜底。
    const creatorOsGuideSnapshot = await resolveChatGuideSnapshot(chatContext.surface);
    // [T-240①] 阶段判据(动态层):项目对话读该项目的 stage + 发布状态(getProjectDetail 读端口
    // 已在 composition root 绑好,不新造)。best-effort:读不到/端口未装配 → null(不注阶段块、
    // 场景白名单不做阶段收窄,兜底不破坏)。用途:①渲成「当前项目阶段」system 块(创作前 vs 已发布,
    // 治「创作前项目被按复盘套路要逐字稿」实录病例);②喂 getSurfaceToolScope 做阶段感知工具收窄。
    let projectStage: {
        stage: string;
        published: boolean;
    } | null = null;
    if (chatContext.projectId && deps.contextReaders?.getProjectDetail) {
        try {
            const detail = await deps.contextReaders.getProjectDetail(ctx, {
                projectId: chatContext.projectId,
            });
            if (detail) {
                projectStage = {
                    stage: detail.stage,
                    published: detail.publish.published,
                };
            }
        }
        catch {
            projectStage = null; // 阶段判据是 best-effort 增强,读失败绝不阻断装配
        }
    }
    // [T-386] 后台任务状态真值(best-effort):每轮开始前查该账号近期 chat 派发类任务的库内
    // 真实状态,渲成 system 块 —— 让模型每轮都拿到「现在」的任务状态,而不是凭上轮记忆断言。
    // 端口未装配/读失败 → 空块不注(增强不阻断),honesty 第 16 条兜底。
    let recentTasks: RecentTaskTruth[] = [];
    if (deps.listRecentTasksPort) {
        try {
            recentTasks = selectRecentChatTasks(await deps.listRecentTasksPort(ctx), Date.now());
        }
        catch {
            recentTasks = [];
        }
    }
    // 工具层(SPEC §3.2 第 1+2 层 + [T-240③] 场景真收窄):
    //   1. 场景白名单:surface 声明允许工具集(getSurfaceToolScope);未知 surface(global/兜底)
    //      → 回落全量(向后兼容)。project surface 阶段感知:明确未发布 → 砍 review.analyze。
    //   2. functionKey(深链按钮的显式用户意图)命中真工具但被场景砍掉 → 补回白名单尾部,保
    //      T-231⑨ 强制置顶机制(forcedTool 依赖 toolWhitelist.includes)不受场景收窄影响。
    //   3. 排序:skill preferred(registry getTools + applyFunctionKey 置顶)在前,其余场景白名单
    //      工具在后(skillsBrief 也按此列)。
    const scopedNames = getSurfaceToolScope(chatContext.surface, {
        projectPublished: projectStage ? projectStage.published : null,
    });
    let baseAllowed = scopedNames ?? ALL_CHAT_TOOL_NAMES;
    // [T-770] `creatoros.guide` 是低误触发元 Skill，不继承未知 surface 的“全量工具”兼容回退。
    // 只有产品协议明确批准的 topics/project 能看到短工具描述；其它已知或未来 surface 一律物理排除。
    if (chatContext.surface !== "topics" && chatContext.surface !== "project") {
        baseAllowed = baseAllowed.filter((name) => name !== "creatoros.guide");
    }
    if (options.positioningScratch && chatContext.surface === "positioning") {
        baseAllowed = baseAllowed.filter((name) => ![
            "context.projects",
            "context.metrics",
            "context.comments",
            "context.positioning.detail",
        ].includes(name));
    }
    // [T-642] 已有可信项目引用时，当前对象不再需要全量项目库。host 侧直接拿掉列表工具，
    // 把 T-106 的“提示模型别摸索”升级成确定性约束；单项目工具由 boundProjectId 自动补 ID。
    if (chatContext.projectId) {
        baseAllowed = baseAllowed.filter((name) => name !== "context.projects");
    }
    if (mediaRoute?.kind === "douyin.share") {
        baseAllowed = baseAllowed.filter((name) => name !== "web.read");
    }
    else {
        // 只在本轮明确出现抖音分享或显式深链时暴露，避免普通对话让模型自行“升级”为建档。
        baseAllowed = baseAllowed.filter((name) => name !== "intelligence.douyin.share");
    }
    if (mediaRoute?.kind === "cover.publication_reference") {
        // 系统级可执行文件探测与 CreatorOS 的模型配置无关。该组合请求物理排除 local.tools，
        // 避免模型再次用 ffmpeg/node 探测结果臆断生图模型是否可用。
        baseAllowed = baseAllowed.filter((name) => name !== "local.tools");
    }
    const routedTool = mediaRoute?.kind === "douyin.share"
        ? "intelligence.douyin.share"
        : mediaRoute?.kind === "cover.reference" ||
            mediaRoute?.kind === "cover.publication_reference"
            ? "cover.generate"
            : null;
    const forcedMaterialKind = chatContext.functionKey === "material.generate.image"
        ? "image"
        : chatContext.functionKey === "material.generate.video"
            ? "video"
            : undefined;
    const forcedToolSequence = mediaRoute?.kind === "cover.publication_reference"
        ? ["context.publications", "cover.generate"]
        : forcedMaterialKind && chatContext.projectId
            ? ["context.artifact.text", "material.generate"]
            : undefined;
    if (forcedToolSequence) {
        for (const toolName of forcedToolSequence) {
            if (!baseAllowed.includes(toolName))
                baseAllowed = [...baseAllowed, toolName];
        }
    }
    const scratchForbiddenTools = new Set([
        "context.projects",
        "context.metrics",
        "context.comments",
        "context.positioning.detail",
    ]);
    const effectiveFunctionKey = mediaRoute?.kind === "douyin.share" &&
        chatContext.functionKey === "web.read"
        ? undefined
        : options.positioningScratch &&
            chatContext.surface === "positioning" &&
            chatContext.functionKey &&
            scratchForbiddenTools.has(chatContext.functionKey)
            ? undefined
            : chatContext.projectId && chatContext.functionKey === "context.projects"
                ? undefined
                : forcedMaterialKind
                    ? undefined
                    : chatContext.functionKey;
    // [T-716] 局部改稿是一个已由 UI 明确锚定目标段落的原子动作，不是开放式 Copilot
    // 对话。若继续把项目分析、联网、生成整稿等几十个工具一并发给模型，不仅浪费上下文，
    // OpenAI-compatible 模型还可能在强制 tool_choice 后于流中途拒绝复杂 schema，最终只剩
    // “局部改写中断”。这里把它收敛为单工具最小回合；段落锚点仍由服务端当下真值绑定。
    const hasTrustedScriptPatchAnchor = chatContext.selection?.kind === "script_section" &&
        Boolean(chatContext.selection.artifactId?.trim()) &&
        Boolean(chatContext.selection.versionId?.trim()) &&
        Boolean(chatContext.selection.ids[0]?.trim()) &&
        Boolean(chatContext.selection.excerpt?.trim());
    // T-819：普通项目对话也可提供候选工具，但它必须依赖当前稿只读端口；模型先读结构化
    // currentVersion，再提交 sectionRef，execute 仍会重读一次。非项目/无读端口继续物理排除。
    const hasContextualScriptPatch = Boolean(chatContext.projectId &&
        deps.contextReaders?.getArtifactText &&
        effectiveFunctionKey !== "script.patch");
    const isScriptPatchAction = effectiveFunctionKey === "script.patch" && hasTrustedScriptPatchAnchor;
    let allowedNames = effectiveFunctionKey &&
        ALL_CHAT_TOOL_NAMES.includes(effectiveFunctionKey) &&
        !baseAllowed.includes(effectiveFunctionKey)
        ? [...baseAllowed, effectiveFunctionKey]
        : baseAllowed;
    if (routedTool && !allowedNames.includes(routedTool)) {
        allowedNames = [...allowedNames, routedTool];
    }
    // [T-732] allChatTools 只会在可信段落锚点完整时真实挂载 script.patch。若仅从 surface
    // skill 或失效 functionKey 把它留在白名单，技能简介会宣传一个不存在的工具，forcedTool
    // 还会继续强制调用它。白名单必须与真实挂载条件使用同一真值。
    if (!hasTrustedScriptPatchAnchor && !hasContextualScriptPatch) {
        allowedNames = allowedNames.filter((name) => name !== "script.patch");
    }
    const preferredTools = applyFunctionKey(hasEffectiveScope ? getEffectiveTools(skillId) : getTools(skillId), effectiveFunctionKey).filter((n) => allowedNames.includes(n));
    const toolWhitelist = isScriptPatchAction
        ? ["script.patch"]
        : [
            ...preferredTools,
            ...allowedNames.filter((n) => !preferredTools.includes(n)),
        ];
    // 3) 解析 model。基础档按 skill 主能力解析(chatbox.topic/review/positioning 复用各自
    //    主工具的配置档);各工具 exec 内按自己的 capability 再解析(不同工具可配不同模型)。
    const skillCapability = SKILL_PRIMARY_CAPABILITY[skillId] ?? "topic.generate";
    // 4) 数据层:装配 CreativeContext facets(定位 / 飞轮 / 受众信号 / 知识库 / 复盘作品真材料),
    //    注进 system。T-039a:把 chatContext.projectId 真正传下去(原写死 null → 复盘/项目相关
    //    facet 永远读不到本项目),让复盘路径能拿到这条作品的真文案/标题/数据/评论;topic 从选中态
    //    标题(工作台一键岛带进来的作品标题)派生(不再恒 ""),让账号级兜底也有真主题可用。
    const context = await assembleCreativeContext(ctx, {
        projectId: chatContext.projectId ?? null,
        topic: chatContext.selection?.label?.trim() ?? "",
        excludePositioning: options.positioningScratch && chatContext.surface === "positioning",
        excludeAccounts: options.positioningScratch && chatContext.surface === "positioning",
        excludeHistoricalCreatorContext: options.positioningScratch && chatContext.surface === "positioning",
    }, deps);
    // 数据层 + 选中态层(T-027):先拼 CreativeContext facets,再接上"本次对话针对的选中内容"块 ——
    // 让模型一进来就知道用户"这条"指哪条,不再瞎答/反复索要标题。
    // T-039b per-action 注入矩阵:定位对话(chatbox.positioning)额外注入账号画像 accountsBrief
    // ——定位提案要立足「这个人在平台上已经是谁」;其它 surface 不注(避免账号噪声)。
    const baseSystem = assembleChatSystem(skill.system, context, {
        includeAccounts: skillId === "chatbox.positioning" && !options.positioningScratch,
    });
    // [T-684] 联网检索已改成随包浏览器能力，不再读取被隐藏的搜索模型配置。
    // 只要宿主装配了 searchWeb 端口，就是真联网；失败时诚实失败，不回落模型记忆。
    const searchConfigured = Boolean(deps.searchWeb);
    // [T-058①B / T-240②] 能力边界诚实(实录复盘:模型口头宣称「已采纳写入定位母版」但 DB 未动):
    // 写库只经工具产卡+用户点采纳;禁止假承诺;工具带分页限制时如实说明。
    // [T-240②] 规则带作用域:分「全局条款」(1-10,任何场景都生效:不假承诺/不编数字/指针权/
    // 直接写稿规则…)与「场景条款」(S1/S2,只对对应场景生效)。治的实录病例:原第 9 条无稿门不带
    // 作用域 → 创作前起草也会被它压住,编导会错误要求用户先贴逐字稿。
    const honestyBlock = [
        "【能力边界 —— 全局条款,任何场景都必须遵守】",
        "1. 你对任何数据的写入都只有一条路径:调用对应工具产出候选卡,由用户点卡上的「采纳/写入」按钮完成。你自己没有直接写库能力。",
        "2. 绝不口头宣称「已写入/已采纳/已保存」—— 除非你看到用户明确说 TA 已点过采纳按钮。用户想落库时,引导 TA:先让你调工具产卡,再点卡上的按钮。",
        "3. 用户要新定位 → 必须调 positioning.generate 工具(产带采纳按钮的卡),不要只在文本里写定位 —— 文本无法被采纳。",
        "4. 工具有分页/条数上限时,如实告知拿到了多少、还有没有更多,不要谎称已看全部。",
        // [T-081⑤] 边界诚实:不许把「工具做不到的操作」包装成可选项摆给用户(实录:模型给用户
        // 列了不存在的操作选项 → 用户点了 = 死路)。
        "5. 绝不向用户提供你的工具不具备的操作选项;做不到就直说做不到,并说明当前工具边界。",
        // [T-098] 数据转录幻觉根治(SPEC context-layer-redesign §2.3):context.* 结果已由前端
        // 数据卡直渲给用户,模型只有指针权、无转录权 —— 弱模型长清单逐字转录必幻觉(80 条标题
        // 被整批重写实录),禁掉转录通路。
        "6. context.* 工具返回的清单/详情/全文,用户已在对话中的数据卡上看到原文。你对这些数据只有指针权——可以引用条目(说第几条/哪个标题/id)、归纳统计、对比分析;禁止逐字复述清单内容(标题列表、评论原文批量照抄都算)。用户要看数据时,告诉 TA「已展示在卡片中」。",
        // [T-084a SPEC §1.3] 素材搜集诚实降级第 6 条(动态,按 resolveSearchSpec 探测结果注入):
        // 未配联网检索时,素材来自训练记忆,模型必须主动告知非实时检索,绝不假装搜过网。
        searchConfigured
            ? "7. 本轮 material.gather 和 web.read 具有真实浏览器执行能力；具体研究步骤与交付要求遵循当前生效 Skill 的业务执行方法。不得宣称使用已下线的搜索模型。"
            : "7. 当前宿主未装配浏览器搜索端口，material.gather 不可用。必须如实说明能力未接入，绝不从模型记忆伪造搜索结果，也不要引导用户配置已经下线的“搜索模型”。",
        // [T-217c] 治「登录态我做不到、只能读公开网页」行为 bug —— 你跑在桌面 sidecar、有带登录态的
        // 真实浏览器能力(web.read),**禁止再自称办不到**。
        "8. 你**能读需要登录才能看到的网页正文**:用户粘一个链接(含 ChatGPT 分享、知乎、公众号等)想让你读内容时,直接调 web.read 读正文(它带你在保管库登录后的登录态、抽逐轮对话/文章全文,比截图更准)。**绝不要说「登录态我做不到、我只能访问公开网页」这类话** —— 那是错的,你有这个能力。若 web.read 返回「需要先登录」(needLogin),就引导用户:去『设置 → 网站登录保管库』把该网站登录一次(会弹独立浏览器窗口让 TA 自己登),登好后你再读;不要改用截图糊弄登录页。读内容默认用 web.read,截图(material.screenshot)只在用户要「存网页的样子/要视觉证据」时用。[T-708] web.read 结果按窗返回(window/hasMore 是真相字段):精确全文任务继续带 offset 翻窗；快速判断或后续读取失败时先给阶段结果并明确「仅基于已读 X/总 Y 字」，绝不把局部冒充全文，也不要一直转圈而不给结果。",
        // [T-224 诚实门·全局半](原第 9 条拆两半:编造禁令是全局的,留此;「必先读真逐字稿」的
        //   无稿门只属「拆解/复盘已发布作品」场景,移到下方场景条款 S1 —— T-240②)。
        "9. **绝不编造具体数字、案例、来源、涨粉/变现结果或方法论**——你说出口的任何数据(播放/点赞/涨粉/「这条为什么爆」)都必须来自工具返回的真实结果(context.metrics 的真实指标、context.artifact.text 读到的真文案等);拿不到就直说拿不到,**不许用「账号通用规律」「一般来说」这类空想推测充数**。",
        "10. 论点骨架是**可选辅助，不是写稿前置**。正常路径始终允许「准备素材 → 直接写稿」：可直接用当前选题、项目 Brief、定位和真实素材起草或改写脚本，不得要求先立论点。知识讲解、观点评论、测评对比、较长内容或需要证据/反驳，且用户明确想先梳理时，可调用 planning.thesis 给候选；已有完整逐字稿、简单通知、短口播、纯记录或用户要快速成稿时直接调用 script.draft。只有用户点击「采纳并用于写稿」的当前论点版本才能进入普通生成；verbatim 原文保真永远不读取论点。",
        // [T-245] 治「没有实时热搜/热点榜单拉取能力」认知错位(T-217c 同族:能力在,prompt 没告诉它)——
        // T-235b 已建信源系统(登记热榜站点→readUrl 拉真信号)+黑马雷达,编导必须知道自己有这些能力。
        "11. **你有真实热点能力,绝不自称「没有实时热点/热搜拉取能力」——那是错的**。你的热点能力有三路:①内容雷达中的网页/RSS 来源会保留真实条目、链接与抓取证据;②内容雷达的热点宝/黑马发现会保留官方榜单口径与原视频链接;③web 联网搜索(已配时)。用户要蹭热点/追热榜出题时:**优先调 topic.generate 并传 basis=trend**;若结果注明未拉到实时信号或用户还没登记来源,**引导 TA 去『内容雷达』登记网页/RSS、博主或分享链接**(需登录才能看的站点,先去『设置 → 网站登录保管库』登录一次),而不是让用户手动编造热点、更不是自称没能力。",
        // [T-253] 本机文件读取能力认知 + 授权协议 + 安全边界诚实(denylist 拒读时如实说明,绝不绕)。
        "12. **你能读用户本机的文件**(local.read,支持 macOS/Linux 绝对路径、Windows 盘符路径和 UNC 网络路径，也支持 ~ 展开):用户说「读一下我桌面那份稿子 / 看看 ~/xx/某文件 / 读 E:\\资料\\稿子.md / 读 \\\\server\\share\\稿子.md」时直接调它,绝不自称「Windows 路径读不了」「我碰不到你的本地文件」或要求用户换到 macOS。授权协议:首次读某路径会弹**确认卡**(needApproval)并挂起当前调用——告诉用户在卡上选「允许一次/总是允许该目录/拒绝」；允许后系统会在**同一回合自动续跑**，不要要求用户重发，也不要重复调用制造循环；被拒绝就不再尝试。安全边界(如实转述,绝不绕):敏感文件(.env、含 key/secret/token 的文件、SSH/钥匙串/证书)无论授权与否都拒读——被拒时向用户说明这是确定性安全规则并给出原因,**绝不换路径/改名建议来绕过**;超 1MB 或二进制文件拒读,建议用户直接上传到素材库。",
        // [T-256a] 环境感知能力认知(能力在,须诚实用):编导能探测本机已装工具 + 能列已授权工作区目录。
        // 铁律:探到什么报什么,缺工具诚实引导安装,绝不假装工具存在/编造版本号/臆造未授权目录。
        "13. **你能感知用户的电脑环境,但只能读、不能装、不能乱跑命令**。两件事:①**探测已装工具**(local.tools):只在动作确实依赖操作系统可执行文件时探——如用户要「抽音频/转码」前看 ffmpeg，在本机跑脚本前看 node/python3。**绝不能用 local.tools 探测 CreatorOS 的生图/文生视频/文本模型配置、provider、发布能力或其它应用内服务**；这类能力直接调用对应工具，由对应任务返回真实配置或调用错误。系统工具装了就说装了(可报版本),没装就直说并给安装命令；只支持 ffmpeg/ffprobe/node/python3/git，绝不假装工具存在、绝不编造版本号。②**列工作区目录**(local.workspace):用户问「我授权过哪些目录/我放素材的文件夹」时列出 TA 已「总是允许该目录」的本地目录;要看某目录里有什么,再用 local.read 读那个目录。清单为空就说还没授权过、引导 TA 去授权,绝不臆造用户没授权过的目录。你没有安装工具、执行任意命令、写本地文件的能力——只有「读环境」这一层,别对用户承诺装工具或跑命令。",
        // [T-265] 反工具冒充:能力不存在时诚实说明，不能抓相邻工具冒充。
        //   工具清单(上方「你的技能清单」)是你能力的单一真值:清单没列的能力=你现在没有。
        "14. **绝不用「用途不同的工具」冒充用户真正要的能力**。用户要某能力(如生成封面、做某种产物)时,先看你的技能清单里**有没有对应的工具**:有就调那个对的工具;**没有就诚实告诉用户「这个能力我现在没有对应工具」**,并说明现有工具能做到的最接近的事。宁可诚实说没有,也不误接工具骗过去。",
        // [T-380] 对话减摩擦:能力边界当场诚实 + 顺手的事直接做,不摆选项清单、不堆免责预防针。
        "15. **能力边界诚实 + 减摩擦**:系统不支持的能力(如某种生成方式/某个平台/某类操作)**绝不假装执行**,在动手前当场说明「这个当前不支持」;反过来,你的工具能顺手替用户做到的动作就**直接做**(该调工具就调),不要把本可直接执行的事拆成多选项清单抛回给用户选。要么先拦(不支持就直说),要么干净执行(支持就直接干)——**不要在执行前堆一段免责/预防针式的铺垫**(「可能会失败/仅供参考/我先说明几点」云云),执行结果如何就如实报什么。",
        // [T-386] 治实录病例:整稿卡已显「✓写入稿面」,编导下轮仍说「整稿还在后台跑,先审 brief
        // 草案」—— 凭对话记忆断言任务状态 + 凭记忆叙述稿面内容(其实已被采纳的新稿覆盖)。
        "16. **后台任务状态绝不凭记忆断言**:整稿/发布物料/封面/审核/逐字稿这类后台任务的状态,**只信系统注入的【后台任务状态真值】块和界面卡片**——你上一轮说「在后台跑」不代表现在还在跑,任务状态在你回答之间随时变化。真值块显示已完成/已写入的任务,绝不再说「还在跑/还没好/先等等」;不确定时直说「以卡片显示的状态为准」,绝不猜。同理,**要评价/审核/引用稿面当前内容时,先调 context.artifact.text 读当前版本再叙述**——你记忆里的「草案」可能已被用户采纳的新稿覆盖,凭记忆叙述旧版本 = 对着不存在的东西发言。",
        // [T-708] 创作质量条件统一软化。权限/归属/真相仍由其它条款与执行层守住。
        "17. **创作完整度不是拒绝服务的理由**:六问未答完、未先比较方向、逐字稿/素材不齐、联网失败、用户没指定长度或格式，都只能影响候选质量，不能阻止定位卡、选题卡或第一版整稿生成。用户明确说「直接生成/先给一版」时立即调用正确工具；用“待验证/待补证据/待补真实案例”标缺口，禁止编造事实。只有鉴权与数据归属、隐私安全、破坏性操作、幂等冲突、外部发送/发布，以及会把虚假事实沉淀进正式数据的情况可以硬拦。",
        "18. **故障归因必须有运行时证据**:只有工具本轮返回的 error、系统注入的【后台任务状态真值】错误，或界面卡片中的脱敏原始错误，才能支持你判断这一次为什么失败。拿到证据时引用脱敏后的原始错误和发生步骤，区分 HTTP/模型拒绝/超时/配置缺失/输入问题；不要擅自扩大成整个平台坏了。没有这些证据时必须说“原因尚未确认，以错误卡或任务状态为准”，不得笼统说“系统有问题”“平台故障”“配置坏了”，也不得用这些话替代继续执行当前能做的工作。",
        "",
        // [T-240②] 场景条款 —— 带作用域的规则,只在对应场景生效,禁止跨场景套用。
        "【场景条款 —— 只在对应场景生效,禁止跨场景套用】",
        // [T-224 诚实门·场景半] 无稿门只管「拆解/复盘已发布作品」;创作前立框架不适用(S2)。
        chatContext.projectId
            ? `S1.(仅在拆解/复盘一条**已发布**作品时生效)当前作品已绑定 projectId="${chatContext.projectId}",**先调 context.project.lifecycle 看全流程真状态,正文再调 context.artifact.text**,绝不调 context.projects 拉全库找它;拆经验再调 review.analyze。任何 lifecycle 分区是 error 都必须说“读取失败”,不能说“用户没生成/没采纳”。读不到真稿时,若关联抖音就顺手调 project.transcribe 发起抓取;抓不了就直说并请用户贴稿,绝不推测充数。`
            : "S1.(仅在拆解/复盘一条**已发布**作品时生效)拆它、产它的经验/方法论之前,**必须先读到这条作品的真逐字稿**:账号级未引用具体作品时,用户说“前几期/历史/之前发布/同系列”就用 context.projects.search 按真实发布时间找 projectId；普通最近项目才用 context.projects。拿到 id 后先调 context.project.lifecycle,正文再调 context.artifact.text;拆经验再调 review.analyze。读不到真稿时,若关联抖音就顺手调 project.transcribe 发起抓取;抓不了就直说并请用户贴稿,绝不推测充数。",
        "S2.(仅在为**创作前(未发布)**的项目搭结构或起草脚本时生效)依据是定位+选题卡+已搜集素材——这是正常创作流,**不适用 S1 的无稿门**:创作前没有逐字稿不是缺陷,不要因读不到逐字稿而卡住、不要向用户索要逐字稿、更不要把「没有逐字稿」当成拒绝起草的理由。",
    ].join("\n");
    const coverPublicationReferenceBlock = mediaRoute?.kind === "cover.publication_reference"
        ? [
            "【参考历史作品生成封面】",
            "先调用 context.publications 读取当前账号真实已发布且有封面的近期候选；再结合当前项目标题、Brief、稿件与候选标题，自动选择‘最新且最关联’的一条。相关性优先，相关程度相当时选择发布时间更新的作品。",
            "选定后必须把该条真实 coverAssetId 原样传给 cover.generate.referenceAssetId 并直接发起封面任务。不要把 A/B 选择抛回用户，不要因为候选不绝对最新而停下追问。",
            "不得调用 local.tools 探测生图模型；它只探测 ffmpeg/node/python/git 等系统可执行文件。生图配置由 cover.generate 自己检查并通过任务卡返回真实结果。",
            "若没有任何合格候选或候选都没有真实 coverAssetId，诚实说明拿不到参考封面并停止；不得降级成无参考图生成。",
        ].join("\n")
        : "";
    // [T-077c] 技能自感知(SPEC §1.3 [gate-F1]):把当前 surface 白名单的技能清单注进 system
    // (每工具一行「中文名(工具名):一句话用途」,行数=白名单工具数、上限 20 超出截断)——
    // 让模型能如实回答「你能干什么」,并在对话中主动建议(「这个我可以用『记录经验』帮你存下来」)。
    // 词表与前端工具 trace 行同源(lib/chat-tool-labels 单一真值),不编造白名单外的能力。
    const skillsBriefBlock = [
        "【你的技能清单 —— 本对话你能调用的全部工具,回答「你能干什么」时以此为准,不要编造清单外的能力】",
        buildSkillsBrief(toolWhitelist),
    ].join("\n");
    const selectionBlock = assembleSelectionContext(chatContext.selection, {
        scriptPatchRequired: isScriptPatchAction,
    });
    const assetAliasBlock = chatContext.assetAliases && Object.keys(chatContext.assetAliases).length
        ? [
            "【当前对话素材别名 —— 用户说图2/image2/视频1时必须按此表识别，绝不猜标题】",
            ...Object.entries(chatContext.assetAliases).map(([alias, assetId]) => `${alias} -> assetId=${assetId}`),
            "引用已有素材的工具若支持 referenceAssetId，直接传对应 assetId；工具不支持时要诚实说明，不能说‘识别不到图2’。",
        ].join("\n")
        : "";
    // T-039a 补:复盘对话「瞎问复盘对象」根因 —— 本项目真材料虽已装进 context(reviewSubject reader)
    // 且进了 review.analyze 工具的 facets,但**没进对话系统提示**,故 LLM 在决定调用工具前不知道复盘哪条,
    // 于是反复问「复盘对象是什么」并退回账号级泛论。这里把「本次复盘对象(真标题+文案+数据+评论)」直接
    // 注进对话 system + 强指令「别再问、直接基于它复盘」,让模型一进来就扣住这条作品。有 projectId 才注入
    // (reviewTitle/reviewScript 非空);读不到(无脚本/数据)则该行省略,不喂空噪声。
    const reviewSubjectBlock = context.reviewTitle || context.reviewScript || context.reviewMetrics
        ? [
            "【本次复盘对象 —— 创作者已在工作台选定这一条作品,请直接基于它提炼可复用要素,不要再问用户「复盘对象是什么」、也不要退回账号整体泛论】",
            // [T-134] 逐字稿/评论是外部来源用户可控内容(prompt-injection 最高危面)→ <user_data> 硬边界
            // 包裹;真实数据是派生统计数字,不含自由文本、不包。守卫指令已在 baseSystem 顶部(全局覆盖)。
            context.reviewTitle ? `标题:${wrapUserData(`《${context.reviewTitle}》`)}` : "",
            context.reviewScript ? `文案/逐字稿:\n${wrapUserData(context.reviewScript)}` : "",
            context.reviewMetrics ? `真实数据:${context.reviewMetrics}` : "",
            context.reviewComments ? `观众评论(真实):\n${wrapUserData(context.reviewComments)}` : "",
        ]
            .filter(Boolean)
            .join("\n")
        : "";
    // [T-106] 项目态当前项目注入 —— 项目内对话(chatContext.projectId 有值)把「当前项目 id」作为
    // **工具可用值**注入 + 指路 context.artifact.text/detail,免得模型不知道 id 就调 context.projects
    // 列全站去找(实录:项目内编导拉 79 条项目库还找不到匹配、退回口播稿脑补)。id 是工具入参,标题仅提示。
    const currentProjectTitle = chatContext.selection?.label?.trim() ?? "";
    const currentProjectBlock = chatContext.projectId
        ? [
            `【当前项目 —— 你正在为这一个具体项目编导,projectId="${chatContext.projectId}"${currentProjectTitle ? `,标题《${currentProjectTitle}》` : ""}】`,
            `先调 context.project.lifecycle 读取这个项目从选题卡、稿件、素材、封面、发布、指标、审核到复盘的真状态；需要正文时再调 context.artifact.text,需要审核命中项时调 context.review.report。以上工具都使用可信 projectId="${chatContext.projectId}"。`,
            `你已经知道这条内容的 projectId 了,**绝不要用 context.projects 列出全站项目去找这一条**——那是全账号清单,不是当前项目。`,
        ].join("\n")
        : "";
    // [T-240①] 阶段判据块 —— 项目对话把「创作前(未发布)/已发布(可复盘)」渲成明确场景信号
    // (formatProjectStageBlock 纯函数);读不到项目详情(projectStage=null)→ 不注(不喂猜测)。
    const stageBlock = projectStage ? formatProjectStageBlock(projectStage) : "";
    // [T-382] 当前选中号块 —— ctx.accountId(x-account-id 已验属主)命中账号画像行时,把「用户
    // 当前操作的抖音号是谁」渲成明确 system 事实 + 指令。治实录病例:用户问「我当前登录的是哪个
    // 账号」,编导答「从你这侧的登录状态我没法判断」—— 系统明明知道(header 已验属主、画像已注入),
    // 只是没标哪个是当前号。所有 surface 都注(不限定位对话:「我的账号/我的数据」在任何面都该
    // 默认指当前号);未选号 / reader 无 id / 无匹配 → 空串不注(诚实,不猜)。
    const currentAccountBlock = context.currentAccountLine
        ? [
            `【当前选中的抖音号】用户当前操作的抖音号:${context.currentAccountLine}。`,
            "用户说「我的账号 / 我的数据 / 我当前登录的是哪个账号」时,默认都指这个号——直接如实回答、直接拉它的数据;**绝不要说「我没法判断你登录的是哪个号」、也绝不要反问用户当前是哪个号**(系统已把当前号告诉你了)。",
        ].join("\n")
        : "";
    // [T-270] 立项 Brief 硬锚块 —— 项目态对话把「本条内容立项硬约束(钦定核心信息/内容目标含避免X/
    // 内容形式/目标观众)」注进 system,让编导聊 hook/论点/整稿前就锚定钦定前提,不再漂移/自创矛盾主张。
    // 作**权威约束块**(与 stageBlock/currentProjectBlock 同类,不套 <user_data> 数据边界——brief 是
    // 创作者自己对本项目的钦定决策,须以「必须遵守」的指令力生效,而非当外部数据降权)。account 态
    // (projectId=null)→ context.projectBriefHard 恒空 → filter(Boolean) 略过,不注空壳。
    const briefHardBlock = context.projectBriefHard || "";
    // [T-727] 创作上下文不是安全政策：本轮明确执行要求可以覆盖历史创作建议。尤其保真导入
    // 必须走 sourceRef 确定性通道，不能再让 Brief 的「避免 X」要求用户先解除规则。
    const currentInstructionPriorityBlock = [
        "【当前明确指令优先级】",
        "用户本轮明确的创作执行要求，优先于项目 Brief、定位、复盘与归因中的创作建议；这些建议是普通生成的创作基线，不是权限、安全或合规政策。发生冲突时直接执行本轮要求，不能要求用户先解除规则、修改选题卡或反复确认。",
        "用户要求原文不改/一字不改/逐字写入时，必须使用 script.draft 的 verbatim 模式与受信 sourceRef；禁止把原文压缩进 extraBrief 后交给写稿模型重写。权限归属、隐私安全、外部发布、破坏性操作、事实不可伪造和候选确认门仍然 fail-closed。",
        "用户可能在一条消息里先交代视频状态、操作背景，再紧接着粘贴完整稿件。仅收到稿件时先正常回应，不自动创建候选；等用户明确要求写入后，稿面只收稿件正文。必须由你理解“对助手说的话”和“面向视频观众的稿件”并用 startAnchor / endAnchor 选择边界，不能把对话说明一起写入，也不能漏掉说明结束后的第一句稿件开场；代码只负责按你选定的精确边界恢复原字符。",
    ].join("\n");
    const currentScriptPriorityBlock = chatContext.projectId
        ? [
            "【当前确认稿优先级】",
            "当用户问当前稿的内容、结构、时长，或要做单段改写、配图、信息卡、封面时，必须先调用 context.artifact.text 读取 output_script 的 currentVersionId 真值。工具返回的 truthPriority=current_confirmed_script、版本、contentHash 与 sections 是‘这条内容现在在说什么’的第一内容真相。",
            "本轮明确要求 > 当前确认稿 > 当前段落/分镜 > 联网原文与项目素材事实证据 > 项目 Brief/定位/历史对话/旧候选。Brief 只在没有当前稿时作为首次创作基线；与当前确认稿冲突时不得用 Brief 覆盖当前稿，须按当前稿回答并可指出冲突。",
            hasContextualScriptPatch
                ? "普通对话中用户说‘改第 N 段’、按语义点名某段或引用当前稿一句话时：先读 context.artifact.text，由你做语义定位；唯一目标时调用 script.patch 并逐字使用返回的 sectionRef。零段或多段可能匹配才澄清，不向用户索要任何技术 ID。整稿改写请求不要调用局部工具。"
                : "如果本轮局部改稿的快捷锚点已经失效，只结束这次快捷动作；不要把旧锚点带入后续普通对话。",
        ].join("\n")
        : "";
    const verbatimSourceBlock = formatVerbatimSourceInventory(options.verbatimSources ?? []);
    // [T-386] 后台任务状态真值块(recentTasks 上方已 best-effort 读取;空列表 → 空串不注)。
    const taskTruthBlock = formatRecentTasksBlock(recentTasks, Date.now());
    const system = isScriptPatchAction
        ? [
            "【局部改稿专用回合】",
            "用户已明确选中一个现有脚本段落。只根据用户本轮修改要求重写该段；不得改动、重写或补写其他段落，也不得要求用户提供 artifactId、versionId、sectionId 等技术字段。",
            "必须调用 script.patch 提交 replacementText。技术锚点由服务端绑定；不要调用其他工具，不要只在对话中返回改写文案。",
            selectionBlock,
        ]
            .filter(Boolean)
            .join("\n\n")
        : [
            baseSystem,
            honestyBlock,
            coverPublicationReferenceBlock,
            skillsBriefBlock,
            currentAccountBlock,
            currentProjectBlock,
            briefHardBlock,
            currentInstructionPriorityBlock,
            currentScriptPriorityBlock,
            verbatimSourceBlock,
            stageBlock,
            taskTruthBlock,
            reviewSubjectBlock,
            selectionBlock,
            assetAliasBlock,
        ]
            .filter(Boolean)
            .join("\n\n");
    // 选中态标题 —— 工具入参兜底(模型没显式传 title/subject 时用它,避免拿空标题去诊断)。
    const selectionTitle = chatContext.selection?.label?.trim() || "";
    const scriptHooksContext: ScriptHooksContext = {
        selectionTitle, positioningBrief: context.positioningBrief,
        projectBriefHard: context.projectBriefHard ?? "", userMaterialHardBrief: context.userMaterialHardBrief ?? "",
        userMaterialRefBrief: context.userMaterialRefBrief ?? "", knowledgeBrief: context.knowledgeBrief ?? "",
    };
    // 5) 工具白名单层:按 skill 白名单挂工具,execute 复用现有 runner 核心产**候选**(非实体)。
    const toolDeps = createChatAssemblyToolDeps(ctx, chatContext, deps, { mediaRoute, forcedMaterialKind, creatorOsGuideSnapshot, verbatimSources: options.verbatimSources, latestUserInstruction: options.latestUserInstruction, searchConfigured });
    // [T-439] 装配层一律用**原名**(内部真值:错误信封登记 / 白名单 / 深链 functionKey / 审计日志
    //   都按原名)。合规化只在发给模型那一刻做,见下方 streamText 入参。
    const tools = buildChatTools(toolWhitelist, toolDeps);
    // [T-117 确定性修] functionKey 是深链/按钮明确指定的工具(如「补全选题卡」深链 fn=topic.enrich);
    // 命中真工具时强制本轮调它,防模型把卡当文本吐 + 谎称已渲卡(弱 tool-calling 模型的常态)。
    const forcedTool = forcedToolSequence?.[0] && toolWhitelist.includes(forcedToolSequence[0])
        ? forcedToolSequence[0]
        : routedTool && toolWhitelist.includes(routedTool)
            ? routedTool
            : effectiveFunctionKey && toolWhitelist.includes(effectiveFunctionKey)
                ? effectiveFunctionKey
                : undefined;
    return {
        skillId,
        system,
        tools,
        capability: skillCapability,
        ...(tools["material.gather"] ? { researchContext: { selectionTitle, userMaterialQueryTerms: [...(context.userMaterialQueryTerms ?? [])], searchConfigured: Boolean(deps.searchWeb) } } : {}),
        ...((["topic.enrich", "positioning.generate", "calibration.diagnose", "topic.generate", "review.analyze", "knowledge.distill"].some(name => tools[name])) ? { structuredContext: { positioningBrief: context.positioningBrief, accountsBrief: context.accountsBrief, learningsBrief: context.learningsBrief, signalsBrief: context.signalsBrief, knowledgeBrief: context.knowledgeBrief } } : {}),
        ...(tools["script.hooks"] ? { scriptHooksContext: { ...scriptHooksContext } } : {}),
        forcedTool,
        ...(forcedToolSequence ? { forcedToolSequence } : {}),
    };
}
