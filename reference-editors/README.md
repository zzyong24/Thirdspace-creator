# CreatorOS 原生开源编辑工作面

四类编辑器直接挂载到项目当前页面的 HTMLElement，复用原渲染器、画布或时间轴。CreatorOS 提供应用主题、当前作品、素材归属与版本保存；作品自身的纸张、主题颜色和尺寸保持原设置。编辑入口没有 iframe、独立网页导航或 postMessage。ShadowRoot 只隔离可信组件的样式，不执行用户生成脚本。

| 组件 | 固定源 | 实际复用 | 原生对应源码 |
| --- | --- | --- | --- |
| NoteRelay | 用户附件 0.1.8，内容快照 `a91b976a2fe25453dafb22d9b407ee6a5508e889da5083fe2901b395f28f5667` | WechatAdapter、RednoteAdapter、主题、DOM分页与交付 | `frontend/public/reference-editors/sources/noterelay/source.zip` |
| Doocs/md | `a7c17fc4cda92e3c13aa7e24f06615cfa4219b31` | 原 CodeMirror、Vue预览、主题、HTML导出 | `frontend/public/reference-editors/sources/doocs-md/native-source.tar.gz` |
| 快图 | `b3bdcfb0bd6d8f98e7483cf561ac03ba56c0d889` | 原 Vue Home、Fabric与插件、图层及导出 | `frontend/public/reference-editors/sources/kuaitu/native-source.tar.gz` |
| OpenCut classic | `cf5e79e919144200294fb9fed22a222592a0aeea` | 原 React 编辑布局、EditorCore、时间轴、MediaBunny导出 | `frontend/public/reference-editors/sources/opencut-classic/native-source.tar.gz` |

## 挂载、主题和归属

`frontend/src/features/reference-editors/native-editor-surface.tsx` 动态载入固定本地 ESM。引擎接收不可变 accountId/outputId/sourceVersionId、应用亮暗主题/密度、实例弹层容器、取消信号及真实 File 上传回调。句柄提供 request/update/dispose；切账号/作品和迟到结果都沿宿主与引擎两层守卫。OpenCut/Doocs 的原模块单例使用同文档 lease，旧实例完全停止写入再交新实例；快图和 NoteRelay 有独立实例。

正式稿仍经原文章/图文/制作公共服务保存。素材先经原上传与 material-link 服务取得真实 assetId/assetFileId，再进入引擎。JSON保存只保确切 mediaId 及文件引用，不保存临时 Blob URL；缺失图片保留位置、层级与原引用，用安全占位显示，不自动读取未知外链。权限错误和坏输入保持原守卫。

导出文件与同次冻结文档配对保存；保存回执未知时继续使用原请求、冻结稿及已上传文件重试。OpenCut 的粗剪采纳继续同一个原时间轴/撤销栈及 NativePatchReplay。弹层/导出锁/快捷键仅归当前编辑区，原画纸与最终媒体的风格不受应用主题改写。

## 构建、源码和许可

- NoteRelay：`pnpm --dir frontend build:noterelay`；`node frontend/scripts/build-noterelay.mjs --verify`。完整源码归档的 web/package.json 固定依赖，web/build.mjs 可独立重建 native.js/native.css；完整原 src 差异为 WEB_PATCHES.diff，显式DOM helper取代全局原型修改。
- 快图、OpenCut、Doocs：新的原生对应源码保留各自构建入口及 VERIFY.md；原固定归档不被新改造覆盖。具体构建、patch、hash、许可与夹具边界见各自 `reference-editors/<editor>/native/`。
- 统一核验：`node frontend/scripts/verify-native-editors.mjs` 核对 manifest.json 中四类 native 文件集、SHA256、对应源及共享合同复制件。旧独立页构建记录属于历史，不能当作本轮原生验收。旧 Doocs 整站构建脚本不再用于交付。

原开源 LICENSE、依赖声明、必要对应源码随静态包交付，应用的专有限制不替代其许可。OpenCut MIT、快图 MIT/core ISC、Doocs WTFPL、NoteRelay AGPL-3.0-or-later；依赖分别保留原文本。原 MediaBunny MPL 和 SoundTouch LGPL 对应源码继续位于 sources，不删历史许可。

## 当前验证边界

本轮类型、实际原组件构建、DOM/生命周期夹具、公共服务、HTTP、LED-047等证据见 `docs/verification/t1053-native-editors.md`。夹具不证明浏览器像素或真实 PNG/MP4/系统 Clipboard。OpenCut WASM 的上游 API 没有 GPU device/compositor 销毁接口；可清理纹理、媒体/音频、定时器、observer和实例 DOM，不能宣称 GPU 设备全部释放。真实亮暗主题视觉、浏览器最终媒体及粘贴仍待验。
