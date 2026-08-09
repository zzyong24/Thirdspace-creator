# LESSON LEDGER（教训账本）

> 自进化闭环的项目级账本(设计:`docs/superpowers/specs/*-self-evolving-orchestrator-design.md`)。scaffold 时复制到 `<control_root>/LESSON_LEDGER.md`,与 `DECISION_LOG.md` 并列。
> **分工**:`LED-*` 记「踩了什么坑 + 防复发的可执行规则」;`DEC-*` 记「主动取舍 + 接受的风险」。LED 可反向链 `DEC-*`。
> **append-only**:不就地改历史;状态流转只追加或改 `Status`。
> **GuardCheck 是命脉**:能写成可执行命令的 LED,把 check 同步进 `process/reconcile.config.json` 的 `lessons[]`,`reconcile.mjs` 每次重跑,复发即 `✗ exit 1` 挡住("坑只踩一次")。

## 字段说明
- **ID / Date / Stage / Severity(low｜medium｜high) / Status(observation｜candidate｜rule｜quarantined｜deprecated｜retracted)**
- **WhatFailed** 坑本身 · **RootCause** 根因
- **GuardRule** 防复发规则(人读) · **GuardCheck** 可执行命令 或 `manual`(注明为何)
- **Outcome(T+N)** 回看复盘(借得对/借错/手搓后悔…),初期常空靠回填 · **Ref** 反向链 `DEC-*`/commit/文档

## 生命周期
`observation`(只记不防)→ `candidate`(跨 ≥2 个独立项目出现 或 单项目造成过一次返工〔门槛未校准·占位,对齐 decisions/README〕,经 consolidate 提议)→ `rule`(写得出可执行判据 + 过 lessons-injection-gate + 留痕,才真注入对应 gate/prompt)→ `quarantined`(误报超阈值时可逆静音)→ `deprecated`/`retracted`(不复现/被 superseded;`retracted`=有坑别再用,由 LESSON 触发)。
**scope**:`gen`(跨项目通用,可被晋升)/ `prj`(本项目专属,永不外溢)。

---

## LED-001 — <一句话坑名>
- **Date**: YYYY-MM-DD · **Stage**: <stage-id 或 通用(gen)> · **Severity**: <low|medium|high> · **Status**: rule
- **WhatFailed**: <出了什么错>
- **RootCause**: <根因>
- **GuardRule**: <防复发的规则>
- **GuardCheck**: `<可执行命令,guard 成立时 exit 0、复发时非 0>` 或 `manual`（<为何不可自动化>）
- **Outcome(T+N)**: —（待回填）
- **Ref**: <DEC-xxx / commit / 文档>

<!-- 新 LED 往下追加,不改历史行 -->
