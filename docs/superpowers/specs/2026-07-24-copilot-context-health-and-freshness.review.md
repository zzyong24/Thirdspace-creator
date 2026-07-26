# T-516 PRODUCT SPEC 独立评审记录

> 被审工件：`docs/superpowers/specs/2026-07-24-copilot-context-health-and-freshness.md`  
> review_mode：`cross-family`  
> reviewer model：`gpt-5.6-sol`  
> 执行方式：`codex exec --skip-git-repo-check -s read-only --output-schema spec-reviewer.schema.json`  
> 轮次：3/3（达到 STOP 上限，不再用追加重试洗 verdict）  
> 最终处理：`CONCERNS（已处理）`；0 blocker，13 个 major 全部接受并修入 SPEC  
> 人的裁决：`confirmed`（用户于 2026-07-24 回复“好的好的，认可。”；确认①完成，允许进入 CONTRACT，不构成 BUILD 授权）

## Round 1

```json
{
  "verdict": "CONCERNS",
  "summary": "方案方向与宪法一致，价值、确认门、账号隔离和统一调度设计较完整，但事实契约、状态枚举、暂不处理语义、现有入口证据及前台性能门仍存在可执行性缺口。",
  "findings": [
    {
      "severity": "major",
      "category": "completeness",
      "where": "FR-CTX-02、FR-CTX-07、FLOW-CTX-01、ENT-CTX-01",
      "issue": "truthStatus 未包含 unknown，但读取失败流程使用 unknown。",
      "suggestion": "统一唯一枚举并明确 missing/unknown、Prompt、UI 和转换语义。"
    },
    {
      "severity": "major",
      "category": "completeness",
      "where": "FR-CTX-02/03/07/08、TEST-CTX-01/08",
      "issue": "缺少首批 factKey 的逐项来源、asOf、新鲜度、冲突和 Prompt 契约。",
      "suggestion": "增加字段级 Context Fact 契约表并明确首批范围。"
    },
    {
      "severity": "major",
      "category": "completeness",
      "where": "FR-CTX-07、ASM-CTX-03",
      "issue": "5/9 阈值未定义哪 9 项和计数规则。",
      "suggestion": "枚举 9 个字段，固定 trim/空值/版本算法。"
    },
    {
      "severity": "major",
      "category": "completeness",
      "where": "SC-CTX-04、FLOW-CTX-03、ENT-CTX-04/05、FR-CTX-06/09/10",
      "issue": "“暂不处理”一处称不改库，一处要求 dismissed，缺少重开与标记语义。",
      "suggestion": "区分业务真值与 disposition，补 evidenceHash、dismiss/reopen 和幂等规则。"
    },
    {
      "severity": "major",
      "category": "reinvent-wheel",
      "where": "IA-CTX-02、FR-CTX-08、§10–§11",
      "issue": "定位、同步、登录、模型和诊断深链缺 route/component/operation 证据。",
      "suggestion": "逐个补 file:line；不存在的聚焦能力列为本任务新增并验收。"
    },
    {
      "severity": "major",
      "category": "approach",
      "where": "FLOW-CTX-01、NFR-CTX-03、TEST-CTX-13",
      "issue": "只定义全量扫描 2 秒，未定义每轮对话装配位置及异步任务创建性能。",
      "suggestion": "拆分 task 创建、prompt fact builder、model dispatch 与全量扫描预算。"
    }
  ]
}
```

### Round 1 disposition

| Finding | 处理 | 规格修订 |
|---|---|---|
| R1-01 truthStatus | 接受 | 统一为 `verified/missing/unknown/stale/conflict/quarantined`，补状态表 |
| R1-02 首批 facts | 接受 | 增加首批 Context Fact 字段级契约 |
| R1-03 9 字段 | 接受 | 固定 9 字段与仓内 completeness 算法 |
| R1-04 dismiss | 接受 | dismiss 只改 disposition，补 evidenceHash/reopen/标记规则 |
| R1-05 深链证据 | 接受 | IA-CTX-02 增加五类真实入口证据与新增聚焦接线 |
| R1-06 性能 | 接受 | NFR/Flow/Test 分拆 1s/500ms/2s 性能门 |

## Round 2

```json
{
  "verdict": "CONCERNS",
  "summary": "方案方向与人工确认、本地优先、统一调度原则一致，但真实 publication 的取数口径、零模型冲突判定和 PR-FAQ 的商业/迁移问题仍未闭合。",
  "findings": [
    {
      "severity": "major",
      "category": "completeness",
      "where": "FR-CTX-02 publication.summary、TEST-CTX-01/13",
      "issue": "未定义合法 canonical publication 的 revision、externalId、ownership、re-parent 和重复 anchor 口径。",
      "suggestion": "定义 canonical eligibility，异常进入 conflict/unknown，并补先采集后登记、重锚、重复 externalId、错属测试。"
    },
    {
      "severity": "major",
      "category": "completeness",
      "where": "FR-CTX-02 positioning.currentStatement、FR-CTX-07、FLOW-CTX-02",
      "issue": "自由文本“互斥”没有零模型可复现算法。",
      "suggestion": "限定确定性冲突规则；语义差异只 needs_review 或由用户显式触发 AI。"
    },
    {
      "severity": "major",
      "category": "value-viability",
      "where": "§4.1 PR-FAQ",
      "issue": "未直接回答年卡/额外费用和存量 statusNote 迁移成本。",
      "suggestion": "补定价影响、模型费用、保留/隔离/逐账号处理和不迁移行为。"
    }
  ]
}
```

