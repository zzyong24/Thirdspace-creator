# T-1417 文本连接测试支持正式聊天输出预算的区分性诊断

2026-10-25，承接用户“那急需解决 不要偷懒”及 T-1427 的修复、CLI 实测、本地安装授权。新官方凭据更新时间为 11:40:06.250Z；随后新对话 execution-task-c34e9921-4086 首轮仍为 HTTP 402，原任务最后一次恢复没有使用。同一时段 default 最小探针有真实回复。历史记录原先引用 docs/verification/t1408/credential-refresh-20261025/；重编号后写成 t1427 并不证明原件已搬迁。2026-10-28 本机核查两个目录均不可得，因此本段是历史背景，原始回执尚未在本机复核，不作为本轮真实模型或费用验收；无需重打付费或失败请求补证。

## 原因与最小改动

当前探针固定 maxOutputTokens=128；正式普通聊天为 8192，另有系统上下文和工具。现在无法只改变输出预算做比较，而且 copilot.assist 返回“暂无内置连接测试”。这两个可复现的诊断缺口需要补齐；尚不能由此认定 402 是余额、预算或上下文引起。

在现有 settings.models.test 增加可选 body.textOutputLimit，仅接受 128 或 8192，缺省保留 128。该选项只适用 default、script.review、copilot.assist、chat.fallback；其他能力显式携带此选项时必须在解析凭据、启动 worker 或发出网络前拒绝。copilot.assist 复用现有 resolveLlm(ctx, capability)，不改来源选择或正式聊天实现。chat.fallback 继续只认专配，不回退主模型。

composition 只传该有限选项，经 backend service port 和严格 text IPC 送到现有独立 model probe worker，最终成为同一个 modelFor + streamText 的 maxOutputTokens。不得开放自定义 prompt、tools、URL、headers、凭据或任意输出预算。原有固定“请只回复 OK”、首个非空正文/思考流停止、deadline、取消、并发上限、maxRetries=0 和错误脱敏全部保留。图片 IPC 不接受此字段。默认 UI 按钮不传 body，行为与费用边界不变。

8192 请求的成功说明必须写明只验证最小文本请求、输出上限为 8192，不证明正式聊天上下文或工具可用；默认 128 文案保持原状。不得把本诊断实现通过当作 T-1427 的官方聊天已恢复。

## 归属与准确写集

不新增 UI、数据库、后台任务或凭据所有者。契约负责有限参数，frontend server composition 负责现有路由解析，backend 负责 worker 端口，AI SDK 仍只在 worker。

产品写集：contract/src/operations/settings.ts、contract/src/internal/model-probe-io.ts、frontend/src/server/settings-model-test-wrap.ts、frontend/src/server/persistence-client.ts、backend/src/modules/ai-runtime/model-probe-io.service.ts、ai-worker/src/io/model-probe-worker-entry.ts。

测试写集：frontend/src/server/settings-model-test-wrap.test.ts、backend/src/modules/ai-runtime/model-probe-io.service.test.ts、前端测试文件中的现有真实 child process + HTTP fixture（request-io.service.test.ts 仅作为原取消/预算回归执行，不修改）。工件：本 SPEC、对应独审、docs/verification/t1417/**；BACKLOG、modules.config、context/T-1417、progress、events、review-events、PROJECT 等正常控制面。其它产品、正式聊天预算、供应商错误映射、用户配置和旧证据不改。

## 验收

先独立审核，再真实 RED→GREEN：公开契约缺省兼容；128/8192 通过，负数、0、129、超大数、字符串拒绝；非文本选项在任何副作用前拒绝；copilot.assist 原能力解析；备用模型隔离；真实 service→IPC→worker→本地 HTTP 捕获两种 max token 值及原鉴权，确认一次请求、无工具、正文或思考非空、错误/空流不误报；默认调用保持 128；失败与取消仍清理 worker。测试不得访问真实用户数据库或实际供应商。

运行相关 contract/backend/worker/frontend 类型检查、上述定向测试、timeout-policy、boundary、diff check 与独立最终复核。按既有固定入口在外盘干净提交本地打包安装；重建缓存仅放外盘，结束清理本轮临时工作树。

安装后用公开 CLI、月明水清深、同一次官方来源选择窗口、同 capability=copilot.assist，串行比较 128/8192 各一次，记录时间/结果/凭据元数据与 CAS 恢复。这是两次区分性实验，不重复撞 402，不调用原任务恢复、不代充、不换源。若两者都成功，下一步查正式上下文/工具差异；仅大预算失败则取得预算相关性证据，仍须权威原因才能称余额不足。若都失败则记录当前基础请求亦被拒绝，不冒充正式聊天通过。T-1427 继续以完整真实三轮为最终成功标准。
