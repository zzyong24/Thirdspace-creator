import type { WorkEditorReadInput, WorkEditorProposeInput, RequestContext } from '@creatoros/contract';
import { workEditorTarget } from '@creatoros/contract';
import type { ExecutionRef } from '@creatoros/contract/execution-worker';
import type { ChatWorkerDispatcherDeps } from '../execution/model-worker-dispatcher';
import type { createChatHostContextReader } from '../ai/chat-host-context.service';
import { buildChatTools, type ChatToolDeps } from './chat-tools';
import { prepareChatToolDefinitions } from './chat-tool-definitions';
import { createChatHostToolAdapter } from './chat-host-tool-adapter';
import { ConflictError } from '../execution/execution.errors';
import {resolveWorkEditorProtocol} from './chat-work-editor-protocol';
import { canonicalJson } from '../ai/canonical-json';
import { createWorkEditorCandidateService, type WorkEditorPorts } from './work-editor-candidate';
/** 原execution冻结target与三维owner，只短读取/候选，无owner写权限。 */
export function createChatWorkEditorToolHost(reader: Pick<ReturnType<typeof createChatHostContextReader>, 'read'>, ports: WorkEditorPorts): NonNullable<ChatWorkerDispatcherDeps['resolveTools']> {
    const service = createWorkEditorCandidateService(ports), effects = { 'work.editor.read': 'none', 'work.editor.propose': 'proposal' } as const;
    async function resolve(ctx: RequestContext, execution: ExecutionRef, signal?: AbortSignal) {
        signal?.throwIfAborted();
        const frozen = structuredClone(await reader.read({ ...execution }));
        if (frozen.context.userId !== ctx.userId || (frozen.context.accountId ?? null) !== (ctx.accountId ?? null) || (frozen.context.groupId ?? null) !== (ctx.groupId ?? null))
            throw new Error('编导目标与当前任务的账号组不符');
        const definitions = frozen.modelInput.tools.filter(tool => Object.hasOwn(effects, tool.name));
        if (!definitions.length)
            return {};
        const definitionOptions=resolveWorkEditorProtocol(definitions,workEditorTarget.parse(frozen.hostContext.chatContext.editorTarget));
        const context = frozen.hostContext.chatContext, target = workEditorTarget.parse(context.editorTarget);
        if (context.surface !== 'project' || context.projectId !== target.projectId)
            throw new Error('编导工具未绑定当前明确保存的作品');
        const tools = buildChatTools(definitions.map(tool => tool.name), { humanizeError: () => null, ...definitionOptions,editorTarget: target, readWorkEditor: async (input: WorkEditorReadInput) => { try {
                return {...await service.read(frozen.context, target, input),...(frozen.hostContext.resolvedWritingContext?{resolvedWritingContext:structuredClone(frozen.hostContext.resolvedWritingContext)}:{})};
            }
            catch (error) {
                if (!(error instanceof ConflictError))
                    throw error;
                return { kind: 'work.editor.context', schemaVersion: 1, target, base: target.savedBase, baseDigest: target.documentDigest, selection: target.selection, readScope: {}, selected: [], documentSummary: {}, document: null, projectEnvelope: null, media: [], sourceTranscripts: [], capabilities: {}, fieldWindow: null, complete: false, failureCode: 'conflict', error: error.message };
            } }, proposeWorkEditor: async (input: WorkEditorProposeInput) => { try {
                return await service.propose(frozen.context, target, input);
            }
            catch (error) {
                if (!(error instanceof ConflictError))
                    throw error;
                return { kind: 'work.editor.candidate', schemaVersion: 1, target, base: target.savedBase, baseDigest: target.documentDigest, candidateDigest: null, summary: input.summary, candidate: null, changes: [], apply: null, imageRequest: null, failureCode: 'conflict', error: error.message };
            } } } as unknown as ChatToolDeps);
        if (canonicalJson((await prepareChatToolDefinitions(tools,definitionOptions)).definitions) !== canonicalJson(definitions))
            throw new Error('编导工具定义与任务快照不符');
        signal?.throwIfAborted();
        return tools;
    }
    return async (ctx, _input, execution, signal) => { const prototypes = await resolve(ctx, execution, signal);if(!Object.keys(prototypes).length)return {};
      const frozen=await reader.read({...execution}),definitions=frozen.modelInput.tools.filter(tool=>Object.hasOwn(effects,tool.name));
      const definitionOptions=resolveWorkEditorProtocol(definitions,workEditorTarget.parse(frozen.hostContext.chatContext.editorTarget));
      return createChatHostToolAdapter(prototypes,resolve,effects,{definitionOptions}); };
}
