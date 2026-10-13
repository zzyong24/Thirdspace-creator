import { describe, expect, it } from 'vitest';
import type { ProductionReferencePlan } from '../../../../contract/src/resources/reference-editor';
import { readNativeScriptMarkdown, planNativeScriptMarkdown } from './production-script-markdown';

function fixture(): ProductionReferencePlan {
  const source = (suffix: string) => ({ sourceId: `source-${suffix}`, assetId: `asset-${suffix}`, assetFileId: `file-${suffix}`, fileDigest: 'a'.repeat(64), probeDigest: 'b'.repeat(64), timebase: { num: 1, den: 1000 }, durationTicks: 10000, hasAudio: true });
  const element = (id: string, mediaId: string, startTime: number, duration: number, trimStart = 0) => ({ id, name: id, type: 'video' as const, mediaId, startTime, duration, trimStart, trimEnd: 1200000 - trimStart - duration, sourceDuration: 1200000, params: { volume: -6, 'transform.scaleX': 1 }, effects: [{ id: 'fx', type: 'blur', params: { intensity: 2 }, enabled: true }], legacyExtension: { crop: [1, 2] } });
  const scene = { id: 'scene', name: '真实场景', isMain: true, createdAt: '2026-10-13', updatedAt: '2026-10-13', bookmarks: [{ time: 123, note: '原书签' }], sceneExtension: { retained: true }, tracks: { main: { id: 'main', name: '主轨', type: 'video', hidden: false, muted: false, trackExtension: { retained: true }, elements: [element('a1', 'm-a', 120000, 240000), element('b1', 'm-b', 480000, 120000, 240000), element('a2', 'm-a', 720000, 120000)] }, overlay: [{ id: 'captions', name: '字幕', type: 'text', hidden: false, elements: [{ id: 'caption', name: '字幕', type: 'text', startTime: 0, duration: 1000000, trimStart: 0, trimEnd: 0, params: { content: '原字幕', oldPrivate: true }, extension: { old: 7 } }] }], audio: [{ id: 'audio', name: '声音', type: 'audio', muted: false, elements: [{ ...element('sound', 'm-b', 60000, 120000), type: 'audio', sourceType: 'upload', params: { volume: -12 } }] }] } };
  return { editorVersion: 3, referenceEditor: { editor: 'opencut-classic', revision: 'c'.repeat(40), mediaRefs: ['a', 'b'].map(s => ({ mediaId: `m-${s}`, assetId: `asset-${s}`, assetFileId: `file-${s}` })), nativeDocument: { version: 31, currentSceneId: 'scene', metadata: { id: 'project', preserved: 3 }, settings: { fps: { numerator: 24000, denominator: 1001 } }, scenes: [scene, { ...structuredClone(scene), id: 'other-scene' }] } }, nativeSources: ['a', 'b'].map(s => ({ mediaId: `m-${s}`, source: source(s) })), sourceTranscripts: ['a', 'b'].map(s => ({ transcriptId: `transcript-${s}`, sourceId: `source-${s}`, assetFileId: `file-${s}`, audioDigest: 'd'.repeat(64), providerReceiptId: `receipt-${s}`, providerEvidence: {}, granularity: 'word', text: '甲乙', tokens: [{ tokenId: 'local-1', text: '甲', startTicks: 0, endTicks: 500 }, { tokenId: 'local-2', text: '乙', startTicks: 1000, endTicks: 1500 }] })) } as ProductionReferencePlan;
}
function scene(plan: ProductionReferencePlan): any { return (plan.referenceEditor.nativeDocument.scenes as any[])[0]; }
function proposal(plan: ProductionReferencePlan, markdown?: string, trackIds?: string[]) {
  const read = readNativeScriptMarkdown(plan, 'scene', trackIds);
  return planNativeScriptMarkdown(plan, 'scene', { markdown: markdown ?? read.markdown, declaredTrackIds: read.tracks.map(t => t.trackId), stateStamp: read.stateStamp, libraryStamp: read.libraryStamp });
}
function block(markdown: string, id: string): string {
  const lines = markdown.split('\n');
  const start = lines.findIndex(l => l.includes(`markdown-state:item:${encodeURIComponent(id)}`));
  if (start < 0) throw new Error(`缺片段${id}`);
  let end = start + 1;
  while (end < lines.length && !/^\s*(?:\[c\d+\]|\[gap |#{2,3} )/.test(lines[end]!)) end++;
  return lines.slice(start, end).join('\n');
}

describe('T1274 Native Markdown projection / candidate', () => {
  it('不改Markdown是精确no-op：A-B-A/gap/段内停顿/多轨/未知配置/非30fps全保真且不改输入', () => {
    const plan = fixture(), before = structuredClone(plan), read = readNativeScriptMarkdown(plan, 'scene');
    expect(read.formatVersion).toBe(1); expect(read.scopeComplete).toBe(true);
    expect(read.stateStamp).toMatch(/^sha256:[a-f0-9]{64}$/); expect(read.libraryStamp).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(read.markdown.match(/markdown-state:source:m-a/g)).toHaveLength(2);
    expect(read.markdown).toContain('[gap 120000t]'); expect(read.markdown).toContain('[silence=60000t]');
    const result = proposal(plan); expect(result.scene).toEqual(scene(plan)); expect(result.operations).toEqual([]); expect(result.errors).toEqual([]); expect(plan).toEqual(before);
  });
  it('保留真实rate，不把显示fps重写成30fps', () => {
    const plan = fixture(); const first = scene(plan).tracks.main.elements[0]; first.retime = { rate: 2, maintainPitch: false }; first.duration = 120000;
    const result = proposal(plan); expect(result.errors).toEqual([]); expect(result.scene).toEqual(scene(plan));
  });
  it('错stamp/错scene/source变更拒绝且保原', () => {
    const plan = fixture(), read = readNativeScriptMarkdown(plan, 'scene');
    const result = planNativeScriptMarkdown(plan, 'scene', { markdown: read.markdown, declaredTrackIds: read.tracks.map(t => t.trackId), stateStamp: 'sha256:' + '0'.repeat(64), libraryStamp: read.libraryStamp });
    expect(result.errors.length).toBeGreaterThan(0); expect(result.scene).toEqual(scene(plan)); expect(result.operations).toEqual([]);
    expect(proposal(plan, read.markdown.replace('markdown-state:timeline:scene', 'markdown-state:timeline:other-scene')).errors.length).toBeGreaterThan(0);
    const changed = structuredClone(plan); changed.nativeSources![0]!.source.fileDigest = 'f'.repeat(64);
    expect(planNativeScriptMarkdown(changed, 'scene', { markdown: read.markdown, declaredTrackIds: read.tracks.map(t => t.trackId), stateStamp: read.stateStamp, libraryStamp: read.libraryStamp }).errors.length).toBeGreaterThan(0);
  });
  it('canonical stamp覆盖同长度文字、整个源库与未选scene/文件身份，键顺序不影响', () => {
    const plan = fixture(), read = readNativeScriptMarkdown(plan, 'scene', ['main']);
    const changed = structuredClone(plan); changed.sourceTranscripts![0]!.text = '丙丁';
    expect(readNativeScriptMarkdown(changed, 'scene', ['main']).libraryStamp).not.toBe(read.libraryStamp);
    const other = structuredClone(plan); (other.referenceEditor.nativeDocument.scenes as any[])[1].sceneExtension.retained = false;
    expect(readNativeScriptMarkdown(other, 'scene', ['main']).stateStamp).not.toBe(read.stateStamp);
    const keyOrder = structuredClone(plan); const e = scene(keyOrder).tracks.main.elements[0]; e.params = { 'transform.scaleX': 1, volume: -6 };
    expect(readNativeScriptMarkdown(keyOrder, 'scene', ['main']).stateStamp).toBe(read.stateStamp);
  });
  it('唯一可信base可以恢复缺元信息marker，但缺body或scope不可推断删除', () => {
    const plan = fixture(), read = readNativeScriptMarkdown(plan, 'scene');
    const noStamp = read.markdown.replace(/<!-- markdown-state:(?:stamp|lib-stamp|timeline):[^\n]+ -->\n/g, '');
    const result = proposal(plan, noStamp); expect(result.errors).toEqual([]); expect(result.warnings.length).toBeGreaterThan(0); expect(result.scene).toEqual(scene(plan));
    expect(proposal(plan, read.markdown.replace('<!-- markdown-state:body -->', '')).errors.length).toBeGreaterThan(0);
    expect(proposal(plan, read.markdown.replace(/<!-- markdown-state:scope:[^\n]+ -->/g, '')).errors.length).toBeGreaterThan(0);
  });
  it('完整声明集合才允许删除，未选轨/保护图层/原参数保持', () => {
    const plan = fixture(), read = readNativeScriptMarkdown(plan, 'scene', ['main']);
    const md = read.markdown.replace(block(read.markdown, 'b1'), '');
    const result = proposal(plan, md, ['main']); expect(result.errors).toEqual([]); expect(result.operations).toContainEqual({ kind: 'delete', trackId: 'main', elementId: 'b1' });
    expect(result.scene.tracks.overlay).toEqual(scene(plan).tracks.overlay); expect(result.scene.tracks.audio).toEqual(scene(plan).tracks.audio);
    expect(result.scene.tracks.main.elements[0]).toEqual(scene(plan).tracks.main.elements[0]);
    expect(proposal(plan, read.markdown.replace('## V1', '## V9'), ['main']).errors.length).toBeGreaterThan(0);
  });
  it('重排使用源真实ticks并继承裁切/音量/效果/未知字段', () => {
    const plan = fixture(), read = readNativeScriptMarkdown(plan, 'scene', ['main']);
    const first = block(read.markdown, 'a1'), second = block(read.markdown, 'b1');
    const md = read.markdown.replace(first, '__FIRST__').replace(second, first).replace('__FIRST__', second);
    // 源header也按片段显式绑定：交换前同步区段身份，不能猜素材。
    const swapped = md.replace('### asset-a <!-- markdown-state:source:m-a:asset-a -->', '### asset-b <!-- markdown-state:source:m-b:asset-b -->').replace('### asset-b <!-- markdown-state:source:m-b:asset-b -->\n' + first, '### asset-a <!-- markdown-state:source:m-a:asset-a -->\n' + first);
    const result = proposal(plan, swapped, ['main']); expect(result.errors).toEqual([]);
    const moved = result.scene.tracks.main.elements.find(e => e.id === 'b1')!; expect(moved.startTime).toBe(120000); expect(moved.params).toEqual(scene(plan).tracks.main.elements[1].params); expect(moved.legacyExtension).toEqual({ crop: [1, 2] });
  });
  it('复制保原ID，clone继承丰富配置和附件；新增来自明确source metadata', () => {
    const plan = fixture(), read = readNativeScriptMarkdown(plan, 'scene', ['main']);
    const first = block(read.markdown, 'a1'); const duplicate = read.markdown.replace(first, first + '\n' + first);
    const result = proposal(plan, duplicate, ['main']); expect(result.errors).toEqual([]);
    const copies = result.scene.tracks.main.elements.filter(e => e.mediaId === 'm-a' && e.trimStart === 0 && e.duration === 240000); expect(copies).toHaveLength(2); expect(new Set(copies.map(e => e.id)).size).toBe(2);
    expect(copies[1]!.effects).toEqual(copies[0]!.effects); expect(copies[1]!.legacyExtension).toEqual(copies[0]!.legacyExtension); expect(copies[1]!.params).toEqual(copies[0]!.params);
    const fresh = proposal(plan, read.markdown + '\n### asset-b <!-- markdown-state:source:m-b:asset-b -->\n[clip source=480000..600000t rate=1]\n', ['main']);
    expect(fresh.errors).toEqual([]); const added = fresh.scene.tracks.main.elements.find(e => e.trimStart === 480000)!; expect(added.mediaId).toBe('m-b'); expect(added.duration).toBe(120000); expect(added.trimEnd).toBe(600000);
  });
  it('词删除依真实timebase切分/继承rate，不按文字估时，停顿保留', () => {
    const plan = fixture(), read = readNativeScriptMarkdown(plan, 'scene', ['main']), first = block(read.markdown, 'a1');
    const result = proposal(plan, read.markdown.replace(first, first.replace('[s1] 甲', '~~[s1] 甲~~')), ['main']);
    expect(result.errors).toEqual([]); const kept = result.scene.tracks.main.elements.find(e => e.id === 'a1')!; expect(kept.trimStart).toBe(60000); expect(kept.duration).toBe(180000); expect(kept.params).toEqual(scene(plan).tracks.main.elements[0].params);
    expect(result.scene.tracks.main.elements.find(e => e.id === 'a2')!.startTime).toBe(660000);
  });
  it('重复localID按asset复合；误编号只能同素材唯一文本纠正', () => {
    const plan = fixture(), read = readNativeScriptMarkdown(plan, 'scene', ['main']), first = block(read.markdown, 'a1');
    const result = proposal(plan, read.markdown.replace(first, first.replace('[s1] 甲', '[s999] 甲')), ['main']); expect(result.errors).toEqual([]); expect(result.warnings.join('\n')).toContain('自动纠正'); expect(result.scene).toEqual(scene(plan));
    expect(read.libraryDocs.map(d => d.assetId)).toEqual(['asset-a', 'asset-b']);
    expect(read.libraryDocs.every(d => d.content.includes('[s1] 甲'))).toBe(true);
  });
  it('重复文本不猜；可独立定位坏片段保原并warning，其他合法轨道仍候选', () => {
    const plan = fixture(); const transcript = plan.sourceTranscripts![0]! as any; transcript.tokens.push({ tokenId: 'local-3', text: '甲', startTicks: 2500, endTicks: 3000 });
    const read = readNativeScriptMarkdown(plan, 'scene'), first = block(read.markdown, 'a1'), sound = block(read.markdown, 'sound');
    const md = read.markdown.replace(first, first.replace('[s1] 甲', '[s999] 甲')).replace(sound, '');
    const result = proposal(plan, md); expect(result.errors).toEqual([]); expect(result.warnings.join('\n')).toContain('保留原片段');
    expect(result.scene.tracks.main.elements).toEqual(scene(plan).tracks.main.elements); expect(result.scene.tracks.audio[0]!.elements).toEqual([]);
  });
  it('不能隔离未知语法/轨道身份时保整轨并errors；其他轨修改继续', () => {
    const plan = fixture(), read = readNativeScriptMarkdown(plan, 'scene'); const sound = block(read.markdown, 'sound');
    const md = read.markdown.replace('## V1', '## V1\n非法未知行').replace(sound, '');
    const result = proposal(plan, md); expect(result.errors.length).toBeGreaterThan(0); expect(result.scene.tracks.main).toEqual(scene(plan).tracks.main); expect(result.scene.tracks.audio[0]!.elements).toEqual([]);
  });
  it('停顿缺行/擅自缩短保持听审边界，保原且不自动删静音', () => {
    const plan = fixture(), read = readNativeScriptMarkdown(plan, 'scene', ['main']);
    const result = proposal(plan, read.markdown.replace('[silence=60000t]', '[silence=0t]'), ['main']); expect(result.errors).toEqual([]); expect(result.warnings.join('\n')).toContain('听审'); expect(result.scene).toEqual(scene(plan));
  });
  it('无词级输入仅完整clip可编辑，segment粒度只精确句级，不能任意字符映射', () => {
    const plan = fixture(); plan.sourceTranscripts = plan.sourceTranscripts!.map(t => ({ transcriptId: t.transcriptId, sourceId: t.sourceId, assetFileId: t.assetFileId, audioDigest: t.audioDigest, providerReceiptId: t.providerReceiptId, providerEvidence: {}, granularity: 'text', text: '缺词级时码' }));
    const read = readNativeScriptMarkdown(plan, 'scene', ['main']); expect(read.markdown).not.toContain('[s1]'); expect(proposal(plan).scene).toEqual(scene(plan));
    const first = block(read.markdown, 'a1'); const result = proposal(plan, read.markdown.replace(first, first + '\n[s1] 缺词级时码'), ['main']); expect(result.warnings.join('\n')).toContain('保留原片段'); expect(result.scene).toEqual(scene(plan));
  });
  it('重叠/缺probe/不支持元素归保护集合，省略也不删除', () => {
    const plan = fixture(); scene(plan).tracks.main.elements.push({ id: 'unknown', type: 'unsupported-layer', startTime: 400000, duration: 10000, trimStart: 0, trimEnd: 0, params: { private: true } });
    const read = readNativeScriptMarkdown(plan, 'scene', ['main']); expect(read.tracks[0]!.protectedElementIds).toContain('unknown');
    const result = proposal(plan, read.markdown.replace(block(read.markdown, 'b1'), ''), ['main']); expect(result.scene.tracks.main.elements.find(e => e.id === 'unknown')).toEqual(scene(plan).tracks.main.elements.find((e: any) => e.id === 'unknown'));
  });
  it('未知rich参数clone未获validator允许时保轨，不伪造合法新元素', () => {
    const plan = fixture(); scene(plan).tracks.main.elements[0].params.privateOld = { x: 1 }; const read = readNativeScriptMarkdown(plan, 'scene', ['main']), first = block(read.markdown, 'a1');
    const result = proposal(plan, read.markdown.replace(first, first + '\n' + first), ['main']); expect(result.errors.length).toBeGreaterThan(0); expect(result.scene).toEqual(scene(plan));
  });
  it('原unknown类型不修改时精确no-op不被新增validator反杀', () => {
    const plan = fixture(); scene(plan).tracks.main.elements.push({ id: 'unknown', type: 'future-native-layer', startTime: 400000, duration: 10000, trimStart: 0, trimEnd: 0, params: { future: 1 } });
    const result = proposal(plan); expect(result.errors).toEqual([]); expect(result.operations).toEqual([]); expect(result.scene).toEqual(scene(plan));
  });
  it('非法声明轨道返回可修复错误而不抛崩服务', () => {
    const plan = fixture(), read = readNativeScriptMarkdown(plan, 'scene');
    const input = { markdown: read.markdown, declaredTrackIds: ['missing'], stateStamp: read.stateStamp, libraryStamp: read.libraryStamp };
    expect(() => planNativeScriptMarkdown(plan, 'scene', input)).not.toThrow();
    expect(planNativeScriptMarkdown(plan, 'scene', input).errors.length).toBeGreaterThan(0);
    expect(planNativeScriptMarkdown(plan, 'scene', { ...input, declaredTrackIds: ['main', 'main'] }).scene).toEqual(scene(plan));
  });
  it('真实48000 timebase及rate=2的词切分按源ticks数学，不按字符/fps', () => {
    const plan = fixture(); const source = plan.nativeSources![0]!.source; source.timebase = { num: 1, den: 48000 }; source.durationTicks = 480000;
    const transcript = plan.sourceTranscripts![0]! as any; transcript.tokens = [{ tokenId: 'w1', text: '甲', startTicks: 0, endTicks: 24000 }, { tokenId: 'w2', text: '乙', startTicks: 48000, endTicks: 72000 }];
    const old = scene(plan).tracks.main.elements[0]; old.retime = { rate: 2, maintainPitch: true }; old.duration = 120000;
    const read = readNativeScriptMarkdown(plan, 'scene', ['main']), first = block(read.markdown, 'a1');
    const result = proposal(plan, read.markdown.replace(first, first.replace('[s1] 甲', '~~[s1] 甲~~')), ['main']);
    expect(result.errors).toEqual([]); const next = result.scene.tracks.main.elements.find(e => e.id === 'a1')!;
    expect(next.trimStart).toBe(60000); expect(next.duration).toBe(90000); expect(next.retime).toEqual({ rate: 2, maintainPitch: true });
  });
  it('非格点词时码不给假锚，segment粒度允许整句、不允许字符切片', () => {
    const plan = fixture(); const source = plan.nativeSources![0]!.source; source.timebase = { num: 1, den: 90000 }; source.durationTicks = 900000;
    const transcript = plan.sourceTranscripts![0]! as any; transcript.tokens = [{ tokenId: 'fraction', text: '不落格', startTicks: 1, endTicks: 2 }];
    const read = readNativeScriptMarkdown(plan, 'scene', ['main']); expect(read.libraryDocs.find(d => d.mediaId === 'm-a')!.content).not.toContain('[s1]'); expect(proposal(plan, read.markdown, ['main']).scene).toEqual(scene(plan));
    source.timebase = { num: 1, den: 1000 }; source.durationTicks = 10000; transcript.granularity = 'segment'; transcript.tokens = [{ tokenId: 'sentence', text: '完整句子', startTicks: 0, endTicks: 500 }];
    const sentence = readNativeScriptMarkdown(plan, 'scene', ['main']), first = block(sentence.markdown, 'a1');
    const result = proposal(plan, sentence.markdown.replace(first, first.replace('[s1] 完整句子', '[s1] 完整')), ['main']);
    expect(result.warnings.join('')).toContain('保留原片段'); expect(result.scene).toEqual(scene(plan));
  });
  it('坏片段被前序ripple影响时不错误局部恢复，整轨保原', () => {
    const plan = fixture(), read = readNativeScriptMarkdown(plan, 'scene', ['main']); const first = block(read.markdown, 'a1'), last = block(read.markdown, 'a2');
    const md = read.markdown.replace(first, '').replace(last, last.replace('[s1] 甲', '[s999] 不存在'));
    const result = proposal(plan, md, ['main']); expect(result.errors.length).toBeGreaterThan(0); expect(result.scene.tracks.main).toEqual(scene(plan).tracks.main);
  });
  it('删除中间词保留实际间隔并clone两侧原配置，不裁动画超界', () => {
    const plan = fixture(), transcript = plan.sourceTranscripts![0]! as any;
    transcript.tokens = [{ tokenId: 'one', text: '一', startTicks: 0, endTicks: 500 }, { tokenId: 'two', text: '二', startTicks: 500, endTicks: 1000 }, { tokenId: 'three', text: '三', startTicks: 1000, endTicks: 1500 }];
    const read = readNativeScriptMarkdown(plan, 'scene', ['main']), first = block(read.markdown, 'a1');
    const result = proposal(plan, read.markdown.replace(first, first.replace('[s2] 二', '~~[s2] 二~~')), ['main']);
    expect(result.errors).toEqual([]); const head = result.scene.tracks.main.elements.find(e => e.id === 'a1')!; expect(head.duration).toBe(60000);
    const tail = result.scene.tracks.main.elements.find(e => e.mediaId === 'm-a' && e.trimStart === 120000)!; expect(tail.duration).toBe(120000); expect(tail.effects).toEqual(head.effects); expect(tail.params).toEqual(head.params);
    scene(plan).tracks.main.elements[0].animations = { volume: { keys: [{ id: 'key', time: 200000, value: -6, segmentToNext: 'linear', tangentMode: 'auto' }] } };
    const richRead = readNativeScriptMarkdown(plan, 'scene', ['main']), richFirst = block(richRead.markdown, 'a1');
    const blocked = proposal(plan, richRead.markdown.replace(richFirst, richFirst.replace('[s2] 二', '~~[s2] 二~~')), ['main']); expect(blocked.errors.length).toBeGreaterThan(0); expect(blocked.scene).toEqual(scene(plan));
  });

  it('明确image文件clip不需要视频probe：编辑/复制保旧配置，无probe视频保护', () => {
    const plan = fixture(); plan.referenceEditor.mediaRefs.push({ mediaId: 'image-media', assetId: 'image-asset', assetFileId: 'image-file' });
    scene(plan).tracks.main.elements.push({ id: 'image-clip', name: '原图片', type: 'image', mediaId: 'image-media', startTime: 960000, duration: 60000, trimStart: 0, trimEnd: 0, params: { opacity: .7 }, cropExtension: { original: true } });
    const read = readNativeScriptMarkdown(plan, 'scene', ['main']); expect(read.tracks[0]!.editableElementIds).toContain('image-clip');
    const image = block(read.markdown, 'image-clip'), result = proposal(plan, read.markdown.replace(image, image + '\n' + image), ['main']);
    expect(result.errors).toEqual([]); expect(result.scene.tracks.main.elements.filter(e => e.type === 'image')).toHaveLength(2);
    expect(result.scene.tracks.main.elements.find(e => e.type === 'image' && e.id !== 'image-clip')!.cropExtension).toEqual({ original: true });
    plan.nativeSources = plan.nativeSources!.filter(s => s.mediaId !== 'm-a');
    plan.sourceTranscripts = plan.sourceTranscripts!.filter(t => t.sourceId !== 'source-a');
    const protectedRead = readNativeScriptMarkdown(plan, 'scene', ['main']); expect(protectedRead.tracks[0]!.protectedElementIds).toEqual(expect.arrayContaining(['a1', 'a2']));
  });

  it('同素材下一cN语法损坏不能落入前组而被推定删除', () => {
    const plan = fixture(), main = scene(plan).tracks.main; main.elements = [main.elements[0], main.elements[2]]; main.elements[1].startTime = 360000;
    const read = readNativeScriptMarkdown(plan, 'scene', ['main']), second = block(read.markdown, 'a2');
    const damaged = read.markdown.replace(second, second.replace(/\[c\d+\] \d+t/, '[c2] 坏时长'));
    const result = proposal(plan, damaged, ['main']); expect(result.scene).toEqual(scene(plan)); expect(result.operations).toEqual([]); expect(result.warnings.length + result.errors.length).toBeGreaterThan(0);
  });

});
