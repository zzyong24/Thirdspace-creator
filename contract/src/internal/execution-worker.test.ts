import { expect, it } from 'vitest';
import { hostMessageSchema, workerMessageSchema, workerCallRequestId, intelligenceRewriteInputSchema, structuredGenerationInputSchema, workerTaskInputSchema } from './execution-worker';
const execution={executionTaskId:'synthetic',attempt:1,fenceToken:'owned'};
const envelope={version:1,requestId:'one'};
it('旧私有运行和回复协议仍可解析，新协议仅追加协商字段与消费确认',()=>{
  expect(hostMessageSchema.parse({...envelope,type:'run',execution,deadlineAt:null})).not.toHaveProperty('receiptProtocol');
  expect(hostMessageSchema.parse({...envelope,type:'reply',ok:true,data:{}})).not.toHaveProperty('callSeq');
  expect(workerMessageSchema.parse({...envelope,type:'call',execution,port:'heartbeat',data:{}})).not.toHaveProperty('callSeq');
  expect(workerMessageSchema.parse({...envelope,type:'consumed',execution,throughSeq:0,consumedRanges:[{fromSeq:2,toSeq:100}]})).toHaveProperty('consumedRanges');
});
it.each([0,-1,1.5,Number.MAX_SAFE_INTEGER+1])('私有调用序列拒绝非有效正整数 %s',callSeq=>{
  expect(workerMessageSchema.safeParse({...envelope,type:'call',execution,port:'heartbeat',data:{},callSeq}).success).toBe(false);
});
it('消费确认拒绝倒置区间和未知协议，保留 continuous 的 null deadline',()=>{
  expect(workerMessageSchema.safeParse({...envelope,type:'consumed',execution,throughSeq:0,consumedRanges:[{fromSeq:4,toSeq:3}]}).success).toBe(false);
  expect(hostMessageSchema.safeParse({...envelope,type:'run',execution,deadlineAt:null,receiptProtocol:'unknown'}).success).toBe(false);
  expect(hostMessageSchema.parse({...envelope,type:'run',execution,deadlineAt:null,receiptProtocol:'consumed-v1'})).toHaveProperty('deadlineAt',null);
});
it('请求身份绑定任务、attempt、fence 和调用序列，改序列不能冒用旧 ID',()=>{
  expect(workerCallRequestId(execution,1)).not.toBe(workerCallRequestId(execution,2));
  expect(workerCallRequestId(execution,1)).not.toBe(workerCallRequestId({...execution,fenceToken:'stale'},1));
  expect(workerCallRequestId(execution,1)).toBe(workerCallRequestId({...execution},1));
});

function rewriteInput(outputSchema: null | Record<string, unknown> = null) {
  return { kind: 'model.structured', intelligenceText: 'rewrite_only', operationKey: 'intelligence:original', capability: 'topic.generate', skillId: 'intelligence.topic-adapted-draft', maxOutputTokens: 8192, timeoutMs: 600000,
    facets: { mode: 'topic_preview', target: JSON.stringify({ generationMode: 'rewrite_only', transformId: 'original-transform', transcript: { text: '原文', hash: '原hash' } }), continuousRecovery: 'true' },
    skillSnapshot: { snapshotVersion: 1, userId: 'u', accountId: 'a', groupId: 'g', groupVersion: 1, membershipVersion: 1, resolvedAt: 'now', platformPolicyVersion: '1', platformPolicy: '候选', skills: [{ skillId: 'intelligence.topic-adapted-draft', baseVersion: 'v3', overlayRevision: null, overlayVersion: null, effective: { methodSystem: '', template: '{{transcript}}', tools: [], requiredFacets: ['transcript'], contextRequirements: [], outputSchema, completionPolicy: null, completionPolicyAdapter: null } }] } };
}
it.each([null, { type: 'object', properties: { value: { type: 'string' } } }])('正文私有标签保留真实 null 或合法 object 契约 %s，不替换冻结值', outputSchema => {
  const input = rewriteInput(outputSchema);
  expect(intelligenceRewriteInputSchema.parse(input)).toEqual(input);
  expect(workerTaskInputSchema.parse(input)).toEqual(input);
  expect(structuredGenerationInputSchema.safeParse(input).success).toBe(false);
});
it('普通 structured 仍拒绝无契约，旧合法冻结原样兼容，不借标签放宽', () => {
  const { intelligenceText: _tag, ...plain } = rewriteInput();
  expect(workerTaskInputSchema.safeParse(plain).success).toBe(false);
  expect(structuredGenerationInputSchema.safeParse(plain).success).toBe(false);
  const { intelligenceText: _oldTag, ...old } = rewriteInput({ type: 'object' });
  expect(workerTaskInputSchema.parse(old)).toEqual(old);
  expect(workerTaskInputSchema.parse(old)).not.toHaveProperty('intelligenceText');
});
it.each(['wrong-tag', 'missing-tag', 'capability', 'skill', 'snapshot-skill', 'duplicate-skill', 'extra-skill', 'mode', 'invalid-json', 'null-target', 'array-target', 'strategy-target', 'unknown-field'])('正文标签机械矛盾 %s 不能由 union 降级放行', problem => {
  const input = rewriteInput();
  if (problem === 'wrong-tag') input.intelligenceText = 'unknown';
  if (problem === 'missing-tag') delete (input as Partial<typeof input>).intelligenceText;
  if (problem === 'capability') input.capability = 'copy.generate';
  if (problem === 'skill') input.skillId = 'script.draft';
  if (problem === 'snapshot-skill') input.skillSnapshot.skills[0]!.skillId = 'script.draft';
  if (problem === 'duplicate-skill') input.skillSnapshot.skills.push(input.skillSnapshot.skills[0]!);
  if (problem === 'extra-skill') input.skillSnapshot.skills.push({ ...input.skillSnapshot.skills[0]!, skillId: 'topic.generate' });
  if (problem === 'mode') input.facets.mode = 'script_candidate';
  if (problem === 'invalid-json') input.facets.target = '{';
  if (problem === 'null-target') input.facets.target = 'null';
  if (problem === 'array-target') input.facets.target = '[]';
  if (problem === 'strategy-target') input.facets.target = JSON.stringify({ generationMode: 'strategy_backed' });
  const candidate = problem === 'unknown-field' ? { ...input, unexpected: true } : input;
  expect(intelligenceRewriteInputSchema.safeParse(candidate).success).toBe(false);
  expect(workerTaskInputSchema.safeParse(candidate).success).toBe(false);
});
