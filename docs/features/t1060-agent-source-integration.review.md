# SPEC Review — current

- Task: T-1060
- Verdict: PASS
- Round: 3/3 (recheck)
- Spec receipt: af4fdfdd5a60
- Review receipt: 453827cbe2c1

## 当前有效问题

当前无未销账问题。

已销账：REV-001 (SPEC-SHA256:11bbb6bfd565196d1a7b9fe64351d8677c0f4d5569b335511bdaa6314bede99a:docs/features/t1060-agent-source-integration.md:43（FR-1060-2）。准引文：「创建载荷中的 `externalAgentBinding` 由 backend 固定，参与原输入摘要」；「缺这个字段的旧 queued/reserved Codex 任务沿原 native 路径；旧 settled 回执仍可读，历史 ACP started/unknown 无完整绑定时明确恢复受阻」；「新路径顺序为创建会话、核对有效权限、等待原 `startExternalChatTurn` 持久入场确认、调用 prompt、等待事件处理结束、结算。`onRequestWritten` 仅观察；入场后任何无法排除已发送的失败均 unknown，不重发。」该段明确固定客户端提交、适配器2.1.1、程序0.159.3及权限配置身份；第70行列入旧缺绑定任务和入场失败/断线检查。仅合同销账，源码与故障检查待实现。)；REV-002 (SPEC-SHA256:11bbb6bfd565196d1a7b9fe64351d8677c0f4d5569b335511bdaa6314bede99a:docs/features/t1060-agent-source-integration.md:53-55（FR-1060-3）。准引文：「权限固定使用原适配器 `read-only` 模式：`approvalPolicy=on-request`、`approvalsReviewer=user`、readOnly sandbox、网络关闭、无可写根。宿主 permission 回调明确 cancelled；客户端 fs/terminal 能力均 false。」；「以固定上游源码的窄补丁在子进程启动 argv 和 thread config 中覆盖这些设置，保留全局 MCP 的 disabled 项，再加入本任务服务器。原生 config/read 与 mcpServerStatus/list 核对实际集合后才返回可入场会话；额外/未核验工具不得进入 prompt。」；「子环境沿原 `codexRuntimeEnvironment` 允许键；再加入宿主固定 CODEX_PATH/CODEX_CONFIG/INITIAL_AGENT_MODE。不接受调用者的 DEFAULT_AUTH_REQUEST、任意 MCP 或供应商配置。启动日志关闭原配置/认证请求输出，原文件不复制、不改写。」第53行逐项定义禁用 feature/仅保留原生图片与任务MCP，配置不匹配不放宽且保留原Pi/媒体路径；第70行列入配置层、审批异常、环境检查。仅合同销账，有效配置与实际工具证据待实现核验。)；REV-003 (SPEC-SHA256:11bbb6bfd565196d1a7b9fe64351d8677c0f4d5569b335511bdaa6314bede99a:docs/features/t1060-agent-source-integration.md:57（FR-1060-3）。准引文：「聊天图片使用原 `pending-generated-asset` service，经同一聊天执行的窄 `saveExternalChatImage/recoverExternalChatImage` 端口提交/查原收据，不能伪装为 asset.generate。」；「backend 重新校验 task/lease/输入摘要/started session/turn 归属，操作键从原 callId、真实 provider toolCallId、图片序号派生。」；「聊天回执仅持有受控 asset/file/checksum/byteLength 引用及失败项，结算前查原收据验证。纯图允许空 text 且至少一张已保存候选；正文+单图失败保留正文和明确未保存说明，全部为空则明确失败。通知接收同步，保存队列必须在 prompt 终态后 await flush；重放先查原素材收据，未知回合不重新调用模型。」同段明确真实PNG/JPEG/WebP字节、单图30MiB、任务私有路径/符号链接约束及有效内联字节降级，用户仍沿原候选确认；第70行声明原域表/两项JSON增量与相关输入族检查。仅合同销账，端口装配、幂等恢复、纯图/晚保存/单图降级待实现验证。)

```spec-review-state
{
  "schema": "spec-review-state/v2",
  "task_id": "T-1060",
  "cycle": 1,
  "round": 3,
  "max_rounds": 3,
  "review_kind": "recheck",
  "verdict": "PASS",
  "summary": "已独立只读复审 T1060 readonly v2 补充合同（SPEC SHA256 af4fdfdd5a605b76269a3d04fdf47b65fc75e7a306c49b9712080d892332ce0c）。原 REV-001..003 全部字段与 resolved 状态逐项保持，不改写历史发现或旧结论。未发现新增合同阻止项：backend 创建时冻结 v2，旧 v1/旧缺绑定路由与 unknown 不重发不变；固定 Codex 联合配置仅直接展示 image_gen 和本轮唯一任务 MCP 官方规范化命名空间，关闭无前缀命名与 Code Mode host，保留只读、无网络、无可写根及原禁用项；启动参数、native config/read 实际回显、原 thread 配置与实际工具集合均须核验一致，不能把形状或请求值当作精确一致证明；ACP allow_once 仅由原当前 prompt 与真实 MCP 调用事件、session/toolCallId、原始 server/tool、原审批标记及选项关联决定，取消或异常继续取消，不获得永久信任；backend 原归属、租约、输入摘要、tool.approve、幂等与 committed 排除继续生效。DEC-T1060-02 已记录这是此前用户认可图片与任务工具目的下的窄修复，不扩大脚本/文件/命令/发布能力。固定上游字段与已有权限路径可支撑合同，不需新协议或任务权威。生产源码仍为 v1，已有临时检查指出回显 equality 尚需补齐；本结论仅合同复审，正式 host/Worker 真实 MCP、图片 pending 同字节读回、故障/取消/旧任务验证均待实施验收，绝不写成真机或产品修复 PASS。本次未改共享文件、未运行测试/模型/浏览器/安装或读取认证。",
  "spec_path": "docs/features/t1060-agent-source-integration.md",
  "spec_sha256": "af4fdfdd5a605b76269a3d04fdf47b65fc75e7a306c49b9712080d892332ce0c",
  "constitution_path": "orchestrator/SYSTEM_ARCHITECTURE.md",
  "constitution_sha256": "3efbb0394b8bcc9eb3c9ad7e8c9364df51e336006b862e02ac71fd6c9327971e",
  "review_path": "docs/features/t1060-agent-source-integration.review.md",
  "review_mode": "independent",
  "model": "inherited-root",
  "policy": "convergent-review/v2",
  "cycle_authorization": null,
  "latest_event_hash": "0d11d546d327f0f3ccfa78ec64d496bfea27f0f9fe8a88be8d1d502b7238b52f",
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
  "receipt": "453827cbe2c1"
}
```
