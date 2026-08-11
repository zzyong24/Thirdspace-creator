# T-770 BUILD Gate — CreatorOS 低误触发元 Skill

> 结论：PASS（2026-08-11）。本任务未新增页面、按钮或视觉变化。

## 范围

- 新增代码随版、只读、不可账号覆盖的 `creatoros.guide@v1`。
- 仅在 `topics` / `project` 对话场景按需暴露短工具描述；正文只在真实工具调用后从本轮 effective snapshot 读取。
- 禁止未知、校准、定位、复盘和知识蒸馏场景取得该工具。
- 不接远程 prompt bundle，不写领域数据，不调用网络或副作用端口。

## 真实模型触发评测

- 固定模型：`MiniMax-M3`。
- 参数：`temperature=0`，`topics` surface 当前真实 39 个工具共同竞争。
- 数据集：`orchestrator/evals/T-770-creatoros-guide.json`（5 正例、10 反例）。
- 第一轮：13/15。漏触发“当前项目讲 CreatorOS”，误触发“其他内容创作系统”。证据：`T-770-creatoros-guide.round1.result.json`。
- 第二轮：13/15。上述两例修复，继续暴露两条 CreatorOS 创作/校对漏触发。证据：`T-770-creatoros-guide.round2.result.json`。
- 第三轮初次执行：前 4 例语义均正确，随后供应商临时 `529 overloaded`，未伪装成 PASS、未生成完整报告。
- 第三轮完整复跑：**15/15 PASS**。5 个正例均调用一次 `creatoros.guide`；10 个反例调用 0 次。CreatorOS 创作请求读取说明后仍继续调用现有创作工具。
- 最终证据：`orchestrator/evals/T-770-creatoros-guide.result.json`。
- 评测报告只保存工具名、模型名和 PASS/FAIL，不保存模型正文、密钥、token 或 baseUrl；模式扫描通过。

## 聚焦测试与类型

- `backend`: `chat-tools`、`chat-runner`、`effective-skill-snapshot`，3 files / 331 tests PASS。
- `frontend`: chat route + settings Skill 数据，2 files / 61 tests PASS。
- `ai-worker`: `creatoros-guide`，1 file / 2 tests PASS。
- `contract`、`ai-worker`、`backend`、`frontend` typecheck 全部 PASS。
- 修改文件 ESLint：0 error；仅 `persistence-client.ts:10399` 保留 1 条既有 `_ctx` warning。
- `git diff --check` PASS。

## 仓库门禁

- `boundary-scan`: 0 新增，保留基线 5 条。
- `semantic-boundary-scan`: PASS。
- `orphan-scan`: 0 error / 100 个历史 warning。
- `test-integrity`: 0 error / 1 个既有 coverage config warning。
- `lessonctl audit/context`: 完成；旧 lifecycle warning 如实保留。

## 安全清理

真实评测只读取正式数据库的临时文件副本，未连接或修改正式数据库。评测完成后，99 MB 临时副本已从 `/private/tmp` 移至 macOS 废纸篓：

`~/.Trash/creatoros-t770-eval.FivqYM-20260811T1358Z`

正式数据库和应用运行状态未改变。
