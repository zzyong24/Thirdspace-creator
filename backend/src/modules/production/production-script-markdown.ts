import { createHash } from 'node:crypto';
import { productionReferencePlan, type ProductionReferencePlan } from '../../../../contract/src/resources/reference-editor';
import { readProductionNativeScene, sourceNativeTickExact, type ProductionNativeScene, type ProductionNativeTrack, type ProductionNativeElement } from '../../../../contract/src/resources/production-native-rough';
import { validateNativeSceneTracksCandidate, type NativeSerializedScene, type NativeSerializedTimelineTracks, type ProductionNativeMedia } from '../../../../contract/src/resources/production-native-document';
import { mapPlannedToOriginals, type PlannedItem, type OriginalItem } from './chatcut-script-core/diff';
import { sameAnchorText, uniqueTextAnchor } from './chatcut-script-core/normalize';
import { SCRIPT_BODY_MARKER, ROW_PATTERNS, markerValues, encodeIdentity, decodeIdentity, unstrike } from './chatcut-script-core/format';

/** 04/22→28→19→35适配：纯工程投影与候选，不持有数据库/任务/媒体运行时。
 * SEMANTIC_BOUNDARY_ALLOW: 只落实显式轨道/词句删留与源时间，不理解用户意图，不判静音或创作内容。
 * 逐项来源、原代码块与修改记录见chatcut-script-core/README.md。
 */
export interface NativeScriptMarkdownError { line: number; message: string; hint?: string }
export interface NativeScriptMarkdownTrack { alias: string; trackId: string; type: string; editableElementIds: string[]; protectedElementIds: string[] }
export interface NativeScriptMarkdownRead {
  formatVersion: 1; sceneId: string; stateStamp: string; libraryStamp: string; markdown: string;
  libraryDocs: Array<{ mediaId: string; assetId: string; content: string }>;
  tracks: NativeScriptMarkdownTrack[]; scopeComplete: true;
}
export interface NativeScriptMarkdownInput { markdown: string; declaredTrackIds: string[]; stateStamp: string; libraryStamp: string }
export interface NativeScriptMarkdownResult {
  scene: NativeSerializedScene; warnings: string[]; errors: NativeScriptMarkdownError[];
  operations: Array<{ kind: string; trackId: string; elementId: string }>;
}
type Source = NonNullable<ProductionReferencePlan['nativeSources']>[number]['source'];
interface Anchor { localId: number; tokenId: string; transcriptId: string; text: string; start: number; end: number; granularity: 'word' | 'segment' }
interface SourceInfo { mediaId: string; assetId: string; assetFileId: string; source?: Source; duration: number | null; kind: 'video' | 'audio' | 'image'; anchors: Anchor[] }
interface Chunk { kind: 'segment' | 'silence'; start: number; end: number; anchor?: Anchor }
interface ClipInfo { alias: number; element: ProductionNativeElement; source: SourceInfo; start: number; end: number; rate: number; chunks: Chunk[] }
interface TrackInfo { descriptor: NativeScriptMarkdownTrack; track: ProductionNativeTrack; clips: ClipInfo[] }
interface Snapshot { plan: ProductionReferencePlan; scene: ProductionNativeScene; tracks: TrackInfo[]; sources: Map<string, SourceInfo>; stateStamp: string; libraryStamp: string }
interface Group { line: number; clip?: ClipInfo; source?: SourceInfo; start: number; end: number; rate: number; duration: number; dropped: boolean; children: Array<{ line: number; raw: string }>; errors: NativeScriptMarkdownError[] }
interface TrackRows { info: TrackInfo; line: number; scope: boolean; events: Array<{ kind: 'gap'; duration: number; line: number } | { kind: 'group'; group: Group }>; errors: NativeScriptMarkdownError[] }
interface NativePlanned extends PlannedItem { mediaId: string; rate: number; template?: ProductionNativeElement; line: number; preservedExactly?: boolean }

