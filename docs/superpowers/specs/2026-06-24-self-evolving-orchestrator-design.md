# 自进化 orchestrator skill 设计规范

> 把 `product-to-code-orchestrator` 从「静态规则手册」变成**有闭环的活系统**:坑/决策被捕获 → 进项目账本 → 进每个 stage 时自动调阅相关教训 → 复发就用**可执行断言**挡住 → 周期蒸馏回 skill。核心机制是 `GuardCheck`(每条教训带一条可执行校验,reconcile 每次重跑,复发即 `exit 1`)——"坑只踩一次,第二次起机器替所有人记得"。

- **日期**:2026-06-24
- **来源**:多智能体设计 workflow(3 勘察 + 4 视角设计面板 + 1 综合,run `wf_95f3baba-7b4`)
- **真实 skill 路径**:`~/.claude/skills/product-to-code-orchestrator/`(经 `~/.skills-manager/skills/` 管理);vault 在 `~/.claude/skills/thirdspace-vault/`
- **状态**:设计已定;先实施 Phase 0 最小闭环验证

---

## 1. 问题

orchestrator 现状:rules / gates / prompts / DECISION_LOG / state-machine / traceability 都很成熟,但**全是 prescriptive 的静态参考**——项目里踩的坑、拍的决策结局,从不回流改进 skill。没有「技术决策模式库」,没有「踩坑→教训」闭环,经验不跨项目复用。

## 2. 六层架构(各落在 skill 真实位置)

| 层 | 职责 | 落点 |
|---|---|---|
| **L0 捕获** | 一条命令低摩擦记坑/决策,统一收口 | vault 新增 `record-pitfall`(type:pitfall,**强制 --dry-run 默认**)+ `process/lessons-capture.mjs` |
| **L1 账本** | 项目内 append-only 观察池(机读 ndjson + 人读 md) | `aies/00-control/.lessons/lessons.ndjson` + `LESSON_LEDGER.md`(与 DECISION_LOG 并列、互链、被 reconcile 的 control_root 覆盖) |
| **L2 调阅** | 进 stage 自动把相关教训推到面前 | `process/lessons-recall.mjs` + `prompts/lesson-retrieval.md` + `stage-router.md` **第 6.5 步**(唯一改的既有 prompt) |
| **L3 决策模式** | 反复取舍提炼成可查可校验的卡 | skill 根 `decisions/PATTERNS.md` + `patterns/PAT-NNN-*.md` + `decisions/README.md` |
| **L4 自动化** | 捕获/回填是脚本副作用,不靠人自觉 | `reconcile.mjs` 加 `checkLessons()` + `reconcile.config.json` 加 `lessons[]`;gate/harness/`session-stop.sh` 挂钩 |
| **L5 蒸馏** | 项目教 skill,但不失控 | `process/consolidate-lessons.mjs`(只提议、绝不自动改 rules)+ `gates/lessons-injection-gate.md` + `notes/learned-patterns/` |

## 3. 三个核心机制

### 3.1 决策模式卡(L3)— 以 borrow-before-build 为母版
- 模式卡 `PAT-NNN`,固定 6 段:触发条件 `TRIG-*` / 判据(两张 ID 化闸表)/ 推荐默认 / 可观测证据+缺证保守默认 / 过往应用(链 LEDGER 行)/ 反模式速查。
- **borrow-before-build = PAT-001**:4 档阶梯 `T0 直采 → T1 适配封装 → T2 fork 改造 → T3 手搓`,默认从 T0 起。两张闸:
  - `BORROW-GATE`(BG-001 许可证 / BG-002 维护活性 / BG-003 采用面 / BG-004 安全面 / BG-005 契合度命中率≥阈值且缺口可 thin adapter 补 / BG-006 退出成本可控)—— **全过**才允许停在 T0/T1。
  - `BUILD-FORCE`(BF-001 触及核心差异化 / BF-002 无候选满足 BORROW-GATE / BF-003 候选要 fork 上游语义→自动≥T2 / BF-004 合规·延迟·体积硬约束过不了 / BF-005 全周期成本>自研)—— **任一命中**即强制下沉。
  - 硬规则:任何 T2/T3 决策必须写 record 举证"为什么 T0/T1 不够格"(举证责任在下沉者)。
