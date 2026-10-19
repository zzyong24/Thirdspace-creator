# T-1149 当前实施独立复核

- 时间：2026-10-10T02:39:40+08:00
- HEAD：`2af9cab4c4cff2677f470ee096e4f2a2e98fca40`
- SPEC：`7818267628134fda88c4d332558211ba08adfe831e9a7d61e85b71ceb4d5e195`
- 结论：**CHANGES_REQUIRED**

## 阻断 finding

### IMP-001：公共浏览器能力 fixture 违反正式响应 schema

`frontend/tests/e2e/t1149-cover-aspect-group.spec.ts` 的 `capabilities()` 只返回 `text_to_image`、`image_to_image` 两项。正式 `canvasGenerationCapabilitiesResource` 要求 `modes` 恰好四项。真实 contract client 会拒绝两项响应，因此该旅程无法取得“参考能力合成样本”，不能作为当前产品公共链证据。

最小修正仅限新 E2E fixture：补齐 `text_to_video` 和 `image_to_video` 两条合法记录；不改 schema、产品或断言。修正后必须在最终字节上实际运行新旅程。

## 静态代码结论

- 组比例更新同步 group 与组内所有 `image_generation`，不触碰静态图片和组外节点。
- 只有能力表明确声明不支持时拒绝；未知/晚到能力不自动重写文档。模式拒绝发生在引用清理之前，原引用保持。
- `generateGroup` 保持 recreate、完成、在途、failed、旧 null 的既有优先级；明确不支持的新页被跳过，合法页继续，全无可提交页时不写幽灵 attempt。
- 保存、owner/epoch、T1108 成功后引用记忆、`showIdentity=false` 等原边界没有被新逻辑绕过。

## 证据边界

已报告的 6 条 RED 与 48 条组件 PASS 可作为阶段证据，但当前 type、public-root 与其它 Gate 尚在运行。本报告不代签浏览器、旧任务 T1148 收据更新、LED047、完整 reconcile、安装、模型或原生 App。

## 当前文件 SHA

- `frontend/src/features/creative-canvas/cover-aspect-ratio-labels.ts`: `e78d44f0850bfc3b212804763fb0537713286cd790e63fff399f8170fcb5d408`
- `frontend/src/features/creative-canvas/canvas-editor.tsx`: `d67ba3e119fc7aa8dc18c2b83a295befdecd710915fccf34d8bc45716780cec9`
- `frontend/src/features/creative-canvas/canvas-template-library.tsx`: `296211da8ab736533477714310744e14ce7ee17e11e230976fee0ec59f8b8899`
- `frontend/src/features/creative-canvas/canvas-editor.test.tsx`: `50636caf2a006875d4b2b9d040645a2018a032f6dd94ff436367481998db5b5f`
- `frontend/src/features/creative-canvas/canvas-template-library.test.tsx`: `585702fbe59bccc81ff8f0b1d4517edf5b0c1172930f08fc37ed3998b73b3dff`
- `frontend/tests/e2e/t1149-cover-aspect-group.spec.ts`: `fc3b1973261012ccd48d76d2dbea92d54dfd046aafaaab823d1a8ecb19750040`
- `docs/verification/t1149/run-aspect-journey.mjs`: `0efbbc6192d11a805c92ef1689ba60d213dd43b0c663d81247f597ae785ce40a`
- `docs/verification/t1149/PAGE_SPEC.md`: `cb2906ee1ba429ac3e7c4fe8e05027d385653c099d9a496db550895cb23ae26a`
