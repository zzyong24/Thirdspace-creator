# SPEC Review — current

- Task: T-1060
- Verdict: PASS
- Round: 2/3 (recheck)
- Spec receipt: 11bbb6bfd565
- Review receipt: 034e75fa3d2e

## 当前有效问题

当前无未销账问题。

已销账：REV-001 (SPEC-SHA256:11bbb6bfd565196d1a7b9fe64351d8677c0f4d5569b335511bdaa6314bede99a:docs/features/t1060-agent-source-integration.md:43（FR-1060-2）。准引文：「创建载荷中的 `externalAgentBinding` 由 backend 固定，参与原输入摘要」；「缺这个字段的旧 queued/reserved Codex 任务沿原 native 路径；旧 settled 回执仍可读，历史 ACP started/unknown 无完整绑定时明确恢复受阻」；「新路径顺序为创建会话、核对有效权限、等待原 `startExternalChatTurn` 持久入场确认、调用 prompt、等待事件处理结束、结算。`onRequestWritten` 仅观察；入场后任何无法排除已发送的失败均 unknown，不重发。」该段明确固定客户端提交、适配器2.1.1、程序0.159.3及权限配置身份；第70行列入旧缺绑定任务和入场失败/断线检查。仅合同销账，源码与故障检查待实现。)；REV-002 (SPEC-SHA256:11bbb6bfd565196d1a7b9fe64351d8677c0f4d5569b335511bdaa6314bede99a:docs/features/t1060-agent-source-integration.md:53-55（FR-1060-3）。准引文：「权限固定使用原适配器 `read-only` 模式：`approvalPolicy=on-request`、`approvalsReviewer=user`、readOnly sandbox、网络关闭、无可写根。宿主 permission 回调明确 cancelled；客户端 fs/terminal 能力均 false。」；「以固定上游源码的窄补丁在子进程启动 argv 和 thread config 中覆盖这些设置，保留全局 MCP 的 disabled 项，再加入本任务服务器。原生 config/read 与 mcpServerStatus/list 核对实际集合后才返回可入场会话；额外/未核验工具不得进入 prompt。」；「子环境沿原 `codexRuntimeEnvironment` 允许键；再加入宿主固定 CODEX_PATH/CODEX_CONFIG/INITIAL_AGENT_MODE。不接受调用者的 DEFAULT_AUTH_REQUEST、任意 MCP 或供应商配置。启动日志关闭原配置/认证请求输出，原文件不复制、不改写。」第53行逐项定义禁用 feature/仅保留原生图片与任务MCP，配置不匹配不放宽且保留原Pi/媒体路径；第70行列入配置层、审批异常、环境检查。仅合同销账，有效配置与实际工具证据待实现核验。)；REV-003 (SPEC-SHA256:11bbb6bfd565196d1a7b9fe64351d8677c0f4d5569b335511bdaa6314bede99a:docs/features/t1060-agent-source-integration.md:57（FR-1060-3）。准引文：「聊天图片使用原 `pending-generated-asset` service，经同一聊天执行的窄 `saveExternalChatImage/recoverExternalChatImage` 端口提交/查原收据，不能伪装为 asset.generate。」；「backend 重新校验 task/lease/输入摘要/started session/turn 归属，操作键从原 callId、真实 provider toolCallId、图片序号派生。」；「聊天回执仅持有受控 asset/file/checksum/byteLength 引用及失败项，结算前查原收据验证。纯图允许空 text 且至少一张已保存候选；正文+单图失败保留正文和明确未保存说明，全部为空则明确失败。通知接收同步，保存队列必须在 prompt 终态后 await flush；重放先查原素材收据，未知回合不重新调用模型。」同段明确真实PNG/JPEG/WebP字节、单图30MiB、任务私有路径/符号链接约束及有效内联字节降级，用户仍沿原候选确认；第70行声明原域表/两项JSON增量与相关输入族检查。仅合同销账，端口装配、幂等恢复、纯图/晚保存/单图降级待实现验证。)

