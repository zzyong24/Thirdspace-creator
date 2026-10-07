'use client';
import * as React from 'react';
import type {NativeEditorHandle, NativeEditorOwner} from './native-editor-contract';
import {loadNativeEditor} from './native-editor-loader';
import {applyNativeEditorTheme, useNativeEditorTheme} from './native-editor-theme';
export type {EditorSnapshot, EditorExport, NativeEditorHandle} from './native-editor-contract';

type Props = {
  editor: 'kuaitu' | 'opencut-classic' | 'doocs-md' | 'noterelay';
  owner: NativeEditorOwner;
  disabled?: boolean;
  visible?:boolean;
  onReady(): void;
  onChanged(value?: unknown): void;
  onImport(file: File, options?:{signal?:AbortSignal}): Promise<{mediaId: string}>;
  onError(message: string): void;
  onImportActivity?(pending:number):void;
};
/** 固定本地源码直接挂载；ShadowRoot 只隔离样式，业务正式稿由原作品服务持有。 */
export const NativeEditorSurface = React.forwardRef<NativeEditorHandle, Props>(function NativeEditorSurface(props, ref) {
  const host = React.useRef<HTMLDivElement>(null);
  const active = React.useRef<NativeEditorHandle | null>(null);
  const pending = React.useRef(new Map<string, {reject(error: Error): void; cleanup(): void}>());
  const callbacks = React.useRef(props);
  const theme = useNativeEditorTheme();
  const latestTheme = React.useRef(theme);
  const [state, setState] = React.useState<'opening' | 'ready' | 'failed'>('opening');
  React.useLayoutEffect(() => {callbacks.current = props; latestTheme.current = theme;});
  React.useImperativeHandle(ref, () => ({
    request: async <T,>(operation: string, payload?: unknown, options?: {requestId?: string; signal?: AbortSignal}) => {
      const handle = active.current;
      if (!handle) throw new Error('编辑器尚未准备好');
      options?.signal?.throwIfAborted();
      const requestId = options?.requestId ?? crypto.randomUUID();
      const requestController=new AbortController();
      if (pending.current.has(requestId)) throw new Error('原编辑请求仍在确认，请等待回复');
      return new Promise<T>((resolve, reject) => {
        const requests = pending.current;
        const cleanup = () => {clearTimeout(timer); options?.signal?.removeEventListener('abort', abort); if (requests.get(requestId) === entry) requests.delete(requestId);};
        const fail = (error: Error) => {requestController.abort(); cleanup(); reject(error);};
        const abort = () => fail(new Error('编辑操作已停止，当前输入已保留'));
        const timer = setTimeout(() => fail(new Error('编辑操作尚未确认，当前内容已保留，请重试')), 900000);
        const entry = {reject: fail, cleanup};
        requests.set(requestId, entry);
        options?.signal?.addEventListener('abort', abort, {once: true});
        void Promise.resolve().then(() => {
          if (active.current !== handle || requests.get(requestId) !== entry) throw new Error('已切换作品，原操作停止');
          return handle.request<T>(operation, payload, {...options, requestId,signal:requestController.signal});
        }).then(result => {
          if (requests.get(requestId) !== entry) return;
          if (active.current !== handle) {fail(new Error('已切换作品，原操作停止')); return;}
          cleanup(); resolve(result);
        }, error => fail(error instanceof Error ? error : new Error('编辑操作未完成')));
      });
    },
    update: options => active.current?.update(options),
    dispose: async () => {const handle = active.current; active.current = null; for (const request of pending.current.values()) request.reject(new Error('已离开当前作品')); await handle?.dispose();},
  }), []);
  const {groupId=null,accountId,projectId,outputId,sourceVersionId}=props.owner;
  const effectiveAccountId=groupId?null:accountId;
  const editor = props.editor;
  const themeReady = theme !== null;
  React.useEffect(() => {
    if (!host.current || !latestTheme.current) return;
    const controller = new AbortController();
    const requests = pending.current;
    const importForOwner = callbacks.current.onImport;
    const isCurrent = () => !controller.signal.aborted && callbacks.current.editor === editor && (callbacks.current.owner.groupId??null) === groupId && (groupId||callbacks.current.owner.accountId===effectiveAccountId) && callbacks.current.owner.projectId===projectId && callbacks.current.owner.outputId === outputId && callbacks.current.owner.sourceVersionId === sourceVersionId;
    const element = host.current;
    const shadow = element.shadowRoot ?? element.attachShadow({mode: 'open'});
    const container = document.createElement('div');
    const portals = document.createElement('div');
    container.style.cssText = 'height:100%;min-height:0;min-width:0;position:relative;overflow:hidden;';
    container.tabIndex = -1;
    portals.dataset.nativePortalRoot = '';
    portals.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:60;';
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = `/reference-editors/${editor}/native/native.css`;
    const baseStyle = document.createElement('style');
    baseStyle.textContent = ':host{display:block;height:100%;min-height:0;color:var(--creatoros-text);background:var(--creatoros-surface);font-family:var(--creatoros-font-sans)}*,*::before,*::after{box-sizing:border-box}[data-native-portal-root]>*{pointer-events:auto}';
    let mounted: NativeEditorHandle | undefined;
    let cssResolve: () => void;
    let cssReject: (error: Error) => void;
    const cssReady = new Promise<void>((resolve, reject) => {cssResolve = resolve; cssReject = reject;});
    css.onload = () => cssResolve();
    css.onerror = () => cssReject(new Error('编辑器样式读取失败，请重新打开工作台'));
    const abortCss = () => cssReject(new Error('已离开当前作品'));
    const cssTimer = setTimeout(() => cssReject(new Error('编辑器样式读取超时，请重新打开工作台')), 120000);
    void cssReady.finally(() => clearTimeout(cssTimer)).catch(() => undefined);
    controller.signal.addEventListener('abort', abortCss, {once: true});
    applyNativeEditorTheme(element, latestTheme.current);
    shadow.replaceChildren(baseStyle, css, container, portals);
    setState('opening');
    void (async () => {
      try {
        const [module] = await Promise.all([loadNativeEditor(editor), cssReady]);
        controller.signal.throwIfAborted();
        mounted = await module.mount(container, {
          owner: {groupId,accountId:effectiveAccountId,projectId,outputId,sourceVersionId}, theme: latestTheme.current!, portalContainer: portals, signal: controller.signal,
          onChanged: value => {if (isCurrent()) callbacks.current.onChanged(value);},
          onError: message => {if (isCurrent()) callbacks.current.onError(message);},
          onImportActivity: pending => {if(isCurrent())callbacks.current.onImportActivity?.(pending);},
          importMedia: async (file,options) => {if (!isCurrent()) throw new Error('已切换作品'); const result = await importForOwner(file,{signal:options?.signal?AbortSignal.any([controller.signal,options.signal]):controller.signal}); if (!isCurrent()) throw new Error('已切换作品'); return result;},
        });
        if (controller.signal.aborted) {await mounted.dispose(); return;}
        active.current = mounted;
        mounted.update({theme: latestTheme.current!, disabled: callbacks.current.disabled,visible:callbacks.current.visible});
        setState('ready'); callbacks.current.onReady();
      } catch (error) {
        if (!controller.signal.aborted) {setState('failed'); callbacks.current.onError(error instanceof Error ? error.message : '编辑器没有完成加载');}
      }
    })();
    return () => {
      controller.abort();
      controller.signal.removeEventListener('abort', abortCss);
      if (active.current === mounted) active.current = null;
      for (const request of requests.values()) request.reject(new Error('已切换作品，原操作停止'));
      void mounted?.dispose().catch(() => undefined);
      css.onload = null; css.onerror = null;
      // 只移除此挂载的节点，StrictMode 的下一实例可能已经接管同一 ShadowRoot。
      for (const node of [container, portals, css, baseStyle]) node.remove();
    };
  // Theme 变化由 update 处理，不能重建时间轴或丢失图层。
  }, [editor,groupId,effectiveAccountId,projectId,outputId,sourceVersionId,themeReady]);
  React.useEffect(() => {
    if (theme && host.current) {applyNativeEditorTheme(host.current, theme); active.current?.update({theme, disabled: props.disabled,visible:props.visible});}
  }, [theme, props.disabled,props.visible]);
  return <div className="relative h-full min-h-0 min-w-0" aria-busy={state === 'opening'}>
    {state !== 'ready' && <p role="status" className="absolute inset-x-0 top-0 z-10 bg-surface p-4 text-sm text-muted-foreground">{state === 'failed' ? '编辑器未完成加载，当前稿件已保留。' : '正在打开编辑器…'}</p>}
    <div ref={host} className="relative h-full min-h-0 w-full" aria-label={props.editor === 'opencut-classic' ? '视频剪辑工作台' : props.editor === 'kuaitu' ? '图片设计工作台' : '公众号排版编辑器'} />
  </div>;
});