- 每条判据配「判定问句 + 跑什么命令验证 + 缺证据时保守默认」,对齐 `_GATE_EVIDENCE`(判据不能被一段自信的话说服)。
- 这套 BG/BF 双闸是其余所有 PAT 卡判据的母版。种子 4 张:PAT-001 borrow-vs-build、PAT-002 内存库 vs 真DB、PAT-003 同步 vs 异步、PAT-004 契约优先 vs 直写。

### 3.2 踩坑→教训闭环(L0+L1+L4)
```
坑发生 → record-pitfall --what --root --guard --check   (薄封装已有 recordAgentEvent)
     → 写一行 LED-NNN 到 LESSON_LEDGER.md(关键列 GuardCheck=可执行命令)
     → GuardCheck 进 reconcile.config.json 的 lessons[]
     → 下次重蹈 → reconcile ✗ LED-NNN 复发 → exit 1 → CI 红 → PR 进不去
```
`GuardCheck` 列是闭环命脉:把"教训"变成"可被 reconcile 自动跑的可校验断言"。high severity LED 必须给可执行 check 或显式标 `manual+理由`。真实例(本仓 DEC-013 同类):`API task.title→name` 改了但前端 `COMP-TaskCard` 仍读 `title` → LED check=查改动字段是否同步进 `CHANGE_IMPACT.md` → 以后忘同步即被拦。

### 3.3 自动调阅 + 自动捕获(L2+L4)
- 调阅寄生在 `stage-router.md` 第 6.5 步(router 每 stage 必读 → 零额外纪律):进 stage 前 `lessons-recall.mjs <stage>`,按 `stage_id ∩ tech_tags ∩ scope∈{gen, 本项目prj}` 三重交集过滤,**只注入 lifecycle∈{candidate,rule}、红旗优先、硬上限 7 条**;observation 默认不注入(信噪比)。
- 捕获挂在"反正都要跑"的执行点:reconcile 漂移→`kind=reconcile-drift`;`verify-task.sh` 失败 HALT 前→`kind=pitfall`(带失败命令输出);gate 出 finding→`kind=gate-finding`;harness commit 后→`kind=decision`(commit hash + trace-id);`session-stop.sh` 扩关键字(TypeError/timeout/test failed/drift)兜底 + 提醒回填到期 outcome。

## 4. 不失控的安全阀(curation,L5)
- `consolidate-lessons.mjs` **只提议、绝不自动改 `rules/`**(exit 码化,reconcile 姊妹工具)。
- 四态生命周期 `观察→候选→规则→废弃`;**复现 ≥3 个独立项目才升候选**;升规则必须过 `lessons-injection-gate`(可执行判据 + 指明注入位+diff + LEDGER 留痕 + 可回滚)。
- **gen(跨项目通用)/ prj(本项目专属)物理分离**,prj 永不外溢冒充普适规则。
- 受控 TAXONOMY 白名单(category 枚举 + tech_tags 白表)防自由 tag 碎片化。捕获门槛对齐 `spawn_task`("高置信、可独立行动";模糊感慨不进账本)。
- 账本 append-only(可审计);体积随"独立教训数"而非"事件数"增长。

## 5. 落地节奏

