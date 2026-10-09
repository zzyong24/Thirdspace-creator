import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { workEditorNativeEdit, workCreationReadInput, workEditorTarget, workCreationTarget, type RequestContext } from '@creatoros/contract';
import { chatWorkerInputSchema } from '@creatoros/contract/execution-worker';
import { registerAllTemplates } from '@creatoros/ai-worker';
import { createDb, aiTasks, executionTasks, projects, and, eq, type Db } from '@creatoros/backend';
import { createAiService } from '../ai';
import { chatInputDigest, createChatTurnSubmissionService, type ChatTurnSnapshot, type ChatTurnAssembly } from '../ai/chat-turn-submission.service';
import { prepareChatTurn } from './chat-turn-preparation';
import type { AssembleChatDeps } from './chat-assembly-types';
import { buildAssistantFunctionalPrompt } from './assistant-functional-prompt';

const editorTools = ['work.editor.read', 'work.editor.propose'];
const creationTools = ['work.creation.read', 'work.creation.propose'];

describe('T1093 已绑定编导方法', () => {
  it('给模型的原生时间示例是严格合同可接受的数字，字符串仍被原合同拒绝', () => {
    const prompt = buildAssistantFunctionalPrompt(editorTools);
    const match = prompt.match(/数字格式示例：(\{[^\n]+?\})；/);
    expect(match, '功能方法必须给出可验证的 JSON 数字格式').not.toBeNull();
    const patch = JSON.parse(match![1]!);
    const edit = { type: 'patchNativeElement', trackId: 'example-track', elementId: 'example-element', expectedElementDigest: `sha256:${'a'.repeat(64)}`, patch };
    expect(workEditorNativeEdit.safeParse(edit).success).toBe(true);
    for (const field of ['duration', 'trimStart']) {
      expect(typeof patch[field]).toBe('number');
      expect(workEditorNativeEdit.safeParse({ ...edit, patch: { ...patch, [field]: String(patch[field]) } }).success).toBe(false);
    }
    expect(prompt).toContain('示例不是当前工程值');
    expect(prompt).toContain('从真实读取计算');
  });

  it('联合第一次读取示例不猜摘要；成功后才复制实际摘要和共同来源', () => {
    const prompt = buildAssistantFunctionalPrompt(creationTools);
    expect(prompt).toContain('第一次work.creation.read调用{}');
    expect(workCreationReadInput.safeParse({}).success).toBe(true);
    expect(workCreationReadInput.safeParse({ targetDigest: '猜测的摘要' }).success).toBe(false);
    expect(prompt).toContain('不传、不猜targetDigest');
    expect(prompt).toContain('成功读取返回的targetDigest');
    expect(prompt).toContain('scriptSourceRef');
    expect(prompt).toContain('用户已明确不自动生成视频初稿');
  });

  it.each([editorTools, creationTools])('纠错只在明确无副作用的参数错误内改变参数，并以成功回执判定候选', (...names) => {
    const prompt = buildAssistantFunctionalPrompt(names);
    for (const rule of ['status:error', 'error.code:invalid_input', 'sideEffect:none', '同一原任务', '实际改变参数', '不得重复原参', '结果未知', '不续期', '只有正式propose成功回执', '没有候选']) {
      expect(prompt).toContain(rule);
    }
  });

  it.each([[], ['work.editor.propose'], ['work.editor.read'], ['work.creation.propose'], ['work.creation.read']])('缺少完整工具对时不提示调用不存在的编导方法', (...names) => {
    const prompt = buildAssistantFunctionalPrompt(names);
    expect(prompt).not.toContain('数字格式示例');
    expect(prompt).not.toContain('第一次work.creation.read调用{}');
    expect(prompt).not.toContain('status:error');
  });
});

