# T-970 安装版 RedFox 聊天验收

## 故障证据

旧失败任务 ai-task-9d556905-4725-4acd-bd6e-3927c03ea19a，执行记录 execution-task-d8e42d14-749d-438c-8651-58ce3adf0168。安装版日志 UTC 2026-09-13T14:44:05.195Z 记录 prepareChatRedfox / ZodError / HOST_PORT_REJECTED；持久执行记录已有模型 checkpoint，后被标记 TOOL_REQUIRES_RECONCILIATION。

纠正 T-969：业务 ai_tasks 的 modelKey、startedAt 在成功聊天中也为空，不能据此推断没有模型调用。execution.tasks.get 当前读取的是另一类执行对象，404 也不能证明持久执行记录不存在；本次通过 execution.tasks.list 的 kind/ownerId 查询到了原记录。

## 修复和测试

候选提交 f1c8fdd6。RedFox 工具公布与实际执行复用同一动作契约，在取得外部执行权前反馈非法输入；按动作添加默认分页值。日期范围与 URL 拒绝返回确定性工具错误，不抛成未知外部结果。

- 参数契约回归先失败（缺字段被错误接受），修复后通过。
- 日期/URL 回归先失败（抛异常），修复后通过且不发网络请求。
- backend RedFox/工具参数/工具门：50 项通过。
- Worker RedFox/持久工具：30 项通过；Worker TypeScript 通过。
- 打包预检：42 项通过；官方本地打包成功并安装启动。
- 全仓 backend TypeScript 仍有既有测试类型漂移；本次文件无错误。boundary-scan 有既有 live-chat-session.ts 两条 SDK 导入违规，不计全绿。

## 真实安装版验证

用户授权的相同请求：使用redfox帮我分析一下今天的爆款内容 结合我的定位。

通过已安装 CLI 的 ai.conversations.messages.create 发起，复用产品持久聊天服务；没有直接调用供应商替代产品验证。账号 acct-ae1a8346-9，历史对话「RedFox 热点真实验收」（ai-conv-92f97c71-50）。

任务 ai-task-92f97c71-63，UTC 14:59:19.927 提交，14:59:30.001 成功，约 10.1 秒。持久结果可回读，tool-redfox_query 为 output-available，status=ok，返回 20 组热点。查询明确使用北京时间 2026-09-13 00:00:00 至 23:59:59。模型在工具结果之后返回结合账号定位的分析。未自动采纳、生成选题或发布。

本次证明热点工具与后续模型回复闭环成功；不把一次成功推断成全部六种动作的真实上游验收。历史错误任务未重写。

安装文件 /Users/zyongzhu/Downloads/CreatorOS-1.1.0.dmg，SHA-256：4c29051dd72440954e634e7c972c8411063698351ce0a7673cc2e1667e5501bc。hdiutil verify 有效，本地 ad-hoc 包，未做 Apple 公证。
