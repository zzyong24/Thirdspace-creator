import {readNativeScriptMarkdown,planNativeScriptMarkdown,nativeChangedMediaIds} from '../production/production-script-markdown';
import { createHash } from 'node:crypto';
import { workEditorTarget, workEditorReadInput, workEditorProposeInput, articleDocument, graphicPostDocument, productionReferencePlan, readProductionNativeScene, sourceNativeTick, validateNativeSceneTracksCandidate, productionNativeParamRegistryKeys, PRODUCTION_NATIVE_GRAPHIC_DEFINITIONS, NATIVE_SOURCE_REVISION, NATIVE_DOCUMENT_VERSION, NATIVE_TICKS_PER_SECOND, type RequestContext, type WorkEditorTarget, type WorkEditorReadInput, type WorkEditorProposeInput, type WorkEditorContext, type WorkEditorCandidate, type ArticleResource, type GraphicPostResource, type ProductionEditorDocument, type NativeSerializedScene, type NativeSerializedTimelineTracks as NativeSerializedSceneTracks, type NativeSerializedTimelineTrack, type NativeSerializedTimelineElement, type ProductionNativeMedia } from '@creatoros/contract';
import { canonicalJson } from '../ai/canonical-json';
import { ConflictError } from '../execution/execution.errors';
export interface WorkEditorPorts {
    readArticle?(ctx: RequestContext, outputId: string): Promise<ArticleResource>;
    readGraphicPost?(ctx: RequestContext, outputId: string): Promise<GraphicPostResource>;
    readProduction(ctx: RequestContext, outputId: string): Promise<ProductionEditorDocument>;
    readMedia(ctx: RequestContext, input: {
        projectId: string;
        mediaId: string;
        assetId: string;
        assetFileId: string;
    }): Promise<{
        kind: 'video' | 'audio' | 'image';
        durationTick: number | null;
    }>;
}
export const workEditorContentDigest = (value: unknown) => `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
function fail(message: string): never { throw new ConflictError(message); }
const eq = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
const check = (a: unknown, b: unknown, message = '前值摘要已变化') => { if (!eq(a, b))
    fail(message); };
const json = <T>(value: T): any => JSON.parse(JSON.stringify(value));
const assertDigest = (value: unknown, digest: string) => { if (workEditorContentDigest(value) !== digest)
    fail('前值摘要已变化，请重新读取'); };
function boundary(value: string, index: number) { if (index < 0 || index > value.length || !Number.isSafeInteger(index))
    fail('文本范围越界'); if (index > 0 && index < value.length) {
    const a = value.charCodeAt(index - 1), b = value.charCodeAt(index);
    if (a >= 0xd800 && a <= 0xdbff && b >= 0xdc00 && b <= 0xdfff)
        fail('文本范围不能拆开Unicode字符');
} }
function ranges(value: string, edits: Array<{
    startUtf16: number;
    endUtf16: number;
    replacementText: string;
    expectedFieldDigest: string;
}>): string {
    const sorted = [...edits].sort((a, b) => a.startUtf16 - b.startUtf16 || a.endUtf16 - b.endUtf16);
    for (let i = 0; i < sorted.length; i++) {
        const e = sorted[i]!;
        assertDigest(value, e.expectedFieldDigest);
        boundary(value, e.startUtf16);
        boundary(value, e.endUtf16);
        if (e.endUtf16 < e.startUtf16)
            fail('文本范围相反');
        if (i && e.startUtf16 <= sorted[i - 1]!.endUtf16 && (e.startUtf16 < sorted[i - 1]!.endUtf16 || e.startUtf16 === sorted[i - 1]!.startUtf16))
            fail('文本范围重叠');
    }
    let result = value;
    for (const e of sorted.reverse())
        result = result.slice(0, e.startUtf16) + e.replacementText + result.slice(e.endUtf16);
    return result;
}
type Loaded = {
    target: WorkEditorTarget;
    document: any;
    plan: any | null;
    scene: NativeSerializedScene | null;
    media: Array<ProductionNativeMedia & {
        assetId: string;
        assetFileId: string;
    }>;
};
/** 语义由本轮Skill/模型负责；此服务只读真实owner并机械落实明确typed输入，不写正式作品。 */
export function createWorkEditorCandidateService(ports: WorkEditorPorts) {
    async function load(ctx: RequestContext, raw: WorkEditorTarget,scriptOnly=false): Promise<Loaded> {
        const target = workEditorTarget.parse(structuredClone(raw));
        let document: any, plan: any = null, scene: NativeSerializedScene | null = null;
        let media: Loaded['media'] = [];
        if (target.owner === 'wechat_article' || target.owner === 'graphic_post') {
            if(target.owner==='wechat_article'&&!ports.readArticle||target.owner==='graphic_post'&&!ports.readGraphicPost)fail('此服务未提供对应作品读取端口');
            const owner = target.owner === 'wechat_article' ? await ports.readArticle!(ctx, target.outputId) : await ports.readGraphicPost!(ctx, target.outputId);
            if (owner.projectId !== target.projectId || owner.outputId !== target.outputId || owner.artifactId !== target.savedBase.artifactId || owner.currentVersionId !== target.savedBase.versionId)
                fail('作品保存版本已变化，请先保存并重新读取');
            document = structuredClone(owner.current);
            assertDigest(document, target.documentDigest);
            const selection = target.selection;
            if ('sectionIds' in selection) {
                for (const id of selection.sectionIds)
                    if (document.sections.filter((s: any) => s.sectionId === id).length !== 1)
                        fail('文章选区已变化');
                if (selection.textRange) {
                    if (selection.sectionIds.length !== 1 || !selection.field)
                        fail('文本选区缺少唯一字段');
                    const text = document.sections.find((s: any) => s.sectionId === selection.sectionIds[0])[selection.field];
                    assertDigest(text, selection.textRange.expectedFieldDigest);
                    boundary(text, selection.textRange.startUtf16);
                    boundary(text, selection.textRange.endUtf16);
                }
            }
            else {
                for (const id of selection.cardIds)
                    if ((document.cardBriefs ?? []).filter((s: any) => s.cardId === id).length !== 1)
                        fail('图卡选区已变化');
                if (selection.textRange) {
                    if (selection.cardIds.length !== 1 || !selection.field)
                        fail('文本选区缺少唯一字段');
                    const text = (document.cardBriefs ?? []).find((s: any) => s.cardId === selection.cardIds[0])[selection.field] ?? '';
                    assertDigest(text, selection.textRange.expectedFieldDigest);
                    boundary(text, selection.textRange.startUtf16);
                    boundary(text, selection.textRange.endUtf16);
                }
            }
        }
        else {
            const owner = await ports.readProduction(ctx, target.outputId);
            if (owner.projectId !== target.projectId || owner.outputId !== target.outputId || owner.productionId !== target.savedBase.productionId || owner.revision !== target.savedBase.revision || owner.plan?.editorVersion !== 3)
                fail('原生制作保存版本已变化');
            assertDigest(owner.plan, target.documentDigest);
            plan = productionReferencePlan.parse(structuredClone(owner.plan));
            if (plan.referenceEditor.revision !== NATIVE_SOURCE_REVISION || plan.referenceEditor.nativeDocument.version !== NATIVE_DOCUMENT_VERSION)
                fail('原生工程版本不支持编导候选');
            scene = readProductionNativeScene(plan, target.selection.sceneId) as unknown as NativeSerializedScene | null;
            if (!scene)
                fail('原生选区场景已变化');
            document = structuredClone(scene);
            const tracks = [scene.tracks.main, ...scene.tracks.overlay, ...scene.tracks.audio];
            for (const ref of target.selection.elementRefs)
                if (tracks.find(t => t.id === ref.trackId)?.elements.filter(e => e.id === ref.elementId).length !== 1)
                    fail('原生元素选区已变化');
            if (target.selection.transcript) {
                const transcript = plan.sourceTranscripts?.find((t: any) => t.transcriptId === target.selection.transcript!.transcriptId && t.sourceId === target.selection.transcript!.sourceId);
                if (!transcript || target.selection.transcript.tokenIds.some(id => !transcript.tokens.some((t: any) => t.tokenId === id)))
                    fail('原生转写选区已变化');
            }
            media = scriptOnly?[]:await Promise.all(plan.referenceEditor.mediaRefs.map(async (ref: any) => { const exact = await ports.readMedia(ctx, { projectId: target.projectId, ...ref }); const probe = plan.nativeSources?.find((b: any) => b.mediaId === ref.mediaId && b.source.assetId === ref.assetId && b.source.assetFileId === ref.assetFileId); return { ...ref, ...exact, ...(probe ? { durationTick: sourceNativeTick(probe.source.durationTicks, probe.source) } : {}) }; }));
        }
        return { target, document, plan, scene, media };
    }
    function complete(loaded: Loaded, document = loaded.document) { return { kind: loaded.target.owner === 'wechat_article' ? 'article' : loaded.target.owner === 'graphic_post' ? 'graphic_post' : 'native_scene', document }; }
    async function read(ctx: RequestContext, target: WorkEditorTarget, raw: WorkEditorReadInput = {}): Promise<WorkEditorContext> {
        const input = workEditorReadInput.parse(raw), l = await load(ctx, target,input.view==='script_markdown'), t = l.target, d = l.document;
        let selected: any[] = [], summary: any = {}, scope: any = input.scope ?? t.selection;
        if(input.view==='script_markdown'&&t.owner!=='production')fail('时间轴文字视图仅用于当前视频');
        const scriptMarkdown=input.view==='script_markdown'?readNativeScriptMarkdown(l.plan,t.owner==='production'?t.selection.sceneId:'',input.scope?.kind==='native_elements'&&input.scope.elementRefs.length?[...new Set(input.scope.elementRefs.map(e=>e.trackId))]:undefined):undefined;
        if (t.owner === 'wechat_article') {
            if (input.scope && input.scope.kind !== 'article_sections')
                fail('读取选区类型不符');
            const ids = input.scope?.kind === 'article_sections' ? input.scope.sectionIds : t.selection.sectionIds;
            for (const id of ids)
                if (d.sections.filter((s: any) => s.sectionId === id).length !== 1)
                    fail('文章读取选区不存在');
            selected = input.view === 'index' ? [] : d.sections.filter((s: any) => !ids.length || ids.includes(s.sectionId)).map((s: any) => ({ ...s, sectionDigest: workEditorContentDigest(s), fieldDigests: { heading: workEditorContentDigest(s.heading), body: workEditorContentDigest(s.body) } }));
            summary = { title: d.title, sectionCount: d.sections.length, sections: d.sections.map((s: any) => ({ sectionId: s.sectionId, order: s.order, headingUtf16: s.heading.length, bodyUtf16: s.body.length })), imageCount: d.imageUses.length };
        }
        else if (t.owner === 'graphic_post') {
            if (input.scope && input.scope.kind !== 'graphic_cards')
                fail('读取选区类型不符');
            const ids = input.scope?.kind === 'graphic_cards' ? input.scope.cardIds : t.selection.cardIds;
            for (const id of ids)
                if ((d.cardBriefs ?? []).filter((s: any) => s.cardId === id).length !== 1)
                    fail('图卡读取选区不存在');
            selected = input.view === 'index' ? [] : (d.cardBriefs ?? []).filter((s: any) => !ids.length || ids.includes(s.cardId)).map((s: any) => ({ ...s, cardDigest: workEditorContentDigest(s), fieldDigests: { title: workEditorContentDigest(s.title), body: workEditorContentDigest(s.body), visualBrief: workEditorContentDigest(s.visualBrief ?? '') } }));
            summary = { title: d.title, cardCount: (d.cardBriefs ?? []).length, cards: (d.cardBriefs ?? []).map((s: any, index: number) => ({ cardId: s.cardId, index, titleUtf16: s.title.length, bodyUtf16: s.body.length, visualBriefUtf16: (s.visualBrief ?? '').length })), imageCount: d.imageUses.length };
        }
        else {
            if (input.scope && (input.scope.kind !== 'native_elements' || input.scope.sceneId !== t.selection.sceneId))
                fail('原生读取选区类型或场景不符');
            const refs = input.scope?.kind === 'native_elements' ? input.scope.elementRefs : t.selection.elementRefs;
            const tracks = [d.tracks.main, ...d.tracks.overlay, ...d.tracks.audio] as NativeSerializedTimelineTrack[];
            for (const ref of refs)
                if (tracks.find(t => t.id === ref.trackId)?.elements.filter(e => e.id === ref.elementId).length !== 1)
                    fail('原生读取选区不存在');
            selected = input.view === 'index' ? [] : tracks.flatMap(track => track.elements.filter(e => !refs.length || refs.some(r => r.trackId === track.id && r.elementId === e.id)).map(element => ({ trackId: track.id, trackDigest: workEditorContentDigest(track), elementDigest: workEditorContentDigest(element), element })));
            summary = { sceneId: d.id, tracksDigest: workEditorContentDigest(d.tracks), tracks: tracks.map(track => ({ id: track.id, type: track.type, name: track.name, elementCount: track.elements.length, elements: track.elements.map(e => ({ id: e.id, type: e.type, startTime: e.startTime, duration: e.duration })) })) };
        }
        let fieldWindow: WorkEditorContext['fieldWindow'] = null;
        if (input.fieldWindow) {
            const w = input.fieldWindow;
            let value: unknown;
            if (t.owner === 'wechat_article' && (w.target === 'article_section' || w.target === 'article_metadata'))
                value = w.target === 'article_metadata' && ['title', 'summary'].includes(w.field) ? d[w.field] : w.target === 'article_section' && ['heading', 'body'].includes(w.field) ? d.sections.find((s: any) => s.sectionId === w.id)?.[w.field] : undefined;
            if (t.owner === 'graphic_post' && w.target === 'graphic_card' && !(d.cardBriefs ?? []).some((s: any) => s.cardId === w.id))
                fail('字段窗口没有对应真实文本');
            if (t.owner === 'graphic_post' && (w.target === 'graphic_card' || w.target === 'graphic_metadata'))
                value = w.target === 'graphic_metadata' && ['title', 'body', 'summary'].includes(w.field) ? d[w.field] : w.target === 'graphic_card' && ['title', 'body', 'visualBrief'].includes(w.field) ? (d.cardBriefs ?? []).find((s: any) => s.cardId === w.id)?.[w.field] ?? (w.field === 'visualBrief' ? '' : undefined) : undefined;
            if (typeof value !== 'string')
                fail('字段窗口没有对应真实文本');
            boundary(value, w.offsetUtf16);
            let end = Math.min(value.length, w.offsetUtf16 + w.lengthUtf16);
            if (end > 0 && end < value.length && value.charCodeAt(end - 1) >= 0xd800 && value.charCodeAt(end - 1) <= 0xdbff && value.charCodeAt(end) >= 0xdc00 && value.charCodeAt(end) <= 0xdfff)
                end--;
            if (end === w.offsetUtf16 && end < value.length)
                fail('字段窗口长度不足以读取完整Unicode字符');
            fieldWindow = { offsetUtf16: w.offsetUtf16, totalUtf16: value.length, fieldDigest: workEditorContentDigest(value), text: value.slice(w.offsetUtf16, end), hasMore: end < value.length, nextOffsetUtf16: end < value.length ? end : null };
            scope = { kind: 'field_window', ...w };
            selected = [];
        }
        return json({ kind: 'work.editor.context', schemaVersion: 1, target: t, base: t.savedBase, baseDigest: t.documentDigest, selection: t.selection, readScope: scope, selected, documentSummary: summary, document: input.view === 'document' ? complete(l) : null, projectEnvelope: l.plan ? { metadata: l.plan.referenceEditor.nativeDocument.metadata ?? null, settings: l.plan.referenceEditor.nativeDocument.settings ?? null } : null, media: l.media, sourceTranscripts: l.plan?.sourceTranscripts ?? [], ...(scriptMarkdown?{scriptMarkdown}:{}), capabilities: { markdownTimeline:t.owner==='production',scriptMarkdownView:'script_markdown', typedPatch: true, ticksPerSecond: NATIVE_TICKS_PER_SECOND, nativeDocumentVersion: NATIVE_DOCUMENT_VERSION, nativeSourceRevision: NATIVE_SOURCE_REVISION, nativeRate: { min: .01, max: 5 }, paramsRegistry: Object.fromEntries(['video', 'image', 'text', 'audio', 'sticker', 'graphic', 'effect'].map(type => [type, productionNativeParamRegistryKeys(type)])), graphicDefinitions: Object.fromEntries(PRODUCTION_NATIVE_GRAPHIC_DEFINITIONS.map(id => [id, productionNativeParamRegistryKeys('graphic', id)])), effectsCatalog: [{ type: 'blur', params: productionNativeParamRegistryKeys('effect', undefined, 'blur') }], fields: t.owner === 'wechat_article' ? ['title', 'summary', 'tags', 'heading', 'headingLevel', 'body'] : t.owner === 'graphic_post' ? ['title', 'body', 'summary', 'tags', 'visualBrief'] : ['name', 'startTime', 'duration', 'trimStart', 'trimEnd', 'sourceDuration', 'mediaId', 'isSourceAudioEnabled', 'hidden', 'retime', 'params', 'animations'] }, fieldWindow, complete: true, failureCode: null, error: null });
    }
    async function propose(ctx: RequestContext, target: WorkEditorTarget, raw: WorkEditorProposeInput): Promise<WorkEditorCandidate> {
        const input = workEditorProposeInput.parse(raw), l = await load(ctx, target,input.candidate.kind==='markdown_timeline'), t = l.target, original = l.document, next = structuredClone(original);
        check(input.base, t.savedBase, '候选保存版本不符');
        if (input.baseDigest !== t.documentDigest || input.candidate.owner !== t.owner)
            fail('候选归属或基点不符');
        const candidate = input.candidate;
        let scriptDiagnostics:ReturnType<typeof planNativeScriptMarkdown>|undefined;
        if(candidate.kind==='markdown_timeline'){
            if(t.owner!=='production'||candidate.sceneId!==t.selection.sceneId)fail('Markdown候选不是当前冻结场景');
            scriptDiagnostics=planNativeScriptMarkdown(l.plan,candidate.sceneId,candidate);
            next.tracks=structuredClone(scriptDiagnostics.scene.tracks);
        }
        else if (candidate.kind === 'typed_snapshot') {
            if (t.owner === 'production') {
                const d = candidate.document as NativeSerializedScene;
                check({ ...d, tracks: null }, { ...original, tracks: null }, '不能改写原生scene受保护字段');
                next.tracks = structuredClone(d.tracks);
            }
            else if (t.owner === 'wechat_article') {
                const d = candidate.document as any;
                check({ ...d, title: null, summary: null, tags: null, sections: null }, { ...original, title: null, summary: null, tags: null, sections: null }, '不能改写文章图片、来源或布局');
                check(d.sections.map((s: any) => ({ ...s, heading: null, headingLevel: null, body: null })), original.sections.map((s: any) => ({ ...s, heading: null, headingLevel: null, body: null })), '不能改变文章section身份或来源');
                Object.assign(next, d);
            }
            else {
                const d = candidate.document as any;
                check({ ...d, title: null, body: null, summary: null, tags: null, cardBriefs: null }, { ...original, title: null, body: null, summary: null, tags: null, cardBriefs: null }, '不能改写图文图片、来源、设计或布局');
                check((d.cardBriefs ?? []).map((s: any) => ({ ...s, title: null, body: null, visualBrief: null })), (original.cardBriefs ?? []).map((s: any) => ({ ...s, title: null, body: null, visualBrief: null })), '不能改变图卡身份或来源');
                Object.assign(next, d);
            }
        }
        else if (candidate.owner === 'wechat_article' || candidate.owner === 'graphic_post') {
            const pending = new Map<string, any[]>(), written = new Set<string>();
            const declare = (key: string) => { if (written.has(key) || pending.has(key))
                fail('同字段候选修改重叠'); written.add(key); };
            for (const e of candidate.edits) {
                if (e.type === 'patchArticleMetadata' || e.type === 'patchGraphicMetadata') {
                    assertDigest(original, e.expectedDocumentDigest);
                    for (const [key, value] of Object.entries(e.patch)) {
                        declare(`metadata.${key}`);
                        next[key] = value;
                    }
                    continue;
                }
                const article = 'sectionId' in e, key = article ? e.sectionId : (e as any).cardId, originals = article ? original.sections : original.cardBriefs ?? [], items = article ? next.sections : next.cardBriefs ?? [];
                const before = originals.find((s: any) => (article ? s.sectionId : s.cardId) === key), after = items.find((s: any) => (article ? s.sectionId : s.cardId) === key);
                if (!before || !after)
                    fail('候选选区对象不存在');
                if (e.type === 'patchArticleSection' || e.type === 'patchGraphicCard') {
                    assertDigest(before, e.type === 'patchArticleSection' ? e.expectedSectionDigest : e.expectedCardDigest);
                    for (const [field, value] of Object.entries(e.patch)) {
                        declare(`${key}.${field}`);
                        after[field] = value;
                    }
                }
                else {
                    const k = `${key}.${e.field}`;
                    if (written.has(k))
                        fail('同字段候选修改重叠');
                    pending.set(k, [...(pending.get(k) ?? []), e]);
                }
            }
            for (const es of pending.values()) {
                const e = es[0], article = 'sectionId' in e, key = article ? e.sectionId : e.cardId, before = (article ? original.sections : original.cardBriefs ?? []).find((s: any) => (article ? s.sectionId : s.cardId) === key), after = (article ? next.sections : next.cardBriefs ?? []).find((s: any) => (article ? s.sectionId : s.cardId) === key);
                after[e.field] = ranges(before[e.field] ?? '', es);
            }
        }
        else {
            if (t.owner !== 'production')
                fail('候选作品类型不符');
            if (candidate.sceneId !== t.selection.sceneId)
                fail('候选不是冻结scene');
            const oldTracks = [original.tracks.main, ...original.tracks.overlay, ...original.tracks.audio] as NativeSerializedTimelineTrack[];
            const tracks = () => [next.tracks.main, ...next.tracks.overlay, ...next.tracks.audio] as NativeSerializedTimelineTrack[];
            const touched = new Set<string>();
            const beforeElement = (trackId: string, elementId: string, digest: string) => { const track = oldTracks.find(t => t.id === trackId), element = track?.elements.find(e => e.id === elementId); if (!track || !element)
                fail('候选原生元素不存在'); assertDigest(element, digest); if (touched.has(elementId))
                fail('同原生元素候选修改重叠'); touched.add(elementId); return element; };
            for (const e of candidate.edits) {
                if (e.type === 'insertNativeTrack') {
                    assertDigest(original.tracks, e.expectedTracksDigest);
                    if (e.index > next.tracks[e.lane].length)
                        fail('新增轨道位置越界');
                    next.tracks[e.lane].splice(e.index, 0, structuredClone(e.track));
                    continue;
                }
                if (e.type === 'insertNativeElement') {
                    const before = oldTracks.find(t => t.id === e.trackId), after = tracks().find(t => t.id === e.trackId);
                    if (!before || !after)
                        fail('插入轨道不存在');
                    assertDigest(before, e.expectedTrackDigest);
                    after.elements.push(structuredClone(e.element) as never);
                    continue;
                }
                if (e.type === 'moveNativeElement') {
                    const before = beforeElement(e.fromTrackId, e.elementId, e.expectedElementDigest), from = oldTracks.find(t => t.id === e.fromTrackId), to = oldTracks.find(t => t.id === e.toTrackId);
                    if (!from || !to)
                        fail('移动轨道不存在');
                    assertDigest(from, e.expectedFromTrackDigest);
                    assertDigest(to, e.expectedToTrackDigest);
                    const source = tracks().find(t => t.id === e.fromTrackId)!, destination = tracks().find(t => t.id === e.toTrackId)!;
                    source.elements = source.elements.filter(element => element.id !== e.elementId) as never;
                    destination.elements.push({ ...structuredClone(before), startTime: e.startTime } as never);
                    continue;
                }
                const before = beforeElement(e.trackId, e.elementId, e.expectedElementDigest), track = tracks().find(t => t.id === e.trackId)!, index = track.elements.findIndex(element => element.id === e.elementId);
                if (e.type === 'removeNativeElement') {
                    track.elements.splice(index, 1);
                    continue;
                }
                if (e.type === 'replaceNativeElement') {
                    if (e.element.id !== before.id)
                        fail('替换元素不能改变ID');
                    track.elements[index] = structuredClone(e.element) as never;
                    continue;
                }
                const after = { ...structuredClone(before), ...e.patch, ...(e.patch.params ? { params: { ...before.params, ...e.patch.params } } : {}), ...(e.patch.animations ? { animations: { ...before.animations, ...e.patch.animations } } : {}) } as NativeSerializedTimelineElement;
                // SEMANTIC_BOUNDARY_ALLOW: trim/rate只按原source span机械派生时长，不替模型做ripple或删留。
                if ((before.type === 'video' || before.type === 'audio') && e.patch.duration === undefined && (e.patch.trimStart !== undefined || e.patch.trimEnd !== undefined || e.patch.retime !== undefined)) {
                    const span = before.sourceDuration ?? Math.round(before.duration * ((before as {
                        retime?: {
                            rate?: number;
                        };
                    }).retime?.rate ?? 1)) + before.trimStart + before.trimEnd;
                    after.sourceDuration = e.patch.sourceDuration ?? span;
                    after.duration = Math.round((after.sourceDuration - after.trimStart - after.trimEnd) / ((after as any).retime?.rate ?? 1));
                }
                track.elements[index] = after as never;
            }
        }
        if (t.owner === 'wechat_article')
            articleDocument.parse(next);
        else if (t.owner === 'graphic_post')
            graphicPostDocument.parse(next);
        else if(!eq(original.tracks,next.tracks)){
            if(scriptDiagnostics){
                const required=nativeChangedMediaIds(original.tracks,next.tracks);
                l.media=await Promise.all(l.plan.referenceEditor.mediaRefs.filter((ref:any)=>required.has(ref.mediaId)).map(async(ref:any)=>{
                    const exact=await ports.readMedia(ctx,{projectId:t.projectId,...ref}),binding=l.plan.nativeSources?.find((item:any)=>item.mediaId===ref.mediaId);
                    return {...ref,...exact,...(binding?{durationTick:sourceNativeTick(binding.source.durationTicks,binding.source)}:{})};
                }));
            }
            validateNativeSceneTracksCandidate(original.tracks, next.tracks, l.media);
        }
        if (input.imageRequest && (t.owner !== 'graphic_post' || !(next.cardBriefs ?? []).some((c: any) => c.cardId === input.imageRequest!.cardId)))
            fail('换页图请求缺少真实card');
        const changes: Array<any> = [];
        const diff = (before: any, after: any, path: string, objectId: string) => { if (eq(before, after))
            return; if (Array.isArray(before) && Array.isArray(after)) {
            for (let index = 0; index < Math.max(before.length, after.length); index++)
                diff(before[index] ?? null, after[index] ?? null, `${path}[${index}]`, after[index]?.sectionId ?? after[index]?.cardId ?? after[index]?.id ?? before[index]?.sectionId ?? before[index]?.cardId ?? before[index]?.id ?? objectId);
        }
        else if (before && after && typeof before === 'object' && typeof after === 'object' && !Array.isArray(before) && !Array.isArray(after)) {
            for (const key of new Set([...Object.keys(before), ...Object.keys(after)]))
                diff(before[key] ?? null, after[key] ?? null, `${path}.${key}`, after.sectionId ?? after.cardId ?? after.id ?? objectId);
        }
        else
            changes.push({ path, objectId, label: path, before: before ?? null, after: after ?? null }); };
        diff(original, next, 'document', t.outputId);
        const apply = t.owner === 'wechat_article' || t.owner === 'graphic_post' ? { operation: t.owner === 'wechat_article' ? 'createArticleVersion' : 'createGraphicPostVersion', outputId: t.outputId, body: { expectedCurrentVersionId: t.savedBase.versionId, document: next } } : { operation: 'applyProductionEditor', outputId: t.outputId, body: { expectedRevision: t.savedBase.revision, edits: [{ type: 'replaceNativeSceneTracks', sceneId: next.id, expectedBeforeDigest: workEditorContentDigest(original.tracks), tracks: next.tracks }] } };
        return json({ kind: 'work.editor.candidate', schemaVersion: 1, target: t, base: t.savedBase, baseDigest: t.documentDigest, candidateDigest: workEditorContentDigest(next), summary: input.summary, candidate: complete(l, next), changes, ...(scriptDiagnostics?{scriptDiagnostics:{warnings:scriptDiagnostics.warnings,errors:scriptDiagnostics.errors,operations:scriptDiagnostics.operations}}:{}), apply:scriptDiagnostics&&!changes.length?null:apply, imageRequest: input.imageRequest ?? null, failureCode:scriptDiagnostics?.errors.length&&!changes.length?'script_input':null,error:scriptDiagnostics?.errors.length&&!changes.length?scriptDiagnostics.errors.map(issue=>`第 ${issue.line} 行：${issue.message}`).join('；'):null });
    }
    return { readTarget: async (ctx: RequestContext, target: WorkEditorTarget) => (await load(ctx, target)).target, read, propose };
}
