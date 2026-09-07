import { describe, it, expect, vi } from 'vitest';
import { runTranscriptPostprocessRuntime } from './transcript-postprocess';
const fixture = vi.hoisted(() => ({model: {}, node: vi.fn(), modelFor: vi.fn()}));
vi.mock('./provider-factory', () => ({modelFor: fixture.modelFor.mockImplementation(() => fixture.model)}));
vi.mock('../nodes/structured-node', () => ({runStructuredNode: fixture.node}));
const spec = {apiFormat: 'openai_chat' as const, baseUrl: 'https://fixture.invalid', model: 'fixture', token: 'fixture'};
describe('后处理默认执行路径', () => {
 it('结构化节点收到同一取消信号、输出上限和原有模板', async () => {
  const controller = new AbortController();
  fixture.node.mockResolvedValueOnce({object: {correctedText: '你好，世界。'}});
  expect(await runTranscriptPostprocessRuntime(spec, {transcript: '你好世界', signal: controller.signal, maxOutputTokens: 321})).toEqual({applied: true, transcript: '你好，世界。'});
  expect(fixture.node).toHaveBeenLastCalledWith(expect.objectContaining({model: fixture.model, signal: controller.signal, maxOutputTokens: 321, template: expect.objectContaining({id: 'transcript.postprocess.inline'})}));
 });
 it('预先取消在空原文短路前被识别，不调用模型', async () => {
  const controller = new AbortController(); controller.abort();
  fixture.node.mockClear();
  await expect(runTranscriptPostprocessRuntime(spec, {transcript: '', signal: controller.signal})).rejects.toMatchObject({name: 'AbortError'});
  expect(fixture.node).not.toHaveBeenCalled();
 });
 it('注入已有账本模型时不另建裸模型', async () => {
  const model = 'fixture-durable-model';
  fixture.modelFor.mockClear();
  fixture.node.mockResolvedValueOnce({object: {correctedText: '你好，世界。'}});
  await runTranscriptPostprocessRuntime(spec, {transcript: '你好世界'}, {model});
  expect(fixture.node).toHaveBeenLastCalledWith(expect.objectContaining({model}));
  expect(fixture.modelFor).not.toHaveBeenCalled();
 });

});
