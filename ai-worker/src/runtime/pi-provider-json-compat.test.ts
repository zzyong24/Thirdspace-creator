import { createServer } from 'node:http';
import { expect, it, vi } from 'vitest';
import { generateText, streamText } from 'ai';
import { createPiProviderModel } from './pi-provider';
import { modelFor } from './provider-factory';

const full = (message: Record<string, unknown> = { role: 'assistant', content: '完整正文' }, finish_reason = 'stop') => ({
  id: 'completion-fixture', object: 'chat.completion', created: 1, model: 'fixture',
  choices: [{ index: 0, message, finish_reason }],
  usage: { prompt_tokens: 20, completion_tokens: 12, total_tokens: 32, prompt_tokens_details: { cached_tokens: 3 }, completion_tokens_details: { reasoning_tokens: 2 } },
});
async function http(body: unknown, action: (baseUrl: string) => Promise<void>, contentType = 'application/json') {
  let requests = 0;
  const log = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const server = createServer(async (req, res) => {
    for await (const _ of req) { /* 实际消费SDK请求。 */ }
    requests++;
    res.writeHead(200, { 'content-type': contentType });
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    await action(`http://127.0.0.1:${(server.address() as { port: number }).port}/v1`);
    expect(requests).toBe(1);
    expect(JSON.stringify(log.mock.calls)).not.toContain('synthetic-token');
  } finally {
    log.mockRestore(); server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}
const spec = (baseUrl: string) => ({ apiFormat: 'openai_chat' as const, model: 'fixture', baseUrl, token: 'synthetic-token' });
const request = () => ({ prompt: [{ role: 'user' as const, content: [{ type: 'text' as const, text: '协议测试' }] }], abortSignal: AbortSignal.timeout(120_000), maxOutputTokens: 128 });

it.each(['generate', 'stream'] as const)('完整JSON经实际SDK %s入口仅一次HTTP即返回正文', async kind => {
  await http(full(), async baseUrl => {
    const options = { model: modelFor(spec(baseUrl)), prompt: '协议测试', maxRetries: 0, abortSignal: AbortSignal.timeout(120_000) };
    const result = kind === 'generate' ? await generateText(options) : streamText(options);
    expect(await result.text).toBe('完整正文');
    expect(await result.finishReason).toBe('stop');
    expect((await result.usage).totalTokens).toBe(32);
  });
}, 180_000);

it('JSON正文、reasoning、多工具、参数与usage保留供应商真实事实', async () => {
  const message = { role: 'assistant', content: '正文', reasoning_content: '推理', tool_calls: [
    { id: 'tool-one', type: 'function', function: { name: 'first', arguments: '{"value":1}' } },
    { id: 'tool-two', type: 'function', function: { name: 'second', arguments: '{"text":"中文"}' } },
  ] };
  await http(full(message, 'tool_calls'), async baseUrl => {
    const result = await createPiProviderModel(spec(baseUrl)).doGenerate(request());
    expect(result.content).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'text', text: '正文' }),
      expect.objectContaining({ type: 'reasoning', text: '推理' }),
      expect.objectContaining({ type: 'tool-call', toolCallId: 'tool-one', toolName: 'first', input: '{"value":1}' }),
      expect.objectContaining({ type: 'tool-call', toolCallId: 'tool-two', toolName: 'second', input: '{"text":"中文"}' }),
    ]));
    expect(result.finishReason.unified).toBe('tool-calls');
    expect(result.response?.id).toBe('completion-fixture');
    expect(result.usage).toMatchObject({ inputTokens: { total: 20, cacheRead: 3 }, outputTokens: { total: 12, reasoning: 2 } });
  });
}, 180_000);

it.each(['length', 'content_filter', 'end'])('完整JSON保留终止语义 %s', async reason => {
  await http(full({ role: 'assistant', content: reason === 'content_filter' ? null : '正文' }, reason), async baseUrl => {
    const result = await createPiProviderModel(spec(baseUrl)).doGenerate(request());
    expect(result.finishReason.unified).toBe(reason === 'length' ? 'length' : reason === 'end' ? 'stop' : 'content-filter');
  });
}, 180_000);

it.each(['absent', 'extensions'])('JSON用量%s时不编造计量、不因未消费扩展阻断正文', async mode => {
  const body: Record<string, unknown> = full();
  if (mode === 'absent') delete body.usage;
  else body.usage = { ...full().usage, prompt_tokens_details: { cached_tokens: 3, provider_extension: { future: true } } };
  await http(body, async baseUrl => {
    const result = await createPiProviderModel(spec(baseUrl)).doGenerate(request());
    expect(result.content).toContainEqual({ type: 'text', text: '完整正文' });
    expect(result.usage.inputTokens.total).toBe(mode === 'absent' ? undefined : 20);
  });
}, 180_000);

it('JSON媒体类型带charset或+json仍消费完整响应', async () => {
  await http(full(), async baseUrl => {
    expect((await createPiProviderModel(spec(baseUrl)).doGenerate(request())).content).toContainEqual({ type: 'text', text: '完整正文' });
  }, 'application/vnd.fixture+json; charset=utf-8');
}, 180_000);

const invalid: [string, unknown][] = [
  ['截断JSON', '{"object":"chat.completion","choices":['],
  ['缺结束事实', { ...full(), choices: [{ index: 0, message: { role: 'assistant', content: '未确认' }, finish_reason: null }] }],
  ['错误对象', { error: { message: 'fixture error' } }],
  ['未知结束码', full(undefined, 'unknown-provider-reason')],
  ['非assistant', full({ role: 'user', content: '错误角色' })],
  ['错误正文类型', full({ role: 'assistant', content: { text: '错误形状' } })],
  ['多个choice', { ...full(), choices: [...full().choices, { ...full().choices[0], index: 1 }] }],
  ['坏工具参数', full({ role: 'assistant', content: null, tool_calls: [{ id: 'tool', type: 'function', function: { name: 'tool', arguments: '{"unfinished":' } }] }, 'tool_calls')],
  ['工具缺ID', full({ role: 'assistant', content: null, tool_calls: [{ type: 'function', function: { name: 'tool', arguments: '{}' } }] }, 'tool_calls')],
  ['已消费用量非法', { ...full(), usage: { ...full().usage, prompt_tokens_details: { cached_tokens: -1 } } }],
];
it.each(invalid)('不完整/非法JSON保持未知且不重发：%s', async (_label, body) => {
  await http(body, async baseUrl => {
    await expect(createPiProviderModel(spec(baseUrl)).doGenerate(request())).rejects.toThrow('PI_MODEL_STREAM_RESULT_UNKNOWN');
  });
}, 180_000);
