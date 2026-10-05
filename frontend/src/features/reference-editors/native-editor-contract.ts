export type NativeEditorTheme = {
  mode: 'light' | 'dark';
  tokens: Record<string, string>;
  fontFamily: string;
  fontSize: string;
  density: string;
};
export type NativeEditorOwner = {accountId: string; outputId: string; sourceVersionId: string};
export type NativeEditorHandle = {
  request<T = unknown>(operation: string, payload?: unknown, options?: {requestId?: string; signal?: AbortSignal}): Promise<T>;
  update(options: {theme?: NativeEditorTheme; disabled?: boolean}): void;
  dispose(): Promise<void>;
};
export type NativeEditorOptions = {
  owner: NativeEditorOwner;
  theme: NativeEditorTheme;
  portalContainer: HTMLElement;
  signal: AbortSignal;
  onChanged(value?: unknown): void;
  onError(message: string): void;
  importMedia(file: File): Promise<{mediaId: string}>;
};
export type NativeEditorModule = {mount(container: HTMLElement, options: NativeEditorOptions): Promise<NativeEditorHandle>};
export type EditorSnapshot = {document: Record<string, unknown>; mediaMetadata?: Array<Record<string, unknown>>};
export type EditorExport = EditorSnapshot & {blob: Blob; fileName: string};
