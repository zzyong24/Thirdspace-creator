# T-768 BUILD Gate

日期：2026-08-11
结论：代码与静态打包合同 PASS；正式候选的 macOS / Windows 安装版真实短音频 Whisper
smoke 尚未执行，因此 T-768 保持进行中，不把静态依赖检查冒充真机推理成功。

## 行为收口

- `resolveTranscribeSpec` 对任意在线或渠道配置解析异常返回规范的 `whisper-local` spec；
  坏签名、坏配置和异常内容均不会继续被使用。
- `prepareManagedTranscribeSpec` 对未绑定额度账户、额度不足、权益拒绝、lease 过期、供应商未知、
  网络和合同错误统一回退本地，不再把额度入口作为 ASR 阻断。
- `transcribeWithLocalFallback` 覆盖用户自配云端与渠道受管云端：在线抛错、响应非法或空文本后，
  对同一音频只调用一次本地 Whisper；本地本身失败时不递归。
- 回退不申请第二枚 lease、不更换幂等键、不重复产生在线消耗；调用结果返回真实的
  `effectiveSpec` 与 `channel-managed | configured-cloud | whisper-local` 模式。
- 本地失败只投影稳定文案“本地转写失败，请重试。”，不携带 ffmpeg、ONNX、worker、绝对路径、
  临时 token 或云端内部异常。
- 未修改视觉文件、Growth、Activity、GitHub 发布流程或生产配置。

## 独立评审与 TDD

- 独立复审：第一轮发现 3 个 major（云端空文本、实际执行模式、底层本地错误泄漏）；修订后第二轮
  通过，最终对当前 SPEC hash 的第三轮回执为 `PASS[REV:3eb18966ea59]`。证据：
  `orchestrator/reviews/T-768.round1.json`、`orchestrator/reviews/T-768.round2.json`、
  `orchestrator/reviews/T-768.round3.json`。
- 红测：新增行为测试后，前端聚焦实跑 11 例失败、后端聚焦实跑 1 例失败；随后实现统一回退边界。
- 绿测：
  - 前端受管 ASR / lease：19/19 PASS。
  - 后端解析 / 批量转写 runner：44/44 PASS。
  - ai-worker 本地 Whisper adapter：18/18 PASS。
  - 桌面 sidecar / 正式工作流 / 本地打包静态合同：52/52 PASS。
  - frontend、backend、ai-worker typecheck：全部 PASS。
  - 聚焦 ESLint：0 errors；仅保留 `persistence-client.ts` 一条既有未使用参数 warning。
  - 业务代码与既有文档差异 whitespace 检查：PASS；新 SPEC 状态块保留 2 处 Markdown 硬换行。

## 物理与测试完整性门

- boundary-scan：PASS，无新增违规（5 条均为既有基线）。
- orphan-scan：0 errors / 100 warnings，双向链路 PASS；warning 为既有 PLANNED / 未追踪 FR。
- semantic-boundary-scan：PASS。
- test-integrity：0 errors / 1 warning；5 个修改测试文件的用例与断言均净增，无 skip 或 suppression
  放宽；warning 为仓库未配置 coverage threshold。
- reconcile：如实 FAIL（4 errors / 9 warnings）。4 个 error 均为 T-768 范围外的既有回执漂移：
  T-765、T-746 review receipt，以及 T-727、T-722 frontend receipt；T-768 当前 SPEC 回执
  `PASS[REV:3eb18966ea59]` 未漂移，本任务的 boundary / orphan / semantic / test-integrity 子门通过。

## 仍需正式候选验证

- 静态合同已证明构建脚本强制物化 `@xenova/transformers`、ONNX 原生绑定与双平台 ffmpeg/ffprobe，
  缺失时构建失败。
- 尚未在本轮安装版 macOS 与 Windows 候选中，各自使用一条非 fixture 短音频完成真实本地 Whisper
  转写。因此 AC-768-05 仍待验，T-676 的 Windows worker / GLib 根因也不能据此宣告关闭。
- 本 Gate 未运行 GitHub 打包、未创建 tag / Release、未上传或分发安装包。
