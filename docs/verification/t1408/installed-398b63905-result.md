# 398b63905 安装版与 CLI 复验

2026-10-25。本次从干净已提交的 `398b63905d6208aca89b6359af15720fa96de8f6` 按固定入口构建并安装，原用户授权有效。额度页登录、余额/冻结/消耗同步由用户明确跳过（DEC-141020），不记为通过。

| 检查 | 实际结果 |
| --- | --- |
| 本地构建安装 | 固定 `pnpm -C frontend desktop:package-local` 入口成功；DMG 校验、签名校验及安装前后产物哈希一致。版本 1.2.0，本地 ad-hoc，未公证。 |
| 官方最小连接测试 | 安装版公开 CLI `settings.models.test(default)` 返回业务 `ok:true`，说明为“已收到最小测试请求的流式回复，连通。”只证明最小请求。 |
| 官方 Pi 正式对话 | 新安装候选独立验收首轮仍为 `CHANNEL_MODEL_PAYMENT_REQUIRED` / HTTP 402 / `waiting_user`。跨轮记忆、计算、同组工具未执行，不能计通过。 |
| 配置保全 | 最小测试结束恢复到 revision 64；正式对话测试后回读原 choices 一致、text 为 codex，revision 66。 |
| 数据保全 | 安装前 65 个项目 ID 全部仍在；安装后共 66 个，多出 1 个在安装完成后创建的项目，无原项目删除。5 个组成员完整一致。不能把新增项目归因于安装或断言所有项目正文逐字节未变。 |
| 推送 | 尚未推送。额度跳过没有把正式聊天或剩余验收改为通过。 |

正式对话的新验收任务为 `ai-task-4ba04d39-421` / `execution-task-4ba04d39-422`，对话为 `ai-conv-4ba04d39-417`。公开回读确认 attempt 1、maxAttempts 3，执行层 blocked、runtimeStatus waiting_user；AI 任务外层 status 仍为 running，不能单看该字段认为仍生成。CLI 等待达到本次 120 秒观察预算后再回读确认，没有取消、重提或自动恢复。脚本记录首轮观察总时长 130.382 秒，不是模型生成耗时。

原 `execution-task-5e73167d-402` 未再恢复，最后一次尝试未消耗。此次官方探针与正式聊天结果分别记录；未查明现场 402 的权威资金/权益原因，未充值、改预算、换源或缩小正式请求冒充恢复。

产物：

- DMG SHA-256：`bd2c31d89f7b82625486132192cd8e10c29849a83e643b8d7215cc9b7879500a`。
- 安装主程序 SHA-256：`c135dcda9f169ae68c611a39bc77b6eda6ecce76721ed8300d4597a46db8fbaf`。
- 安装 sidecar SHA-256：`a9be9fbbd90253bc3ab37423e54c6a6d3f1503d25c7fa9dbd0107e4c0d6b7750`。

本地证据来源为 `docs/verification/t1411/local-package/installed-candidate-proof.json`、`official-probe/probe-result.json`，以及本任务 `local-package/auth-fix-data-preservation-proof.json`、`local-package/official-chat-retest-398b63905/`。实际用户内容与原始 CLI 回执仅保留本地，不批量加入提交；本报告是限定范围摘要。
