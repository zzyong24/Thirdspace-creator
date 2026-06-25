# LESSON LEDGER（教训账本）

> 自进化 orchestrator 闭环的项目级账本(设计见 `docs/superpowers/specs/2026-06-24-self-evolving-orchestrator-design.md`)。
> **与 DECISION_LOG 的分工**:`LED-*` 记「**踩了什么坑 + 防复发的可执行规则**」;`DEC-*` 记「**主动取舍 + 接受的风险**」。一条 LED 可反向链到引发它的 `DEC-*`。
> **append-only**:不就地改历史行;状态流转只追加新信息或改 `Status`。
> **GuardCheck 是命脉**:能写成可执行命令的 LED,其 check 同步登记进 `process/reconcile.config.json` 的 `lessons[]`,`reconcile.mjs` 每次重跑——坑一复发即 `✗ exit 1` 挡住。

## 字段说明
- **ID / Date / Stage / Severity / Status**(active｜promoted｜deprecated)
- **WhatFailed**:坑本身 ·  **RootCause**:根因
- **GuardRule**:防复发的规则(人读) ·  **GuardCheck**:可执行校验命令,或 `manual`(注明为何不可自动化)
- **Outcome(T+N)**:回看复盘(借得对/借错/手搓后悔…),初期常空,靠回填 ·  **Ref**:反向链 `DEC-*` / commit / 文档

---

## LED-001 — .env.local 含真实密钥可能被提交进 git
- **Date**: 2026-06-23 · **Stage**: 通用(gen)· **Severity**: high · **Status**: active
- **WhatFailed**: 接入 MiniMax 时在 `frontend/.env.local` 写入真实 `MINIMAX_AUTH_TOKEN`;一旦误 `git add` 就会把密钥提交进库(本次靠人工核对 `.gitignore` 才避免)。
- **RootCause**: 密钥落盘文件与受版本管理的工作区同根,纯靠"记得别提交"这种纪律不可靠。
- **GuardRule**: 任何 `.env.local`(及含真实密钥的 env 文件)**绝不能被 git 跟踪**。
- **GuardCheck**: `! git ls-files | grep -qF .env.local`（已登记进 `reconcile.config.json` lessons[]，每次 reconcile 重跑）
- **Outcome(T+N)**: —（待回填）
- **Ref**: 本会话配置化 LLM 接入;`.gitignore` 含 `.env*.local`

## LED-002 — 设计文档只提交到 feat worktree，用户在 main 看不到
- **Date**: 2026-06-24 · **Stage**: 通用(gen)· **Severity**: medium · **Status**: active
- **WhatFailed**: spec/plan 提交在 `feat/service-contract`(`.worktrees/` 子目录),用户在仓库根 `main` 分支查看,顶层 `docs/` 看不到 → 无法审阅 → 形成"看不到→不能批→不能合→还是看不到"死循环。
- **RootCause**: 干活的 worktree/分支 与 用户查看的 工作区/分支 不一致;审阅产物被"等代码合并"卡住。
- **GuardRule**: 给用户审阅的设计文档必须落到用户查看的分支(通常 `main`),代码可留 feature 分支。
- **GuardCheck**: `manual` — 跨 worktree/分支可见性难用单仓命令稳定校验;靠流程纪律 + 已写入 orchestrator skill `rules/global-rules.md` 的规则约束。
- **Outcome(T+N)**: —（待回填）
- **Ref**: 已加入 `product-to-code-orchestrator/rules/global-rules.md`「Review artifacts must be visible」规则
