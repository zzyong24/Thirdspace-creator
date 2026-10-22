# Assets — 可复用资产库

> `decisions/` 的**平级延伸**。装两类资产:`kind:module`(可 vendor 的代码模块,带 `files/` + example)与 `kind:pattern`(方法论卡,住 `decisions/patterns/`,只在 ASSET_INDEX 登记一行)。
> 入口索引:[ASSET_INDEX.md](./ASSET_INDEX.md)(L0 grep 表 + scope→该查映射)。

## 质量防火墙(战略资产的护城河)

asset 库的质量由**本库自己的 `verified` 门**独占把守,**与任何来源(feeder)的质量无关**。

- **任何来源都只产 candidate**(落 `_candidates/`):A=工程复盘自产 / B=本地扫描(CodeGraph)/ C=GitHub 蒸馏(借 `project-distiller` 机制)。外部蒸馏 / 蒸馏 KB 只是**辅助线索**,不是单一 / 主输入源。
- **要变 `active`/`verified` 必须清可执行门**:
  1. 重写成本仓 schema(不是原始分析)
  2. example-as-test 跑绿(可执行证明)
  3. 真实交付 / 跨项目复用过(A 源实战背书)
  4. license 干净(确定性工具核;copyleft BLOCK 进 module)
  5. 高危域(crypto / auth / key-management / payment)人审
- **质量锚点 = A 源**(本仓已交付、已 green 的真东西)。首批 bootstrap 卡即来自此。

## 怎么加

1. 任何来源 → 落 `_candidates/`,`status: candidate`,`verified: false`。
2. 过上面 5 条门 → 人确认 → `status: active`,`verified: true`(同 problem_tag 多个 active 时其一标 `winner: true` + `preference_rule`)。
3. 治理:淘汰只改 `status`(`deprecated` 带 `superseded_by` / `retracted` 由 LESSON 触发),**不物理删**。

## 治理(§3.6 最轻形态)

### 哪个更好(winner / preference_rule)
- 同一 `problem_tag` 下 ≥2 个 `active` 资产 → 其一标 `winner: true` + `preference_rule`(一句话:何时选我、何时选对方,卡间互相点名消歧)。**不强制建 ADR 裁决卡**。
- 判断维度**多维结构化**(reuseFreq / example 绿否 / provenance / license),**绝不压成单一聚合分**。
- `asset-check.mjs` 仅在"同 problem_tag ≥2 active 但无人标 winner"时 **WARN**(不 ERROR)。

### 淘汰(只改 status,不删数据)
- `deprecated`(软):被更好资产取代,frontmatter 加 `superseded_by: MOD-NNN` + 一句迁移指引;INDEX 行 status 同步改。
- `retracted`(硬):"有坑别用",带 rationale。**由 LESSON 触发** —— 当某 LED 晋升 rule 且指认某资产为坑源时,人确认后把该资产 status 改 `retracted`,并在卡内反链该 LED。
- 两者都**不物理删** `files/`/`example/`(保留历史与可追溯),只翻 status。

> 以上治理状态的机器校验见 `process/asset-check.mjs`(status 合法性 + INDEX 一致 + candidate≠active + license fail-closed + winner WARN)。

## 编号

`MOD-NNN`(module)/ `PAT-NNN`(pattern,复用 decisions 编号)。**skill 级独立编号,绝不进项目级 `ID_REGISTRY`**(否则 orphan-scan 判无上游 = fabricated → exit 1)。
