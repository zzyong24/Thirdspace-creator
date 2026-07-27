# T-527 统一纠偏独立审计记录

> 日期：2026-07-26
> 方式：四个独立 reviewer 分别核对代码、历史 SPEC/CONTRACT 与 Replacement
> 审计对象：四份 Replacement 的第一次“瘦身”版本
> 总结论：四项均未达到 BUILD-ready；按三轮 STOP 规则退回上游，不继续堆补丁

## 1. T-517 生产预设自动化

**最终 verdict：FAIL**

阻塞项：

- Replacement 又在 `job_run` 上定义 lease、heartbeat、cancel、retry，重复了仓内已有
  `backend/src/modules/execution/persistent-task.service.ts`。
- operation/resource/error/example 没有形成唯一线协议；无 AI 的 run 与字段模型互相矛盾。
- create/update 仍可能接受任意 prompt、target、grant 和 cron，没有真正收窄为生产预设。
- 重试幂等和副作用去重没有闭合；preset registry、权限和默认值也不完整。

**上游处理**：调度/历史留给 `scheduled_job/job_run`，durable execution 唯一复用
`PersistentTaskService`；旧 CONTRACT 关闭，重新产出薄映射契约。

## 2. T-516 “AI 对我的理解”

**最终 verdict：FAIL**

阻塞项：

- 硬依赖的 T-517 尚未形成可实现契约。
- 用账号总作品数推导某个定位字段“低置信”没有证据链，会制造假健康结果。
- 任意非空 `statusNote` 都报错，和 T-521 的窄分类不一致。
- 使用了不存在的 `externalRef`，真实字段是 `externalId`；还绕过 publishing service port。
- 首次失败、并发运行、设置页跳转和 operation 错误示例未闭合。

**上游处理**：首版只做缺定位、账号样本不足、定位过期、已知动态文案四类确定性检查；禁止逐字段
置信度，等 T-517 窄契约后再继续。

## 3. T-518 问题反馈

**最终 verdict：FAIL**

阻塞项：

- 设计要求的 Growth 授权证明无法从现有 Activity verdict 获得。
- Growth 只有测试用确定性对象存储 adapter，没有可承诺生产私有附件保存的基础设施。
- 通知 adapter、support module 架构、事务/清理/幂等模型均不存在或未闭合。
- 继续补这些缺口会把一个反馈入口重新扩张成上传平台和客服系统。

**上游处理**：撤销应用内上传。复用仓内已有签名/缓存 `supportUrl`，只做本地整理、复制、打开
反馈渠道和打开加密日志目录。

## 4. T-519 知识文件工作区

**最终 verdict：FAIL**

阻塞项：

- 当前 `assets.uploads.create` 不返回稳定 `assetId`，Asset 到 `complete` 才创建；complete
  非幂等且无法和 KnowledgeDocument 原子关联。
- 上传会话没有固定 `accountId`，账号切换后 complete 可能产生错误归属。
- 抽取 runner 会自动走模型总结，不满足“导入默认本地确定性抽取”。
- Search 正文投影的唯一写者、重建、蒸馏 provenance、递归归档并发均未闭合。

**上游处理**：先修 Assets ownership/idempotency 和本地抽取边界，再补 Folder/Document；禁止
绕过前置问题新建第二套上传/搜索。

## 5. 审计裁决

- 上述 FAIL 是历史真实性，不改写成 PASS 或 accepted-risk。
- 2026-07-26 四份 Replacement 已按 findings 重写为 PLAN 边界，明确不再声称是完整 CONTRACT。
- 本轮的完成条件是“把跑偏方向纠正并关闭错误 BUILD 输入”，不是把四个功能伪报为已实现。
- 编排框架优化不属于 T-527，不在本次修改。

## 6. 新上游 PLAN Round 1

> review_mode：cross-model，`codex exec -m gpt-5.6-sol`，只读核对生产代码
> verdict：FAIL（3 blocker / 2 major / 2 minor）

### Findings 与作者处置

| finding | 处置 | 理由与落点 |
|---|---|---|
| T-516 删除 AI 起草 patch、用户确认/调整、审计/恢复 | 接受 | PLAN 恢复“用户主动让 AI 起草 → 现有定位表单预览/调整 → positioning service 保存 → 版本历史恢复”；只删除独立 Saga |
| T-519 遗漏 URL/文本、默认文件夹、多级树、虚拟节点和 local-only | 接受 | PLAN 全部补回，并声明旧知识/图/导入 ID 不迁不删 |
| T-517 把现状误写成只差薄映射 | 接受 | 改为“现有两块地基尚未接通”，补 sealed kind、typed registry、唯一 driver、aiTaskId 退出和 timer cutover |
| T-516 复用 T-521 当前公开入口会边读边改 | 接受 | CONTRACT 前置改为先抽出同源纯分类 service port，扫描不得调用 mutating cleanup |
| Manifest 仍指旧工件 | 接受 | T-516/517/518/519 PLAN 原子重挂 2026-07-26 Replacement；旧 T-517 CONTRACT 标 invalidated 并保留 FAIL |
| T-518 外链事实应为 sidecar open-url | 接受 | 证据与契约前置改为 `/api/v1/local/open-url` |
| T-518 缺复制/日志独立失败状态 | 接受 | 增 `copy_failed/logs_opening/logs_open_failed/channel_open_failed` |

Round 1 的原始 FAIL 不改写。以上修订进入定向 Round 2；Round 2 只判断这些 blocker/major 是否
消失以及是否引入新的方向矛盾，不重新扩张产品范围。

## 7. 新上游 PLAN Round 2

> review_mode：同一 cross-model reviewer 定向复审
> verdict：CONCERNS（0 blocker / 1 major / 0 minor）

唯一 finding：Manifest 已正确重挂，但 `DEC-AUTO-001` 仍写 active、`DEC-CTX-005` 仍写
needs-user-confirmation，可能让旧 automation_run/effect 平台和 Context candidate/event/undo
平台重新进入决策队列。

**作者处置：接受。**

- `DEC-AUTO-001` 改为 `superseded-in-part`：只保留生产预设积木、唯一 ticker 和人工确认闭环；
- `DEC-AUTO-002` 改为 `superseded`，明确从未激活；
- `DEC-CTX-005` 改为 `superseded`，明确从未确认且移出决策队列；
- `DEC-FDB-001` 同步标为被 `DEC-FDB-002` 取代。

Round 2 CONCERNS 继续保留，以上单点修订进入 Round 3 定向复核。

## 8. 新上游 PLAN Round 3（最终）

> review_mode：同一 cross-model reviewer 单点复核
> verdict：PASS（0 blocker / 0 major / 0 minor）

复核确认：

- `DEC-AUTO-001` 已明确只保留产品原则，旧 `automation_run/AutomationGrant/effect` 物理路线
  不再是当前输入；
- `DEC-AUTO-002`、`DEC-CTX-005` 已明确从未激活并被 `DEC-ODR-001` 取代；
- `DEC-FDB-001` 已明确被 `DEC-FDB-002` 取代；
- Round 2 的 CONCERNS 和作者处置均原样保留，没有改写历史结论。

因此，四份 2026-07-26 Replacement 的 **PLAN Gate 通过**。这只表示跑偏方向已被关闭、后续
可以从新 PLAN 起草最小 CONTRACT；不表示 T-516/T-517/T-518/T-519 已实现，也不恢复任何旧
CONTRACT 的 BUILD 授权。
