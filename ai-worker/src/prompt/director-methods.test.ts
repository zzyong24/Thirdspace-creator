import { beforeEach, describe, expect, it } from 'vitest';
import { _resetRegistry, getTemplate, getOfficialSkillBase, registerAllTemplates } from './registry';
import { bindPrompt } from './template';

describe('T-944 编导方法实际装配边界', () => {
 beforeEach(() => { _resetRegistry(); registerAllTemplates(); });
 it('逐字分镜节点不会再注入要求重写开头与正文的写手方法', () => {
  const tpl = getTemplate('script.storyboard.segment');
  const bound = bindPrompt(tpl, {voiceover: '用户的原稿。\n保留此句。', voiceoverSha256: 'frozen'});
  expect(bound.prompt).toContain('用户的原稿。\n保留此句。');
  expect(bound.system).not.toContain('【写稿与改稿】');
  expect(bound.prompt).toContain('逐字符完全相同');
 });
 it.each(['script.draft', 'script.voiceover.compose'])('%s 不再同时要求因果论证与少论证多断言', id => {
  const bound = bindPrompt(getTemplate(id), {positioning:'教普通人修理自行车', sourceMaterials:'刹车片已磨损；尚无维修效果数据。', sourceInstruction:'先解释检查办法。'});
  expect(bound.prompt).toContain('刹车片已磨损；尚无维修效果数据。');
  expect(bound.prompt + bound.system).not.toContain('少论证、多断言');
  expect(bound.prompt).not.toContain('按结构方案的段落顺序展开');
  expect(bound.prompt).not.toContain('违反=废稿');
 });
 it.each(['intelligence.topic-from-decomposition', 'intelligence.topic-adapted-draft', 'script.voiceover.compose', 'method.topic', 'method.writing'])('%s 实际可见三种目的与独立表现形式方法', id => {
  const tpl = getTemplate(id);
  const bound = bindPrompt(tpl, { ...Object.fromEntries(tpl.requiredFacets.map(key => [key, '真实测试输入'])), positioning:'服务线下门店', topicCandidate: JSON.stringify({contentRole:'conversion',contentRoleReason:'原作科普，本账号有服务证据，帮助顾客决策。'}) });
  expect(bound.system).toContain('traffic 流量型');
  expect(bound.system).toContain('trust 信任型');
  expect(bound.system).toContain('conversion 获客型');
  expect(bound.system).toContain('表现形式是另一维');
  if (id === 'intelligence.topic-adapted-draft') expect(bound.prompt).toContain('"contentRole":"conversion"');
 });
 it('方法正文更新同时更新管理端版本且不把新写规则注入冻结分镜', () => {
  const official = getOfficialSkillBase('method.writing');
  if (!official) throw new Error('官方写作方法缺失');
  expect(official.baseVersion).not.toBe('v1');
  expect(official.methodSystem).toBe(getTemplate('method.writing').system);
 });
});
