# 无人值守执行适配器

这里的 `run.sh` 使用 `claude -p` 串行运行任务，依赖 Claude CLI；它不会启动 GPT-6 Astra。Codex 主会话使用相同任务/验证协议时，按当前宿主能力执行，不把 Claude 参数直接套给 Codex。

## 运行前

目标项目需要已初始化的 `orchestrator/process/`、有效的模块与进度配置、明确范围和自治授权。L2 及以上必须通过自治预检；仅确认产品方案并不会自动启动循环。

检查 `settings.autonomous.json` 的命令、路径和权限是否适配项目。它包含具体技术栈的默认项，不能视为所有工程通用的安全配置。然后在目标项目运行：

```bash
node orchestrator/process/reconcile.mjs
node orchestrator/process/progress.mjs next
bash orchestrator/process/harness/run.sh
```

不要为了通过预检删除失败检查或伪造完成记录。验证命令以项目声明为准。

## 循环实际做什么

任务领取、实现、`verify-task.sh` 验证、记录提交与状态，然后领取下一个可执行任务。跨会话状态来自 Git、清单与 `progress.json`。连续不前进、验证超出修复预算、缺失必要条件或达到运行上限时停止。

`buildout` 只运行实现、验证和实际验收；`maintenance` 才在配置间隔及结束前调用 `evaluator.md` 和 `evaluator-rebuttal.md`。两个角色均只读。只有两轮都通过且不是高影响功能时，运行器调用 `progress.mjs verify` 写入 `e2e_verified`。未知、失败或缺失结论均不通过。高影响功能需要用户处理，双重通过不代替发布授权。

| 环境变量 | 默认值与含义 |
| --- | --- |
| `HARNESS_MAX_ITERS` | 60，最大循环次数 |
| `HARNESS_MAX_TURNS` | 50，每次 CLI 调用回合上限 |
| `HARNESS_MAX_REPAIR` | 2，验证失败后的修复预算 |
| `HARNESS_ONLY_STEP` | 空，可限制执行步骤 |
| `EVALUATOR_EVERY_N` | 4，仅维护模式生效 |
| `CODER_MODEL` / `EVALUATOR_MODEL` / `REBUTTAL_MODEL` | 未设置时各角色使用 Claude CLI 默认模型；设置不同值才能实际选择不同模型 |
| `HARNESS_HIGH_BLAST` | 逗号分隔的高影响功能 ID，也可在模块配置中声明 |
| `HARNESS_RUN_ID` | 可选，用于关联运行事件 |

退出码：`0` 表示本轮所需工作与检查完成；`1` 表示被检查或失败阻止；`2` 表示达到指定步骤或次数上限，不能当成完成。

## 文件职责

- `coding-agent.md`：单个任务的实现协议。
- `verify-task.sh`：新行为与回归验证。
- `evaluator.md`、`evaluator-rebuttal.md`：维护模式的两轮只读结论。
- `run.sh`：调度、记录和结论汇总，唯一自动验收写入者。
- `settings.autonomous.json`、`risk-hook.sh`：当前适配器的权限与操作检查。
- `PARALLEL.md`：宿主原生并行的入口；`run.sh` 本身仍是串行。

模型评审补充可执行验证，不能保证发现所有问题。发布、部署和推送按具体用户授权处理；当前授权已覆盖时不重复索要批准。
