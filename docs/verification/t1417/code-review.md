# T-1417 独立代码与测试复核

审核者 `/root/t1427_contract_review`；观察截止 `2026-10-25T12:12:13.811920+00:00`。结论：未发现本次实现的确认缺陷，代码复核通过；定向测试日志显示 GREEN，静态门仍需主线程实际终态收据，安装后的两次正式诊断尚未由本审核验证。不得将此结论写成 T-1417 全部完成或官方聊天恢复。

本次沿用已读任务包 §1–5、§7–9 和写前 §6，绑定 SPEC SHA-256 `b7a2790082624238fccc86fcb344d861f68e646d48217fe1df0d4a66e74995e3`。审核者未实现代码，未运行测试、业务、浏览器、构建、安装或控制面命令；仅写本报告。独立审查实际工作区 diff、源码和已发生日志，未自行修实现。

## 已核实现

公开 `settings.models.test` body 是严格、整体可选的对象，唯一可选字段 `textOutputLimit` 是 128/8192 数值 literal 联合。旧 UI 仍发送 body=undefined，schema 接受 undefined；空对象也保持旧默认行为。任意额外字段、字符串预算、负数、0、129、32768、null 等均不能成为有效新参数。此改变没有新增 URL、headers、prompt、tools 或凭据入口。

`runModelConnectionTest` 先调用公开 body schema.parse，再于任何 resolver、worker 或 fetch 之前执行四个文本能力白名单。携带显式合法预算的非文本能力直接返回固定 fail；即使 asset.classify 内部也使用文本 helper，仍不能绕过此守卫。非法预算先被 schema 拒绝，且不会触发依赖。无预算的旧图片、搜索、ASR、停用 embedding 等行为保持。`createSettingsWithModelTest` 仍先要求 ctx，继承现有公开入口身份和作用域校验，不增加旁路权限。

参数真实传递链完整：公开 wrapper 的 body → runModelConnectionTest/options → textModelProbe → persistence-client 的 probeTextModel → backend probeText 的第四参数 → 严格 text IPC 顶层 textOutputLimit → 原 worker 的 streamText.maxOutputTokens。backend 第三个 AbortSignal 参数位置保留，原调用取消兼容；缺省通过 `??128` 保持 128。image IPC 仍严格且没有该字段。backend 继续只投射原 spec 字段，authStyle、token 与 channel-managed 标记没有丢失或扩权。

copilot.assist 使用原 resolveLlm(ctx, capability)；chat.fallback 继续使用 resolveDedicatedLlm，缺专配即返回未配置，不落回主模型。旧默认成功文案精确不变；8192 成功文案明确“最小文本请求”“输出上限为 8192”“不代表正式聊天上下文或工具已通过”，没有把 probe 成功报成聊天验收。

worker 仅把硬编码 128 改成严格已解析的有限输入或默认 128，原固定 OK prompt、首个非空正文/思考停止、maxRetries=0、abortSignal、deadline、并发上限及 finally abort/清理未改。原请求服务和 request-io.service.test.ts 均与 HEAD 字节一致；原错误脱敏、channel-managed 身份隐藏、固定领域提示白名单及供应商错误映射均未改。

## 真实 RED / GREEN 与证明范围

| 证据 | 实际日志结果 | 证明范围 |
| --- | --- | --- |
| red-frontend.log | 10 FAIL / 72 PASS，共 82 | 旧代码缺预算 body、copilot 解析、非文本提前拒绝，以及公开两档路径；两档真实 HTTP 用例旧版没有发出目标请求 |
| red-backend.log | 8 FAIL / 9 PASS，共 17 | 旧严格 IPC 拒绝合法新字段，且旧 service 忽略第四参数，使非法预算没有在启动前拒绝 |
| green-frontend.log | 82 PASS | 新公开合同、能力/默认/备用隔离、原错误/空流/思考语义、真实 IPC 与 HTTP 断言通过 |
| green-backend.log | 两文件 20 PASS | 新 IPC 17 项及原 request-io 的 3 项取消/预算回归通过 |

前端新增真实两档用例使用 `createSettingsWithModelTest` 的公开 operation、capability=copilot.assist 和 body，随后调用真实 createModelProbeIoService。fixture 临时打包生产 model-probe-worker-entry，通过真实子进程 IPC 连到监听 127.0.0.1 的 HTTP server，记录实际 Anthropic 请求 body。128/8192 分别断言捕获的 max_tokens；每次请求数为 1、无 tools，Bearer/x-api-key/旧缺省鉴权及原默认 128 用例保留。SDK 与 worker 没有被 mock 成直接返回 OK，配置解析与其余非相关端口使用合成 fixture，不读取用户数据库或调用实际供应商。

原 401/500/402 真实 HTTP 回归仍经过 worker 的 Error IPC 重建，验证不泄露 synthetic token、原单次请求和固定诊断。空流与思考流判定已有 composition/stream fixture；取消与排队预算沿用未改的 mock child process 回归，不能将其描述为本轮新增真实供应商取消测试。真实 HTTP 用例通过 finally 执行 io.stop/server 清理。源码与日志共同支持本次有限参数传递，不能推导真实官方服务器是否接受 8192 或当前 402 原因。

