import type { RequestContext } from '@creatoros/contract';
import type { ChatContext } from './chat-context';
import type { AssembleChatDeps } from './chat-assembly-types';
import type { CopilotMediaRoute } from './chat-assembly-context';
import type { ChatToolDeps, VerbatimSource } from './chat-tools';
import { createChatReadToolBindings } from './chat-read-tool-bindings';
import type { resolveChatGuideSnapshot } from './chat-guide-snapshot';
/** 仅构造动态工具定义需要的真值；模型、任务提交及浏览器执行由持久工具 Host 提供。 */
export function createChatAssemblyToolDeps(ctx: RequestContext, chatContext: ChatContext, deps: AssembleChatDeps, input: {
    mediaRoute: CopilotMediaRoute | null;
    forcedMaterialKind?: 'image' | 'video';
    creatorOsGuideSnapshot: Awaited<ReturnType<typeof resolveChatGuideSnapshot>>;
    verbatimSources?: readonly VerbatimSource[];
    latestUserInstruction?: string;
    searchConfigured: boolean;
}): ChatToolDeps {
    return {
        ...createChatReadToolBindings(ctx, deps.contextReaders),
        ...(input.mediaRoute?.kind === 'cover.publication_reference' ? { publicationView: 'published_cover_candidates' as const } : {}),
        readCreatorOsGuide: input.creatorOsGuideSnapshot ? () => input.creatorOsGuideSnapshot! : undefined,
        boundProjectId: chatContext.projectId ?? undefined,
        ...(input.forcedMaterialKind ? { forcedMaterialKind: input.forcedMaterialKind } : {}),
        ...(chatContext.selection?.kind === "article_section" ? {articleImageSelection: chatContext.selection} : {}),
        verbatimSources: input.verbatimSources ?? [], latestUserInstruction: input.latestUserInstruction ?? '',
        ...(chatContext.selection?.kind === 'script_section' && chatContext.selection.artifactId?.trim() && chatContext.selection.versionId?.trim() && chatContext.selection.ids[0]?.trim() && chatContext.selection.excerpt?.trim() ? { scriptPatchAnchor: { artifactId: chatContext.selection.artifactId.trim(), versionId: chatContext.selection.versionId.trim(), sectionId: chatContext.selection.ids[0].trim(), originalText: chatContext.selection.excerpt } } : {}),
        humanizeError: deps.humanizeError,
        searchConfigured: input.searchConfigured,
    } as ChatToolDeps;
}