// 完整sha256与canonical对象键；数组顺序本就是时间轴/转录事实，不排序洗掉变化。
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => JSON.stringify(k) + ':' + canonical(v)).join(',') + '}';
  return JSON.stringify(value) ?? 'null';
}
function stamp(value: unknown): string { return 'sha256:' + createHash('sha256').update(canonical(value)).digest('hex'); }
function allTracks(scene: ProductionNativeScene): ProductionNativeTrack[] { return [scene.tracks.main, ...scene.tracks.overlay, ...scene.tracks.audio]; }
function integer(value: number): boolean { return Number.isSafeInteger(value) && value >= 0; }
function intervalDuration(start: number, end: number, rate: number): number { return Math.round((end - start) / rate); }
function cleanText(text: string): string { return text.replace(/\r?\n/g, '\\n'); }
function issue(line: number, message: string, hint?: string): NativeScriptMarkdownError { return { line, message, ...(hint ? { hint } : {}) }; }
function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function chunksFor(element: ProductionNativeElement, source: SourceInfo, start: number, end: number): Chunk[] {
  const anchors = source.anchors.filter(a => a.start >= start && a.end <= end).sort((a, b) => a.start - b.start || a.end - b.end || a.localId - b.localId);
  // 多版本重叠或部分词的时码不能替模型选一份；仍保留精确clip编辑。
  if (!anchors.length || anchors.some((a, i) => i > 0 && a.start < anchors[i - 1]!.end)) return [];
  const chunks: Chunk[] = []; let cursor = start;
  for (const anchor of anchors) { if (anchor.start > cursor) chunks.push({ kind: 'silence', start: cursor, end: anchor.start }); chunks.push({ kind: 'segment', start: anchor.start, end: anchor.end, anchor }); cursor = anchor.end; }
  if (cursor < end) chunks.push({ kind: 'silence', start: cursor, end });
  return chunks;
}
function snapshot(raw: ProductionReferencePlan, sceneId: string, trackIds?: string[]): Snapshot {
  const plan = productionReferencePlan.parse(raw), scene = readProductionNativeScene(plan, sceneId);
  if (!scene) throw new Error('原生场景不存在');
  const tracks = allTracks(scene), selected = new Set(trackIds ?? tracks.map(t => t.id));
  if (trackIds && (selected.size !== trackIds.length || trackIds.some(id => !tracks.some(t => t.id === id)))) throw new Error('声明轨道不存在或重复');
  const sources = new Map<string, SourceInfo>();
  for (const ref of plan.referenceEditor.mediaRefs) {
    const binding = plan.nativeSources?.find(v => v.mediaId === ref.mediaId);
    const source = binding?.source.assetId === ref.assetId && binding.source.assetFileId === ref.assetFileId ? binding.source : undefined;
    const kinds = new Set(tracks.flatMap(t => t.elements.filter(e => e.mediaId === ref.mediaId).map(e => e.type)));
    const kind: SourceInfo['kind'] = kinds.has('image') && !kinds.has('video') && !kinds.has('audio') ? 'image' : kinds.has('audio') && !kinds.has('video') ? 'audio' : 'video';
    const info: SourceInfo = { mediaId: ref.mediaId, assetId: ref.assetId, assetFileId: ref.assetFileId, source, duration: source ? sourceNativeTickExact(source.durationTicks, source) : null, kind, anchors: [] };
    let localId = 0;
    for (const transcript of plan.sourceTranscripts ?? []) {
      if (!source || transcript.sourceId !== source.sourceId || transcript.assetFileId !== ref.assetFileId || transcript.granularity === 'text') continue;
      for (const token of transcript.tokens) {
        localId++;
        const start = sourceNativeTickExact(token.startTicks, source), end = sourceNativeTickExact(token.endTicks, source);
        if (start === null || end === null || end <= start || end > (info.duration ?? 0)) continue;
        info.anchors.push({ localId, tokenId: token.tokenId, transcriptId: transcript.transcriptId, text: cleanText(token.text), start, end, granularity: transcript.granularity });
      }
    }
    sources.set(info.mediaId, info);
  }
  let video = 0, audio = 0, protectedAlias = 0, clipAlias = 0;
  const infos: TrackInfo[] = [];
  for (const track of tracks) {
    const alias = track.type === 'video' ? `V${++video}` : track.type === 'audio' ? `A${++audio}` : `P${++protectedAlias}`;
    const clips: ClipInfo[] = [];
    for (const element of [...track.elements].sort((a, b) => a.startTime - b.startTime || a.id.localeCompare(b.id))) {
      const source = sources.get(element.mediaId ?? ''), rate = element.retime?.rate ?? 1;
      const image = element.type === 'image';
      const end = image ? element.trimStart + element.duration : (typeof element.sourceDuration === 'number' ? element.sourceDuration : source?.duration ?? 0) - element.trimEnd;
      const hasOverlap = track.elements.some(other => other.id !== element.id && other.startTime < element.startTime + element.duration && element.startTime < other.startTime + other.duration);
      const typeAllowed = track.type === 'video' ? element.type === 'video' || element.type === 'image' : track.type === 'audio' && element.type === 'audio' && element.sourceType === 'upload';
      if (!source || !typeAllowed || hasOverlap || rate < .01 || rate > 5 || !Number.isFinite(rate) || !integer(end) || end <= element.trimStart || !element.duration || (!image && (source.duration === null || end > source.duration)) || image && rate !== 1 || intervalDuration(element.trimStart, end, rate) !== element.duration) continue;
      clips.push({ alias: ++clipAlias, element, source, start: element.trimStart, end, rate, chunks: element.type === 'image' ? [] : chunksFor(element, source, element.trimStart, end) });
    }
    if (!selected.has(track.id)) continue;
    const editable = new Set(clips.map(c => c.element.id));
    infos.push({ descriptor: { alias, trackId: track.id, type: track.type, editableElementIds: clips.map(c => c.element.id), protectedElementIds: track.elements.filter(e => !editable.has(e.id)).map(e => e.id) }, track, clips });
  }
  return { plan, scene, tracks: infos, sources,
    stateStamp: stamp({ protocol: 'creatoros.native-script.v1', document: plan.referenceEditor.nativeDocument, editor: plan.referenceEditor.editor, revision: plan.referenceEditor.revision, productionRevision: plan.revision ?? null, mediaRefs: plan.referenceEditor.mediaRefs }),
    libraryStamp: stamp({ mediaRefs: plan.referenceEditor.mediaRefs, sources: plan.nativeSources ?? [], transcripts: plan.sourceTranscripts ?? [] }),
  };
}
function sourceHeader(source: SourceInfo): string { return `### ${cleanText(source.assetId)} <!-- markdown-state:source:${encodeIdentity(source.mediaId)}:${encodeIdentity(source.assetId)} -->`; }
function clipRow(clip: ClipInfo): string { return `[c${clip.alias}] ${clip.element.duration}t source=${clip.start}..${clip.end}t rate=${clip.rate} <!-- markdown-state:item:${encodeIdentity(clip.element.id)} -->`; }
function render(s: Snapshot): NativeScriptMarkdownRead {
  const lines = [ '<!-- markdown-state:format:1 -->', `<!-- markdown-state:stamp:${s.stateStamp} -->`, `<!-- markdown-state:lib-stamp:${s.libraryStamp} -->`, `<!-- markdown-state:timeline:${encodeIdentity(s.scene.id)} -->`, SCRIPT_BODY_MARKER, '', '<!-- t=120000 ticks/s；silence仅表示未转录源区间，不是声学静音，缩短须沿既有听审。 -->' ];
  for (const info of s.tracks) {
    lines.push(`## ${info.descriptor.alias} <!-- markdown-state:track:${encodeIdentity(info.track.id)} -->`);
    lines.push(`<!-- markdown-state:scope:${encodeIdentity(JSON.stringify(info.descriptor))} -->`);
    let cursor = 0, previousMedia: string | null = null;
    for (const clip of info.clips) {
      if (clip.element.startTime > cursor) lines.push(`[gap ${clip.element.startTime - cursor}t]`);
      if (clip.source.mediaId !== previousMedia) { lines.push(sourceHeader(clip.source)); previousMedia = clip.source.mediaId; }
      lines.push(clipRow(clip));
      for (const chunk of clip.chunks) lines.push(chunk.kind === 'segment' ? `[s${chunk.anchor!.localId}] ${chunk.anchor!.text}` : `[silence=${chunk.end - chunk.start}t] <!-- markdown-state:range:${chunk.start}..${chunk.end} -->`);
      cursor = clip.element.startTime + clip.element.duration;
    }
    for (const id of info.descriptor.protectedElementIds) lines.push(`<!-- 保护原元素:${encodeIdentity(id)}；不由Markdown重建 -->`);
    lines.push('');
  }
  const libraryDocs = [...s.sources.values()].map(source => ({ mediaId: source.mediaId, assetId: source.assetId, content: [sourceHeader(source), '<!-- 只读源库；sN按媒体+asset+transcript+token复合定位，句级时码不能按字符分割。 -->', ...source.anchors.map(a => `[s${a.localId}] ${a.text}`), ...(source.anchors.length ? [] : ['<!-- 无可验证词句时码；仅支持精确整片段或已冻结源范围，禁止估时。 -->']), ...(source.duration ? [`[clip source=0..${source.duration}t rate=1]`] : [])].join('\n') }));
  return { formatVersion: 1, sceneId: s.scene.id, stateStamp: s.stateStamp, libraryStamp: s.libraryStamp, markdown: lines.join('\n'), libraryDocs, tracks: s.tracks.map(t => t.descriptor), scopeComplete: true };
}
export function readNativeScriptMarkdown(plan: ProductionReferencePlan, sceneId: string, trackIds?: string[]): NativeScriptMarkdownRead { return render(snapshot(plan, sceneId, trackIds)); }

