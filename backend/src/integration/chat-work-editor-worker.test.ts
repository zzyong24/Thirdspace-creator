import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { it, expect, beforeAll } from 'vitest';
import { createDb, executionCalls, executionTasks, aiMessages, eq, type Db } from '@creatoros/backend';
import type { WorkEditorTarget, WorkEditorProposeInput, WorkEditorCandidate, RequestContext } from '@creatoros/contract';
import { createProjectRepository, createProjectsService } from '../modules/projects';
import { createArtifactsService } from '../modules/artifacts';
import { createArticlesService } from '../modules/articles/articles.service';
import { createAiRepository } from '../modules/ai/ai.repository';
import { createChatTurnSubmissionService } from '../modules/ai/chat-turn-submission.service';
import { createChatHostContextReader } from '../modules/ai/chat-host-context.service';
import type { ChatHostContext } from '../modules/ai/chat-host-context';
import { createPersistentTaskService } from '../modules/execution/persistent-task.service';
import { createChatWorkerDispatcher } from '../modules/execution/model-worker-dispatcher';
import { createExternalChatTurnService } from '../modules/ai/external-chat-turn.service';
import {createWorkCandidateSourceService} from '../modules/ai/work-candidate-source.service';
import {createWorkCandidateAdoption} from '../application/generation/work-candidate-adoption';
import { createExternalTaskToolService } from '../modules/ai/external-task-tool.service';
import { createChatTaskToolHost } from '../modules/ai-runtime/chat-task-tool-host';
import { buildChatTools, type ChatToolDeps } from '../modules/ai-runtime/chat-tools';
import { prepareChatToolDefinitions } from '../modules/ai-runtime/chat-tool-definitions';
import { workEditorContentDigest, type WorkEditorPorts } from '../modules/ai-runtime/work-editor-candidate';
import type { ContextReaders } from '../modules/ai-runtime/chat-assembly-types';
let seq = 0;
const now = () => new Date().toISOString(), nextId = (p: string) => `${p}-editor-worker-${++seq}`;
const entryPath = resolve('../ai-worker/dist/execution-worker.cjs');
beforeAll(() => execFileSync(process.execPath, [resolve('../ai-worker/scripts/build.mjs')], { stdio: 'pipe', timeout: 120000 }), 180000);
async function owners(db: Db, ctx: RequestContext) {
    const deps = { now, nextId }, projects = (store: Db) => createProjectsService(createProjectRepository(store), deps);
    const artifacts = (store: Db) => createArtifactsService({ db: store, ...deps, assertProjectOwned: (c, id) => projects(store).getProject(c, id), resolveOutputProjectId: (c, id) => projects(store).getProjectIdByOutput(c, id) });
    const articlePorts={...deps,projects,artifacts,assertAssetFile:async()=>{throw Error('本fixture无媒体引用');},resolveDocumentSource:async()=>null,resolveSelectedBrand:async()=>null,submitGeneration:async()=>{throw Error('短候选不能生成子任务');},readGeneration:async()=>{throw Error('短候选不能生成子任务');}};
    const articles = createArticlesService(db, { ...deps, projects, artifacts, assertAssetFile: async () => { throw Error('本fixture无媒体引用'); }, resolveDocumentSource: async () => null, resolveSelectedBrand: async () => null, submitGeneration: async () => { throw Error('短候选不能生成子任务'); }, readGeneration: async () => { throw Error('短候选不能生成子任务'); } });
    const project = await projects(db).createProject(ctx, { title: '编导公共链', brief: '原保存文章' });
    const output = await articles.createOutput(ctx, project.id, { title: '真实文章', clientRequestId: 'public-editor-output' }), initial = await articles.getArticle(ctx, output.id);
    const document = { ...initial.current, title: '真实文章', sections: [{ sectionId: 'selected-section', order: 0, heading: '目标', headingLevel: 2, body: '完整正文😀'.repeat(18000), sourceRefs: [] }, { sectionId: 'other-section', order: 1, heading: '另一段', headingLevel: 2, body: '其余段保持原样', sourceRefs: [] }] };
    await articles.createVersion(ctx, output.id, { expectedCurrentVersionId: initial.currentVersionId, clientRequestId: 'public-editor-base', document });
    const current = await articles.getArticle(ctx, output.id);
    const target: WorkEditorTarget = { schemaVersion: 1, projectId: project.id, outputId: output.id, owner: 'wechat_article', contentType: 'article', savedBase: { kind: 'artifact', artifactId: current.artifactId, versionId: current.currentVersionId }, documentDigest: workEditorContentDigest(current.current), selection: { kind: 'article_sections', sectionIds: ['selected-section'], field: 'heading' } };
    const proposal: WorkEditorProposeInput = { base: target.savedBase, baseDigest: target.documentDigest, summary: '改已选标题', candidate: { kind: 'typed_patch', owner: 'wechat_article', edits: [{ type: 'patchArticleSection', sectionId: 'selected-section', expectedSectionDigest: workEditorContentDigest(current.current.sections[0]), patch: { heading: '新标题' } }] } };
    const editor: WorkEditorPorts = { readArticle: (c, id) => articles.getArticle(c, id), readGraphicPost: async () => { throw Error('wrong owner'); }, readProduction: async () => { throw Error('wrong owner'); }, readMedia: async () => { throw Error('not native'); } };
    return { articles, project, output, current, target, proposal, editor, articlesFor:(store:Db)=>createArticlesService(store,articlePorts),artifactsFor:artifacts,projects: projects(db) };
}
it.each(['pi', 'codex'] as const)('原%s协议公共submit/claim/短host/ledger/parts：长候选无损，采纳才原owner写', async (engine) => {
    const opened = await createDb(), db = opened.db, ctx: RequestContext = { userId: 'editor-worker-u', accountId: `editor-worker-a-${++seq}`, requestId: 'editor-worker-request', source: 'user' };
    const f = await owners(db, ctx), repo = createAiRepository(db, { userId: ctx.userId, accountId: ctx.accountId ?? null, now, nextId });
    const conversation = await repo.createConversation({ title: '修改标题', projectId: f.project.id, scope: 'project' }), source = await repo.createMessage(conversation.id, { role: 'user', content: '改已选标题，保留完整正文', attachments: [], modelMetadata: {} });
    const defs = (await prepareChatToolDefinitions(buildChatTools(['work.editor.read', 'work.editor.propose'], { humanizeError: () => null } as unknown as ChatToolDeps))).definitions;
    const hostContext: ChatHostContext = { schemaVersion: 1, chatContext: { surface: 'project', projectId: f.project.id, editorTarget: f.target }, mediaRoute: null, positioningScratch: false, trustedScriptSources: [], skillSnapshot: { snapshotVersion: 1, userId: ctx.userId, accountId: ctx.accountId ?? null, resolvedAt: 'fixed', platformPolicyVersion: '1', platformPolicy: '只产候选', skills: [{ skillId: 'chatbox.topic', baseVersion: '1', overlayRevision: null, overlayVersion: null, effective: { methodSystem: '原Skill', template: '', tools: defs.map(d => d.name), requiredFacets: [], contextRequirements: [], outputSchema: null, completionPolicy: null, completionPolicyAdapter: null } }] } };
    const submitted = await createChatTurnSubmissionService(db, { now, nextId, assertProject: (c, id) => f.projects.getProject(c, id).then(() => { }), assemble: async () => ({ capability: 'copilot.assist', system: '先读取真实选区，再提交局部候选', messages: [{ role: 'user', content: source.content }], maxSteps: 6, maxOutputTokens: 512, tools: defs, hostContext }) }).submit(ctx, { conversationId: conversation.id, sourceMessageId: source.id, executionEngine: engine });
    const reader = createChatHostContextReader(db, { now }), resolveTools = createChatTaskToolHost(reader, {} as ContextReaders, { editor: f.editor }), budget = { maxCalls: 10, maxTokens: 200000, deadlineMs: 120000 };
    let expected: WorkEditorCandidate, readResult: unknown, publicRef: Parameters<typeof reader.read>[0] | undefined;
    let cleanup = async () => { };
    try {
        if (engine === 'pi') {
            const requests: Array<Record<string, any>> = [];
            const server = createServer(async (req, res) => {
                let body = '';
                for await (const c of req)
                    body += c.toString();
                const input = JSON.parse(body);
                requests.push(input);
                const step = requests.length, delta = step < 3 ? { tool_calls: [{ index: 0, id: step === 1 ? 'editor-read' : 'editor-propose', type: 'function', function: { name: step === 1 ? 'work_editor_read' : 'work_editor_propose', arguments: JSON.stringify(step === 1 ? { view: 'selection' } : f.proposal) } }] } : { content: '已提出候选，请预览后采纳' };
                res.writeHead(200, { 'content-type': 'text/event-stream' });
                res.end([{ choices: [{ index: 0, delta, finish_reason: null }] }, { choices: [{ index: 0, delta: {}, finish_reason: step < 3 ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 } }].map(c => `data: ${JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', created: 1, model: 'protocol-fixture', ...c })}\n\n`).join('') + 'data: [DONE]\n\n');
            });
            await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
            const host = createChatWorkerDispatcher(db, { now, entryPath, workerId: 'editor-pi-host', budget, modelConcurrency: 1, resolveTools, resolveModelCredential: async () => ({ apiFormat: 'openai_chat', baseUrl: `http://127.0.0.1:${(server.address() as {
                        port: number;
                    }).port}/v1`, model: 'protocol-fixture', token: 'fixture' }) });
            cleanup = async () => { await host.stop(); server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); };
            await host.drainOnce();
            expect(requests).toHaveLength(3);
            const calls = await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId, submitted.executionTaskId));
            expected = JSON.parse(calls.find(c => c.kind === 'tool' && JSON.parse(c.resultText!).toolCallId === 'editor-propose')!.resultText!).output.data;
            readResult = JSON.parse(calls.find(c => c.kind === 'tool' && JSON.parse(c.resultText!).toolCallId === 'editor-read')!.resultText!).output.data;
            expect(calls.filter(c => c.kind === 'tool')).toHaveLength(2);
            expect(calls.some(c => c.kind === 'external_tool')).toBe(false);
        }
        else {
            const claim = (await createPersistentTaskService(db, { now, nextId }).claimTask({ taskId: submitted.executionTaskId, workerId: 'editor-codex-protocol' }))!;
            publicRef = { executionTaskId: submitted.executionTaskId, attempt: claim.lease.attempt, fenceToken: claim.lease.fenceToken };
            const frozen = await reader.read(publicRef), tools = await resolveTools(ctx, frozen.modelInput, publicRef, new AbortController().signal), external = createExternalTaskToolService(db, { now }), chat = createExternalChatTurnService(db, { now, budget });
            expect((await external.list(publicRef, {}, tools)).tools.map(t => t.name)).toEqual(['work.editor.read', 'work.editor.propose']);
            const turn = await chat.reserve(publicRef, {});
            await chat.start(publicRef, { callId: turn.callId, sessionId: 'codex-protocol-fixture', protocolKind: 'acp', protocolVersion: 1 });
            const read = await external.execute(publicRef, { turnCallId: turn.callId, toolCallId: 'editor-read', toolName: 'work.editor.read', input: { view: 'selection' } }, tools, new AbortController().signal);
            readResult = read.outcome!.data;
            const request = { turnCallId: turn.callId, toolCallId: 'editor-propose', toolName: 'work.editor.propose', input: f.proposal };
            const proposal = await external.execute(publicRef, request, tools, new AbortController().signal);
            expect(proposal.status).toBe('settled');
            expected = proposal.outcome!.data as unknown as WorkEditorCandidate;
            expect(await external.execute(publicRef, request, tools, new AbortController().signal)).toEqual(proposal);
            let text = '', offset = 0;
            for (;;) {
                const page = await reader.readToolResult(publicRef, { toolCallId: 'editor-propose', offset });
                text += page.text;
                if (!page.hasMore)
                    break;
                offset = page.nextOffset!;
            }
            expect(JSON.parse(text)).toEqual(proposal.outcome);
            expect(text.length).toBeGreaterThan(60000);
            await chat.settle(publicRef, { callId: turn.callId, status: 'settled', receipt: { schemaVersion: 1, engine: 'codex', protocolKind: 'acp', protocolVersion: 1, sessionId: 'codex-protocol-fixture', turnId: turn.callId, usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 }, text: '已提出候选，请预览后采纳', stopReason: 'end_turn' } });
            const committed = await chat.commit(publicRef, { callId: turn.callId });
            expect(await chat.commit(publicRef, { callId: turn.callId })).toEqual(committed);
        }
        expect(readResult).toMatchObject({ kind: 'work.editor.context', selected: [{ sectionId: 'selected-section', body: f.current.current.sections[0]!.body }] });
        expect(expected!.candidate?.document).toMatchObject({ sections: [{ sectionId: 'selected-section', heading: '新标题', body: f.current.current.sections[0]!.body }, { sectionId: 'other-section', body: '其余段保持原样' }] });
        expect(expected!.candidateDigest).toBe(workEditorContentDigest(expected!.candidate!.document));
        expect(JSON.stringify(expected!).length).toBeGreaterThan(60000);
        const messages = await db.select().from(aiMessages).where(eq(aiMessages.conversationId, conversation.id)), assistant = messages.find(m => m.role === 'assistant')!;
        const part=(assistant.parts as Array<any>).find(p=>p.toolCallId==='editor-propose');expect(part.state).toBe('output-available');const {__creatorosOutcome,...originalData}=part.output;expect(__creatorosOutcome).toMatchObject({schemaVersion:1,status:'ok',sideEffect:'proposal',error:null});expect(originalData).toEqual(expected!);
        expect((await db.select().from(executionTasks).where(eq(executionTasks.id, submitted.executionTaskId)))[0]!.status).toBe('succeeded');
        expect((await f.articles.getArticle(ctx, f.output.id)).currentVersionId).toBe(f.current.currentVersionId);
        if (expected!.apply?.operation !== 'createArticleVersion')
            throw Error('原owner apply缺失');
        const sources=createWorkCandidateSourceService(db),verified=await sources.read(ctx,{conversationId:conversation.id,sourceMessageId:source.id,toolCallId:'editor-propose'});expect(verified.candidate).toEqual(expected!);
        const adapter=createWorkCandidateAdoption(db,{source:sources,articles:f.articlesFor,graphic:()=>{throw Error('wrong owner');},lockArtifact:(c,id,tx)=>f.artifactsFor(tx).getArtifact(c,id,true)});
        const adoptionBody={adoptionMode:'assistant' as const,expectedCurrentVersionId:f.current.currentVersionId,assistantSource:verified.assistantSource,fieldSelection:[],factSelection:{mode:'keep'},policyVersion:1,clientRequestId:'public-editor-user-adopt'};
        const beforeCalls=await db.select().from(executionCalls);const adopted=await adapter.adopt(ctx,'article',f.output.id,adoptionBody);
        expect(await adapter.adopt(ctx,'article',f.output.id,adoptionBody)).toEqual(adopted);expect(await db.select().from(executionCalls)).toEqual(beforeCalls);
        const manual=await f.articles.createVersion(ctx,f.output.id,{...expected!.apply.body,expectedCurrentVersionId:adopted.versionId,clientRequestId:'legacy-manual-after-assisted'});expect(manual.document).toEqual(adopted.document);
        expect(await adapter.adopt(ctx,'article',f.output.id,adoptionBody)).toEqual(adopted);expect((await f.articles.getArticle(ctx,f.output.id)).currentVersionId).toBe(manual.versionId);
        expect(adopted.document).toEqual(expected!.candidate!.document);
        expect(await f.articles.createVersion(ctx, f.output.id, { ...expected!.apply.body,expectedCurrentVersionId:adopted.versionId,clientRequestId:'legacy-manual-after-assisted' })).toEqual(manual);
        await expect(f.articles.createVersion(ctx, f.output.id, { ...expected!.apply.body, clientRequestId: 'public-editor-stale-adopt' })).rejects.toThrow();
    }
    finally {
        await cleanup();
        await opened.client.close();
    }
}, 180000);
