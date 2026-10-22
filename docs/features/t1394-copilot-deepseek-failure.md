# T-1394：Copilot DeepSeek 请求与诊断修复

用户授权：分支 fix-ai-copilot-2026-10-22，基线 5763199619968a3c342205d97d23a9efe59dc138；跳过缺失 product-to-code-orchestrator。禁止读取凭据、真实模型调用、许可/激活/verdict/签名改动及 push。

范围：ai-worker 请求构造、供应商错误脱敏与持久失败链路；contract 仅增加可选诊断字段；backend 保存受控诊断；frontend 映射与日志去重。保留既有重试与未知结果语义。

验收：合成本地 HTTP 验证 DeepSeek 强制工具关闭默认思考、max_tokens、工具及消息序列；错误状态/白名单消息码脱敏限长后到达调用与任务；http_400/404/422 明确提示；开发诊断去重与发送 catch。只跑相关 vitest、受影响包 typecheck，不跑全量 build/全量 Gate。无法恢复历史响应，不冒真实调用成功。

诊断流：供应商拒绝 → 脱敏白名单摘要 → 调用 resultText / GenerationFailure → commitResult → task.errorMessage → 用户提示。

## 后续修复（2026-10-22）

基线 5837a64c469555517b38425a201c7b86bbe4b9d6，用户明确授权 failed / cancelled 同源消息新建执行尝试，运行中与成功提交继续幂等；不重复消息。事务锁下复核最新绑定，并发重试合并，保留旧任务。内部兜底不冒充供应商详情，缺详情提示历史未记录原因，移除 Error 名称拼接。合成 DeepSeek 400 JSON 验证 worker 分类、调用及任务脱敏持久化与卡片传播；不调用真实模型。

涉及路径：backend 聊天提交器及测试、worker outcome 测试，frontend 错误映射及流测试；仅相关 vitest 和所改包 typecheck，无全量构建。任务包编译因原 task binding 缺失失败，按 AGENTS 回退读本 SPEC 与 BACKLOG 行；缺失编排技能按用户要求跳过。交付 /tmp/copilot-fix2.patch、提交脚本与结果记录，不 push。