- **Phase 0(最小闭环,先在 Thirdspace-creator 单仓跑通)**:① vault `record-pitfall` 子命令(--dry-run 默认)② 项目 `LESSON_LEDGER.md`(LED 模板,核心 GuardCheck 列)③ `reconcile.mjs` 的 `checkLessons()` + config `lessons[]`。挂到两个必跑点:reconcile 漂移分支(自动 capture)、每个 workflow §1 前(recall 桩)。零新增人工纪律、改动最小,先证明"坑能自动挡"。
- **Phase 1**:`decisions/` 三件套(PATTERNS + 4 种子卡 + README)+ 改 stage-router 第 6.5 步;每张卡填 ≥1 行本项目真实结局背书(P1 真 Postgres = commit 435eea7/ce581ae)。
- **Phase 2**:`lessons-recall/capture.mjs` 收口 + `lesson-retrieval/capture.md` + TAXONOMY 白名单 + DECISION_LOG_TEMPLATE 加 `Lesson-Candidate`/`Pattern-Ref` 桥;先改 5 个决策密集 stage(03/05/10/13/15)钩子。
- **Phase 3**:harness `verify-task.sh`/`run.sh` 插 capture + `session-stop.sh` 关键字与到期回填提醒 + consistency-gate 自动回填上游 outcome;铺完其余 workflow 钩子。
- **Phase 4(约半年)**:`consolidate-lessons.mjs` + `lessons-injection-gate.md` + `notes/learned-patterns/` 聚合;首次阈值校准(攒够 LED 把"未校准·占位"阈值 bump);首批 gen 教训晋升 rule 真注入。

## 6. 文件改动清单(全量;Phase 0 仅前 3+1)

**Phase 0**
- `~/.claude/skills/thirdspace-vault/scripts/thirdspace-vault.mjs` — 加 `record-pitfall` 子命令(薄封装 recordAgentEvent,type:pitfall,**默认 --dry-run 写项目 .lessons,不直接灌 vault**)
- `~/.claude/skills/product-to-code-orchestrator/templates/LESSON_LEDGER_TEMPLATE.md` — 新建(scaffold 时复制到 `aies/00-control/`)
- 本项目 `<control_root>/LESSON_LEDGER.md` — 实例化 + 第一条背书行(P1 真 Postgres)
- 本项目 `reconcile.mjs` + `reconcile.config.json` — `checkLessons()` + `lessons[]`

**Phase 1+**(详见各阶段):`decisions/PATTERNS.md`、`decisions/patterns/PAT-001..004*.md`、`decisions/README.md`、`prompts/stage-router.md`(第6.5步)、`process/lessons-recall.mjs`、`process/lessons-capture.mjs`、`process/consolidate-lessons.mjs`、`prompts/lesson-retrieval.md`、`prompts/lesson-capture.md`、`gates/lessons-injection-gate.md`、`templates/DECISION_LOG_TEMPLATE.md`(加桥字段)、`workflows/*.md`(钩子)、`process/harness/{verify-task.sh,run.sh}`、`~/.claude/hooks/session-stop.sh`、`notes/learned-patterns/`。

## 7. 开放权衡(诚实)
- **双写漂移**:每决策写 DEC + LED + PAT-ref,可能不同步 → LED 强制反向链 DEC,consolidate/reconcile 校验链完整;仍有真实成本。
- **T+N 结局回填是闭环成败点也最易断**:revisit-trigger 多手动,修正列易长期空 → 做成 consistency-gate 副作用 + session-stop 提醒兜底,但 hook 只在 session 结束触发,无法根治。
- **捕获覆盖不全**:架构权衡类坑(非报错、非 commit)仍可能漏,与 experience-capture 同源固有弱点。
- **阈值是拍脑袋初值**:首版标"未校准·占位";本项目才 14 条 DEC,跨项目蒸馏半年内出不了可信结果,是增量项非 MVP。
- **rules 注入张力**:把 rule 注入 gate/prompt 让静态层变活,与"rules 是 immutable reference"有张力 → 严守只注入 gates/prompts、不碰 cardinal 纪律;走 injection-gate + 留痕 + 可回滚。
- **改动面广**:workflows(18)+gates(18)都要插钩子 → 分批,先 5 个决策密集 stage 验证再铺。
- **误写污染**:实测 `record-agent-event --help` 会真写一条空事件 → 捕获器**必须默认 --dry-run**。
