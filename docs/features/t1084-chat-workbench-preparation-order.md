# T-1084 修复聊天工具准备顺序导致的普通消息失败

用户持续授权全面验证 AI 助手和本地客户端。2026-10-08 新 main 包 `0480ebe17717bd426e083709fc22ccbdb9eb7840` 实际安装后，公开 `ai.conversations.create` 成功；同一中性项目的纯只读消息 `ai.conversations.messages.create` 实际 HTTP400：`Workbench 能力未装配执行入口：plan.update`。模型尚未执行，消息提交准备在事务之前失败。原失败、原幂等键、会话和所有业务资料保留，不把失败写成模型成功。

## 原因和结果

`prepareChatTurn` 先将完整 Workbench 声明传给 `prepareChatAssembly`。内层只建立旧业务工具原型，却立即执行要求完整目录的 `prepareChatToolDefinitions`；计划和其他 Workbench 原型要在内层返回以后才注入，导致所有启用计划的正常消息提前失败。真实计划执行 host 已在 `chat-production-composition` 装配，沿原任务租约和 backend plan service 保存，不需要增加假执行入口。

修复仅在内层旧业务工具准备时不附加尚未注入的 Workbench 声明；内层返回后保留现有 Workbench 原型注入，并使用原完整冻结选项执行最后一次严格工具准备。正常消息继续进入原任务提交、Worker 和模型；新旧快照、执行引擎选择、原副作用及采用规则保持。

```mermaid
flowchart LR
 A[读取当前项目和消息] --> B[准备已有业务工具]
 B --> C[装配计划与 Workbench 工具原型]
 C --> D[用完整目录严格核验全部工具]
 D --> E[提交原任务并由 Worker 执行]
```

## 精确写集和边界

- 产品：`backend/src/modules/ai-runtime/chat-turn-preparation.ts`。
- 回归：`backend/src/modules/ai-runtime/chat-assembly.test.ts`，保留全部已有测试和断言，补真实 Pi/Codex 准备及 Workbench 目录漂移拒绝。
- 控制/证据：本 SPEC、同名独立评审、`docs/verification/t1084/`、T1062 当前安装验收记录、BACKLOG、BACKLOG-details 及流程命令实际生成的事件/回执。

不改公共 schema/API、数据归属、模型或 Skill 语义策略、数据库、UI、权限、工具副作用、原生执行、`chat-tool-definitions` 的严格拒绝规则和最终快照。原型仍不能脱离原任务租约执行，未实现的能力不能伪造支持。没有 UI 改动，不使用浏览器夹具代签原生验收。

## 必验

1. 已发生安装版公开入口失败和原 `真实聊天冻结可选计划工具，旧快照不被静默改写` RED；保留原日志，不补拍更早证据。
2. 修复前补测真实 `prepareDurableChatTurn`，覆盖 `pi`、`codex`、可选 plan 加原生 Workbench 声明；旧未启用快照无新增计划，最终 schema/描述漂移仍拒绝，原历史规则不改。记录新增 RED 后最小修复 GREEN。
3. 完整原 `chat-assembly.test.ts`、原 plan host/公开 plan 集成、前端公开聊天提交集成与类型检查；boundary/semantic/超时扫描按真实结果保留旧全局欠债，不能删断言或放宽守卫洗绿。
4. 独立实施复核后提交 main 并冻结，沿固定本地打包入口重新出包，不做构建备份；校验镜像、签名和安装字节后在当前用户客户端验证。此为已确认本地验收授权，不 push/tag/公开发布。
5. 先读原会话 `ai-conv-ca33de02-271` 的消息与任务列表，证明原失败没有提交任务。原失败幂等键按真实公开回执恢复规则处理；已明确 failed 的准备请求可用记录修复关联的新请求再次验证，不能将其称作原未知任务重试或伪造旧失败成功。最终读回新任务真实状态、消息、步骤和结果，查确实读取当前版本；仅候选不自动采用。
6. 安装后继续 T1062 剩余全功能矩阵。纯组归属、已保存文章/图文/主脚本、原片及既有粗剪工程保持；原生 UI、Codex 实际执行或用户验收没有发生时仍写待验。

本轮证据根：`/Users/zyongzhu/CreatorOS-local-acceptance/main-installed-20261008/t1084`。T1084 只关闭此确定性提交阻断，不代签 T1062/T1074 全功能可用，也不代签未核因的首次接口长等待。
