# 2026-07-25 已确认 Gate：CONTRACT / DESIGN 并发波次

## Wave 目标

把用户通过 `DEC-BATCH-20260725-004` 放行的三条线推进到各自下一个真实 Gate：

- T-501：PAGE SPEC 独立 Round 2 复审；
- T-518：一键问题反馈 SERVICE CONTRACT 初稿；
- T-519：知识工作区 SERVICE CONTRACT 初稿。

本波不进入 BUILD、不运行付费 provider、不触发桌面构建。T-517 由其他会话推进，本波只消费其
`runtime not ready → fail closed` 边界。

## write_set 推导与 lane

| Lane | 任务序列 | write_set | 依赖 | 合并顺序 |
|---|---|---|---|---|
| A | T-501 PAGE SPEC Round 2 独立复审 | `docs/superpowers/specs/2026-07-25-model-configuration-experience-redesign.page-spec.review.md` | T-501 CONTRACT Gate + 确认② | 1 |
| B | T-518 CONTRACT 作者 | `docs/superpowers/specs/2026-07-25-one-click-issue-feedback.contract.md` | T-518 PLAN accepted-risk | 2 |
| C | T-519 CONTRACT 作者 | `docs/superpowers/specs/2026-07-25-knowledge-workspace-folder-multiview.contract.md` | T-519 PLAN accepted-risk | 3 |

三条 write_set 互不相交。BACKLOG、manifest、DECISION_LOG、TRACEABILITY、CHANGE_IMPACT、
ID_REGISTRY 和任务审计文件全部 hoist 给主 Agent 串行集成，子 Agent 禁止触碰。

## Task Packets

- `orchestrator/context/T-501.md`
- `orchestrator/context/T-518.md`
- `orchestrator/context/T-519.md`

## External method 路由

- `superpowers:writing-plans`：当前宿主未安装，`reference-only`；本波只吸收“具体文件/契约/
  验证命令”纪律，正规化到 SERVICE CONTRACT/PAGE SPEC，不另建 writing-plans 文档。
- `spec-kit:plan`：上游仓指针，`reference-only`；用户未要求 clone，使用本地 CONTRACT workflow。
- `superpowers:verification-before-completion`：当前宿主未安装，`unavailable`；回退到本地
  Gate 05/06/12/15b、独立复审和 `reconcile`。
- `codex:gpt-image-2-ui-mock`：本会话内置 image generation 可直接使用，但只有 T-501 PAGE
  SPEC 复审通过后才可生成一张 overview；当前尚不调用。
- `stitch`：当前会话没有 `mcp__stitch__*`，`unavailable`；它只在 overview/逐屏人审后消费
  `DESIGN.md`，不阻塞本波 CONTRACT 与 PAGE SPEC Gate。

## 集成与停止线

1. 每条 lane 返回后，主 Agent 检查越界写入并运行该文件 `git diff --check`。
2. T-501 若复审通过，只生成一张 overview 供用户视觉确认③；不得把当前文字确认代替视觉确认。
3. T-518/T-519 初稿须由非作者独立复审，最多三轮；确认②前不得 BUILD。
4. 同一障碍失败两次即停止上报；不得通过换措辞无限重试。
5. 波次收尾运行 `pmem sync`、`reconcile`、orphan/boundary/diff 静态 Gate；不把既有范围外欠债
   伪写成当前任务失败或通过。