export function planNativeScriptMarkdown(plan: ProductionReferencePlan, sceneId: string, input: NativeScriptMarkdownInput): NativeScriptMarkdownResult {
  const s = snapshot(plan, sceneId);
  const result: NativeScriptMarkdownResult = { scene: structuredClone(s.scene) as unknown as NativeSerializedScene, warnings: [], errors: [], operations: [] };
  const declared = new Set(input.declaredTrackIds);
  if (declared.size !== input.declaredTrackIds.length || input.declaredTrackIds.some(id => !s.tracks.some(t => t.track.id === id))) { result.errors.push(issue(1, '声明轨道不存在或重复', '重新读取真实轨道集合')); return result; }
  s.tracks = s.tracks.filter(t => declared.has(t.track.id));
  // Stage 1：目标+完整状态+源库。缺元信息只能由本次可信base恢复，错值绝不恢复。
  if (input.stateStamp !== s.stateStamp || input.libraryStamp !== s.libraryStamp) { result.errors.push(issue(1, '工程或原片资料已改变', '重新读取后核对草稿，不自动重发')); return result; }
  const checks = [['stamp', s.stateStamp], ['lib-stamp', s.libraryStamp], ['timeline', encodeIdentity(sceneId)], ['format', '1']] as const;
  for (const [name, expected] of checks) {
    const values = markerValues(input.markdown, name);
    if (values.length > 1 || values.length === 1 && values[0] !== expected) result.errors.push(issue(1, `Markdown ${name} 与当前可信base不符`));
    else if (!values.length) result.warnings.push(`从本次唯一可信base恢复缺失${name}元信息`);
  }
  if (!input.markdown.includes(SCRIPT_BODY_MARKER)) result.errors.push(issue(1, '缺少正文标记', `保留${SCRIPT_BODY_MARKER}`));
  if (result.errors.length) return result;
  // Stage 2：04逐行parser，未知行绑定原clip才能局部恢复，否则整轨保留。
  const rows = parseRows(input.markdown, s);
  result.errors.push(...rows.errors);
  for (const track of rows.tracks) {
    if (!track.scope) track.errors.push(issue(track.line, '缺少完整可编辑集合声明', '重新读取完整轨道，不把截断输入视作删除'));
    if (track.errors.length) { result.errors.push(...track.errors); result.warnings.push(`保留原轨道${track.info.descriptor.alias}`); continue; }
    const planned = buildTrackPlan(track, result.warnings);
    if (planned.errors.length) { result.errors.push(...planned.errors); result.warnings.push(`保留原轨道${track.info.descriptor.alias}`); continue; }
    // Stage 3/4：19身份延续diff；保护集合不参加原项删除。
    try {
      const changed = applyTrackDiff(s, track.info, planned.items);
      // 真正无修改无需把旧工程重新验成新输入；保住旧unknown字段/类型和数组顺序。
      if (!changed.operations.length) continue;
      const after = structuredClone(result.scene.tracks) as unknown as NativeSerializedTimelineTracks;
      replaceTrack(after, track.info.track.id, changed.elements);
      // Stage 5只验候选，不写DB。当前固定原生合同检查全配置与媒体时间数学。
      validateNativeSceneTracksCandidate(s.scene.tracks as unknown as NativeSerializedTimelineTracks, after, mediaCatalog(s));
      result.scene.tracks = after;
      result.operations.push(...changed.operations);
    } catch (error) { result.errors.push(issue(track.line, `原生候选未通过校验：${message(error)}`)); result.warnings.push(`保留原轨道${track.info.descriptor.alias}`); }
  }
  return result;
}
function replaceTrack(tracks: NativeSerializedTimelineTracks, id: string, elements: ProductionNativeElement[]): void {
  const track = [tracks.main, ...tracks.overlay, ...tracks.audio].find(t => t.id === id)!;
  track.elements = elements as typeof track.elements;
}
function mediaCatalog(s: Snapshot): ProductionNativeMedia[] { return [...s.sources.values()].map(source => ({ mediaId: source.mediaId, kind: source.kind, durationTick: source.duration })); }
function parseRows(md: string, s: Snapshot): { tracks: TrackRows[]; errors: NativeScriptMarkdownError[] } {
  const tracks: TrackRows[] = [], errors: NativeScriptMarkdownError[] = [], lines = md.split('\n');
  const bodyStart = lines.findIndex(line => line.trim() === SCRIPT_BODY_MARKER); let current: TrackRows | undefined, currentSource: SourceInfo | undefined, group: Group | undefined;
  for (let index = bodyStart + 1; index < lines.length; index++) {
    const raw = lines[index]!.trim(), line = index + 1; if (!raw) continue;
    if (raw.startsWith('## ')) {
      group = undefined; currentSource = undefined;
      const aliasMatch = ROW_PATTERNS.trackHeader.exec(raw), trackMarker = /<!-- markdown-state:track:([^ ]+) -->/.exec(raw);
      const info = aliasMatch ? s.tracks.find(t => t.descriptor.alias === aliasMatch[1]) : undefined;
      const identity = trackMarker ? decodeIdentity(trackMarker[1]!) : undefined;
      if (!info || identity !== info.track.id || tracks.some(t => t.info.track.id === info.track.id)) { errors.push(issue(line, '轨道别名/真实身份不存在、未声明或重复', '只能编辑本次已导出的真实轨道')); current = undefined; continue; }
      current = { info, line, scope: false, events: [], errors: [] }; tracks.push(current); continue;
    }
    if (!current) { if (!ROW_PATTERNS.comment.test(raw)) errors.push(issue(line, '内容不属于声明的轨道')); continue; }
    const scope = /^<!-- markdown-state:scope:([^ ]+) -->$/.exec(raw);
    if (scope) {
      try { const decoded = decodeIdentity(scope[1]!); if (current.scope || !decoded || canonical(JSON.parse(decoded)) !== canonical(current.info.descriptor)) throw Error('scope'); current.scope = true; }
      catch { current.errors.push(issue(line, '可编辑/保护集合声明已改变', '重新读取原集合')); }
      continue;
    }
    if (ROW_PATTERNS.comment.test(raw) || ROW_PATTERNS.speaker.test(raw)) continue;
    if (raw.startsWith('### ')) {
      group = undefined; const match = ROW_PATTERNS.sourceHeader.exec(raw);
      const mediaId = match ? decodeIdentity(match[2]!) : null, assetId = match ? decodeIdentity(match[3]!) : null;
      const source = mediaId ? s.sources.get(mediaId) : undefined;
      if (!source || assetId !== source.assetId) { current.errors.push(issue(line, '原片media/asset复合身份不存在', '从本次只读源库复制精确source标记')); currentSource = undefined; }
      else currentSource = source;
      continue;
    }
    const unwrapped = unstrike(raw), gap = ROW_PATTERNS.gap.exec(unwrapped.line);
    if (gap) {
      group = undefined;
      const duration = Number(gap[2]);
      if (!integer(duration) || !!gap[1] !== !!gap[3]) current.errors.push(issue(line, '轨道空隙时间或删除标记无效'));
      else current.events.push({ kind: 'gap', duration: unwrapped.dropped || gap[1] ? 0 : duration, line });
      continue;
    }
    const clipMatch = ROW_PATTERNS.clip.exec(unwrapped.line), freshMatch = ROW_PATTERNS.fresh.exec(unwrapped.line);
    if (clipMatch || freshMatch) {
      const clip = clipMatch ? current.info.clips.find(c => c.alias === Number(clipMatch[1])) : undefined;
      const start = Number(clipMatch ? clipMatch[3] : freshMatch![1]), end = Number(clipMatch ? clipMatch[4] : freshMatch![2]), rate = Number(clipMatch ? clipMatch[5] : freshMatch![3]), duration = clipMatch ? Number(clipMatch[2]) : intervalDuration(start, end, rate);
      group = { line, clip, source: currentSource, start, end, rate, duration, dropped: unwrapped.dropped, children: [], errors: [] };
      if (!currentSource || clipMatch && (!clip || clip.source.mediaId !== currentSource.mediaId || clipMatch[6] && decodeIdentity(clipMatch[6]) !== clip.element.id)) group.errors.push(issue(line, '片段锚点与原片/轨道不符', '保持原cN和source复合身份'));
      if (!integer(start) || !integer(end) || !integer(duration) || !duration || end <= start || !Number.isFinite(rate) || rate < .01 || rate > 5 || duration !== intervalDuration(start, end, rate) || !currentSource || (currentSource.kind === 'image' ? rate !== 1 : !currentSource.duration || end > currentSource.duration)) group.errors.push(issue(line, '源范围、真实时长或速率不符'));
      current.events.push({ kind: 'group', group }); continue;
    }
    // 损坏的下一clip不能吞进上一clip的子行再误推定删除；可锚定则保原，否则保整轨。
    const brokenClip = /^\[c(\d+)\]/.exec(unwrapped.line);
    if (brokenClip) {
      const clip = current.info.clips.find(c => c.alias === Number(brokenClip[1]));
      group = clip ? { line, clip, source: clip.source, start: clip.start, end: clip.end, rate: clip.rate, duration: clip.element.duration, dropped: false, children: [], errors: [issue(line, '片段header格式损坏，不能推定删除')] } : undefined;
      if (group) current.events.push({ kind: 'group', group }); else current.errors.push(issue(line, '未知损坏片段锚点，保留原轨道'));
      continue;
    }
    if (/^\[(?:gap|clip)\b/.test(unwrapped.line)) { group = undefined; current.errors.push(issue(line, '轨道空隙或新增片段格式损坏，保留原轨道')); continue; }
    if (ROW_PATTERNS.segment.test(unwrapped.line) && !group) {
      group = { line, source: currentSource, start: 0, end: 0, rate: 1, duration: 0, dropped: false, children: [{ line, raw }], errors: [] };
      current.events.push({ kind: 'group', group }); group = undefined; continue;
    }
    if (group) group.children.push({ line, raw }); else current.errors.push(issue(line, '无法定位的Markdown语法错误', '保留原轨道，重新读取并使用cN/sN/gap格式'));
  }
  for (const info of s.tracks) if (!tracks.some(t => t.info.track.id === info.track.id)) errors.push(issue(1, `声明轨道${info.descriptor.alias}正文缺失`, '完整导出并保留轨道header与scope；空轨也须声明'));
  return { tracks, errors };
}
function buildTrackPlan(track: TrackRows, warnings: string[]): { items: NativePlanned[]; errors: NativeScriptMarkdownError[] } {
  const items: NativePlanned[] = [], errors: NativeScriptMarkdownError[] = []; let cursor = 0;
  for (const event of track.events) {
    if (event.kind === 'gap') { cursor += event.duration; if (!integer(cursor)) errors.push(issue(event.line, '时间范围溢出')); continue; }
    const group = event.group; if (group.dropped && !group.errors.length) continue;
    const ranges = resolveGroup(group);
    if (ranges.errors.length) {
      // 已定位且该片段原位置不受上游ripple影响，才安全保原；否则该轨依赖不能隔离。
      if (group.clip && group.clip.element.startTime === cursor) {
        warnings.push(`第${group.line}行保留原片段${group.clip.element.id}：${ranges.errors.map(e => e.message).join('；')}`);
        items.push(plannedClip(group.clip, group.clip.start, group.clip.end, cursor, group.line, true)); cursor += group.clip.element.duration; continue;
      }
      errors.push(...ranges.errors); continue;
    }
    warnings.push(...ranges.warnings);
    for (const range of ranges.ranges) {
      const source = group.source!;
      const duration = intervalDuration(range.start, range.end, group.rate);
      if (!integer(duration) || duration <= 0 || !integer(cursor + duration)) { errors.push(issue(group.line, '精确源区间无法形成可播放原生时长')); break; }
      items.push(group.clip ? { ...plannedClip(group.clip, range.start, range.end, cursor, group.line), rate: group.rate, durationTick: duration } : { preservedItemId: null, assetId: source.mediaId, mediaId: source.mediaId, itemType: track.info.track.type === 'audio' ? 'audio' : source.kind === 'image' ? 'image' : 'video', sourceStartTick: range.start, sourceEndTick: range.end, fromTick: cursor, durationTick: duration, rate: group.rate, line: group.line });
      cursor += duration;
    }
  }
  return { items, errors };
}
function plannedClip(clip: ClipInfo, start: number, end: number, cursor: number, line: number, preservedExactly = false): NativePlanned {
  return { preservedItemId: clip.element.id, assetId: clip.source.mediaId, mediaId: clip.source.mediaId, itemType: clip.element.type, sourceStartTick: start, sourceEndTick: end, fromTick: cursor, durationTick: intervalDuration(start, end, clip.rate), rate: clip.rate, template: clip.element, line, preservedExactly };
}
function resolveGroup(group: Group): { ranges: Array<{ start: number; end: number }>; errors: NativeScriptMarkdownError[]; warnings: string[] } {
  const errors = [...group.errors], warnings: string[] = [], ranges: Array<{ start: number; end: number }> = [];
  if (!group.children.length) {
    if (group.clip?.chunks.length) errors.push(issue(group.line, '词句/停顿子行缺失', '删除整片段请显式删除cN组；停顿须听审，不能把截断子行视作缩短'));
    else if (group.end > group.start) ranges.push({ start: group.start, end: group.end });
    return { ranges, errors, warnings };
  }
  const expectedPauses = group.clip?.chunks.filter(c => c.kind === 'silence') ?? [], pauses = new Set<string>();
  for (const child of group.children) {
    const unwrapped = unstrike(child.raw), segment = ROW_PATTERNS.segment.exec(unwrapped.line), silence = ROW_PATTERNS.silence.exec(unwrapped.line);
    if (segment) {
      const id = Number(segment[1]), text = segment[2]!, source = group.source;
      let anchor = source?.anchors.find(a => a.localId === id && sameAnchorText(a.text, text));
      if (!anchor && source) {
        anchor = uniqueTextAnchor(source.anchors, text);
        if (anchor) warnings.push(`第${child.line}行同素材锚点[s${id}]→[s${anchor.localId}]自动纠正`);
      }
      if (!anchor || group.clip && (anchor.start < group.start || anchor.end > group.end)) { errors.push(issue(child.line, '词句锚点不存在、重复文本无法唯一恢复或越出原片段', '从同素材只读library复制明确sN，不按文字猜时间')); continue; }
      if (!unwrapped.dropped) ranges.push({ start: anchor.start, end: anchor.end });
    } else if (silence) {
      const start = Number(silence[2]), end = Number(silence[3]), key = `${start}:${end}`;
      if (unwrapped.dropped || Number(silence[1]) !== end - start || !expectedPauses.some(p => p.start === start && p.end === end) || pauses.has(key)) errors.push(issue(child.line, '停顿缩短/删除须沿既有听审，已保留原片段', 'Markdown候选没有停顿听审确认，不得自动删静音'));
      else { pauses.add(key); ranges.push({ start, end }); }
    } else errors.push(issue(child.line, '片段内未知语法', '保留原片段并重新读取'));
  }
  if (expectedPauses.some(p => !pauses.has(`${p.start}:${p.end}`))) errors.push(issue(group.line, '停顿子行缺失须听审，已保留原片段'));
  // 同一个原片段、源区间连续的保留项合并；跨删除区间/重排不串起来。
  const merged: Array<{ start: number; end: number }> = [];
  for (const range of ranges) { const last = merged.at(-1); if (last && last.end === range.start) last.end = range.end; else merged.push({ ...range }); }
  return { ranges: merged, errors, warnings };
}
function applyTrackDiff(s: Snapshot, info: TrackInfo, planned: NativePlanned[]) {
  const originals: OriginalItem[] = info.clips.map(c => ({ id: c.element.id, assetId: c.source.mediaId, type: c.element.type, fromTick: c.element.startTime, sourceStartTick: c.start, sourceEndTick: c.end }));
  const { assignments, deletedIds } = mapPlannedToOriginals(planned, originals);
  const byId = new Map(info.track.elements.map(e => [e.id, e])), updated = new Map<string, ProductionNativeElement>(), adds: ProductionNativeElement[] = [];
  const operations: NativeScriptMarkdownResult['operations'] = [], usedIds = new Set(allTracks(s.scene).flatMap(t => t.elements.map(e => e.id)));
  for (const [index, assignment] of assignments) {
    const p = planned[index]!, source = s.sources.get(p.mediaId)!;
    if (info.track.type !== 'video' && info.track.type !== 'audio' || info.track.type === 'audio' && (!source.source?.hasAudio || p.itemType !== 'audio')) throw new Error('不能新增或重建不支持的轨道/元素类型');
    const origin = assignment.kind === 'update' ? byId.get(assignment.originalId) : assignment.kind === 'clone' ? byId.get(assignment.fromOriginalId) : undefined;
    let id = origin?.id ?? '';
    if (assignment.kind !== 'update') {
      id = 'md-' + stamp({ scene: s.scene.id, track: info.track.id, index, base: s.stateStamp, planned: p }).slice(7, 31);
      let suffix = 0; const base = id; while (usedIds.has(id)) id = `${base}-${++suffix}`; usedIds.add(id);
    }
    const body: ProductionNativeElement = origin ? structuredClone(origin) : { id, name: source.assetId, type: p.itemType, mediaId: source.mediaId, startTime: p.fromTick, duration: p.durationTick, ...(p.itemType === 'image' ? { trimStart: 0, trimEnd: 0 } : { trimStart: p.sourceStartTick, trimEnd: source.duration! - p.sourceEndTick, sourceDuration: source.duration! }), params: {}, ...(p.itemType === 'audio' ? { sourceType: 'upload' } : {}) };
    body.id = id;
    if (!p.preservedExactly) {
      const sourceDuration = typeof body.sourceDuration === 'number' ? body.sourceDuration : source.duration!;
      body.startTime = p.fromTick; body.duration = p.durationTick;
      if (body.type !== 'image') { body.trimStart = p.sourceStartTick; body.trimEnd = sourceDuration - p.sourceEndTick; }
      if (p.rate !== (origin?.retime?.rate ?? 1)) body.retime = { ...body.retime, rate: p.rate };
    }
    if (assignment.kind === 'update') { updated.set(id, body); if (canonical(body) !== canonical(origin)) operations.push({ kind: 'update', trackId: info.track.id, elementId: id }); }
    else { adds.push(body); operations.push({ kind: assignment.kind === 'clone' ? 'clone' : 'add', trackId: info.track.id, elementId: id }); }
  }
  for (const id of deletedIds) operations.push({ kind: 'delete', trackId: info.track.id, elementId: id });
  const elements = [...info.track.elements.filter(e => !deletedIds.has(e.id)).map(e => updated.get(e.id) ?? structuredClone(e)), ...adds];
  const protectedIds = new Set(info.descriptor.protectedElementIds);
  for (const element of elements) {
    if (protectedIds.has(element.id)) continue;
    if (elements.some(other => other.id !== element.id && protectedIds.has(other.id) && other.startTime < element.startTime + element.duration && element.startTime < other.startTime + other.duration)) throw new Error('修改与保护元素时间重叠，不能隔离依赖');
  }
  return { elements, operations };
}
