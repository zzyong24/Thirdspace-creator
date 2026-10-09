# T1145 SPEC 独立初审

- 审查时间：2026-10-09T17:17:25.678Z
- 读取时 HEAD：`8368a6b0aacabbc7ebdcab38ec7c869472d5ded6`
- SPEC SHA-256：`3e15977a72b36c08ef912f6567c9f4cca898244edaa832b6fe9e65d2c46afb67`
- modules SHA-256：`e1367d3eed6a49fb616e63ab6fce6be8baf4eab288a9c244216c037805e98aaf`
- 产品宪法 SHA-256：`86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800`
- 结论：`CONCERNS`

## 视觉与源码判断

已实际查看 `docs/verification/t1145/original-gallery.png`（SHA-256 `98e41642fab10d978c5923205761159586f2fc2bd828109cab25b5e695c4b6ec`）。画面中“关闭预览”区域与第一张素材卡的顶部发生明显覆盖，属于布局占位问题；图片本身已解码，证据不支持把它归因为素材身份、保存或图片加载失败。

当前 `CanvasAssetPicker` 的 drawer 父级是固定 top/bottom 的 `flex` 列并带 `overflow-y-auto`；`AssetPicker` 的 gallery 根可收缩，预览 aside 没有 `shrink-0`。在 `AssetPicker` gallery 根和预览 aside 增加 `shrink-0`，让已有 drawer 外层承接滚动，是与现有结构一致的最小修复。它不改变搜索、分页、即时加入、精确 file/owner、candidate、confirm 或 field 形态。

`presentation="page"` 的调用存在于 `creative-workspace-home.tsx`。该父级没有固定 top/bottom 高度，按自然内容扩展；SPEC 也要求 page/gallery 消费者复核。因此方案本身可以保留一条产品路径，但实施证据必须覆盖 page 消费者，不能只凭 drawer 截图推定无倒退。

## 阻断项 REV-001

正式 modules 的 `verify_commands.implementation` 目前只有 `git diff --check`。这不能执行 SPEC 明确要求的六视口真实 Chrome gallery/field 旅程、AssetPicker 与 media/source 单测、LED-047、frontend typecheck、静态门卫、timeout、pmem 和完整 reconcile。布局仍重叠、page 消费者被裁切、选择/保存回读退化时，当前正式 Gate 仍会通过。

同一模块还把证据写集登记成 `docs/verification/1145/**`，而 SPEC 与现有目录使用 `docs/verification/t1145/**`。这会使要求生成的真实图、报告和收据落在正式写集之外。

在产品实施前，应把模块证据路径改为 `docs/verification/t1145/**`，并把 SPEC 第22、24行列出的真实浏览器、受影响组件/来源回归、LED-047、type、boundary/semantic/orphan、timeout、diff、pmem 和 reconcile 精确绑定到正式命令。浏览器命令须使用现有 runner、0 retry 和既定预算；不能用原来两例 PASS 或旧截图代替新字节的实际 GREEN。

## 范围边界

除 REV-001 外，产品范围足够窄：只改 `frontend/src/components/media/asset-picker.tsx` 的 gallery 根与预览 aside 物理收缩行为，无需扩大公共契约、数据归属或功能权限。CanvasAssetPicker 父级、T1140 field 优化、上传/保存语义均可保持不变。

原两例 PASS、当前全局 worker 清理失败和旧截图均须保留为各自历史。本 `CONCERNS` 不表示产品方案错误，也不表示任何实现或浏览器结果已经发生。

## 输入绑定

- `frontend/src/components/media/asset-picker.tsx`: `d5e88a8e4a1a366d47bf866c3de7bb8b76ed2d17743ab3f960fa8d3b69fd96e3`
- `frontend/src/features/creative-canvas/canvas-asset-picker.tsx`: `b279a045b82612181247402f1ca591fea0cf58f8fa386655448276c2c127f12d`
- 原图：`98e41642fab10d978c5923205761159586f2fc2bd828109cab25b5e695c4b6ec`
