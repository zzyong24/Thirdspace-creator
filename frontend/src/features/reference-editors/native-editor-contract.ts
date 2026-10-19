export type NativeEditorTheme = {
  mode: 'light' | 'dark';
  tokens: Record<string, string>;
  fontFamily: string;
  fontSize: string;
  density: string;
};
/** 本地桥范围；不向公共DTO添加归属证明。旧账号调用可逐步迁移。 */
export type NativeEditorOwner = {groupId:string|null;accountId: string|null;projectId:string; outputId: string; sourceVersionId: string};
export type NativeContextEvent = {kind:'native-context';contextEpoch:number;outputId:string;sceneId:string|null;selectedElements:unknown[];documentChanged:boolean};
export function isNativeContextEvent(value:unknown):value is NativeContextEvent {
 if(!value||typeof value!=='object')return false;
 const row=value as Partial<NativeContextEvent>;
 return row.kind==='native-context'&&Number.isSafeInteger(row.contextEpoch)&&typeof row.outputId==='string'&&(row.sceneId===null||typeof row.sceneId==='string')&&Array.isArray(row.selectedElements)&&typeof row.documentChanged==='boolean';
}
export type NativeEditorHandle = {
  request<T = unknown>(operation: string, payload?: unknown, options?: {requestId?: string; signal?: AbortSignal}): Promise<T>;
  update(options: {theme?: NativeEditorTheme; disabled?: boolean;visible?:boolean}): void;
  dispose(): Promise<void>;
};
export type NativeEditorOptions = {
  owner: NativeEditorOwner;
  workspaceAddons?:boolean;
  theme: NativeEditorTheme;
  portalContainer: HTMLElement;
  signal: AbortSignal;
  onChanged(value?: unknown): void;
  onError(message: string): void;
  onImportActivity?(pending:number):void;
  importMedia(file: File, options?:{signal?:AbortSignal}): Promise<{mediaId: string}>;
};
export type NativeEditorModule = {mount(container: HTMLElement, options: NativeEditorOptions): Promise<NativeEditorHandle>};
export type EditorSnapshot = {document: Record<string, unknown>; mediaMetadata?: Array<Record<string, unknown>>};
export type EditorExport = EditorSnapshot & {blob: Blob; fileName: string};

export type NativeEditorContext=EditorSnapshot&{documentVersion?:31;contextEpoch:number;outputId:string;sceneId:string;trackId:string;selectedElements:Array<{trackId:string;elementId:string}>;playheadTick:number;ticksPerSecond:120000};
export type NativePreviewMedia={mediaId:string;assetId:string;assetFileId:string;file:File;name:string;type:string;size:number;lastModified:number;width?:number;height?:number;duration?:number;fps?:number;hasAudio?:boolean};
export type NativePreviewSceneRequest={owner:NativeEditorOwner;targetSceneId:string;baseContextEpoch:number;beforeDigest:string;candidateDigest:string;tracks:Record<string,unknown>;media:NativePreviewMedia[]};
export type NativePreviewSceneResult={operation:'preview-scene';blob:Blob;fileName:string;sceneId:string;candidateDigest:string;contextEpoch:number;documentVersion:31;warnings?:Array<{code:'preserved_missing_media';trackId:string;elementId:string;mediaId:string;message:string}>};
