# T-1417 实现与验证

公开 settings.models.test 现在可对同一文本能力显式传入 128 或 8192 输出上限，并支持 copilot.assist。参数经过公开契约、backend service port、严格 IPC 到独立 worker；默认连接测试仍为 128。固定短提示、无工具、首次正文/思考即结束、取消、并发和原时限保持。

真实 RED：前端 10 失败 / 72 通过，后端 8 失败 / 9 通过。GREEN：前端 82、后端与 request-io 回归 20，全数通过，无重试、无 skip。包含实际 child process 和 loopback HTTP，验证两档 max_tokens、鉴权、单次请求与无工具。首轮全工作区 typecheck 退出 2（测试返回值 unknown）；修正测试类型标注后，82 项前端复跑和全工作区 typecheck 均退出 0。独立复核无确认缺陷，保留首轮失败记录。timeout-policy、boundary（0 新增 / 5 既有）和 diff check 通过。

预算诊断尚需本地打包安装后的真实公开 CLI 复验；本阶段不将 T-1417 或 T-1408 标记完成。官方 Pi 正式聊天仍有 HTTP 402，未声称根因已确认，未推送。新的官方凭据元数据后首次对话 execution-task-c34e9921-4086 仍失败，紧接着 default 最小探针成功。原 execution-task-5e73167d-402 最后一次恢复未使用，来源设置已 CAS 恢复至原值。

安装版 UI 已找到可用的正常 macOS 辅助功能入口，实际读取设置与模型配置；这解除此前“原生 UI 不可操作”的环境限制，尚未代替完整 UI 旅程验收。原始运行回执保存在 T-1408 credential-refresh-20261025 本地目录，不把账号内容或敏感原始回执纳入本次提交。
