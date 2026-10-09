# T-1149 SPEC 独立初审

- 审查时间：2026-10-10T02:18:55+08:00
- 工作树 HEAD：`2af9cab4c4cff2677f470ee096e4f2a2e98fca40`
- SPEC SHA-256：`7818267628134fda88c4d332558211ba08adfe831e9a7d61e85b71ceb4d5e195`
- modules SHA-256：`88be7f3a2c7f5109ffe15a0a7d0c4cda9279a36a3169b7d469626a8025c15a5d`（已按当前 `depends_on: []` 复核；旧 `c45e…` 仅为历史）
- constitution SHA-256：`86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800`
- 结论：**CONCERNS / CHANGES_REQUIRED_BEFORE_IMPLEMENTATION**

## 结论

当前 SPEC 的产品边界基本成立。后端现有保存校验已经限定 `visualGroups.pageOrder` 只含 `image`/`image_generation`，T1141 已提供新请求 `node.aspectRatio ?? group.aspectRatio` 与旧预约回放边界；前端两个模式入口确实汇入同一个 `updateNode`。因此，组内非空比例同步、已知能力取交集、未知能力继续原公开校验、晚到能力不重写文档、只跳过明确不支持的新提交页，均可在三条产品路径内实现，不需修改 backend、contract、任务 owner 或采纳权限。`depends_on: []` 正确避免 T1124 父整合任务未闭合造成流程环，来源审计仍可作为 provenance。

但当前正式验证绑定缺少一个确定性闭环：`frontend/src/features/creative-canvas/canvas-editor.tsx` 是 T1140 `PAGE_SPEC.md` 的 watched path，SPEC 第46行也明确要求按 T1148 失效并最终重验。T-1149 的 module 只运行新 `run-aspect-journey.mjs`，没有运行原 `docs/verification/t1140/run-picker-journey.mjs`。新旅程不能替代旧任务的正式 frontend-validation 收据。该缺口在实施前必须补齐。

## Finding

### REV-001 — 旧 T1140 收据没有被正式验证命令闭合（major）

- **要求锚点**：SPEC 第46行：T1140已当前正式taskctl完成，本任务更改其watched CanvasEditor时必须通过同一正式失效与最终重验路径，不声称旧PASS仍签新字节。
- **验收锚点**：SPEC 第55行：taskctl通过新PAGE_SPEC真实执行本任务Chrome；不继承来源报告、不是安装/模型/平台验收。后续剩余源码若改此任务watched路径，同样正式失效与最终重验。
- **证据**：当前 modules `88be7f3a2c7f5109ffe15a0a7d0c4cda9279a36a3169b7d469626a8025c15a5d` 的 T-1149 implementation 命令包含新 T1149 Chrome、单测、T1141 公共比例链和全局门卫，但不包含 T1140 原 runner。
- **风险**：新 CanvasEditor 字节可通过 T1149 自测，却保留一个仍绑定旧 CanvasEditor SHA 的 T1140 PASS 收据；这与 SPEC 明示的失效/重验约束冲突。
- **必要修正**：加入 `node docs/verification/t1140/run-picker-journey.mjs`，并沿 T1148 既有正式流程失效旧收据、在最终字节上重验后恢复/完成。新 T1149 旅程继续保留。

## 非阻断观察

- `InfiniteCanvasNode` 确实通过 `onPatch` 汇入 `CanvasEditor.updateNode`，新 E2E 已要求分别覆盖节点卡和 Inspector，因此无需扩大产品写集。为了审计可读性，recheck 时宜把 `infinite-canvas-node.tsx` 与现有 reference test 加入 read_set/相关测试命令；只要新公共旅程真实覆盖两个入口，此项不单独作为阻断 finding。
- `generateGroup` 当前先处理 recreate、在途、历史失败与旧 null，再形成 pending；实现“明确不支持只跳过”时必须在这些原分支之后或保持等价优先级，不能把历史任务按当前 capability 重解释。SPEC 已写明这一点。
- 本次未运行测试、Chrome、Next、typecheck、构建、模型、数据库或安装；没有产品/测试改动。