```spec-review-state
{
  "schema": "spec-review-state/v2",
  "task_id": "T-1060",
  "cycle": 1,
  "round": 2,
  "max_rounds": 3,
  "review_kind": "recheck",
  "verdict": "PASS",
  "summary": "已只读对照首轮 REV-001..003 复核当前 T1060 SPEC 增量（SHA256 11bbb6bfd565196d1a7b9fe64351d8677c0f4d5569b335511bdaa6314bede99a）。三项既有合同缺口均已闭合：创建绑定及旧缺字段路由/持久入场顺序、固定只读权限与启动/会话有效工具核对、沿原待采用素材服务的聊天图片绑定/收据/flush/单图降级。仅将原三项状态改为 resolved 并补准引文证据，其余冻结字段保持首轮原值，不新增 finding 或改变已确认产品方向。WorkBuddy 仍为外部 MCP，原生 mcpLaunch 只提供非秘密随包启动信息，原 API/Pi 配置保留。本结论是合同复审，可据此进入既定实现，不代表源码已经落地、构建或测试通过、模型/图片/跨应用真机可用；这些仍按 SPEC 完成标准验证。本次未改仓库或运行测试、安装、模型、浏览器。",
  "spec_path": "docs/features/t1060-agent-source-integration.md",
  "spec_sha256": "11bbb6bfd565196d1a7b9fe64351d8677c0f4d5569b335511bdaa6314bede99a",
  "constitution_path": "orchestrator/SYSTEM_ARCHITECTURE.md",
  "constitution_sha256": "3efbb0394b8bcc9eb3c9ad7e8c9364df51e336006b862e02ac71fd6c9327971e",
  "review_path": "docs/features/t1060-agent-source-integration.review.md",
  "review_mode": "independent",
  "model": "inherited-root",
  "policy": "convergent-review/v2",
  "cycle_authorization": null,
  "latest_event_hash": "dec7e751699dcdcdc9fc9e6c94143844203f03eee320550eb84b5ad1b09bfeee",
  "open_findings": [],
  "resolved_findings": [
    {
      "id": "REV-001",
      "resolution_evidence": "SPEC-SHA256:11bbb6bfd565196d1a7b9fe64351d8677c0f4d5569b335511bdaa6314bede99a:docs/features/t1060-agent-source-integration.md:43（FR-1060-2）。准引文：「创建载荷中的 `externalAgentBinding` 由 backend 固定，参与原输入摘要」；「缺这个字段的旧 queued/reserved Codex 任务沿原 native 路径；旧 settled 回执仍可读，历史 ACP started/unknown 无完整绑定时明确恢复受阻」；「新路径顺序为创建会话、核对有效权限、等待原 `startExternalChatTurn` 持久入场确认、调用 prompt、等待事件处理结束、结算。`onRequestWritten` 仅观察；入场后任何无法排除已发送的失败均 unknown，不重发。」该段明确固定客户端提交、适配器2.1.1、程序0.159.3及权限配置身份；第70行列入旧缺绑定任务和入场失败/断线检查。仅合同销账，源码与故障检查待实现。"
    },
    {
      "id": "REV-002",
      "resolution_evidence": "SPEC-SHA256:11bbb6bfd565196d1a7b9fe64351d8677c0f4d5569b335511bdaa6314bede99a:docs/features/t1060-agent-source-integration.md:53-55（FR-1060-3）。准引文：「权限固定使用原适配器 `read-only` 模式：`approvalPolicy=on-request`、`approvalsReviewer=user`、readOnly sandbox、网络关闭、无可写根。宿主 permission 回调明确 cancelled；客户端 fs/terminal 能力均 false。」；「以固定上游源码的窄补丁在子进程启动 argv 和 thread config 中覆盖这些设置，保留全局 MCP 的 disabled 项，再加入本任务服务器。原生 config/read 与 mcpServerStatus/list 核对实际集合后才返回可入场会话；额外/未核验工具不得进入 prompt。」；「子环境沿原 `codexRuntimeEnvironment` 允许键；再加入宿主固定 CODEX_PATH/CODEX_CONFIG/INITIAL_AGENT_MODE。不接受调用者的 DEFAULT_AUTH_REQUEST、任意 MCP 或供应商配置。启动日志关闭原配置/认证请求输出，原文件不复制、不改写。」第53行逐项定义禁用 feature/仅保留原生图片与任务MCP，配置不匹配不放宽且保留原Pi/媒体路径；第70行列入配置层、审批异常、环境检查。仅合同销账，有效配置与实际工具证据待实现核验。"
    },
    {
      "id": "REV-003",
      "resolution_evidence": "SPEC-SHA256:11bbb6bfd565196d1a7b9fe64351d8677c0f4d5569b335511bdaa6314bede99a:docs/features/t1060-agent-source-integration.md:57（FR-1060-3）。准引文：「聊天图片使用原 `pending-generated-asset` service，经同一聊天执行的窄 `saveExternalChatImage/recoverExternalChatImage` 端口提交/查原收据，不能伪装为 asset.generate。」；「backend 重新校验 task/lease/输入摘要/started session/turn 归属，操作键从原 callId、真实 provider toolCallId、图片序号派生。」；「聊天回执仅持有受控 asset/file/checksum/byteLength 引用及失败项，结算前查原收据验证。纯图允许空 text 且至少一张已保存候选；正文+单图失败保留正文和明确未保存说明，全部为空则明确失败。通知接收同步，保存队列必须在 prompt 终态后 await flush；重放先查原素材收据，未知回合不重新调用模型。」同段明确真实PNG/JPEG/WebP字节、单图30MiB、任务私有路径/符号链接约束及有效内联字节降级，用户仍沿原候选确认；第70行声明原域表/两项JSON增量与相关输入族检查。仅合同销账，端口装配、幂等恢复、纯图/晚保存/单图降级待实现验证。"
    }
  ],
  "receipt": "034e75fa3d2e"
}
```
