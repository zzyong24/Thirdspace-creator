# T-1408 源码发布验证摘要

## 当前结论

用户已于 2026-10-26 授权将“无需抖音登录生成定位、手动采纳、创建项目”推送至 GitHub 并合并 main。当前候选以 `3a110457ac4c9cb0c2d1289bb427a95f652c38eb` 为基线，只移入 37 个源码及测试文件差量，产品源提交为 `b962aeac8c39e25902affdc3220efe0276ea6dad`。本轮候选专项已有实际结果，完整发布验收未通过；CI 与合并以 PR 实时状态为准，任务仍未完成。

以下历史结果来自以 `cc90b8df02b8e1c96425a90d324390bbdfab1a18` 为基线的独立测试副本，其中包含尚未合并的 PR #11。它们说明原实现做过哪些检查，不能作为当前 main 候选的通过收据。

## 旧基线上的真实模型与界面检查

- 在独立账号组及独立测试数据库中，平台账号和成员数均为零；用户自行配置文本及结构化模型后，真实模型产生定位候选，显式采纳后保存一个定位版本，刷新及重启回读保持内容一致，项目创建和回读完成。
- 生成候选前后、采纳之前未自动写入定位母版；采纳后五项稳定字段与候选一致。记录覆盖一次会话轮次，不能推断仅发生一次模型 HTTP 调用或长期稳定性。
- 模型设置往返最初在真实界面失败；最终使用 React 当前路径与完整 query 绑定快照后，编辑自述、进入模型设置、返回定位的未发送草稿保留实测通过。
- 运行模式为独立 Next 开发实例，不是新签名安装包；原 Windows 安装没有因此完成更新。选题、校准、知识蒸馏和复盘没有在本任务全部重跑真实模型验收。

历史证据标识：`live-model-status.json`、`live-model-adopted.json`、`live-model-post-gate-restarted.json`、`settings-return-verification-summary.json`。原始文件留在本地验收档案，此公开摘要不附数据库、模型配置、页面截图全集或运行日志。

## 旧基线上的定向验证

- 定位/采纳后端定向检查 37 项通过，覆盖真实 PGlite、受控 HTTP 模型与 worker、零平台账号、候选未自动写入、显式采纳、跨组拒绝、重复采纳及下游上下文回读。受控模型不是实际供应商。
- worker 提示词与上下文兼容检查 41 项通过。最终聊天恢复及草稿相关 8 个文件合计 343 项通过，来自同一冻结产品源码的三次检查，不能重复计算早期运行或写成一次完整仓库检查。
- 最终相关 frontend 类型检查、frontend 生产构建及 worker 构建通过。首页及账号组相邻测试的两个旧契约断言曾真实失败；调整测试契约后，两文件 31 项通过，未据此重写原完整门结果。
- 独立源码审阅在已读范围内未发现新阻断，不等同审阅者重跑全部测试，也不构成自动签名收据。

历史证据标识：`backend-feature-in-full-gate.json`、`worker-feature-in-full-gate.json`、`recovery-final-readonly-audit.json`、`default-entry-adjacent-summary.json`、`worker-post-gate-build.json`、`independent-review.json`。

## 旧完整质量门：失败

原完整门共记录 **14,812 个断言通过、420 个失败、199 个跳过及 1 个待办**；另有 21 条文件或套件失败记录。质量门的 441 条失败记录中，63 条匹配登记的已知失败，378 条未匹配。441 是失败记录数，不是用例数；运行异常记录不再重复累加。

“未匹配”不能直接解释为本改动新引入。只有 worker 的 6 项历史失败另有同名同类型基线比较，不能用这 6 项解释其余失败。完整门启动后曾有前端修改，早期类型检查并非最终产品字节的冻结验收；最终专项、构建和审阅分别记录，不能拼成一次全绿发布收据。

历史证据标识：`full-gate-summary.json`、`full-gate-failure-buckets.json`、`worker-prior-six-failures-comparison.json`。当前候选必须保留仓库检查，不能为通过而改失败名单、删除检查或将失败标记成功。

## 过程与安装包边界

- 原完整 reconcile 为失败，记录 85 项错误及 18 项警告；lesson 预算校验失败发生在 lesson 命令执行之前，不能将未执行写成通过，也不能把该次失败改写成 Windows 启动命令错误。
- 正式 UI 过程收据尚缺实际登记的旅程、冻结候选及所要求的视口证据。Windows shell 与进程管理的适配仍需按既有门验证，不是用普通截图或只读核对代替。
- 当前未生成本任务的新 Windows 安装包。合法既有 verdict 构建材料、正式运行时和安装验收独立处理；源码构建通过不等于已签名或已安装，更不代表 Windows Authenticode 签名有效。
- T-1407 的扫码文件保存补丁及 PR #11 其他修复不在本次源码范围；不得据此宣称登录已修复。

历史证据标识：`reconcile-final-full-result.json`、`formal-gate-scope-clarification.json`、`recovery-final-readonly-audit.json`。原任务保持未完成，没有生成本候选的 taskctl complete 或正式 UI 收据。

## 当前 main 候选的专项复验

以下为本轮独立发布工作副本的实际结果，使用 Node 25；37 个源差量在测试前后 SHA256 一致，并与上述产品源提交绑定。没有将 PR #11 代码复制为依赖，也没有修改既有测试来消除此次失败。

- 前端：17 个测试文件、458 个用例通过，0 失败；含定位入口、账号组、首页引导、设置往返草稿、恢复及服务集成。默认入口这一组实际为三个文件共13项，未沿用旧报告中未列全文件清单的20项。
- 后端：定位与采纳四文件37项通过，含真实 PGlite、生产 worker 及受控 HTTP 模型集成；这不是实际供应商验收。
- Worker：模板及上下文五文件41项通过；诊断相关完整三文件49项通过、6项失败，未过滤失败用例，不把所在文件标为通过。
- 前端、后端及 Worker 类型检查通过；官方 Worker 构建、课程预检及前端生产构建通过。
- boundary 检查通过：没有新增违规，五条既有基线保留。
- timeout-policy 完整命令失败：扫描器与既有资源摘要检查已报错，随后 Windows 裸 `pnpm` 启动失败，后续未执行；没有把中断之后的检查标为通过。
- 新后端集成的 beforeAll 会内部再次构建 Worker。因此不声称11个 dist 文件贯穿全部测试保持同一摘要；源码冻结、每次构建及构建产物分别留证。此 PR 不上传 dist 或安装制品。

候选证据标识：`frontend-components-result.json`、`frontend-integration-result.json`、`frontend-build-result.json`、`publication-backend-positioning.result.json`、`publication-worker-context.result.json`、`publication-worker-diagnostics.result.json`。本地完整日志留存，不将日志或测试配置整包上传。

## 仍未完成

1. 当前 main 候选尚未重跑零平台账号下的真实供应商和实际界面完整链。上述旧基线上的真实模型成功不能替代本候选的新验收。
2. 新 PR 的 CI、required checks 及实际合并状态需实时核对；预算阻止、失败与通过分别登记，未合并前不宣称已进入 main。
3. 仍需完成适用的正式 UI 和 reconcile 要求，才可更新任务完成状态。历史全量失败不得因本轮定向检查通过而被覆盖。

本摘要只保留可公开的状态、计数、基线和证据文件名。未包含本机用户路径、测试数据库、模型密钥、签名材料、原始加密或解密日志及旧构建制品。