### Round 2 disposition

| Finding | 处理 | 规格修订 |
|---|---|---|
| R2-01 canonical publication | 接受 | 增加 7 条 eligibility、计数/可见性/日期覆盖语义及异常测试 |
| R2-02 零模型 conflict | 接受 | 增加确定性规则、规范化、输入输出样例；自由文本不自动裁决 |
| R2-03 费用与迁移 | 接受 | PR-FAQ 增加年卡/模型费用与逐账号无损迁移说明 |

## Round 3

```json
{
  "verdict": "CONCERNS",
  "summary": "方向符合宪法且价值、确认门、统一调度与现网调研较完整，但仍有四处契约矛盾会导致错误告警、既有定位约束丢失或账号归属实现歧义，当前不宜离开 PLAN。",
  "findings": [
    {
      "severity": "major",
      "category": "completeness",
      "where": "SC-CTX-01、FR-CTX-03 动态旧字段规则、IA-CTX-01",
      "issue": "UI 声称 statusNote 与作品冲突，但规则只证明它属于应 quarantine 的动态字段。",
      "suggestion": "改成“动态描述已停止用于 AI 回答”，不宣称内容冲突。"
    },
    {
      "severity": "major",
      "category": "approach",
      "where": "FR-CTX-02 project.stageSummary、FR-CTX-03 发布与阶段派生冲突",
      "issue": "宪法未规定 publication 存在就必须推进某个 project.stage，该规则会误报。",
      "suggestion": "publication 与 lifecycle 分别陈述；没有新业务规则/DEC 不生成冲突。"
    },
    {
      "severity": "major",
      "category": "traceability",
      "where": "FR-CTX-01、positioning.stableProfile、FLOW-CTX-01、TEST-CTX-02/07/12",
      "issue": "首批 facts 遗漏既有 capabilities 与 5 个 downstreamRules，可能静默丢硬约束。",
      "suggestion": "为两者补 fact 契约、Prompt 规则和测试。"
    },
    {
      "severity": "major",
      "category": "completeness",
      "where": "FR-CTX-10/11、ENT-CTX-04～06、NFR-CTX-04",
      "issue": "部分字段和唯一/幂等键只含 accountId，遗漏 userId。",
      "suggestion": "所有资源、查询和键统一带 userId + accountId，并补跨 user 同 ID 测试。"
    }
  ]
}
```

### Round 3 disposition

| Finding | 处理 | 规格修订 |
|---|---|---|
| R3-01 夸大冲突文案 | 接受 | SC/IA 改为可由字段白名单证明的 quarantine 文案 |
| R3-02 stage 误报 | 接受 | 删除 publication→stage 强制推断，两类事实独立陈述 |
| R3-03 定位硬约束遗漏 | 接受 | 新增 `positioning.capabilities`、`positioning.downstreamRules` facts 与 TEST-CTX-02 |
| R3-04 联合归属遗漏 | 接受 | ENT/FR/幂等键全部补 `userId + accountId`，TEST-CTX-12 增加跨 user 同 ID |

## 最终裁决说明

- 评审没有 blocker；三轮发现均为可执行 major，已经逐条接受并修订。
- reviewer 的最新原始 verdict 保留为 `CONCERNS`，不改写成 PASS。
- 按评审契约的 STOP 上限，不运行 Round 4；“CONCERNS（已处理）”已由用户裁决为可进入 CONTRACT，原始 review verdict 仍保留，不改写为 PASS。
- 确认①只关闭 PLAN；CONTRACT 需另行通过门禁并取得确认②，生产代码仍未获授权。

## Product Gate

```text
Gate: 01-product-gate
Status: pass
Evidence:
  - docs/superpowers/specs/2026-07-24-copilot-context-health-and-freshness.md
  - docs/产品定位.md
  - cross-family review 三轮原始 verdict 与本文件 disposition
  - SPEC placeholders: 0
  - FR=14, NFR=11, FLOW=4, ENT=7, IA=2, HARD=7, TEST=16
  - node orchestrator/process/orphan-scan.mjs → 0 error，T-516 chain 为 PLANNED
  - node orchestrator/process/pmem.mjs sync → 完成
  - node orchestrator/process/reconcile.mjs → 0 error，1 条既有 BACKLOG bloat warning
Findings:
  - 无未处理 blocker/major
  - review 原始 verdict 保留 CONCERNS；13 项均有接受与修订证据
Decision:
  - 产品规格完整性门通过
  - 用户于 2026-07-24 完成确认①；PLAN 转为 passed，允许进入 CONTRACT
  - CONTRACT 确认②前不得进入 DESIGN/BUILD
```