describe('T1093 实际装配与原提交冻结链（隔离PGlite，无模型执行）', () => {
  let db: Db, close: () => Promise<void>, sequence = 0;
  const nextId = (prefix: string) => `${prefix}-director-method-${++sequence}`;
  const now = () => new Date(1788600000000 + (++sequence) * 1000).toISOString();
  beforeAll(async () => { registerAllTemplates(); const f = await createDb(); db = f.db; close = () => f.client.close(); });
  afterAll(async () => { await close(); });

  it.each(['editor', 'creation'] as const)('%s 方法进入实际system及持久modelInput，同源重放不重新装配或改冻结字节', async family => {
    const ctx = { userId: 'director-method-user', accountId: nextId('account'), requestId: 'test', source: 'user' as const };
    const project = { id: nextId('project') }, stamp = now();
    // 仅隔离库声明项目父夹具；跨模块会话/消息写入经正式AiService，不调用其它模块仓库。
    await db.insert(projects).values({ id: project.id, userId: ctx.userId, accountId: ctx.accountId, title: '隔离编导方法冻结验收', creationMode: 'manual', status: 'active', currentStage: 'script', startedAt: stamp, createdAt: stamp, updatedAt: stamp });
    const forbidden = async () => { throw Error('冻结夹具不得执行候选采用或模型'); };
    const ai = createAiService({ db, now, nextId, artifacts: { createVersion: forbidden }, knowledge: { createKnowledge: forbidden }, positioning: { upsertProfile: forbidden, createStatementVersion: forbidden }, candidate: { createFromAIResult: forbidden, enrichCard: forbidden }, learnings: { createLearning: forbidden }, publishing: { createPublicationFromDraft: forbidden }, materialLinks: { link: forbidden }, calibration: { createDraftPrediction: forbidden } });
    const conversation = await ai.createConversation(ctx, { title: '方法冻结', projectId: project.id, scope: `project:${project.id}` });
    const source = await ai.createMessage(ctx, conversation.id, { content: '只提出候选，尚未采用', attachments: [] });
    const editorTarget = workEditorTarget.parse({ schemaVersion: 1, projectId: project.id, outputId: 'neutral-video', owner: 'production', contentType: 'video', savedBase: { kind: 'production', productionId: 'neutral-production', revision: 1 }, documentDigest: `sha256:${'a'.repeat(64)}`, selection: { kind: 'native_scene', sceneId: 'scene', elementRefs: [], playheadTick: 0, contextEpoch: 1, editorGeneration: 'test-generation' } });
    const creationTarget = workCreationTarget.parse({ schemaVersion: 1, clientRequestId: 'director-method-freeze', projectId: project.id, compositionId: 'neutral-composition', compositionRevision: 1, scriptSourceRef: { kind: 'project_script', id: 'script', versionId: 'script-version' }, scriptConfirmation: { confirmedBy: 'user', source: 'public-request' }, articleMember: { kind: 'article', outputId: 'article', artifactId: 'article-artifact', baseVersionId: 'article-version' }, graphicMember: { kind: 'image', outputId: 'graphic', artifactId: 'graphic-artifact', baseVersionId: 'graphic-version' } });
    // 目标reader是显式准备夹具；此测试证明真实装配→原提交冻结，不代替领域归属或真实Pi。
    const deps: AssembleChatDeps = { humanizeError: () => null, positioning: { getPositioningCenter: async () => ({ profile: null, currentStatement: null }) }, readEditorTarget: async (_ctx, target) => structuredClone(target), readCreationTarget: async (_ctx, target) => structuredClone(target) };
    const assemble = vi.fn(async (_ctx: RequestContext, snapshot: ChatTurnSnapshot): Promise<ChatTurnAssembly> => {
      const prepared = await prepareChatTurn(_ctx, { messages: snapshot.messages.map(m => ({ id: m.id, role: m.role as 'user' | 'assistant', parts: [{ type: 'text' as const, text: m.content }] })), chatContext: { surface: 'project', projectId: project.id, ...(family === 'editor' ? { editorTarget } : { creationTarget }) } }, deps);
      const marker = family === 'editor' ? '数字格式示例' : '第一次work.creation.read调用{}';
      expect(prepared.assembly.system).toContain(marker);
      expect(prepared.assembly.system).toContain('只有正式propose成功回执');
      expect(prepared.toolDefinitions.map(t => t.name)).toEqual(expect.arrayContaining(family === 'editor' ? editorTools : creationTools));
      return { capability: prepared.assembly.capability, system: prepared.assembly.system, messages: chatWorkerInputSchema.shape.messages.parse(prepared.modelMessages), tools: prepared.toolDefinitions, maxSteps: 6, maxOutputTokens: 32768 };
    });
    const service = createChatTurnSubmissionService(db, { now, nextId, assemble, assertProject: async (owner, projectId) => {
      // 显式隔离父夹具端口，仅核本测试的父ID和归属；不声称领域项目服务已验收。
      const [parent] = await db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.userId, owner.userId), eq(projects.accountId, owner.accountId!)));
      if (!parent) throw Error('隔离项目父夹具不存在或归属不符');
    } });
    const request = { conversationId: conversation.id, sourceMessageId: source.id };
    const submitted = await service.submit(ctx, request);
    const readFrozen = async () => {
      const [execution] = await db.select().from(executionTasks).where(eq(executionTasks.id, submitted.executionTaskId));
      const [task] = await db.select().from(aiTasks).where(eq(aiTasks.id, submitted.taskId));
      const payload = execution!.payload as { modelInput: { system: string } };
      expect(payload.modelInput.system).toContain(family === 'editor' ? '数字格式示例' : '第一次work.creation.read调用{}');
      expect(task!.inputData).toMatchObject({ modelInputDigest: chatInputDigest(payload.modelInput) });
      return JSON.stringify({ payload: execution!.payload, inputData: task!.inputData });
    };
    const frozen = await readFrozen();
    // 后续当前装配改变也不应进入已绑定任务；重放必须直接沿原冻结输入。
    assemble.mockImplementationOnce(async () => { throw new Error('同源回放不得重新装配当前方法'); });
    expect(await service.submit(ctx, request)).toEqual({ ...submitted, replayed: true });
    expect(assemble).toHaveBeenCalledTimes(1);
    expect(await readFrozen()).toBe(frozen);
  });
});
