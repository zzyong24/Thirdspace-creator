# T-527 最近产品任务过度设计统一纠偏

> 日期：2026-07-26
> 状态：Replacement scope envelope
> 用户裁决：先纠正已经跑偏的任务；编排框架如何防复发另议，不混入本任务
> 影响任务：T-516、T-517、T-518、T-519
> 历史工件：保留原 SPEC、CONTRACT 和 FAIL/CONCERNS 评审，不删除、不伪改为 PASS

## 1. 大白话结论

最近四个任务把具体用户需求扩张成了平台，第一次“瘦身”又犯了同一个错误：继续用更多契约证明
复杂方案，而没有先核对仓库已经存在什么：

- “每周看看 AI 是否理解我”变成跨领域修复 Saga；
- “有一个自动任务底座”重复实现了已有 `PersistentTaskService` 的 lease/heartbeat/cancel/retry；
- “把 Bug 反馈给开发者”变成客服工单系统；
- “知识库能导入文件并按文件夹查看”变成 41 个新 API 的文件平台，还绕过了现有 Assets 上传的
  账号归属与幂等前置问题。

本次不降低用户已经确认的结果，只删除没有被用户要求的平台能力，并优先复用仓库现有地基。

```mermaid
flowchart LR
  NEED["用户要完成的动作"] --> REUSE["先找仓内已有能力"]
  REUSE --> GAP["只补闭环缺口"]
  GAP --> CONTRACT["最小可实现契约"]
  CONTRACT --> REVIEW["独立评审"]
  REVIEW --> BUILD["用户确认后 BUILD"]
```

## 2. 统一裁决

### 2.1 保留

- 真实用户操作必须有完整成功、空态、失败和重试回显。
- 所有数据继续按 `(userId, accountId)` 隔离。
- AI 只能产候选或建议，进入业务真值必须由用户确认。
- 日志、截图、文件等敏感数据必须由用户主动选择或明确同意。
- 任务必须可验证，不能用假按钮、假成功或编造数据代替。

### 2.2 删除

- 没有真实用户需求支撑的新角色体系、新管理后台和通用工作流平台。
- 为未来可能性预建的 DAG、任意脚本、通用 effect grant、legal hold、复杂 Saga。
- 已有模块能够完成的重复表、重复状态机、重复上传链、重复 AI 候选体系。
- Reviewer 建议中超出已确认产品范围的扩张项；安全问题必须解决，但不自动升级为新产品。

### 2.3 复杂度预算

以下不是机械上限，而是触发重新说明的阈值：

- 一个用户动作新增超过 `1` 个领域模块；
- 新增超过 `2` 张核心业务表；
- 新增超过 `6` 个公开业务 operation；
- 新增角色、权限体系、worker、跨仓状态机或第二套任务队列。

超过任一项，必须先证明现有模块不能复用，并重新取得用户范围确认。Reviewer 只能检查已确认范围
是否安全可实现，不能把所有潜在风险都转成新产品能力。

## 3. 四个任务的新边界

| 任务 | 用户真正要的结果 | 复用 | 只补的缺口 | 明确不做 |
|---|---|---|---|---|
| T-517 | 自动任务按生产预设运行，用户可调频率、开关、立即运行和看结果 | `scheduled_job/job_run` 管调度与展示；`PersistentTaskService` 提供 durable task 原语 | preset 映射、封闭 task kind、单一 driver 与状态投影 | 通用工作流、任意脚本、第二套执行状态机 |
| T-516 | 设置里看到“AI 对我的理解”和最近检查；默认每周，可调/关闭/立即检查；AI 可起草修改供确认 | Positioning、Publishing、Settings、T-517 预设任务 | 最新确定性报告 + 现有定位编辑/版本链 | 虚假逐字段百分比、自动落库、候选/撤销 Saga |
| T-518 | 用户能把问题直接交给开发者 | 已签名/缓存的 `supportUrl`、复制、外链 opener、打开日志目录 | 一个本地反馈弹窗 | 应用内上传、Growth 收件箱、对象存储、客服工单 |
| T-519 | 多文件/URL/文本导入、默认文件夹整理，并继续使用关系图/观点地图/全部视图 | Assets、Knowledge、Search、现有导入、图和地图 | 先修 Assets ownership/idempotency，再补逻辑文件夹 | 第二套上传/搜索/图谱、Office 编辑器、OCR/旧 `.doc` |

## 4. 数据与写入归属

| 数据 | 唯一写者 | 说明 |
|---|---|---|
| 自动任务定义与运行记录 | `scheduling` | 继续使用现有 `scheduled_job/job_run` |
| 自动任务 durable execution | 现有 execution module | 继续使用 `PersistentTaskService` |
| 定位事实 | `positioning` | 健康检查只读，不自动修改 |
| 最新健康报告 | `context-health` 轻量 service | 一账号一份最新报告和检查时间 |
| 反馈文本 | 前端本地临时状态/剪贴板 | 不落服务端；用户提交到配置的外部渠道 |
| 反馈渠道 | 现有 signed channel config | 唯一来源为已净化 `supportUrl` |
| 原始文件 | `assets` | Knowledge 不复制二进制 |
| 文件夹与文档归属 | `knowledge` | 只记录逻辑层级和 asset 引用 |
| 知识条目与关系 | `knowledge` | 继续使用现有实体和关系 |

## 5. 替代工件

- T-517：[最小自动化底座](2026-07-26-creatoros-automation-kernel-minimal.md)
- T-516：[轻量上下文健康](2026-07-26-copilot-context-health-minimal.md)
- T-518：[Bug 反馈收件箱](2026-07-26-bug-feedback-inbox.md)
- T-519：[知识文件工作区瘦身](2026-07-26-knowledge-workspace-lean.md)

原工件全部降为历史证据，不再作为 BUILD 输入。T-501 已由
`2026-07-26-model-configuration-lightweight-optimization.md` 完成同类纠偏；T-510 的核心用户问题
已由 T-523 复用现有端口落实，不重新开启其通用媒体编排平台。

## 6. Gate

1. 已完成的最终独立审计结论必须原样记为 FAIL/退回，不能把用户接受风险写成技术 PASS。
2. 四份 Replacement 只作为新 PLAN 边界；旧 CONTRACT 全部关闭，不再进入 BUILD。
3. T-517/T-516/T-519 分别补齐文内列出的最小契约和独立评审后，再开放确认②。
4. T-518 走已有 `supportUrl`，不再以不存在的 Growth 上传基础设施作为依赖。
5. 编排框架的复杂度防护属于后续独立需求，本任务不修改 orchestrator engine。
