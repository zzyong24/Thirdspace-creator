import {writingContext,resolvedWritingContext} from './work-writing-context';
import {productionScriptMarkdown,productionScriptMarkdownCandidate,productionScriptDiagnostics} from './production-script-markdown';
import {z} from 'zod';
import {articleDocument} from './articles';
import {graphicPostDocument} from './graphic-posts';
import {productionNativeSceneOutput,productionNativeScene,productionNativeElement,productionNativeTrack,productionNativeParams,productionNativeAnimations,productionNativeRetime,nativeTick} from './production-native-document';
export const workEditorDigest=z.string().regex(/^sha256:[a-f0-9]{64}$/);
const id=z.string().min(1);
const integer=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const textRange=z.object({startUtf16:integer,endUtf16:integer,expectedFieldDigest:workEditorDigest}).strict().refine(v=>v.endUtf16>=v.startUtf16,'文本范围相反');
export const workEditorBase=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('artifact'),artifactId:id,versionId:id}).strict(),
 z.object({kind:z.literal('production'),productionId:id,revision:integer}).strict(),
]);
const articleSelection=z.object({kind:z.enum(['article','article_sections']),sectionIds:z.array(id),field:z.enum(['heading','body']).optional(),textRange:textRange.optional()}).strict();
const graphicSelection=z.object({kind:z.enum(['graphic_post','graphic_cards']),cardIds:z.array(id),field:z.enum(['title','body','visualBrief']).optional(),textRange:textRange.optional()}).strict();
export const workEditorElementRef=z.object({trackId:id,elementId:id}).strict();
const nativeSelection=z.object({kind:z.literal('native_scene'),sceneId:id,elementRefs:z.array(workEditorElementRef),playheadTick:nativeTick,
 timeRange:z.object({startTick:nativeTick,endTick:nativeTick,ticksPerSecond:z.literal(120000)}).strict().refine(v=>v.endTick>=v.startTick).optional(),
 transcript:z.object({sourceId:id,transcriptId:id,tokenIds:z.array(id)}).strict().optional(),contextEpoch:integer,editorGeneration:id,
}).strict();
const common={schemaVersion:z.literal(1),projectId:id,outputId:id,documentDigest:workEditorDigest};
const artifactBase=z.object({kind:z.literal('artifact'),artifactId:id,versionId:id}).strict();
const productionBase=z.object({kind:z.literal('production'),productionId:id,revision:integer}).strict();
export const workEditorTarget=z.discriminatedUnion('owner',[
 z.object({...common,owner:z.literal('wechat_article'),writingContext:writingContext.optional(),contentType:z.literal('article'),savedBase:artifactBase,selection:articleSelection}).strict(),
 z.object({...common,owner:z.literal('graphic_post'),contentType:z.literal('image'),savedBase:artifactBase,selection:graphicSelection}).strict(),
 z.object({...common,owner:z.literal('production'),contentType:z.literal('video'),savedBase:productionBase,selection:nativeSelection}).strict(),
]);
export type WorkEditorTarget=z.infer<typeof workEditorTarget>;
export type WorkEditorBase=z.infer<typeof workEditorBase>;
export const workEditorReadScope=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('article_sections'),sectionIds:z.array(id)}).strict(),
 z.object({kind:z.literal('graphic_cards'),cardIds:z.array(id)}).strict(),
 z.object({kind:z.literal('native_elements'),sceneId:id,elementRefs:z.array(workEditorElementRef)}).strict(),
]);
export const workEditorFieldWindow=z.object({target:z.enum(['article_section','graphic_card','article_metadata','graphic_metadata']),id:id.optional(),field:z.enum(['heading','body','title','summary','visualBrief']),offsetUtf16:integer,lengthUtf16:integer.min(1).max(20000)}).strict();
export const workEditorReadInputV1=z.object({view:z.enum(['selection','index','document','field_window']).default('selection'),scope:workEditorReadScope.optional(),fieldWindow:workEditorFieldWindow.optional()}).strict().superRefine((v,c)=>{
 if((v.view==='field_window')!==Boolean(v.fieldWindow))c.addIssue({code:'custom',message:'field_window必须提供且仅能提供对应窗口'});
});
export const workEditorReadInput=z.object({...workEditorReadInputV1.shape,view:z.enum(['selection','index','document','field_window','script_markdown']).default('selection')}).strict().superRefine((v,c)=>{if((v.view==='field_window')!==Boolean(v.fieldWindow))c.addIssue({code:'custom',message:'field_window必须提供且仅能提供对应窗口'});});
const range={expectedFieldDigest:workEditorDigest,startUtf16:integer,endUtf16:integer,replacementText:z.string()};
const rangeOrder=(v:{startUtf16:number;endUtf16:number})=>v.endUtf16>=v.startUtf16;
export const workEditorArticleEdit=z.discriminatedUnion('type',[
 z.object({type:z.literal('patchArticleMetadata'),expectedDocumentDigest:workEditorDigest,patch:z.object({title:z.string().optional(),summary:z.string().optional(),tags:z.array(z.string()).optional()}).strict()}).strict(),
 z.object({type:z.literal('patchArticleSection'),sectionId:id,expectedSectionDigest:workEditorDigest,patch:z.object({heading:z.string().optional(),headingLevel:z.number().int().min(1).max(6).optional(),body:z.string().optional()}).strict()}).strict(),
 z.object({type:z.literal('replaceArticleTextRange'),sectionId:id,field:z.enum(['heading','body']),...range}).strict().refine(rangeOrder),
]);
export const workEditorGraphicEdit=z.discriminatedUnion('type',[
 z.object({type:z.literal('patchGraphicMetadata'),expectedDocumentDigest:workEditorDigest,patch:z.object({title:z.string().optional(),body:z.string().optional(),summary:z.string().optional(),tags:z.array(z.string()).optional()}).strict()}).strict(),
 z.object({type:z.literal('patchGraphicCard'),cardId:id,expectedCardDigest:workEditorDigest,patch:z.object({title:z.string().optional(),body:z.string().optional(),visualBrief:z.string().optional()}).strict()}).strict(),
 z.object({type:z.literal('replaceGraphicTextRange'),cardId:id,field:z.enum(['title','body','visualBrief']),...range}).strict().refine(rangeOrder),
]);
const elementTarget={trackId:id,elementId:id,expectedElementDigest:workEditorDigest};
export const workEditorNativeEdit=z.discriminatedUnion('type',[
 z.object({type:z.literal('patchNativeElement'),...elementTarget,patch:z.object({name:z.string().optional(),startTime:nativeTick.optional(),duration:nativeTick.optional(),trimStart:nativeTick.optional(),trimEnd:nativeTick.optional(),sourceDuration:nativeTick.optional(),mediaId:id.optional(),isSourceAudioEnabled:z.boolean().optional(),hidden:z.boolean().optional(),retime:productionNativeRetime.optional(),params:productionNativeParams.optional(),animations:productionNativeAnimations.optional()}).strict()}).strict(),
 z.object({type:z.literal('replaceNativeElement'),...elementTarget,element:productionNativeElement}).strict(),
 z.object({type:z.literal('insertNativeElement'),trackId:id,expectedTrackDigest:workEditorDigest,element:productionNativeElement}).strict(),
 z.object({type:z.literal('removeNativeElement'),...elementTarget}).strict(),
 z.object({type:z.literal('moveNativeElement'),fromTrackId:id,toTrackId:id,elementId:id,expectedElementDigest:workEditorDigest,expectedFromTrackDigest:workEditorDigest,expectedToTrackDigest:workEditorDigest,startTime:nativeTick}).strict(),
 z.object({type:z.literal('insertNativeTrack'),lane:z.enum(['overlay','audio']),index:integer,expectedTracksDigest:workEditorDigest,track:productionNativeTrack}).strict(),
]);
export const workEditorCompleteCandidate=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('article'),document:articleDocument}).strict(),
 z.object({kind:z.literal('graphic_post'),document:graphicPostDocument}).strict(),
 z.object({kind:z.literal('native_scene'),document:productionNativeSceneOutput}).strict(),
]);
export const workEditorCandidateInputV1=z.union([
 z.object({kind:z.literal('typed_patch'),owner:z.literal('wechat_article'),edits:z.array(workEditorArticleEdit).min(1).max(1000)}).strict(),
 z.object({kind:z.literal('typed_patch'),owner:z.literal('graphic_post'),edits:z.array(workEditorGraphicEdit).min(1).max(1000)}).strict(),
 z.object({kind:z.literal('typed_patch'),owner:z.literal('production'),sceneId:id,edits:z.array(workEditorNativeEdit).min(1).max(1000)}).strict(),
 z.object({kind:z.literal('typed_snapshot'),owner:z.literal('wechat_article'),document:articleDocument}).strict(),
 z.object({kind:z.literal('typed_snapshot'),owner:z.literal('graphic_post'),document:graphicPostDocument}).strict(),
 z.object({kind:z.literal('typed_snapshot'),owner:z.literal('production'),document:productionNativeScene}).strict(),
]);
export const workEditorCandidateInput=z.union([workEditorCandidateInputV1,productionScriptMarkdownCandidate]);
export const workEditorImageRequest=z.object({cardId:id,visualRequirements:z.string().min(1)}).strict();
export const workEditorProposeInputV1=z.object({base:workEditorBase,baseDigest:workEditorDigest,summary:z.string().min(1),candidate:workEditorCandidateInputV1,imageRequest:workEditorImageRequest.nullable().optional()}).strict();
export const workEditorProposeInput=workEditorProposeInputV1.extend({candidate:workEditorCandidateInput});
export const workEditorChange=z.object({path:z.string(),objectId:id,label:z.string(),before:z.json(),after:z.json()}).strict();
export const workEditorApply=z.discriminatedUnion('operation',[
 z.object({operation:z.literal('createArticleVersion'),outputId:id,body:z.object({expectedCurrentVersionId:id,document:articleDocument}).strict()}).strict(),
 z.object({operation:z.literal('createGraphicPostVersion'),outputId:id,body:z.object({expectedCurrentVersionId:id,document:graphicPostDocument}).strict()}).strict(),
 z.object({operation:z.literal('applyProductionEditor'),outputId:id,body:z.object({expectedRevision:integer,edits:z.array(z.object({type:z.literal('replaceNativeSceneTracks'),sceneId:id,expectedBeforeDigest:workEditorDigest,tracks:z.record(z.string(),z.json())}).strict()).min(1)}).strict()}).strict(),
]);
export const workEditorCandidate=z.object({kind:z.literal('work.editor.candidate'),schemaVersion:z.literal(1),target:workEditorTarget,base:workEditorBase,baseDigest:workEditorDigest,candidateDigest:workEditorDigest.nullable(),summary:z.string(),candidate:workEditorCompleteCandidate.nullable(),changes:z.array(workEditorChange),scriptDiagnostics:productionScriptDiagnostics.optional(),apply:workEditorApply.nullable(),imageRequest:workEditorImageRequest.nullable(),failureCode:z.string().nullable(),error:z.string().nullable()}).strict();
export const workEditorContext=z.object({kind:z.literal('work.editor.context'),schemaVersion:z.literal(1),target:workEditorTarget,resolvedWritingContext:resolvedWritingContext.optional(),base:workEditorBase,baseDigest:workEditorDigest,selection:z.union([articleSelection,graphicSelection,nativeSelection]),readScope:z.record(z.string(),z.json()),selected:z.array(z.record(z.string(),z.json())),documentSummary:z.record(z.string(),z.json()),document:workEditorCompleteCandidate.nullable(),projectEnvelope:z.record(z.string(),z.json()).nullable(),media:z.array(z.record(z.string(),z.json())),sourceTranscripts:z.array(z.record(z.string(),z.json())),capabilities:z.record(z.string(),z.json()),scriptMarkdown:productionScriptMarkdown.optional(),fieldWindow:z.object({offsetUtf16:integer,totalUtf16:integer,fieldDigest:workEditorDigest,text:z.string(),hasMore:z.boolean(),nextOffsetUtf16:integer.nullable()}).strict().nullable(),complete:z.boolean(),failureCode:z.string().nullable(),error:z.string().nullable()}).strict();
export type WorkEditorReadInput=z.input<typeof workEditorReadInput>;
export type WorkEditorProposeInput=z.infer<typeof workEditorProposeInput>;
export type WorkEditorCandidate=z.infer<typeof workEditorCandidate>;
export type WorkEditorContext=z.infer<typeof workEditorContext>;

export const productionScriptReadBody=z.object({target:workEditorTarget}).strict().refine(v=>v.target.owner==='production','目标须为当前视频工程');
export const productionScriptProposeBody=z.object({target:workEditorTarget,input:workEditorProposeInput}).strict().refine(v=>v.target.owner==='production'&&v.input.candidate.kind==='markdown_timeline','目标须为当前视频Markdown候选');
