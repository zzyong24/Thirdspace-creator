# 可执行过程层

这里提供通用机制，项目配置由初始化工具生成；不要把某个项目的配置提交回脚手架。文档定义意图，脚本核对可机械判断的事实。

## 按任务查工具

| 工具 | 职责 |
| --- | --- |
| `context-plan.mjs` | 输出当前阶段/任务需要读取的路径，不内联整套规则 |
| `context-compile.mjs` | 派发、并行、自治时生成有边界的任务上下文 |
| `rule-bundle.mjs` | 安装、固定、校验项目规则与所需材料；与运行时基线分开保护 |
| `project-doctor.mjs` | 只读诊断规则、宿主钩子、入口引用与本地 CI 的迁移缺口 |
| `reconcile.mjs` | 检查清单与 Git/文件事实、状态漂移和已启用的校验 |
| `taskctl.mjs` | 看板状态、任务事件与验收收据的正常写入入口 |
| `progress.mjs` | 模块步骤、依赖、领取、完成及并行候选集合 |
| `delivery-phase.mjs` | 用户决定后由建设单向切换到维护 |
| `frontend-validation.mjs` | 页面旅程、真实文本、提交、契约与观察路径绑定 |
| `reviewctl.mjs` | 维护模式规格评审的稳定问题、有限复核与收据 |
| `research-gate.mjs` | 按实际不确定性暂停相关任务，用有界证据恢复 |
| `governance-guard.mjs` | 任务及文件哈希绑定的范围、复杂度与威胁授权 |
| `autonomy-guard.mjs` | 自治预检、实际迭代变更量、推进监测与任务隔离 |
| `parallel-isolation.mjs` | 检查真实工作区、读写范围和待集成候选 |
| `state-lock.mjs` | 共享控制文件的写入互斥，不自动抢占遗留锁 |
| `orphan-scan.mjs` | 已启用编号登记与追踪矩阵的双向关联检查 |
| `program-gate.mjs` | 跨项目旅程、实际部署提交与新鲜验证证据 |
| `strict-receipts-migrate.mjs` | 旧项目收据策略显式迁移，不伪造过去验收 |
| `feature-sync.mjs` / `knowledge-drift.mjs` | 确定性生成契约事实与检测源哈希漂移 |
| `knowledge-coverage.mjs` / `docs-health.mjs` | 已启用知识层的覆盖和文档健康 |
| `harness/` | Claude CLI 串行适配器及宿主并行说明 |

状态和授权完整说明见 `../rules/orchestrator-state-machine.md`；运行器行为见 `harness/README.md`。其余命令按对应流程或 CLI 帮助查阅，不在本索引复制每个参数。

## 项目初始化与配置

用 `tools/init-project.sh` 明确指定 `--triage` 与 `--topology single|multi`，不要手工复制示例配置假装初始化完成。多项目还需要 `--program-id`；跨项目是否必要必须明确，缺少必需配置不代表可以跳过检查。

新项目为 `delivery_phase: buildout` 与 `receipt_policy: required`。收据是证据绑定，不等于必须正式评审。旧 `legacy` 策略可读但不能直接开工/完成；使用迁移工具，显式指定非界面任务，不能批量编造验收。

按需配置 `modules.config.json` 的真实任务、验证命令、读写范围和依赖。步骤依赖用 `step_depends_on`；中间完成记录提交但看板仍为 `🔨`，最终步骤才结束任务。`done_signals` 必须指向应用实际使用的代码和数据路径；自治模式不凭文件存在自动完成步骤。

历史欠账基线只隔离被绑定的任务或事件前缀，不授权新变化。新的哈希、事件、范围或租约仍需通过检查，不能使无关就绪任务承担全仓阻塞。

## 快速审计与完整验证

`reconcile --profile quick --read-only` 用于日常核对、初始化、更新和 CI 的治理步骤：保留阶段、收据、结构、范围与知识层检查，不执行项目任意 lesson shell、资产示例或跨项目 fresh verification，不写运行记录。输出会明确列出这些缺口，不能充当产品全量验证或发布通过证据。`--read-only` 也会约束 full，不能与 `--consolidate` / `--anti-check` 同用。

`reconcile --profile full` 执行已配置的完整检查；省略 profile 保持 full 兼容。任意 shell 可能访问网络、写用户配置、安装依赖或占用共享数据，须在项目实际允许的隔离环境运行。执行器的进程组清理用于终止本次检查，不是安全沙箱。检查保持串行，未证明独立性时不自动并行。

有可执行 lessons 时，在 `reconcile.config.json` 配置 `lesson_execution`：

| 字段 | 语义 |
| --- | --- |
| `minimum_timeout_ms` | 项目允许的正执行预算下限 |
| `default_timeout_ms` | 完整检查命令的默认执行预算；每条 lesson 可用 `timeout_ms` 覆盖 |
| `cleanup_grace_ms` / `settlement_margin_ms` | 终止宽限及结果结算余量，各默认 1000ms，按实际调用链调整 |
| `overall_timeout_ms` | 可省略，默认由全部串行执行、清理和结算预算计算；独立外部上限必须大于完整内部预算 |

数值以项目实测和约束为准，参考 `reconcile.config.example.json` 字段，不能把示例时长当产品标准。没有可执行 lessons 就不要求这份配置。缺失或过短预算会在执行前失败；执行期间逐项报告开始、耗时、退出与失败尾部。超时、取消、未结清子进程都不是 PASS。当前 shell 执行器只支持 POSIX 进程组，其他宿主明确报不支持。

## 更新与诊断

`init-project.sh --update` 分别检查引擎基线与规则包；项目修改过的受管内容保留并提供迁移候选。更新后的 `project-doctor` 不执行项目命令：error 表示确定断链，warning 表示迁移待办，unknown 表示静态诊断不能确认。它不会把新版本号当作旧宿主配置已迁移，也不会把本地 CI 文本当作远端 required check 已启用。

`--ci github` 是显式接入选项。已有 `.github/workflows/verify.yml` 不覆盖，按候选与当前项目命令合并。新项目默认仍只有两个核心 hook；旧 Stop/PostToolUse 可在核对定制后采用新的 quick 模板。

初始化中断后，不能仅凭 `process/` 存在就视为完成。重跑会先校验安装；缺失基线或固定规则包时停止，并给出可复制的 `--update` 命令。需要引擎 adoption 时，先核对独立候选及迁移清单，再采用已审核的清单；不要删除基线绕过保护。核心 hook 更新会保留原文，历史备份已存在时创建编号副本，定制行为仍需核对合并。

自治迭代 v2 收据用 `before_head..after_head` 的提交差异，加本轮工作区变化的文件并集计量；提交后不会归零，开始前已有且未变化的脏文件不计入本轮。此指标是文件变更范围，不是 PR 行数或返工率。v1 历史记录仍按原字段读取，不重写成新测量。

## 钩子的边界

新初始化默认只装会话入口和编辑前看板保护；是否装其他钩子以初始化脚本及交付阶段为准。Claude 与 Codex 配置是宿主适配，不保证每种写入方式都受拦截。直接 shell/IDE 写入可能绕过即时检查，任务工具和 `reconcile`/CI 才提供后续核验；观察器不能撤销已发生的操作。

普通产品项目仅复制运行时，源码测试留在 skill。修改本层后运行 `bash tools/selfcheck.sh`。
