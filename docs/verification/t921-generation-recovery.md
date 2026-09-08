# T-921 输出恢复交付记录

## 已定位的代码问题

1. 文本兼容模式只执行一次，JSON/schema 不合直接抛出；外层 completionPolicy 修复循环无法处理该异常。现改为节点级共享 2 次格式修复预算，携带真实 schema、校验错误与原响应。原生降级同样计入此预算，已有响应能归一化成功则不追加调用。
2. intelligence.topic-from-decomposition 已声明 creative-partial，辅助字段有 defaults，但无 completionPolicy 时合法对象遇 length 仍被丢弃。现保留通过 schema 的创作候选，generation.finishReason 仍保留真实 length；控制输出及完整度策略继续检查。
3. 情报 Worker 将已收响应的输出失败归为 unknown_result；通用 Worker 又反向把许多未知错误改成格式失败。现仅明确 StructuredOutputError/CompletionPolicyRuntimeError（含 cause）归为输出失败，GenerationFailure 优先透传。分类、热点来源、空分镜/选题后验检查同步标类型；flywheel 同步处理。
4. 雷达改写正文为空，原来只报失败；现最多补该阶段 1 次，保留原拆解/选题检查点。不捕获供应商错误来盲目重发。

## 验证

- 独立 SPEC 评审 recovery_review PASS。首轮代码审查指出旧 wrapper 丢类型与后验校验遗漏，已逐处修正，最终复核通过；另指出 flywheel 既有末端校验遗漏，已按建议局部转换为输出错误。
- frontend TypeScript 全量检查通过（/tmp/t921-types-final3.log，退出 0）。未运行业务自动测试或真实模型，沿用用户暂缓授权；未跑全局 reconcile。
- 本地最新两份 sidecar 日志只读解密至 /tmp/t921-main.log 与 /tmp/t921-latest.log，未定位到截图对应选题任务，不能称本次截图根因已由日志证明。
- 安装包仍为此前 T-918 候选，本次未打包、安装或发布。

## 恢复边界

持久结构化节点最多 1 + completionPolicy.repairAttempts + 2 次供应商调用，仍受原任务预算与截止时间约束；非持久入口显式 SDK 重试另计。合法候选先留存；不把无效对象当成功，不伪造事实，不绕过采纳和归属。过滤响应不启动格式修复，用户取消/鉴权/未知回执按原状态停止。

此交付修复共享输出入口与已查到的错误分类，不代表 T-915 全部可靠性已验收；导航卡顿、应用重启续接和外部供应商未知结果恢复仍以既有任务为准。
