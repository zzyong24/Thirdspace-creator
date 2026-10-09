# T1141 SPEC 独立初审

- 审查时间：2026-10-09T17:00:56.531Z
- 读取时 HEAD：`8368a6b0aacabbc7ebdcab38ec7c869472d5ded6`
- SPEC SHA-256：`63dc15b1ccaa83255ab6cae57f4863dbb6822ecf030de0fc48a778f3b26b6e54`
- modules SHA-256：`37f732a4135426a879bed9c5b39d94ce3eef741ef19d78c2e167314872f5b8dd`
- constitution SHA-256：`86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800`
- 结论：`PASS`

## 结论依据

当前缺口已由正式 `prepareGenerateProposal` 路径的隔离观察定位：组内节点省略 `aspectRatio` 时，已保存页组的 `3:4` 没有进入准备结果；组内显式比例和独立节点缺省保持正常，且观察没有调用模型、写用户库或改变画布与任务。该事实足以支持本次窄修，不冒充审核后的 TDD、HTTP、模型或安装验收。

SPEC 将新行为限制为：图片生成节点未填写比例且属于明确页组时，使用 `node.aspectRatio ?? group.aspectRatio`；独立节点、视频首帧、历史任务、文档迁移和其它创作选择不变。能力参数校验、任务输入和 digest 必须使用同一个有效比例，因此不会出现“能力按节点默认放行、冻结请求却写组比例”的分叉。

历史兼容边界清楚且未放松：

- `generate` 已有预约继续直接读取原 `frozenInput`，不以当前组比例重签、续期或重发。
- `reserveGenerationInTransaction` 的历史兼容只能由同一可信 `attemptId` 的既有预约触发，并继续核 `rowOwned`、canvas、node、完整冻结输入、snapshot、digest、revision、membership、admission 和 deadline；它不是对任意旧 `null` 的全局宽容。
- 没有既有预约的旧未采纳候选仍按当前新准备值与原 snapshot 严格比较，比例不同必须要求重新准备，不能升级原候选或账本。
- 前端失败恢复必须区分旧冻结 `aspectRatio=null` 与当前页组比例：旧失败任务不能被解释为已保存当前组比例，也不能自动生成；只允许用户从现有节点生成入口明确发起新请求。

因此 original admission、proposal snapshot replay、任务期限、幂等键、owner 与完整摘要校验均保持严格，没有被本 SPEC 放松。

## 范围与验证

产品写集仅 `creative-canvas.service.ts` 与 `canvas-editor.tsx`，测试写集覆盖对应 service/component；模块命令另运行原 `assistant-system-root.integration.test.ts`，可检查候选准备、确认采用、期限和事务回执不退化。service 测试文件现有真实 transport、组归属、预约恢复、精确参考文件和 PG 锁序基础可承载新增公共组合，不需要扩展公共契约或数据库 schema。

实施时应让“历史缺省语义”由已经读出的可信预约决定，不能由客户端参数、节点当前值或宽松布尔开关决定；新 snapshot 仍须与选择出的新/历史语义对应的完整输入逐字等价。该要求已在 SPEC 中明确，属于实现审查重点，不构成新的阻断 finding。

T1140 当前浏览器正在使用 `canvas-editor.tsx`，SPEC 已明确结束前不得编辑该 watched 文件。当前仅 SPEC/modules 有改动，本 PASS 只允许正式记录后再实施，不代表产品、浏览器、模型、安装或完整 canonical 已通过。

## 绑定源码

- `backend/src/modules/creative-canvas/creative-canvas.service.ts`: `b6afcef5ff51313da8c21da0bed002c86852170f4662e8b59bfd45d1ed0e6460`
- `frontend/src/features/creative-canvas/canvas-editor.tsx`: `ad8b4d076954ae6b7272e0acc948e0e6f1d62b208242a2fabec42ac4c5729cac`
- `backend/src/modules/creative-canvas/creative-canvas.service.test.ts`: `767ff86d90d12535924969b5247acc30242859a07c44a797f56760827ba08e06`
- `frontend/src/features/creative-canvas/canvas-editor.test.tsx`: `1d655252b89a812d57090af4263ace3cbc3da6ee4c4b64325aed42321c3a8824`
- `backend/src/application/chat/assistant-system-root.ts`: `7fc71a6c6a86805760a663d60aac7b3fd04443f389b6f2de23199f0b860b5fa3`
- `backend/src/application/chat/assistant-system-root.integration.test.ts`: `d192f72b5a193cb92303ead1806ca7d735c25dea0344b7905c5ad78e70143c35`
- 前置观察：`docs/verification/t1141/t1141-current-ratio-observation.json` SHA-256 `5e5ded4bcc9ec1954f93d8e3ee318a8587cf0f9e451db7aacb55ec6847474e4b`
