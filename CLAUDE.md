# CreatorOS 项目约定

## 语言(最高优先级)

**永远使用中文回答。** 任何情况下都不要用英文回复用户——所有面向用户的说明、解释、总结、追问一律中文。

例外(保持原文、不翻译):代码标识符、文件/路径名、命令、URL、schema/字段名、枚举/状态值、commit message、第三方库名、API 名。这些保留英文,但围绕它们的叙述用中文。

## 任务流程铁律(强制,SessionStart hook 会注入看板)

**单一执行真相 = `BACKLOG.md`(repo 根)。** 它是必读的任务队列看板,优先于"用户最后一句话"。

1. **需求即任务**:用户一提新需求/想法 → **立即在 `BACKLOG.md` 新建一条任务**(状态 📋,引用对应 SPEC),不靠记忆、不靠上下文。否则需求会丢(曾因此丢掉"任务调度系统")。
2. **状态强制更新**:开工把任务改 🔨 进行中;完成改 ✅ 并提交。每次状态变更都落到 `BACKLOG.md`。
3. **开工从看板顶取**,按既定顺序,不是从对话最新一句临时起意。
4. **严禁 P0/P1 分级,严禁多阶段执行(V0.1/V0.2/"第一阶段")。** 任务一旦定义清楚,就**一次从 0 到 1 做完**;需要规模时**直接起 Workflow 或并行 subagent**,不准把范围切成阶段做减法。
5. **读取顺序**:`BACKLOG.md` → 任务引用的 SPEC(`docs/superpowers/specs/`)→ 代码。设计落 SPEC,执行总账落 BACKLOG,二者不混。
6. **不写 writing-plans 式重计划**:SPEC 已足够落地;真正缺的是任务进队列。别再产出 task 级详细计划文档。
7. **宪法**:产品定位单一真值在 [docs/产品定位.md](docs/产品定位.md)。所有 SPEC / 实现对照它判"是否合定位"。改方向/架构/数据归属的 SPEC,**过审(spec-review gate,verdict≠FAIL)才准开工**(reviewer 见 orchestrator `prompts/spec-reviewer.md`,预设 MiniMax)。
8. **SPEC → 拆 Task → 过审 → 开工(不可跳步,hook 强制)**:写完一份 SPEC,**下一步必须立即把它拆成 BACKLOG 任务**(每切片一条,状态 📋,引用该 SPEC)——这一步**不靠记忆**,由 PostToolUse hook(`.claude/hooks/spec-decompose-gate.sh`,写 SPEC 即注入提醒)兜底。**SPEC 不是执行总账**;没拆 Task 进 BACKLOG = 需求没进队列 = 会丢/会直接乱开工。顺序:写 SPEC → 拆 Task 进 BACKLOG → (改架构的)过 gate → 从看板开工。**未拆 Task / 未过审,不准写实现代码。**

## 执行策略(场景 → 战术;hook 会注入)

- **只要结论、不要文件堆 → SubAgent**(它替你扛大上下文 = 天然压缩)。宽搜/调研/多视角审都走子代理。
- **并行且会改重叠文件 → worktree 隔离**(防冲突);只读并行不用 worktree。
- **检索代码一律优先 codegraph CLI(默认手段,非可选)**:找符号定义/调用链/影响面 → `codegraph query <sym> -j` / `codegraph callers <sym>` / `codegraph impact <sym>`(本仓 `.codegraph/` 已建索引,11k+ nodes)。**grep/ripgrep 只在 codegraph 够不到时兜底**——字面量、注释、配置值、跨文件字符串;**别用 grep 找符号定义/调用关系**(那是 codegraph 的活,grep 会漏会慢)。规范:orchestrator `rules/code-retrieval-rules.md`。
- **任务边界(做完一个 BACKLOG 项)→ checkpoint 进看板/记忆 + 压缩 + `codegraph index --force` 重建索引**(禁用 `sync`:增量检测不可靠会谎报最新;重建后用本次新建符号 `query` 验证),下个任务起步干净。
- 单线程小改不开子代理/worktree(有成本)。硬门用 hook 强制,战术选择是清晰触发下的判断。