## 尚待主线程终态与后续验收

本次读到的 boundary.log 报无新增违规，剩余 5 条原基线；timeout-policy.log 尾部所示子组 5 PASS/0 FAIL。typecheck.log 已依次进入 contract、ai-worker、mcp-server、backend，但在本次首次核对时尚无完整工作区退出证明。目录中没有独立静态命令终态 JSON 可供核对，因此不根据日志尾行推定 typecheck、timeout-policy 或 boundary 的最终退出码。定向 GREEN 的计数按 Vitest 完整汇总登记；本报告没有自行重跑或制造命令退出收据。

主线程需保存所有静态命令的真实完成结果及 diff check，并继续按 SPEC 在干净外盘候选通过固定入口打包安装。安装后同官方来源窗口、同 copilot.assist、128/8192 各一次的公开 CLI 实验与 CAS 恢复尚未由本报告验证。不得重试原任务最后一次恢复、换源、代充或由探针结果推定余额不足。T-1427 正式三轮聊天、其他未完成门与“复验通过后再推送”条件保持。

## 复核字节绑定

| 文件 | SHA-256 |
| --- | --- |
| `contract/src/operations/settings.ts` | `3ac79c3ff1f3826476a1499533f6df43a569ee490647f805fbe058712b6c5b7d` |
| `contract/src/internal/model-probe-io.ts` | `b90c1f3b705cda720a33acdeaf381d96be97966bca34ed1c369bcc9a80958508` |
| `frontend/src/server/settings-model-test-wrap.ts` | `b512a490a07d719b90ec91c13f80a95a02e13f62ea67d7e0dc5bec6eb53c8c86` |
| `frontend/src/server/persistence-client.ts` | `dc0b538d8f8b2fcc739e61c5ec540273776eae3edd2d34ff5b27b13f25d8d918` |
| `backend/src/modules/ai-runtime/model-probe-io.service.ts` | `69bd6a089412c6454cb89e23eeb1f7da42e093c0349743dc093047222a6b3922` |
| `ai-worker/src/io/model-probe-worker-entry.ts` | `6560b91ea7f0492e43f33c66895bb1d1fcef4dd38d83d10509315489727b1b06` |
| `frontend/src/server/settings-model-test-wrap.test.ts` | `29fca1767d145bf2222ba39485a710baa06b5b2f63027be9ce9686c71efdf016` |
| `backend/src/modules/ai-runtime/model-probe-io.service.test.ts` | `0401f7cae1e47033c2b586bfae3e6b50907c64756cb077d5e5e82b09cb1bab09` |
| `docs/verification/t1417/red-frontend.log` | `2be992244b7beccbb9efce04bbe878aa170142ad3edd1806af4af0d4b343b8c5` |
| `docs/verification/t1417/red-backend.log` | `37d2e5ec8a4babc34fff291a027b95fa1d36174ea9723b50b5eb36b21c89c0c4` |
| `docs/verification/t1417/green-frontend.log` | `9d5c136edf8dcdac25c634c0a9f7e8bb4a09510ed273a8561adb70b94de794db` |
| `docs/verification/t1417/green-backend.log` | `b2072dd0c72b368a2947334749d29425cea58e0a90be78ebfdea3d1b863909e3` |

## 类型检查失败后的单行修正复核

补充时间 `2026-10-25T12:14:23.068893+00:00`。首轮全工作区 typecheck 实际退出 2：`settings-model-test-wrap.test.ts(358,11)` 对公开 Transport 返回的 unknown 直接读取 `.data`，触发 TS2571。原 `typecheck.log` 已读并保留，不能把先前 Vitest GREEN 当成类型检查通过。

本次唯一代码增量为在 await 后添加 `as { data: unknown }`，随后读取 data。独立把该一个片段还原后，文件 SHA 精确回到上一审核的 `30fac8b911ff4fa62cfc2f378739006db18f72669e74eb5a036c72c2155cbbe4`，证明没有附带断言或运行逻辑改动。该收窄只声明已知 envelope 的 data 字段，字段值仍为 unknown，没有改成 any 或绕过运行断言；真实 HTTP 捕获、预算、鉴权和成功文案的 expect 均保留。当前测试文件 SHA 为 `29fca1767d145bf2222ba39485a710baa06b5b2f63027be9ce9686c71efdf016`，上表已更新；六个产品文件不因该修正变动。该类型修正认可。

已读 `green-frontend-final.log` 的完整汇总，复跑仍为 82 PASS；当前 `typecheck-final.log` 尚处进行中，不能据此签全工作区静态终态。主线程确认 boundary 与 timeout-policy 命令已通过，本独审已读对应日志；没有替主线程运行或生成退出收据。首轮失败、新测试结果与待完成类型检查分别记录，不覆盖历史。

| 增量证据 | SHA-256 |
| --- | --- |
| `docs/verification/t1417/typecheck.log`（原退出 2） | `17b0c85e97e56a55b34885964b36b473f919fd4f961560c545ae1003d583a3a8` |
| `docs/verification/t1417/green-frontend-final.log` | `4e9d1fe3339e6aa47e13d92559dc6210d5a7991d5c16dbdc52cdfbe119d27e77` |
