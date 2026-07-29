# T-604 独立 SPEC/CONTRACT 评审请求

你是独立 reviewer，不是实现作者。只读评审，不修改任何文件。

必须完整读取：

1. `/Users/zyongzhu/.skills-manager/skills/product-to-code-orchestrator/prompts/spec-reviewer.md`
2. `/Users/zyongzhu/Workbase/Thirdspace-creator/docs/superpowers/specs/2026-07-29-creatoros-growth-managed-model-authority.md`
3. `/Users/zyongzhu/Workbase/Thirdspace-creator/docs/contracts/creator-client-config-consumer-v1.md`
4. `/Users/zyongzhu/Workbase/Thirdspace-creator/PROJECT.md`
5. `/Users/zyongzhu/Workbase/Thirdspace-creator/orchestrator/SYSTEM_ARCHITECTURE.md`

评审范围只限用户已经确认的 CreatorOS 侧结果：模型配置由 Growth 渠道端统一控制，用户不能
自行配置；CreatorOS 设置入口和所有 AI 运行时都不得绕过；长期 Key 不进入桌面客户端；Growth /
AM / AI Gateway 服务端不在本任务实现。

请重点用仓内代码只读核验：

- 当前文本、多模态、ASR、Embedding、搜索是否存在未被 SPEC 纳入的本地配置读取路径；
- 设置 put/list/test/import/export 是否都有服务端边界；
- “上游 exact gateway contract 缺失时 typed port + fail-closed”是否满足 Creator-only 范围，
  有没有假成功或无意扩大到 Growth；
- 构建权威、远程 policy、离线 LKG 与存量本地配置的状态转换是否唯一、可测、可回滚；
- CONTRACT 是否具备逐 FR 数据链路、错误与验收，不允许只隐藏 UI。

严格输出 `spec-review-round/v2` JSON。不要输出 verdict；finding 不得扩大到新计费、配额、管理台、
新 provider 或上游 API 设计。
