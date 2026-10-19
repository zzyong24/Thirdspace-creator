# T1140 / T1145 / T1147 独立实施与实际画面复核

## 结论

**PASS_LIMITED**。当前字节与本轮真实 Chrome 证据足以支持 T1140 的低高度素材字段布局、T1145 的图库预览防重叠与低高度画布抽屉布局，以及 T1147 对 `position: fixed` 裁切观察的机械校准进入后续 Gate。此结论只覆盖本轮局部产品、公开浏览器旅程和实际截图，不代签尚未结束的类型检查、剩余测试或完整 canonical reconcile，也不代签原生 App、模型、平台能力或全功能可用。

未发现需要阻断当前局部实现的未解决 finding，`findings=[]`。

## 输入与来源绑定

- 工作树：`/Users/zyongzhu/.codex/worktrees/t1062-client-integration/Thirdspace-creator`
- 冻结浏览器收据：`t1147-success-original/cleanup-diagnosis-journey.json`，SHA-256 `092a1ae6cef5a3bcb9f47f55578cf15007ecf20638e57d6ccfa59326ae1db5c4`
- 原始私有日志：SHA-256 `abdfe4d94b86814ce10386124de144b96316a7ff0722db898d9a8f5e45569551`
- 实际结果：2 条完整 Chrome 旅程成功、`exitCode=0`、`retries=0`、79.998 秒；用户提供的外层结束收据为 80.1218 秒，两者边界不同且不互相替代。
- 7 个 watched 路径在收据的 `sourceSha256` 与 `sourceAfter` 逐项一致。

关键当前 SHA：

- `asset-picker.tsx`: `236d01545bcddac731f2cccc2cf2ce454ac653aed682b7df390e92cacdc5f14e`
- `asset-media-preview.tsx`: `7ca28b2d737331713413d1b2d2ae7b22d2e43db1fc47cc084581aa6eedd2489d`
- `use-asset-picker-source.ts`: `a9339c94712d97b477b91015dbde2e9bc30a81e1eb16fc97eac3dc106bc28f07`
- `canvas-asset-picker.tsx`: `8780dbace3bcfed9c3bdfc0dacd63e6414ec2ec8d97ecd585f133bc2f3e6ad55`
- `canvas-editor.tsx`: `aa3fd8ec1dfa523e1ca6688c5074c669df18436d93e9a5a9ed7a7be0f4e32da6`
- `t1140-picker-low-height.spec.ts`: `7e83385dce28ed66077b8632833ab927c2cf03a424d637b434b51f60a855212d`
- `run-picker-journey.mjs`: `e1ab3359fc4e32a085eeacd40bfe626c75cf1287eebd587627d2317972989470`

## 代码复核

1. `AssetPicker` 在 field 模式下将搜索、筛选、候选与预览纳入同一正文滚动责任；标题和底部动作仍由 Dialog 固定区域承担。宽且高度充足时恢复双列和各自媒体滚动，gallery 模式的职责未被 field 规则混用。
2. 低高度缩略图和候选预览都使用 `object-contain` 的既有媒体组件，并限制到视口相关高度。无身份模式不会留下空身份容器；确认、取消、不可用原因和错误重试语义未被布局分支删除。
3. T1145 的 gallery 根和候选预览 `aside` 使用 `shrink-0`，避免 flex 收缩造成卡片覆盖；当前六个图库视口均呈现自然占位，关闭后公开观察记录保持原 document/revision。
4. `CanvasAssetPicker` 只在 drawer 且 `max-height:600px` 时切换为真正的 viewport fixed 布局；page 模式与正常高度 drawer 保持原结构。低高度 fixed 层继续有自己的 `overflow-y-auto`，右/上/下安全间距与宽度上限保留。
5. T1147 的裁切观察根据 fixed 元素及其祖先是否实际建立 fixed containing block 决定是否跨越祖先 overflow。普通祖先 overflow 被正确视为可跨越；`transform`、`filter`、`perspective`、`contain`、`will-change` 等建立 containing block 时仍保守保留裁切判断，没有把所有 fixed 元素无条件判绿。
6. T1146 的重开观察等待搜索结果和 `aria-busy=false`，仍保留左右媒体加载、精确 file、取消不写和 owner 断言，最长观察 120 秒。原失败证据保留。

## 实际画面复核

已实际查看六个 gallery 视口：1366×900、1024×680、683×450、390×900、390×450、512×340；并查看 683×450、390×450、512×340 portrait，512×340 landscape、读取失败与确认前画面。

- 既有紫色 CreatorOS 视觉、边框、圆角、选中环、按钮层级与画布背景保持一致，没有另造风格。
- 1366/1024 下图库、候选卡与完整预览层级清楚；683 低高度仍能在抽屉内滚动查看完整预览，没有卡片和预览互相覆盖。
- 390×900 以窄屏单列完成任务；390×450 与 512×340 的完整预览可通过同一正文滚动到达，底部动作保持可操作。此证据不代表缩略图与完整预览必须同时出现在一个静态画面。
- portrait/landscape 均保持完整比例而非裁切；读取失败画面保留已选预览、明确中文错误和“重新读取”，没有用空白或假成功掩盖失败。
- gallery 的 `关闭预览`、field 的取消/使用动作、选择环和实际媒体内容在代表性画面中可辨识。

代表性截图 SHA：

- gallery 1366×900 `96099c1aa5c171ee2efa452089673c31755fb3c7ca0f718b39ebe8d35cb09daa`
- gallery 683×450 `14ad02f0cc6b829d7011a3bed474cd9b615d2d225e3c8abe3f83d4d5690b05a5`
- gallery 390×450 `47833c19039a948c9cc46bce7ed114384a793621e423bf1e0f3adf99ca49ff66`
- gallery 512×340 `3dae48eb0238d92b5607d002c7b62bab07de89e6b49445451cb98c2bcd0a2d52`
- portrait 390×450 `f4e49ada17ada3ab4473d82096d1108d7246001322f14f22ec0ddfdf09dc825a`
- landscape 512×340 `e7cb5aafcda911ca641221e3e0815b94bcd89777378811e2fad342995c8c5dba`
- read error `018592619a1be3d2d8b5056e61e6326b81930278d6c26a2b1967f8ed0cf0e342`

## 证据与限制

- `layout-observation.json` SHA `620236a92d1080341793efc9e5b2e96ef2b57ff8cc756b26253de7d7affb1018`；`public-write-read-observation.json` SHA `987436eb900c607a175d52651f833e707c68a6310b9438486a20416d2dc12366`。
- 当前成功旅程支持本轮交互与视觉结论；它不是原生 App、真实模型或平台调用验收。
- T1144 当前清理成功只能证明这一次 worker 正常退出。旧单次约五分钟停止的原因仍是 `UNKNOWN`，本报告不将其改写为已定位或已根治。
- T1146 原重开失败继续保留；当前成功说明校准后的有限等待与原断言在本次公开旅程成立。
- 剩余测试、类型检查与完整 canonical reconcile 尚待 root 的实际终态；在这些结果到达前，本报告不授权“全绿”或任务整体完成表述。
