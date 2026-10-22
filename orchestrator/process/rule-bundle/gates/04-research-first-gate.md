# Gate 04 — Research-First Gate（不确定性断路器）

> 本门识别的是问题形状，不是某种技术名词。它是 BUILD 中的条件分支，不增加新阶段，也不建立第二份产品真相。
> 任务状态仍由 `BACKLOG.md` 决定；产品/契约/发布取舍仍由 `DECISION_LOG.md` 决定；`docs/research/`
> 只保存可验证证据与候选方案。所有证据继承 [`_GATE_EVIDENCE.md`](_GATE_EVIDENCE.md) 的反自报契约。

## 何时触发

先给观测指定一个项目自己的稳定 `failure family`：只有当症状指向同一个被违反的不变量或未知机制时，
才属于同一族。数据库锁争用、跨平台路径、外部 SDK 能力、模型输出不稳定都只是实例，不是框架枚举。

通用触发形状：

- `repeated-failure-family`：同一问题族重复；
- `violated-invariant`：已确认合同、数据安全或系统不变量被违反；
- `high-cost-feedback-loop`：一次有效反馈需要昂贵、耗时或不可重复的完整运行；
- `unsuccessful-intervention-churn`：连续修补没有恢复目标不变量；
- `external-capability-unknown`：方案依赖尚未验证的供应商、协议、平台或运行环境能力；
- `non-deterministic-behavior`：相同输入/环境无法稳定复现；
- `high-impact-uncertainty`：下一步可能改变产品、契约、安全、发布或产生不可逆影响。

除一次普通 `violated-invariant` / `non-deterministic-behavior` 观测可先留证外，其余触发立即开门；同一任务
第二次技术观测仍无交付进展也必须开门，不能靠换问题标签拖延。

```bash
node orchestrator/process/research-gate.mjs observe <T-ID> \
  --family <project-defined-kebab-case-family> \
  --trigger <通用触发形状> --evidence <失败证据路径> \
  --research-task <T-ID> --card <docs/research/...md>
```

触发后原任务转 `⏸️`，暂停四类行为：继续改生产实现、扩大 workaround、重复全量运行、不可逆操作。
允许的只有只读取证、更新研究卡，以及卡内最多两次的最小区分性实验。

## 研究卡最低证据

使用 `templates/TECHNICAL_RESEARCH_CARD_TEMPLATE.md` 的 `research-first-gate/v2` 区块：

1. 写清被违反的不变量和项目自定义问题族；
2. 权威依据：官方资料、标准、源代码或已批准规格，并注明它直接支持什么判断；
3. 当前系统证据：代码、配置、日志、测试、运行环境或硬件事实，绑定项目路径和定位点；
4. 一个能区分候选的最小实验，记录问题、命令、环境、结果和证据 SHA-256；
5. 至少两个候选，每个写结果、边界、代价以及什么证据会推翻它；
6. 项目自己定义至少两个验收标准；每项记录 target、observed、证据路径/hash 与 `verify_key`；恢复时必须现场执行
   `reconcile.config.json.research_verify_commands[verify_key]` 成功，不能靠手写 `passed: true`；
7. 最多 240 分钟、最多 2 次实验。

## 决策与恢复

- 纯实现选择且不改变已确认行为，可在证据和验收闭合、卡状态改为 `validated` 后恢复。
- 产品方向、IA、数据归属、安全、数据/服务契约、发布标准、不可逆操作或实质成本变化，必须先写
  Decision Record 等待用户确认。Agent candidate 不是批准。
- 旧 `research-first-gate/v1` 卡 fail-closed；它把具体案例词汇固化为框架，必须显式迁移到 v2。

```bash
node orchestrator/process/research-gate.mjs resume <T-ID> \
  --card <docs/research/...md> --decision <DEC-ID>
```

`resume` 只把任务退回 `📋`，不跳过原审核、TDD 或验收门。

## 防止无止境分析

每个实验必须能淘汰候选或改变决策。达到 timebox/两次实验仍无结论时，不继续扩题：采用最小可逆默认、
进入决策队列，或把非当前用户结果所需的硬化移到后续任务。资料数量、讨论长度和文件增长都不算进展。
