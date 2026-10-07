import { it, expect, beforeAll, afterAll } from 'vitest';
import { z } from 'zod';
import { createDb, executionCalls, eq, type Db } from '@creatoros/backend';
import { createAiRepository } from './ai.repository';
import { createChatTurnSubmissionService } from './chat-turn-submission.service';
import { createPersistentTaskService } from '../execution/persistent-task.service';
import { createExternalChatTurnService } from './external-chat-turn.service';
import { createExternalTaskToolService } from './external-task-tool.service';
import { createChatHostContextReader } from './chat-host-context.service';
let db: Db, close: () => Promise<void>, n = 0;
const now = () => '2026-10-07T00:00:00.000Z', nextId = (p: string) => `${p}-result-page-${++n}`;
beforeAll(async () => { const o = await createDb(); db = o.db; close = () => o.client.close(); });
afterAll(async () => close());
it('外部原identity/outcome账本超过60k真实翻窗重拼，unknown、旧fence及错parent拒绝', async () => {
    const ctx = { userId: 'result-u', accountId: 'result-a', source: 'user' as const, requestId: 'result-request' };
    const repo = createAiRepository(db, { userId: ctx.userId, accountId: ctx.accountId, now, nextId }), conversation = await repo.createConversation({ title: '回执', projectId: null, scope: 'global' }), source = await repo.createMessage(conversation.id, { role: 'user', content: '读真实结果', attachments: [], modelMetadata: {} });
    const def = { name: 'work.editor.read', version: 'result-v1', description: '真实读取', parameters: { type: 'object' }, effect: 'none' as const };
    const submitted = await createChatTurnSubmissionService(db, { now, nextId, assemble: async () => ({ capability: 'copilot.assist', system: '中性', messages: [{ role: 'user', content: source.content }], maxSteps: 4, maxOutputTokens: 128, tools: [def] }) }).submit(ctx, { conversationId: conversation.id, sourceMessageId: source.id, executionEngine: 'codex' });
    const claim = (await createPersistentTaskService(db, { now, nextId }).claimTask({ taskId: submitted.executionTaskId, workerId: 'result-worker' }))!, ref = { executionTaskId: submitted.executionTaskId, attempt: claim.lease.attempt, fenceToken: claim.lease.fenceToken };
    const chat = createExternalChatTurnService(db, { now, budget: { maxCalls: 10, maxTokens: 10000, deadlineMs: 120000 } }), turn = await chat.reserve(ref, {});
    await chat.start(ref, { callId: turn.callId, sessionId: 'result-session', protocolKind: 'acp', protocolVersion: 1 });
    const data = { kind: 'work.editor.context', document: { body: '中性完整正文😀'.repeat(15000), params: { rich: '原样' } }, error: null };
    const tool = { version: def.version, effect: 'none' as const, parameters: z.object({}).strict(), approve: async () => ({ status: 'not-applicable' as const }), execute: async () => ({ status: 'ok' as const, summary: '真实结果', evidence: [], data, error: null, continuation: null, sideEffect: 'none' as const }) };
    const service = createExternalTaskToolService(db, { now }), request = { turnCallId: turn.callId, toolCallId: 'long-result', toolName: def.name, input: {} };
    const result = await service.execute(ref, request, { [def.name]: tool }, new AbortController().signal);
    expect(result.status).toBe('settled');
    const reader = createChatHostContextReader(db, { now });
    expect(JSON.parse((await reader.readToolResult(ref, {})).text)).toEqual([{ toolCallId: 'long-result', toolName: def.name }]);
    let text = '', offset = 0;
    for (;;) {
        const page = await reader.readToolResult(ref, { toolCallId: 'long-result', offset });
        text += page.text;
        if (!page.hasMore)
            break;
        offset = page.nextOffset!;
    }
    expect(JSON.parse(text)).toEqual(result.outcome);
    expect(text.length).toBeGreaterThan(60000);
    await expect(reader.readToolResult({ ...ref, fenceToken: 'old' }, { toolCallId: 'long-result' })).rejects.toThrow();
    await db.update(executionCalls).set({ parentCallId: result.callId }).where(eq(executionCalls.id, result.callId));
    await expect(reader.readToolResult(ref, { toolCallId: 'long-result' })).rejects.toThrow();
    await db.update(executionCalls).set({ parentCallId: turn.callId, status: 'unknown' }).where(eq(executionCalls.id, result.callId));
    await expect(reader.readToolResult(ref, { toolCallId: 'long-result' })).rejects.toThrow();
});
