# T1141 实施独立复核

- 审查时间：`2026-10-09T17:37:58.023Z`
- 结论：`PASS_LIMITED_T1141_IMPLEMENTATION`
- Findings：无未解决项

## 源码结论

后端只在 `prepareGenerationInput` 增加机械有效比例：新图片请求采用 `node.aspectRatio ?? group.aspectRatio`，视频与独立节点保持原缺省。该同一 `config` 同时进入 `assetGenerationParameterError`、冻结 `taskInput` 和 `canvasInputDigest`，因此能力检查与实际请求没有分叉；不支持的组画幅在预约、任务或模型提交前拒绝。

旧预约兼容由数据库中已存在、已通过 `rowOwned + canvasId + nodeId` 的预约触发。代码先 `frozenInput(existing)` 完整校验旧摘要，再且仅在旧冻结输入为 image 且没有比例时启用 `preserveLegacyImageRatio`；随后仍执行 snapshot revision/digest/完整 `isDeepStrictEqual`、admission deadline、membership 与原输入比较。它不接受客户端自报 legacy，也不改变旧 inputJson、inputDigest、attemptId、taskId 或期限。

没有旧预约时，新准备必然继承当前组比例；旧未采用 snapshot 省略比例会因完整 snapshot 比较而拒绝并要求重新准备。不同 owner、canvas、node 仍在历史兼容判断前拒绝。同节点其它 attempt 的单在途/未知状态检查保持原逻辑。

前端失败页使用 `node.aspectRatio ?? group.aspectRatio` 与冻结任务比较。旧任务明确 `aspectRatio=null` 且节点仍缺省时显示中文“原任务未保存页组画幅……”并停止，不保存、不提交、不确认；组比例已变时沿原“内容已修改”路径拒绝；冻结比例与当前有效比例相同时才生成新的 attempt。旧失败任务没有被自动改义或自动重放。

## 测试与公共组合

- backend service：1 文件 25 PASS、0 skip，包含真实隔离 PG 用例；日志 SHA `7703d81c6b0d9d7f6211d12b1e61f40846ff7e763ce61490c884dec03b43110b`。
- frontend component：1 文件 27 PASS、0 skip；日志 SHA `3f3a8fc9181a02fb10a64fe32cf309193d01ba2a98661f3a21a5b4c71d72dd20`。
- assistant-system-root adoption：72 PASS、3 个既有 skip；日志 SHA `4f47b4911d4a412896875add531f8fbed3774621d92bea11c72a735583101a12`。三个 skip 不计为全覆盖或全绿。
- backend root/transport + 真实 AiService：exit 0。新任务冻结比例为 `3:4`，公开同键重放相同；旧任务比例仍为 `null`，reservation/task/digest 均未变化，异组拒绝。模型能力为合成 fixture、wake 被关闭、没有模型调用或用户库访问。日志 SHA `bf7e35c7ab0b28cbe32011c2781c80224f4cd89ead27f4e5141655d3137121bc`。

原 backend 行为 RED 与 frontend RED 均保留；早期调用/夹具错误没有被冒充产品 RED。当前证据验证 service、component、adoption 与 backend transport，但不证明真实模型输出、浏览器、原生 App、安装或完整 canonical。

## 源码绑定

- `backend/src/modules/creative-canvas/creative-canvas.service.ts`: `eb04ec3e219b5ec07aae15fb2fd7c416bf521b3495b38916a2e860da582ecebd`
- `backend/src/modules/creative-canvas/creative-canvas.service.test.ts`: `1690eb7a6dc6ff4adb20444dccd3dda3d4b3a8c31e0115d28f5ffa8cb11a8553`
- `frontend/src/features/creative-canvas/canvas-editor.tsx`: `aa3fd8ec1dfa523e1ca6688c5074c669df18436d93e9a5a9ed7a7be0f4e32da6`
- `frontend/src/features/creative-canvas/canvas-editor.test.tsx`: `eb7d14e0e87b53e5444f4d67b6934693c725f7f522e7a895d8e414ea9518b819`
- `docs/verification/t1141/run-public-ratio.mts`: `65fc787035ae131295e6c967794112d679c09cfafdc777613f58b8edb247684b`
- SPEC：`63dc15b1ccaa83255ab6cae57f4863dbb6822ecf030de0fc48a778f3b26b6e54`
- 当前 modules：`4ca68523a96efc8ac45dcf5ee55da2d6000f59cb2fab0dcb390a5c64679cbb9a`

## 有限准入

当前四个实现/测试文件可作为 T1141 的有限实现候选冻结。最终任务完成仍须按正式模块取得尚未由本报告绑定的类型、静态、timeout、pmem 与 canonical 结果；本报告不触碰正在运行的 T1140 浏览器，也不代签浏览器、真实模型或安装。
