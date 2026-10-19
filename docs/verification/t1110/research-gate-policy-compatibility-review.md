# T-1110 研究门与任务状态入口兼容审查

结论：先通过 taskctl 暂停、如实登记研究 OPEN 是兼容用户规则的必要收缩，不是绕过研究门。但比“双手工事件”更窄的现存合法路径是：**taskctl block → v2 研究卡 → 仅以真实 actor 登记 research_open → 实际运行官方 observe 的已 OPEN 分支 → 官方 audit**。该分支不会改任务状态，观测与证据 SHA 由官方程序实际登记；无需改生产、门卫或冒称执行。

本次只读共享树；除本报告外仅在独立 `/tmp` 合成目录验证流程，随后整个合成目录删除。没有修改真实 BACKLOG、研究卡、事件链或浏览器。评审模式 homogeneous inherited，不签研究已验证、真人结果或 T-1110 PASS。

## 已核实的冲突和可用分支

项目用户规则将真实任务状态写入口限定为 taskctl。当前 [技能 SKILL.md](/Users/zyongzhu/.codex/skills/product-to-code-orchestrator/SKILL.md) 对应 [Research Gate 04](/Users/zyongzhu/.codex/skills/product-to-code-orchestrator/gates/04-research-first-gate.md) 要求：

> 触发后原任务转 `⏸️`，暂停四类行为：继续改生产实现、扩大 workaround、重复全量运行、不可逆操作。

研究卡及只读取证/卡内最多两次区分实验仍允许。本轮已有用户状态规则优先，不能为执行技能 CLI 再调用另一程序直接改 BACKLOG。

实际 `research-gate.mjs:317–333` 先追加 research_observation；只有没有 active research_open 时才调用 `setTaskStatus(📋|🔨→⏸️)`。因此“已暂停且尚无 OPEN”直接 observe 会先留下 observation，再因状态不匹配失败，确实不适合 root 最初顺序；但**已有 OPEN 的已暂停任务不被该分支拒绝**。官方 observe 在这种情况下记录观测、返回 RESEARCH_REQUIRED/exit 2，不改 BACKLOG。这提供了更少手工面的兼容入口。

没有查到 open-only/register CLI 或通用 orchestrator events append CLI；run-events.mjs 属 RUN_EVENTS.jsonl 的另一协议，不应用它登记研究控制事件。当前 `auditResearchGates` 接受真实 actor 的 OPEN，并要求原任务仍暂停、research task 行存在、研究卡 v2 可解析；没有要求两 task ID 必须不同。同任务引用也有项目既有 T-915/T-1062 等记录，不必为本次另造任务状态权。

## 最小执行顺序

1. `taskctl block T-1110 --reason` 写真实重复失败事实和证据；若已经暂停，复用该真实状态及事件，不重复 block。写卡为 researching，`task_id` 与 `research_task_id` 都可为 T-1110，族与 trigger 保持稳定，明确四类暂停及最多 240 分钟/2 个实验。重复 SECTION_MISSING 不等于已证明底层根因，不预填 validated/PASS。
2. root 串行、使用既有 `acquireStateLock` 保护首次登记临界区。重读真实任务已暂停、同任务尚无 active OPEN、卡的 task IDs/family/trigger 与实际证据一致，再 append-only 追加 `research_open`。actor 使用实际 `codex-policy-compatible-registration`，明确“本事件为 Codex 按用户状态入口规则登记，BACKLOG 已由 taskctl block；尚未调用 observe”。至少保 task/research_task/card/failure_family/trigger_kind；可附真实卡及 block 证据摘要，不冒用 research-gate actor 或修改既往事件。
3. 实际运行 `research-gate.mjs observe T-1110 --family ... --trigger repeated-failure-family --evidence ... --research-task T-1110 --card ...`，先确保仍有上述 active OPEN。这一次必须如实写“已实际调用 observe 的 existing-OPEN 分支，未改状态”，官方新增 observation 的 actor 才是 research-gate。正常 exit 2 表示要求继续暂停，不是异常执行失败或 PASS。不要为了排序删改 OPEN；OPEN 先记录、observation 后记录是该兼容方案的真实顺序。
4. 运行只读 `research-gate.mjs audit`，保实际输出及 exit。审计通过只代表有效暂停/卡存在与可解析，不代表完整研究卡、实验、验收命令或恢复准入已闭合。

如果 root 已按原方案落下两个真实自有 actor 的事件，也无需重写历史或换 actor；该方案在证据/hash/lineage 与暂停全部真实时仍是诚实兼容路径。只是手工面更大，不应再补造“CLI observe 已执行”的记录或把重复登记等同新增平台实验。

## 独立合成验证

直接调用当前项目原版 research-gate.mjs，仅 `--root` 指向独立 `/tmp` 目录：合成任务 T-90001 已暂停、v2 卡正在 researching、先有 fixture-registration 的 OPEN。结果：

- 官方 observe 实际 exit **2**，BACKLOG SHA 前后完全一致。
- 事件只有先 research_open、后官方 research_observation；后者 actor 为 research-gate，失败证据 SHA 与文件实际摘要一致。
- 官方 audit 实际 exit **0**，输出“研究门有效暂停: T-90001”。

这验证了现存分支可用，没有注册真实 T-1110，也没有代签它的审计。

## 恢复限制

本审查只批准兼容 OPEN 登记，不批准人工关闭研究门。当前 `research-gate resume` 也直接改状态，存在同类入口冲突；而现存 taskctl resume 会拒绝未关闭的 OPEN，不能拿它绕过研究验收。未来恢复仍须真实 validated 卡、现场 verify_key 命令及必要 Decision；应处理合法状态入口兼容后恢复，不能手工 research_resume 或审计成功冒充研究闭合。当前应保持任务暂停与原失败事实。
