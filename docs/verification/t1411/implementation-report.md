# T-1411 实施与验证交接

日期：2026-10-25。基线 commit：`778ea4559850b0d8dfbf279c312dc4c21d72866e`。
前置独立规格审核：`PASS[REV:40d357fc2e44]`；实施前已收到 Root 的 `taskctl start` 通知并重读任务包 §1–9。
SPEC SHA-256：`9f96d971292778c094418199950aaa289ba9e403c381768458618f188b04dc44`。

## 交付行为

文本连接测试完整传递解析所得 `authStyle`。自定义 Anthropic Bearer 经过原 worker-entry、实际子进程 IPC 和 Pi 后，HTTP 请求含 Authorization Bearer 且无 x-api-key；显式 x-api-key 和旧调用缺省方式保持原行为。非法方式在 schema 校验时拒绝，不启动 worker。

正文或思考流的非空成功提示统一为“已收到最小测试请求的流式回复，连通。”。两种流的成功判定、空流失败行为、支付错误分类均保留。

## 精确修改文件

| 文件 | 修改 |
| --- | --- |
| `contract/src/internal/model-probe-io.ts` | 文本内部 IPC 增加可选 `authStyle` 两值 enum；图片与公开 operation 契约不变 |
| `backend/src/modules/ai-runtime/model-probe-io.service.ts` | 原窄投影传递 `authStyle`，继续通过原严格 schema 校验 |
| `frontend/src/server/settings-model-test-wrap.ts` | 合并正文/思考成功返回相同的准确文案 |
| `backend/src/modules/ai-runtime/model-probe-io.service.test.ts` | 新增 9 项契约与非法值前置拒绝检查；此文件为新增文件，独评须显式纳入 |
| `frontend/src/server/settings-model-test-wrap.test.ts` | 原真实 worker fixture 增加 5 项 HTTP 集成；更新 2 项成功文案断言；保留原支付诊断测试 |

文件完整 SHA-256 见 `source-hashes.json`，包括以上 5 个文件及已审 SPEC。未修改其它产品、worker、路由、请求预算、用户配置或控制面，未提交代码。

## 当场发生的验证

每条命令的退出码及对应工具完成回执登记于 `verification-results.json`；typecheck 的 exit 0 来自 session 54293 最终完成回执，不是从“Types generated successfully”推断。

| 阶段 | 命令/证据 | 结果 |
| --- | --- | --- |
| 绿基线 | `pnpm -C frontend exec vitest run src/server/settings-model-test-wrap.test.ts --retry=0`；`baseline-frontend.log` | 1 文件 66 项通过 |
| 红测：IPC/鉴权 | `pnpm -C backend exec vitest run src/modules/ai-runtime/model-probe-io.service.test.ts --retry=0`；`red-backend.log` | 7 失败、2 通过；合法方式未被 schema 接纳，非法方式被旧投影丢弃后触发 worker 启动 |
| 红测：真实 HTTP/文案 | frontend 同命令；`red-frontend-final.log` | 6 失败、65 通过；Bearer 头实际为空、两种成功提示不符；前一轮原日志保存在 `red-frontend.log` |
| 绿测：IPC 与原 request IO 回归 | `pnpm -C backend exec vitest run src/modules/ai-runtime/model-probe-io.service.test.ts src/modules/ai-runtime/request-io.service.test.ts --retry=0`；`green-backend.log` | 2 文件 12 项通过 |
| 绿测：完整 frontend 当前文件 | frontend 同命令；`green-frontend.log` | 1 文件 71 项通过 |
| 全工作区类型 | `NODE_OPTIONS=--max-old-space-size=6144 pnpm --workspace-concurrency=1 -r typecheck`；`typecheck.log` | 5 个工作区串行完成，exit 0 |
| 超时策略 | `node tools/timeout-policy/verify.mjs`；`timeout-policy.log` | exit 0 |
| 架构边界 | `node orchestrator/process/boundary-scan.mjs`；`boundary.log` | exit 0；5 条原基线违规，无新增 |
| diff | `git diff --check`；`diff-check.log` | exit 0，空输出 |

真实集成用临时目录打包现有 `ai-worker/src/io/model-probe-worker-entry.ts` 与 `piRuntimeInitializationPlugin`，调用原 `createModelProbeIoService`，只连接本地 loopback HTTP。成功三档均断言 `/v1/messages`、原 model、`max_tokens=128`、stream、无工具和一次 HTTP。401/500 错误场景也断言一次请求、128 上限、鉴权头互斥，并检查普通 Error IPC 与 UI/日志投影无合成 token。每例 finally 关闭 IO 子进程、HTTP 连接和服务器，套件 finally 删除临时产物。未 mock IPC、modelFor 或 Pi；测试中的解析器仅提供合成配置，没有读取用户凭据。

## 验收边界

本报告只证明连接探针鉴权与结果说明缺陷得到本地红绿修复。没有执行真实账号请求、安装验收、官方 Pi 聊天或原任务恢复；不能将这组测试当作现场 402 的根因证明或恢复证据。独立代码审核、提交、本地打包安装及 T-1408 真实验收由 Root 继续。
