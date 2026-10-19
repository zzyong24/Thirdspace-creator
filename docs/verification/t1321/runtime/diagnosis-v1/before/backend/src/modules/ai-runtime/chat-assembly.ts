import {workEditorTarget,workCreationTarget} from "@creatoros/contract";
import {canonicalJson} from "../ai/canonical-json";
import { createChatSkillLibrary } from "./chat-skill-library";
import { type ChatResearchContext } from "./chat-research-preparation";
import type { ChatStructuredContext } from "./chat-structured-tool-nodes";
import type { ScriptHooksContext } from "@creatoros/contract/execution-worker";
import { resolveChatGuideSnapshot } from "./chat-guide-snapshot";
import { type ToolSet } from "ai";
import type { RequestContext } from "@creatoros/contract";
import { assembleCreativeContext, formatProjectStageBlock } from "./creative-context";
import { resolveSkillForSurface, applyFunctionKey, assembleChatSystem, assembleSelectionContext, wrapUserData, selectRecentChatTasks, formatRecentTasksBlock, type ChatContext, type RecentTaskTruth } from "./chat-context";
import { buildChatTools, ALL_CHAT_TOOL_NAMES, getSurfaceToolScope, type VerbatimSource } from "./chat-tools";
import {prepareChatToolDefinitions} from "./chat-tool-definitions";
import {selectAssistantTools} from "./assistant-operation-policy";
import {buildAssistantFunctionalPrompt} from "./assistant-functional-prompt";
import type { AssembleChatDeps } from './chat-assembly-types';
import { formatVerbatimSourceInventory, type CopilotMediaRoute } from './chat-assembly-context';
import { createChatAssemblyToolDeps } from './chat-assembly-tool-deps';
const SKILL_PRIMARY_CAPABILITY: Record<string, string> = {
    "chatbox.canvas":"topic.generate",
    "chatbox.topic": "topic.generate",
    // 画布讨论仍用现有编导文本模型档；画布的图像/视频模型仅在用户提交生成任务时调用。
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
    resolvedWritingContext?:import("@creatoros/contract").ResolvedWritingContext;
    capability: string;
    researchContext?: ChatResearchContext;
    structuredContext?: ChatStructuredContext;
    scriptHooksContext?: ScriptHooksContext;
};
/** 准备上下文与真实工具，不取得主模型凭据；工具执行迁移仍由各真实端口承担。 */
export async function prepareChatAssembly(ctx: RequestContext, chatContext: ChatContext, deps: AssembleChatDeps, mediaRoute: CopilotMediaRoute | null = null, options: {
    resolvedWritingContext?:import("@creatoros/contract").ResolvedWritingContext;
    positioningScratch?: boolean;
    verbatimSources?: readonly VerbatimSource[];
    latestUserInstruction?: string;
    executionEngine?: "pi" | "codex";
    toolDefinitionOptions?:NonNullable<Parameters<typeof prepareChatToolDefinitions>[1]>;
} = {}): Promise<ChatAssemblyPreparation> {
    chatContext=structuredClone(chatContext);
    options={...options,toolDefinitionOptions:{...options.toolDefinitionOptions},verbatimSources:structuredClone(options.verbatimSources)};
    if(chatContext.editorTarget&&chatContext.creationTarget)throw new Error('同一轮只能冻结一种作品目标');
    if(chatContext.editorTarget){
      const target=workEditorTarget.parse(chatContext.editorTarget);
      if(chatContext.surface!=='project'||chatContext.projectId!==target.projectId||!deps.readEditorTarget)throw new Error('当前作品目标缺少真实准备读取端口');
      const actual=await deps.readEditorTarget(ctx,target);
      if(canonicalJson(workEditorTarget.parse(actual))!==canonicalJson(target))throw new Error('作品版本在准备期间变化，请重新保存并读取');
      chatContext.editorTarget=structuredClone(actual);
    }
    if(chatContext.creationTarget){
      const target=workCreationTarget.parse(chatContext.creationTarget);
      if(chatContext.surface!=='project'||chatContext.projectId!==target.projectId||!deps.readCreationTarget)throw new Error('联合创作目标缺少真实准备读取端口');
      const actual=await deps.readCreationTarget(ctx,target);
      if(canonicalJson(workCreationTarget.parse(actual))!==canonicalJson(target))throw new Error('确认脚本或作品组合在准备期间变化');
      chatContext.creationTarget=structuredClone(actual);
    }
    const writingSelection=chatContext.editorTarget?.owner==='wechat_article'?chatContext.editorTarget.writingContext:chatContext.creationTarget?.writingContext;
    const resolved=options.resolvedWritingContext??(writingSelection?await deps.resolveWritingContext?.(ctx,chatContext.projectId!,writingSelection):undefined);
    if(writingSelection&&!resolved)throw new Error('写作选择缺少真实只读解析端口');
    if(resolved){const {validateResolvedWritingContext}=await import('../../application/generation/work-writing-context');validateResolvedWritingContext(resolved);if(resolved.projectId!==chatContext.projectId||canonicalJson(resolved.selection)!==canonicalJson(writingSelection))throw new Error('写作资料与目标不符');}
    options.toolDefinitionOptions={...options.toolDefinitionOptions,workWritingContext:Boolean(writingSelection),...(chatContext.editorTarget?{workEditorOwner:chatContext.editorTarget.owner}:{})};
    // 1) 页面层:surface → 基础 skill。
    const skillId = resolveSkillForSurface(chatContext.surface);
    // 2) registry 取 skill(模板 system + 工具白名单)。懒加载 ai-worker(AI SDK 不进顶层 bundle)。
    const { getEffectiveTemplate, getEffectiveTools, getTemplate, getTools, hasActiveEffectiveSkillSnapshot, getActiveEffectiveSkillSnapshot, USER_FACING_RESPONSE_POLICY, } = await import("@creatoros/ai-worker");
    const hasEffectiveScope = hasActiveEffectiveSkillSnapshot();
    const skillLibrary = hasEffectiveScope ? createChatSkillLibrary(getActiveEffectiveSkillSnapshot(), ctx) : undefined;
    const skill = hasEffectiveScope
        ? getEffectiveTemplate(skillId)
        : getTemplate(skillId);
    // [T-770] 在当前 ALS scope 内一次性校验并冻结代码随版的产品说明。正文只留在服务端闭包，
    // 不拼进 system；模型真正调用 creatoros.guide 时才进入 tool result。说明不可用时
    // 只让该工具返回不可用，不能让无关的写稿、找素材等聊天在提交前失败。
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
    const systemNames=['system.features','system.read','system.action.propose','canvas.create.propose','canvas.generate.propose'];
    baseAllowed=baseAllowed.filter(name=>!systemNames.includes(name));
    if(deps.assistantSystem)baseAllowed=[...baseAllowed,...systemNames.filter(name=>name!=='canvas.generate.propose'||Boolean(deps.assistantSystem?.generateCanvas))];
    baseAllowed = baseAllowed.filter(name => name !== "skill.read" && name !== "tool.result.read" && name !== "history.read");
    if (skillLibrary?.catalog) baseAllowed = [...baseAllowed, "skill.read", "tool.result.read", "history.read"];
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
    const isArticleImageAction = forcedMaterialKind === "image" && chatContext.selection?.kind === "article_section";
    const forcedToolSequence = chatContext.creationTarget ? ["work.creation.read","work.creation.propose"] : mediaRoute?.kind === "cover.publication_reference"
        ? ["context.publications", "cover.generate"]
        : isArticleImageAction
            ? ["material.generate"]
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
    const effectiveFunctionKey = chatContext.editorTarget?.owner==="production"&&chatContext.functionKey==="video.edit.render"?undefined:mediaRoute?.kind === "douyin.share" &&
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
    if (isArticleImageAction) allowedNames = ["material.generate"];
    if (routedTool && !allowedNames.includes(routedTool)) {
        allowedNames = [...allowedNames, routedTool];
    }
    // [T-732] allChatTools 只会在可信段落锚点完整时真实挂载 script.patch。若仅从 surface
    // skill 或失效 functionKey 把它留在白名单，技能简介会宣传一个不存在的工具，forcedTool
    // 还会继续强制调用它。白名单必须与真实挂载条件使用同一真值。
    if (!hasTrustedScriptPatchAnchor && !hasContextualScriptPatch) {
        allowedNames = allowedNames.filter((name) => name !== "script.patch");
    }
    // 原无画布上下文的合法聊天保留其工具定义；新画布工具只在受信单画布入口可见。
    if(chatContext.surface!=="canvas"||chatContext.selection?.kind!=="canvas"||chatContext.selection.ids.length!==1){allowedNames=allowedNames.filter(name=>name!=="canvas.read"&&name!=="canvas.propose"&&name!=="canvas.generate.propose");}
    if(!chatContext.editorTarget)allowedNames=allowedNames.filter(name=>name!=='work.editor.read'&&name!=='work.editor.propose');
    if(!chatContext.creationTarget)allowedNames=allowedNames.filter(name=>name!=='work.creation.read'&&name!=='work.creation.propose');
    if(chatContext.editorTarget?.owner==="production")allowedNames=allowedNames.filter(name=>name!=='video.edit.render');
    const preferredTools = applyFunctionKey(hasEffectiveScope ? getEffectiveTools(skillId) : getTools(skillId), effectiveFunctionKey).filter((n) => allowedNames.includes(n));
    let toolWhitelist = isScriptPatchAction
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
        excludePositioning: Boolean(resolved)||options.positioningScratch && chatContext.surface === "positioning",
        excludeAccounts: options.positioningScratch && chatContext.surface === "positioning",
        excludeHistoricalCreatorContext: Boolean(resolved)||options.positioningScratch && chatContext.surface === "positioning",
    }, deps);
    if(resolved){context.positioningBrief=resolved.brand?.guidance??'';context.userMaterialHardBrief='';context.userMaterialRefBrief='';}
    const searchConfigured = Boolean(deps.searchWeb);
    const toolDeps = createChatAssemblyToolDeps(ctx, chatContext, deps, { mediaRoute, forcedMaterialKind, creatorOsGuideSnapshot, verbatimSources: options.verbatimSources, latestUserInstruction: options.latestUserInstruction, searchConfigured });
    const prototypes=buildChatTools(toolWhitelist,{...toolDeps,workEditorOwner:options.toolDefinitionOptions.workEditorOwner,skillLibrary,assistantSystem:deps.assistantSystem,
      ...(resolved?{readWorkEditor:async(input:any)=>({...await toolDeps.readWorkEditor!(input),resolvedWritingContext:structuredClone(resolved)}),readWorkCreation:async(input:any)=>({...await toolDeps.readWorkCreation!(input),resolvedWritingContext:structuredClone(resolved)})}:{}),
    });
    const actualDefinitions=(await prepareChatToolDefinitions(prototypes,options.toolDefinitionOptions)).definitions;
    const tools=selectAssistantTools(options.executionEngine??"pi",prototypes,actualDefinitions);
    toolWhitelist=Object.keys(tools);
    // 数据层 + 选中态层(T-027):先拼 CreativeContext facets,再接上"本次对话针对的选中内容"块 ——
    // 让模型一进来就知道用户"这条"指哪条,不再瞎答/反复索要标题。
    // T-039b per-action 注入矩阵:定位对话(chatbox.positioning)额外注入账号画像 accountsBrief
    // ——定位提案要立足「这个人在平台上已经是谁」;其它 surface 不注(避免账号噪声)。
    const baseSystem = assembleChatSystem(skill.system.replaceAll(USER_FACING_RESPONSE_POLICY, "").trim(), context, {
        includeAccounts: skillId === "chatbox.positioning" && !options.positioningScratch,
    });
    // [T-684] 联网检索已改成随包浏览器能力，不再读取被隐藏的搜索模型配置。
    // 只要宿主装配了 searchWeb 端口，就是真联网；失败时诚实失败，不回落模型记忆。
    // 宿主只声明真实能力与执行边界；业务方法由冻结Skill按需加载。
    const honestyBlock = [
        ...(resolved?['本轮写作身份与参考资料只来自work.read的resolvedWritingContext。brand为null表示中性写作，不能改用全局当前品牌。只引用sourceMaterials实际所选文件，未选择的项目文档不自动作为写作资料。sourceMaterials的truncated=true表示仅提供原文前60000个UTF16字符，请在读回后说明资料被截断，勿声称读了全文。']:[]),
        ...(chatContext.editorTarget?['当前编辑器目标已保存并经原owner核验；先work.editor.read读取选区与原始前值，按明确UTF16范围/真实ID/native ticks提出typed_patch。宿主保完整未改字段；返回候选不表示已采纳。']:[]),
        ...(chatContext.creationTarget?['用户已确认当前保存脚本并明确新建文章和图文。先work.creation.read，再由当前引擎联合创作完整同源article和graphic候选，一次work.creation.propose。没有自动视频、TTS或子模型任务。']:[]),
        "【执行边界】",
        "只使用本轮真实工具；权限、账号归属与当前实体状态以工具回执为准。读取或执行被拒绝时尊重拒绝，不换路径绕过；需要授权或登录时说明当前阻塞。",
        "候选、排队、执行中、已执行与已采纳是不同状态。只有真实回执能证明保存或执行；卡片不是完成全部请求的证据。不要声称后台任务已经完成。",
        "可以引用、整理、比较工具返回的正文，解释依据并提出明确标为推演的建议；不得伪造来源、数字、案例或操作结果。摘要和片段不能冒充全文，存在后续页时按需要继续读取。",
        "只缺私人经历凭证、账号定位、项目绑定或雷达来源，不阻断可独立完成的公开研究；利用现有信息推进用户当前目标，必需的操作参数仍由工具校验。",
        searchConfigured ? "本轮已接通浏览器搜索和正文读取；方法由你按需选择。" : "本轮未装配浏览器搜索端口；不得伪称已经联网。",
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
    const skillsBriefBlock = buildAssistantFunctionalPrompt(toolWhitelist);
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
            isArticleImageAction
                ? "本轮只为工作台选中的公众号文章段落生成图片候选；执行端会按当前账号重读文章版本、段落正文和视觉简报。不要读取或引用同项目的视频 output_script。"
                : `先调 context.project.lifecycle 读取这个项目从选题卡、稿件、素材、封面、发布、指标、审核到复盘的真状态；需要正文时再调 context.artifact.text,需要审核命中项时调 context.review.report。以上工具都使用可信 projectId="${chatContext.projectId}"。`,
            `你已经知道这条内容的 projectId 了,**绝不要用 context.projects 列出全站项目去找这一条**——那是全账号清单,不是当前项目。`,
        ].join("\n")
        : "";
    const canvasBlock=chatContext.surface==="canvas" && chatContext.selection?.kind==="canvas" && chatContext.selection.ids[0]
      ? "【当前创作画布】用户正在画布里与你协作。先调用 canvas.read 读取当前账号画布真值和 revision；需要改动时调用 canvas.propose 形成候选，解释候选效果并让用户在画布里点击应用。不要声称已直接修改画布，也不要把生成任务当成已完成。画布 ID 只用于定位，执行端会重新校验归属。"
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
            `【当前选中的平台账号】用户当前操作的平台账号:${context.currentAccountLine}。`,
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
    const currentScriptPriorityBlock = chatContext.projectId && !isArticleImageAction
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
    const methodCatalogBlock = skillLibrary?.catalog ?? "";
    const system = isArticleImageAction
        ? [
            "【公众号文章段落配图专用回合】",
            "用户已从文章工作台选定一个真实段落。立即调用 material.generate，kind=image，mediaKind=illustration；只填写画面方案，目标文章和段落由服务端当前真值绑定。不要调用 context.artifact.text，不要读取或引用视频脚本，不要用截图、精确数字图表或假界面冒充事实证据。候选图需用户审看并确认后才会用于文章。",
            currentProjectBlock,
            selectionBlock,
            USER_FACING_RESPONSE_POLICY,
          ].filter(Boolean).join("\n\n")
        : isScriptPatchAction
        ? [
            "【局部改稿专用回合】",
            "用户已明确选中一个现有脚本段落。只根据用户本轮修改要求重写该段；不得改动、重写或补写其他段落，也不得要求用户提供 artifactId、versionId、sectionId 等技术字段。",
            "必须调用 script.patch 提交 replacementText。技术锚点由服务端绑定；不要调用其他工具，不要只在对话中返回改写文案。",
            selectionBlock,
            USER_FACING_RESPONSE_POLICY,
        ]
            .filter(Boolean)
            .join("\n\n")
        : [
            baseSystem,
            honestyBlock,
            methodCatalogBlock,
            coverPublicationReferenceBlock,
            skillsBriefBlock,
            currentAccountBlock,
            currentProjectBlock,
            canvasBlock,
            briefHardBlock,
            currentInstructionPriorityBlock,
            currentScriptPriorityBlock,
            verbatimSourceBlock,
            stageBlock,
            taskTruthBlock,
            reviewSubjectBlock,
            selectionBlock,
            assetAliasBlock,
            USER_FACING_RESPONSE_POLICY,
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
    // [T-439] 装配层一律用**原名**(内部真值:错误信封登记 / 白名单 / 深链 functionKey / 审计日志
    //   都按原名)。合规化只在发给模型那一刻做,见下方 streamText 入参。
    // [T-117 确定性修] functionKey 是深链/按钮明确指定的工具(如「补全选题卡」深链 fn=topic.enrich);
    // 命中真工具时强制本轮调它,防模型把卡当文本吐 + 谎称已渲卡(弱 tool-calling 模型的常态)。
    const forcedTool = forcedToolSequence?.[0] && toolWhitelist.includes(forcedToolSequence[0])
        ? forcedToolSequence[0]
        : chatContext.surface==="canvas"&&chatContext.selection?.kind==="canvas"&&chatContext.selection.ids.length===1&&toolWhitelist.includes("canvas.read")
            ? "canvas.read"
        : routedTool && toolWhitelist.includes(routedTool)
            ? routedTool
            : effectiveFunctionKey && effectiveFunctionKey !== "material.gather" && toolWhitelist.includes(effectiveFunctionKey)
                ? effectiveFunctionKey
                : undefined;
    return {
        skillId,
        ...(resolved?{resolvedWritingContext:structuredClone(resolved)}:{}),
        system,
        tools,
        capability: skillCapability,
        ...(tools["material.gather"] ? { researchContext: { selectionTitle, userMaterialQueryTerms: [...(context.userMaterialQueryTerms ?? [])], searchConfigured: Boolean(deps.searchWeb) } } : {}),
        ...((["topic.enrich", "positioning.generate", "calibration.diagnose", "topic.generate", "review.analyze", "knowledge.distill"].some(name => tools[name])) ? { structuredContext: { positioningBrief: context.positioningBrief, accountsBrief: context.accountsBrief, learningsBrief: context.learningsBrief, signalsBrief: context.signalsBrief, knowledgeBrief: context.knowledgeBrief } } : {}),
        ...(tools["script.hooks"] ? { scriptHooksContext: { ...scriptHooksContext } } : {}),
        forcedTool,
        ...(forcedToolSequence?.some(name=>toolWhitelist.includes(name)) ? { forcedToolSequence:forcedToolSequence.filter(name=>toolWhitelist.includes(name)) } : {}),
    };
}
