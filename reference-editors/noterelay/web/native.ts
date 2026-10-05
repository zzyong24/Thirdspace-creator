import {noteRelayLayout, type NoteRelayLayout} from './noterelay-layout';
import {WechatAdapter} from '../src/platforms/wechat/adapter';
import {RednoteAdapter} from '../src/platforms/rednote/adapter';
import {parseNote} from '../src/core/markdown';
import {DEFAULT_SETTINGS} from '../src/defaults';
import {listThemes, resolveTheme} from '../src/themes/themeService';
import type {RenderContext} from '../src/types';
import type {Delivery} from './host-port';

type Theme = {mode: 'light' | 'dark'; tokens: Record<string, string>; fontFamily: string; fontSize: string; density: string};
type Options = {
  owner: {accountId: string; outputId: string; sourceVersionId: string}; theme: Theme;
  portalContainer: HTMLElement; signal: AbortSignal;
  onChanged(value?: unknown): void; onError(message: string): void;
};
type DocumentInput = {platform: 'wechat' | 'rednote'; title: string; markdown: string; layout: NoteRelayLayout; images: Array<{source: string; blob: Blob}>};
const placeholder = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
export async function mount(container: HTMLElement, options: Options) {
  options.signal.throwIfAborted();
  const lifetime = new AbortController();
  const abort = () => lifetime.abort();
  options.signal.addEventListener('abort', abort, {once: true});
  container.classList.add('creatoros-noterelay-native');
  const preview = document.createElement('div'); preview.className = 'creatoros-noterelay-stage';
  container.append(preview);
  const adapters = {wechat: new WechatAdapter(), rednote: new RednoteAdapter()};
  let input: DocumentInput | undefined, context: RenderContext | undefined, root: HTMLElement | undefined;
  let renderLifetime = new AbortController(), epoch = 0, selectedImage = '', disabled = false;
  const operations = new Set<Promise<unknown>>();
  const requests = new Set<string>();
  let urls = new Map<string, string>(), assets = new Map<string, Blob>();
  const assert = () => lifetime.signal.throwIfAborted();
  function metadata() {
    const cards = root ? Array.from(root.querySelectorAll<HTMLElement>('.noterelay-rednote-card')) : [];
    return {layout: input?.layout, themes: input ? listThemes(structuredClone(DEFAULT_SETTINGS), input.platform).map(t => ({id: t.id, name: t.name})) : [],
      pageIndex: Number(root?.dataset.activeIndex ?? 0), pageCount: cards.length,
      selectedImage, images: root ? Array.from(root.querySelectorAll<HTMLImageElement>('img[data-noterelay-image-key]')).map((image, index) => ({key: image.dataset.noterelayImageKey!, label: image.alt || `图片 ${index + 1}`})) : []};
  }
  function notify() {if (!lifetime.signal.aborted) options.onChanged(metadata());}
  async function render(next: DocumentInput) {
    const parsedLayout = noteRelayLayout.parse(next.layout);
    for (const image of next.images ?? []) {
      if (typeof image.source !== 'string' || !image.source.startsWith('creatoros-asset:') || !(image.blob instanceof Blob) || !image.blob.type.startsWith('image/')) throw new Error('图片引用不属于当前稿件');
    }
    assert(); renderLifetime.abort(); renderLifetime = new AbortController();
    const rendering = renderLifetime;
    const cancelRender = () => rendering.abort();
    lifetime.signal.addEventListener('abort', cancelRender, {once: true});
    rendering.signal.addEventListener('abort', () => lifetime.signal.removeEventListener('abort', cancelRender), {once: true});
    const generation = ++epoch;
    const oldUrls = urls;
    urls = new Map(); assets = new Map();
    for (const image of next.images ?? []) {
      assets.set(image.source, image.blob); urls.set(image.source, URL.createObjectURL(image.blob));
    }
    input = {...next, layout: parsedLayout};
    const frozenAssets = assets, frozenUrls = urls;
    const settings = structuredClone(DEFAULT_SETTINGS), layout = input.layout;
    settings.activeThemeIds[next.platform] = layout.themeId;
    settings.rednoteFontSize = layout.fontSize; settings.rednoteSplitHeading = layout.splitHeading;
    settings.rednoteTemplateId = layout.templateId;
    settings.rednoteImageWidths = {draft: layout.imageWidths}; settings.rednoteImageRadii = {draft: layout.imageRadii};
    context = {
      note: parseNote(next.markdown, next.title), notePath: 'draft', settings, theme: resolveTheme(settings, next.platform),
      account: {id: 'draft', platform: next.platform, name: layout.authorName, signature: layout.authorBio, handle: '', avatarUrl: '', variables: layout.variables, enabled: true},
      signal: rendering.signal, nativeControls: true,
      resolveImageSrc: source => frozenUrls.get(source) ?? placeholder,
      resolveImageDataUrl: async source => {
        const blob = frozenAssets.get(source); if (!blob) return undefined;
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          const cancel = () => {reader.abort(); reject(new Error('已切换稿件'));};
          const cleanup = () => rendering.signal.removeEventListener('abort', cancel);
          reader.onload = () => {cleanup(); if (rendering.signal.aborted) reject(new Error('已切换稿件')); else resolve(String(reader.result));};
          reader.onerror = () => {cleanup(); reject(new Error('图片读取失败'));};
          rendering.signal.throwIfAborted(); rendering.signal.addEventListener('abort', cancel, {once: true}); reader.readAsDataURL(blob);
        });
      },
      onImageSelected: key => {if (!rendering.signal.aborted) {selectedImage = key; if (root) adapters.rednote.revealImage(root, key); notify();}},
    };
    root = adapters[next.platform].render(context);
    root.querySelector('[data-rednote-copy]')?.remove();
    const nav = root.querySelector<HTMLElement>('.noterelay-card-nav'); if (nav) nav.hidden = true;
    preview.replaceChildren(root);
    // 旧导出使用冻结上下文；直到相应操作结束才回收其图片 URL。
    const previousOperations = [...operations];
    void Promise.allSettled(previousOperations).then(() => {for (const url of oldUrls.values()) URL.revokeObjectURL(url);});
    if (next.platform === 'rednote') await adapters.rednote.ensureLayout(root, context);
    assert(); rendering.signal.throwIfAborted();
    if (epoch !== generation) throw new Error('稿件已改变，请重新读取');
    const images = metadata().images;
    if (!images.some(image => image.key === selectedImage)) selectedImage = images[0]?.key ?? '';
    if (selectedImage && next.platform === 'rednote') adapters.rednote.revealImage(root, selectedImage);
    notify(); return metadata();
  }
  async function execute(operation: string, payload?: unknown) {
    assert();
    if (operation === 'load') {
      const next = payload as DocumentInput;
      if (!next || typeof next.title !== 'string' || typeof next.markdown !== 'string' || !['wechat', 'rednote'].includes(next.platform)) throw new Error('稿件输入无效');
      return render(next);
    }
    if (!input || !root || !context) throw new Error('预览尚未准备好');
    if (operation === 'snapshot') return metadata();
    if (disabled && operation !== 'export') throw new Error('当前操作尚未结束');
    if (operation === 'page') {
      const index = (payload as {index: number}).index, cards = Array.from(root.querySelectorAll<HTMLElement>('.noterelay-rednote-card'));
      if (!Number.isInteger(index) || index < 0 || index >= cards.length) throw new Error('页面不存在');
      root.dataset.activeIndex = String(index); cards.forEach((card, i) => card.classList.toggle('is-active', i === index)); notify(); return metadata();
    }
    if (operation === 'select-image') {selectedImage = (payload as {key: string}).key; adapters.rednote.revealImage(root, selectedImage); notify(); return metadata();}
    if (operation === 'export') {
      if (!input.markdown.trim()) throw new Error('先填写正文，再交付作品');
      const frozenEpoch = epoch, frozenContext = context, frozenRoot = root, platform = input.platform;
      let result: Delivery | undefined;
      const exportContext = {...frozenContext, onDeliver: (value: Delivery) => {result = value;}};
      const action = (payload as {action: string}).action;
      if (platform === 'wechat') await adapters.wechat.copy(exportContext);
      else if (action === 'zip') await adapters.rednote.downloadAll(exportContext, frozenRoot);
      else if (action === 'png') await adapters.rednote.downloadCurrent(exportContext, frozenRoot);
      else if (action === 'copy-png') await adapters.rednote.copy(exportContext, frozenRoot);
      else throw new Error('未知交付操作');
      assert(); frozenContext.signal?.throwIfAborted();
      if (epoch !== frozenEpoch || !result) throw new Error('稿件已改变，请重新导出');
      return result;
    }
    throw new Error('不支持此编辑操作');
  }
  let exporting = false;
  return {
    async request(operation: string, payload?: unknown, requestOptions?: {requestId?: string; signal?: AbortSignal}) {
      assert(); requestOptions?.signal?.throwIfAborted();
      const requestId = requestOptions?.requestId ?? crypto.randomUUID();
      if (requests.has(requestId)) return Promise.reject(new Error('原操作仍在确认'));
      if (operation === 'export' && exporting) return Promise.reject(new Error('前次导出尚未结束，请稍候重试'));
      if (operation === 'export') exporting = true;
      requests.add(requestId);
      const promise = execute(operation, payload).then(result => {assert(); requestOptions?.signal?.throwIfAborted(); return result;});
      operations.add(promise);
      void promise.finally(() => {operations.delete(promise); requests.delete(requestId); if (operation === 'export') exporting = false;}).catch(() => undefined);
      return promise;
    },
    update(value: {theme?: Theme; disabled?: boolean}) {disabled = value.disabled ?? disabled; container.inert = disabled;},
    async dispose() {
      lifetime.abort(); renderLifetime.abort(); epoch++;
      options.signal.removeEventListener('abort', abort);
      await Promise.allSettled([...operations]);
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear(); assets.clear(); preview.remove(); requests.clear();
    },
  };
}
