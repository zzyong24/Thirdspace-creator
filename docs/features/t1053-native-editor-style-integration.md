# T-1053 — 原生集成开源编辑器并统一 CreatorOS 风格

## 用户确认与执行路线

2026-10-03 用户明确：引用的开源项目应与现有项目风格一致，直接成为项目工作面，不采用超链接或 iframe 导入。此要求覆盖已接入的 NoteRelay、OpenCut classic、快图以及保留旧版式的 Doocs，取代此前独立网页/iframe 的技术选择。保持脚本为主稿及原作品、素材、工程、版本与候选采纳服务。DEC-T1053-01 记录此确认；当前维护期 BUILD，原生宿主合同先独立评审再实施。不以新的拆分任务缩减已确认范围。

## 大白话与图

编辑器使用 CreatorOS 的背景、字体、按钮、面板和滚动方式，直接在当前工作台操作；原开源引擎负责画布、时间轴与排版，正式内容继续保存到原稿。公众号文章、图卡和视频本身的颜色/字体仍按用户作品设置，应用的紫色主题不会改写作品。

```mermaid
flowchart LR
 A[CreatorOS 项目工作台] --> B[同一套主题和控件]
 B --> C[原生挂载原开源组件]
 C --> D[原时间轴 / 画布 / 排版引擎]
 D --> E[原作品与精确素材服务]
 E --> F[保存历史与真实交付]
```

## 固定复用源与实查

- OpenCut classic：`cf5e79e919144200294fb9fed22a222592a0aeea`，归档 `reference-editors/opencut-classic/source.tar.gz` SHA256 `ad5a2b874a2b50ab10fca522a271b5c929f383af5c9e40bdf1c3f4feb45360a6`；最新展开源 `/tmp/t1046-ui-work/upstream/opencut-classic-source`，保留 T1046 的原生轨道操作、回执与冻结导出，不使用较旧 video 目录。
- 快图：`b3bdcfb0bd6d8f98e7483cf561ac03ba56c0d889`，归档 SHA256 `6c953a34d6e9deb2a53897da3e346ed292a9869bebcf9f3b4e8585a7d3858294`，展开源 `/tmp/creatoros-reference-graphic/vue-fabric-editor`；继续原 Vue/Fabric/插件三栏工作面。
- Doocs：`a7c17fc4cda92e3c13aa7e24f06615cfa4219b31`，源码 `/tmp/t1049-reference-doocs`；继续原 CodeMirror、Vue 预览、主题与 HTML 导出。
- NoteRelay：0.1.8、T1052 快照 `a91b976a2fe25453dafb22d9b407ee6a5508e889da5083fe2901b395f28f5667`；继续原公众号/图文 adapter、主题、分页与交付。

只读实查已识别：OpenCut 的模块单例/全页导出锁/全局主题，快图的全局快捷键与不完整插件销毁，Doocs 的路径驱动内存分支/全页查询/轮询/主题副作用，NoteRelay 的原型猴补丁/单例交付 receiver。不能仅把 createApp/createRoot 换个挂载点便声称原生兼容。

## 原生宿主合同

FR-01：四类编辑工作面直接挂载到当前页面的 HTMLElement；运行原固定源码的 React/Vue/DOM组件，不加载独立 index.html、不使用 iframe、hash 路由、parent/window.postMessage 或跳转链接作为编辑入口。保留来源与许可说明/源码下载，放入可折叠说明，不冒充外部编辑入口。可使用组件 ShadowRoot 隔离样式，属于同一 DOM 的原生组件；不执行用户生成脚本。既有隔离不可信成片 HTML 的安全预览不作为开源编辑器接入方式，不擅自放开其执行权限。

FR-02：宿主动态加载可信本地 ESM 构建，接口为 `mount(container, options) → Promise<NativeEditorHandle>`；options 含 owner `{accountId,outputId,sourceVersionId}`、当前应用主题、实例 portalContainer、AbortSignal 与 onChanged/onError/importMedia 回调。handle 提供 `request(operation,payload,{requestId?,signal?})`、`update({theme,disabled})`、`dispose():Promise<void>`；所有生命周期与监听归此实例。操作名称、返回数据与既有 owner 服务保持原协议语义。

FR-03：OpenCut/快图保留 load、snapshot、insert-media、export，OpenCut 保留 context、seek、apply-tracks 与原 NativePatchReplay。快图继续原 getJson/loadJSON/previewDocument，PNG 配对实际同次冻结 JSON；OpenCut 继续原 MediaBunny/WebCodecs 导出与冻结工程，采纳同一原时间轴并可撤销。未完成的导入/保存/导出保留原回执和重试语义，不另造作品 JSON 或简化假编辑器。

FR-04：Doocs 原生 handle 接收文档/精确素材/版式，直接报告当前 Markdown与 nativeLayout；保留稳定段落标记、draft sessionStorage、旧 nativeLayout、CAS 保存及 HTML/资源 ZIP。显式使用内存存储，不依赖 CreatorOS 当前 URL 判定，禁止 IndexedDB/OPFS 成为正式稿或素材 owner。原生入口只挂载实际编辑/预览组件，移除原全站标题、lang、html/theme、账号、云图库等副作用。

