# T1090 冻结聊天历史回放独立 SPEC 评审

- 评审类型：`spec-review-round/v2` initial
- 评审时间：2026-10-09（Asia/Shanghai）
- 评审范围：任务包、当前 SPEC、产品定位、T1089 邻接回放诊断及当前相关源码
- SPEC SHA-256：`5ed670f72b1a4884a8fcbc456b64e88adfc21e97f5e46cf2c7b37c28c227851f`
- 产品定位 SHA-256：`86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800`
- 根因证据 SHA-256：`94d6c41670e6e45f6f95c9c81b9b50f5bb94f80b4ddf387b9f1647d4547b8aaa`
- 基点：`9828f8c9`
- 结论建议：**PASS（0 findings）**；正式 verdict 由 `reviewctl` 计算

## 结论依据

根因证据已经把失败收敛为一个确定问题：首次合法完成写入 assistant 消息后，第二次同参回放按 `createdAt` 重新切历史；同时间行可能把 assistant 排到原 user source 前面，使当前历史多出回复并与原 `historyMessageIds/historyDigest` 冲突。原 `b75eb8` 独立源码归档和当前源码都实际复现 59 PASS / 1 FAIL，因此 SPEC 没有把 T1089 变更误写成原因，也没有把旧失败补记为通过。

SPEC 的修复边界与该根因一致：

1. 已绑定 source 只信任后端已核 owner 的真实业务 task，从其原 `inputData.historyMessageIds` 取顺序；模型、Worker 和请求不能提供替代 ID 或 digest。
2. 选择函数要求数组非空、字符串有效、唯一、最后一项是 source；每个 ID 必须仍存在于当前同一 conversation，source 必须是 user。返回值仍是数据库里的真实消息行。
3. 恢复后继续使用旧 `historyDigest` 对真实 `id/role/content/parts/attachments` 和 conversation/project/scope 做摘要校验，不重算或替换旧冻结摘要。因此原内容篡改、缺失、跨会话和 source 变化仍会拒绝。
4. 调用方继续核 user/workspace、project、`copilot.assist`、`chat.run`、source/chatTask、model input、host digest、lease/fence、调用账本、回执和终态。方案只修复历史选择顺序，没有把幂等回放提前到这些校验之前。
5. 后续新增 assistant 或其他消息不在冻结 ID 数组中，不会进入原任务历史；这与“任务输入冻结后可恢复”的产品承诺一致，也不会隐藏真实冻结消息自身的变化。

## 写集与调用链

精确产品写集足以覆盖实际入口：

- 新增 `chat-turn-history.ts` 承载纯选择约束；
- `chat-turn-submission.service.ts` 负责初次冻结与已绑定 replay，并由 `readChatTurnSnapshot` 让 host/proposal 继续复用同一恢复规则；
- `chat-turn-completion.service.ts` 修复 Pi completion 的原回执提交/回放；
- `external-chat-turn.service.ts` 修复 Codex/CodeBuddy 外部 completion 的相同历史恢复。

host 与 proposal 当前都调用 `readChatTurnSnapshot` 后复核 task、source、project、owner 与 digest，因而无需新增产品路径。repository、schema、contract、Worker、页面和数据库均不需要改变。此范围没有新 service、权限、数据表、迁移、模型调用或生命周期机制。

唯一新增测试 `frozen-chat-history.service.test.ts` 被要求走真实 PGlite 与原 service 组合，覆盖 submission、host、proposal、Pi completion、external completion 和完整 Worker 公开 service port；原 completion 60 例及其他关联文件保持原断言。验收还明确要求：

- 原 RED 与有区分性的时间扰动 RED 均保留；
- replay 不新增 assembly、模型、tool、消息、result 或 finish；
- 空、重复、坏型、缺失、跨会话、末项非 source、内容/parts/attachments 篡改及 owner/fence/冻结输入变化全部拒绝且零完成写；
- 原合法首次完成继续通过；
- 测试环境缺失时不能 skip 冒充 PASS。

这些判据能区分“修复冻结回放”与“删除摘要校验或放宽 owner”。

## 明确边界

本任务不重排初次未绑定历史，不修改全会话 UI 顺序，也不承诺任意同毫秒多轮显示已修复。旧 `replyTaskId`、外部引擎协议、图片归属、预算、lease、未知副作用与用户采纳边界均保持。安装验收只要求真实公开只读操作，不能直接伪造 Worker completion，也不代签 live Codex 或全功能 UI。

分类为非 UI（`—`）合理：没有页面、视觉、交互或用户文案变化。该结论只表示 SPEC 可进入实现；不表示产品代码、测试、安装包或 reconcile 已通过。
