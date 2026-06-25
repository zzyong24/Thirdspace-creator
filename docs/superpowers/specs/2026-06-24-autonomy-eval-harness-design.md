# 自治 + eval harness 设计(减少逐步审核)

> 痛点:orchestrator 流程"请你审 / 你说走哪个"太多。目标:把 **harness(自治执行脚手架)** 和 **eval(自动质量门)** 定清楚,让 subagent 在预授权范围内直接干、只在真问题时找人。
> **关键发现**:这套东西**你 skill 里大半已经存在**(autonomous mode + `process/harness/` + 18 个 gates + `settings.autonomous.json`),没启用而已。所以不是从零造,是**打开它 + 补几个小缺口 + 用业界做法对齐**。

- **日期**:2026-06-24 · **来源**:调研 workflow `wf_df99921c-72d`(读现有 harness + 联网调研业界 + 综合)

## 1. 已经存在的(无需新建,只需启用)
| 机制 | 角色 | 文件 |
|---|---|---|
| Autonomous Mode + scope-envelope 预授权(01–14 批准一次→授权下游全自治) | autonomy | `rules/orchestrator-state-machine.md` |
| Initializer→Coding→Evaluator 长跑循环(每 session 跑 1 个隔离 task) | autonomy | `process/harness/run.sh`、`README.md` |
| 持久任务队列 + lease 防重领 | autonomy | `process/progress.mjs` |
| 单 task 契约(red→green TDD、不批量、不 push、不猜产品决策) | autonomy | `process/harness/coding-agent.md` |
| Evaluator(fresh 只读、set `e2e_verified`、visual 红=不验) | eval | `process/harness/evaluator.md` |
| 工具护栏(allowlist Read/Edit/Write+scoped Bash;deny push/rm/curl;max-turns/budget;reconcile Stop-hook) | scope | `process/harness/settings.autonomous.json` |
| reconcile 漂移闸(每 turn,manifest↔git/fs 双向核对) | eval | `process/reconcile.mjs` |
| 18 gates + 证据政策(pass 必须贴命令输出,非散文)+ 双向 orphan 扫 | eval | `gates/` |
| 问题预算(≤3,A 问+等 / B 给默认+走 / C 不问) | autonomy | `prompts/question-budget.md` |

## 2. 自治分级 L0–L4(现状卡在 L0,本契约用 L2)
- **L0 全手动**:每步产出后停、逐门审 ← 这就是"太多请你审"的根源。
- **L1 建议式**:只审一次 plan,中间放手,审最终 PR(对标 Copilot Workspace)。
- **L2 门控自治(本契约默认)**:scope envelope 内自动跑整条垂直,每 task 自跑 eval 门;绿即 commit+取下一个,失败先自修(≤2 轮)再升级。人只看 eval 失败 + 决策队列。
- **L3 并行批量**:取 N 个文件不相交的垂直、各一 worktree 并行,barrier 后串行 merge+reconcile。
- **L4 全自治**:只在 plan 入口 + PR/release 出口两个高杠杆点要人(对标 Devin"审计划+审结果、不审过程")。`git push`/deploy 永不授权给 agent。

## 3. eval 门阶梯 G0–G4(人审被自动门替代;人只看红 + 队列)
| 门 | 验什么 | 阻断时 |
|---|---|---|
| **G0 ACI 预闸** | edit 后单文件 tsc/lint,语法错直接拒、不进上下文(抄 SWE-agent ACI) | agent 自己重写该 edit,零人 |
| **G1 reconcile 漂移** | 每 turn Stop-hook,manifest↔git/fs;exit 0/1/2 | 连续 2 turn drift 才 HALT 叫人 |
| **G2 双不变量** | **F2P**(新行为有测、改前红改后绿)+ **P2P**(既有全套零回归)——抄 SWE-bench harness | 触发 critic 自修(≤2 轮,收敛=真测试转绿)仍红才 HALT |
| **G3 一致性/双向 orphan** | reconcile 0 + 每个 FR/FLOW 有 API+TEST、无 unrequested 范围(BLOCKING) | fail 则被 block 的 stage 不得 passed;带病推进须人显式 accepted-risk+DEC |
| **G4 evaluator 主观** | 每 N 垂直 fresh 只读:scope creep、测试充分性、E2E+visual 真绿才 set verified | visual 红=不验;主观/security 入队列(异步不阻断) |

**核心缺口 = G2**:现有 `verify-task.sh` 只验"新测试过没过",**缺回归不变量(P2P)**。升级它是让"人审退化成看红绿、可外包给机器"的最硬一块。

## 4. 异步决策队列(不每步同步等)
agent 碰 scope 外真决策 → **不停整个 run**:append `DEC-###`{source/affected/reason/待答/proposed-default}、set 该垂直 `blocked_reason`、**继续别的未阻塞垂直**(`progress.mjs ready()` 已自动跳过)。分级:A 级(改行为/security/contract/release)入队列等人;B 级(有默认)记默认直接走;C 级不问。人**批量**审队列(L3 可一次审一周)。补一个 `queue.mjs` 把 open DEC 按 A/B/C 列出来一次性 approve。