FR-05：NoteRelay 原生 handle 直接更新标题/Markdown/版式/已核验图片 Blob，直接返回 HTML/plainText/PNG/ZIP。控件采用现有 React Button/Input/Select/折叠区；复用原导航、图片宽度/圆角、DOM溢出分页与主题。去掉全局 HTMLElement/Node 原型修改和模块单例 receiver；每个实例独立 callback、DOM与图片URL。文章/图文 nativeLayout 与正式正文、段落 ID、来源保持原合同。

FR-06：Theme 真相沿 `frontend/src/styles/tokens.css` 与 globals.css：背景/面板、文字、品牌/选中、边框/焦点、字体/字号、圆角/阴影、密度一致。组件外壳/toolbar/侧栏/属性/菜单/tooltip/输入/按钮随应用亮暗主题变化。通过编译的 CSS AST 作用域或 ShadowRoot限制原 CSS；禁止将上游 `:root/body/html/*` reset 全局注入。需要 hsl 的原样式明确转换或替换，不能直接将 hex 值包进 hsl。作品自身主题、颜色与尺寸不被 UI tokens写入 canonical 文档。

FR-07：工作面由页面容器分配高度、宽度与局部滚动，不用上游整页 viewport 壳或另一套导航。视频工作台直接显示在现有“制作视频”页面；图片细调可继续使用 CreatorOS 自己的 Dialog。所有 vendor Portal/临时 canvas/control/context-menu 进入实例容器，不能追加到应用 body；保留焦点、层级与滚动。快捷键/粘贴只在编辑器及其弹层拥有焦点时生效，文本输入框保留本来行为。导出锁只锁当前编辑器，不将 document.body inert 或阻断应用其它操作。

FR-08：切账号/作品/源版本、卸载与 StrictMode 重挂时先取消实例，再清理 queues、pending imports、GPU/音频/媒体/Blob URL、observer、定时器、全局事件、CodeMirror/Fabric/React/Vue。每个 await 后校验当前实例/owner与 signal，旧操作不得写新工程。OpenCut与Doocs现有模块单例采用显式同文档单实例 lease：旧实例必须销毁并到达不再可写的状态才交新实例；不悄悄共享工程。新挂载可等待旧实例关闭并显示真实状态，取消期间不删除已保存工程或阻断保存未知回执的恢复。其它可实例化组件允许并存；不同浏览器文档的活动编辑器独立。

FR-09：原本地 File 导入、拖放和粘贴统一先走宿主原素材上传/归属回执，返回真实 mediaId再进入原引擎；未知或迟到回执不串作品。图层 JSON 导入包含图片时验证真实素材映射，未解析图片保留结构并显示缺失，不自动请求任意外链或丢弃其它合法图层。删除残留调用旧云“创建设计”的分支，替换为真实同稿清空/设尺寸及必要未保存提示；其它原本可完成的合法编辑不因新增布局/质量限制 hard-fail。

FR-10：对每个固定源码记录实际原生改动与构建、来源/许可证/对应源继续交付。共享原生 host 与业务保存仍在 frontend 展示层，backend/worker/AI SDK边界不变，不新增公开 operation、表、迁移、模型调用循环或原生可执行文件。

## 验收与证据

- AC-01：四类实际产品编辑入口均为原生DOM组件、无 iframe/独立编辑页链接，构建图证明使用原组件和引擎；视频工作面直接在当前制作页面。
- AC-02：亮暗主题/密度更新控件、面板与菜单；应用外壳不受vendor CSS/主题副作用影响；改 UI theme 不改作品内容或版式。容器宽度变化正常局部滚动，无第二套全页壳。
- AC-03：原文章/图文编辑、NoteRelay主题/页序/图片设置/交付、Doocs Markdown/版式/资源ZIP，快图图层/图片/撤销/PNG同稿，OpenCut素材/时间轴/选区/粗剪采纳/撤销/冻结导出/保存历史保持真实功能。旧稿与回执可恢复。
- AC-04：重复挂载/销毁和慢操作换稿：无旧回写/重复监听/跨实例交付，真实清理而非只隐藏旧DOM。外部输入的删除/撤销/粘贴不被截获，导出不锁应用body。
- AC-05：正式保存经原公共服务，账号/作品/CAS/幂等/精确素材不变；没有独立编辑器数据库或未注册图片正式采用。
- AC-06：每个结果注明 fixture 边界；本轮沿此前允许的类型/构建/DOM/合同/服务与HTTP验证，LED-047、boundary、orphan、pmem sync/reconcile。真实浏览器像素、PNG/MP4与系统Clipboard验证未获证据时继续标待验，不把旧iframe测试当新原生测试。全仓既有欠债保留，不放宽门。

## 代码范围

frontend 原生宿主/主题/生命周期组件与四类现有 workbench、原生编辑器构建脚本/static/source archives/许可；NoteRelay现有vendor源；其它三类固定归档的native patches与可重建源码。仅这些原生化所需修改，任务证据及控制面。原合同数据结构及 backend/worker行为不变；所有真实保存/素材回执继续原API。
