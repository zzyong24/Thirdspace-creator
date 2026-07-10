# AGENTS.md — 新会话入口(先读这个)

任何 Agent / 新会话开始前,按顺序做三件事:

1. **读 [PROJECT.md](PROJECT.md)** —— 项目是什么、当前架构、重构进度、欠哪些任务。它由 `pmem sync` 生成,始终最新。
2. **看欠债**:`node orchestrator/process/pmem.mjs tasks` —— 当前 open/wip/blocked 任务。
3. **守规矩**:改代码前读 [orchestrator/SYSTEM_ARCHITECTURE.md](orchestrator/SYSTEM_ARCHITECTURE.md)(房子图纸)。物理边界由门卫执行,违规会被拦。

## 干完一个重大任务后(收尾必做)

```bash
node orchestrator/process/pmem.mjs set <T-id> done      # 更新任务台账
node orchestrator/process/pmem.mjs sync                  # 刷新 PROJECT.md + codegraph + 门卫 + 盖 SHA
node orchestrator/process/reconcile.mjs                  # 跑对账 + 教训守卫(含门卫 LED-003)
```

## 硬规矩(踩过的坑,别再踩)

- **严禁假按钮**:UI 控件要么真实有效,要么删掉。
- **前后端分离**:后端业务模块不准放 `frontend/`;AI/Agent SDK 只准在 worker/ai-runtime;worker 写库经 backend service port,不直连 PG。(门卫 LED-003 执行)
- **AI 不直接写库**:只产候选,用户采纳后由 backend service 落库。
- **大白话 + 配图**:给人看的设计/解释,必须有人能懂的版本 + 一张图,不只堆术语。
- **诚实置 0**:数据缺就显示真实的 0 / 空,绝不编。
- 语言:面向用户一律中文;代码标识符/路径/命令/ID 保留英文。

## 教训账本

`orchestrator/LESSON_LEDGER.md`(LED-*)记「踩了什么坑 + 防复发的可执行规则」。能写成命令的坑都登记进 `reconcile.config.json` 的 `lessons[]`,每次 reconcile 重跑。

## Imported Claude Cowork project instructions