## 5. 业界参照(各抄什么)
| 参照 | 抄什么 |
|---|---|
| [SWE-bench harness](https://www.swebench.com/SWE-bench/reference/harness/) | `verify-task.sh` 升 F2P+P2P 双不变量(最关键) |
| [Claude Code 架构](https://callsphere.ai/blog/inside-claude-code-s-architecture-how-the-agent-loop-works) | 三层确定性约束(工具面没暴露就碰不到 + allow/deny + hook 固定点)代替"求 prompt 听话";subagent 隔离上下文只回摘要 |
| [OpenHands security_risk](https://arxiv.org/pdf/2407.16741) | PreToolUse 给 Edit/Bash 打 LOW/MED/HIGH,低风险 auto、高风险才打断——补"按动作风险分级"(现状只能全审或全放) |
| [Devin 双 checkpoint](https://medium.com/@nitinmatani22/how-devin-ai-actually-thinks-autonomous-planning-dag-execution-and-dynamic-re-planning-explained-997be175a475) | plan checkpoint(批 scope envelope)+ PR checkpoint(审结果),中间放手 |
| [SWE-agent ACI](https://arxiv.org/abs/2405.15793) | edit-with-lint-gate + 窗口化输出 = G0 预闸 |
| [promptfoo CI](https://www.promptfoo.dev/docs/integrations/ci-cd/) | 每个 gate 统一成 exit 0/1 二值闸 + 阈值,过则放行挂则叫人 |
| Reflexion / Self-Refine | critic 自修必须挂**外部可验证信号**(测试/tsc)+ max 2 轮 + 逃生口;纯内省自纠会越改越糟 |
| [Aider repomap](https://aider.chat/docs/repomap.html) | PageRank 式仓库地图做冷启动上下文选择;每改即 commit = 审计/回滚边界 |

## 6. 要补的小缺口(都在 skill 的 `process/harness/`)
1. `verify-task.sh` → F2P+P2P 双不变量闸(退出码 0/1/2)。
2. `settings.autonomous.json` → 加 PreToolUse 风险分级 hook(HIGH=动 contract/schema/migration/control 产物 → 入 DECISION_LOG 等人)。
3. `run.sh` → verify 红时插 critic 自修循环(≤2 轮,收敛=verify 转绿),分类 HALT。
4. `coding-agent.md` → 自修契约 + red→green 留证(防 anti-laundering)。
5. 新增 `process/queue.mjs` → 决策队列消费(列 open DEC、按 A/B/C、resolve 清 blocked_reason)。
6. `orchestrator-state-machine.md` → 写入 L0–L4 分级 + 何时停 + 队列消费协议。

## 7. 立刻可用的 L2 契约(无需先写代码即可执行)
- **scope**:人 ONCE 批准 requirements+domain-model+service-contract+release-criteria(已在 manifest)→ 授权 subagent 在 allowlist 内自治跑所有 `progress.mjs` 派出的垂直,不逐个问。
- **eval**:每 task 过 G1(reconcile 0)→ G2(既有零回归 + 新行为红→绿留证)→ G3(无 orphan)→ G4(每 N 垂直 evaluator)。绿即 commit+next。
- **何时停**:仅 ① G2 自修 2 轮仍红 ② G1 连续 drift ③ 碰 A 级决策(product/IA/security/contract/release)④ `git push`/deploy。其余全自治。
- **入口**:`bash orchestrator/process/harness/run.sh`(可 `HARNESS_ONLY_STEP=repo` 先扫一遍)。

## 8. 诚实风险
- **G2 的 F2P 成本**:确认"新测试改前真红"要多跑一次基线(git stash/容器),拖慢每 task;若只信 agent 自报红→绿,有伪造风险。
- **visual suite 当前红**且被 `pnpm verify` 排除——这是 `e2e_verified` 闸的硬缺口:修复前 E2E 垂直要么进不了 verified、要么被迫 accepted-risk。**得先决策:修 visual 还是显式接受风险并缩小 e2e 闸范围。**
- **PreToolUse 风险分级靠路径匹配易误判**(重构挪文件/加 contract op 可能被误打 HIGH),规则要随项目维护,否则退回"全审或全放"。
- **critic 自修可能 2 轮内"表面转绿语义错"**(弱化断言变体);G2 的 P2P 只防回归、防不住新测试写得松,要 evaluator 异步兜底(坏改动可能已 commit)。
- **L3 并行的共享 barrel merge** + ghost-lease(crash 后任务不释放,无 TTL)+ 非 file-derivable step 的 done_signals 仍是 gap;贸然开并行会在 barrier 卡人。
- **本方案改的是 `~/.skills-manager` 下的 skill 源,不在本 repo**——按"文档可见性"教训,可审产物落 main(本文已落)。
