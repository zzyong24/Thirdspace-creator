# T1145 低高度真实失败后的独立复核

- 复核时间：`2026-10-09T17:31:16.783Z`
- 当前 SPEC SHA-256：`5469acf3da8913cfa2335f5bd72d805d46b1a2af20d026679f2cf72cf2a0f43f`
- 当前 modules SHA-256：`4ca68523a96efc8ac45dcf5ee55da2d6000f59cb2fab0dcb390a5c64679cbb9a`
- 失败图 SHA-256：`8c2799dbcd47cad5462ac7b1e3b64863e5e09db79c5a4f92d177a1b0d7fca7ca`
- 结论：`PASS`

## 真实失败与机制

已实际查看 `low-height-failure-test-failed-1.png`。在 683×450 下，媒体虽已加载，但 drawer 顶部落入画布工具栏区域，底部预览超出有限画布容器；这与 120 秒内完整媒体边界持续为 false 一致。1366 与 1024 已通过只能证明正常高度路径，不能覆盖该低高度裁切。

当前 `CanvasEditor` 的画布容器为 `min-h-[50vh] overflow-hidden`，`CanvasAssetPicker` drawer 使用 `absolute top-16 bottom-16`。仅让内部 gallery/preview `shrink-0` 会形成自然内容占位，却不会让 absolute drawer 脱离这个低高度裁切域。

SPEC 新增的修复只对 `presentation="drawer"` 且 viewport 高度不超过 600px 生效，复用当前 `CanvasVisualGroups` 已有的 `fixed top-3 bottom-3 left-auto right-3 z-40 w-[min(26rem,calc(100vw-1.5rem))]` 规则。该方案让 drawer 以视口为边界，并继续由自己的 `overflow-y-auto` 承担滚动；无需改 CanvasEditor、媒体尺寸或数据路径。

## 范围与回归边界

新增 `frontend/src/features/creative-canvas/canvas-asset-picker.tsx` 是必要且充分的产品路径：

- 只改变低高度 drawer 的定位与宽度；正常高度的原 absolute drawer 保持不变。
- `presentation="page"` 分支保持原字节语义，不继承 fixed 规则。
- AssetPicker 已通过的两个 `shrink-0` 保留，搜索、筛选、拖拽、即时加入、精确 file/owner、关闭和保存回读均不变。
- 复用现有同画布侧栏规则，未新造 z-index、断点或布局体系。

modules 只新增该产品路径，原 Chrome runner、六视口、三个媒体组件、LED-047、type、static、timeout、diff、pmem 与 reconcile 命令均保留。T1146 的列表重建观察没有进入产品写集。

因此本次 changed-lines 没有新增阻断 finding。原 `REV-001` 继续保持 resolved；当前 PASS 只允许实施新增路径并按原完整验证重跑，不表示 683×450 已 GREEN，也不代签浏览器、worker 清理、完整 Gate 或安装。

## 源码绑定

- `frontend/src/components/media/asset-picker.tsx`: `236d01545bcddac731f2cccc2cf2ce454ac653aed682b7df390e92cacdc5f14e`
- `frontend/src/features/creative-canvas/canvas-asset-picker.tsx`: `b279a045b82612181247402f1ca591fea0cf58f8fa386655448276c2c127f12d`
