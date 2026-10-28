# T-1410 阶段清单日期与备注独立复核

日期：2026-10-25。评审者：`/root/t1427_pi_diagnosis`。本代理只读源码、当前控制面与已发生的验证证据；仅写本报告及对应正式 recheck JSON，不修改 manifest、SPEC、module/context 或审核事件。

**结论：当前已补齐的精确 SPEC 增量可通过独立复审，未发现新增规格 finding。** Root 可在正常录入本轮复审后，仅更新实际核对日期并向两处阶段 notes 追加事实。此结论不签 T-1427/1409/1410/1411 总完成，不改变发布状态。

## 审核绑定与范围纠正

- 当前 SPEC：`docs/features/t1410-review-evidence-reconciliation.md`，SHA-256 `3974e24a2b44bfef0c13c87cb780c85aba445611ac081dafa6c3aeb9c7d9a28f`。
- 原 round 2 SPEC：`1c4648100566b258456675893a2854be513e1676d82e6430ff68de0bfc44327d`。本轮真实运行 `reviewctl.mjs context T-1410`，唯一变更锚为 `SPEC-LINE:27:f68765f60b9a83e2`，previous verdict 为 PASS，完整原 findings 为空。移除本轮新增段后，当前全文哈希精确恢复原值。
- 宪法：`docs/产品定位.md`，SHA-256 `86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800`。适用要求为 §0 不把愿景写成完成、P-03 真实日期/结果、§13 发布问题须有实际闭环证据。
- 修改前 manifest：`orchestrator/ARTIFACT_MANIFEST.yaml`，SHA-256 `2a38cc98883223f399781b8966c85efd846b2cbc183060022c5a98a68b535814`。
- 当前 task packet SHA-256：`d1e319910798223f27dfce87ed8b2bcc90e1cc9d07402118e332e5401e038f8f`。

原 SPEC §写集只有“正常DEC/review-events/任务事件/progress/module/context”，没有“阶段”或 manifest，不能将它解释为已经显式授权该路径。本轮 Root 已补明确条款，并同步 module/context 的精确写集。现新增条款只允许 `project.updated_at` 与 `4-build`、`5-ship` 的 notes，禁止更改 stage/gate 状态、confirmation、风险接受或历史；该遗漏已在执行前补正。旧 cycle 与 round 2 空 findings 保留，本轮正常 recheck，不需要新 cycle。

## 已核实的阶段与错误事实

逐项读取了全部 43 个 stage 的状态、gate、gate_status、confirmation，另读取当前阶段、旧 notes、consistency_gate、open_items 与局部 change 条目。没有重新运行 43 项旧产品验收，也没有替它们签当前 PASS。

| 对象 | 当前事实及本轮应保留内容 |
| --- | --- |
| `current_stage/frontier` | 均为 `4-build`；不改变 |
| `1-plan/2-contract/3-design` | 已有 passed/pass 映射及历史说明；不把当前局部修复附会为它们的新验收 |
| `4-build` | draft/not-run；保持原 gate、confirmation_required=false |
| `5-ship` | draft/not-run；保持原 gate、confirmation_required=true |
| `consistency_gate` | fail，blocks `5-ship` 与 `17-integration-release`；原原因与记录保留 |
| T-517 合同 | `T-517-2-contract` invalidated/fail，旧三轮 FAIL 与另建最小合同要求保留 |
| T-537 | plan/contract 均 blocked/fail，第二个有效登录态 RAT-537-01 尚无新关闭证据 |
| 旧 open / change 记录 | OPEN-001/002/004/006、旧 T1003/T1274/T1296 以及原 notes 中失败、未知、Windows/跨系统条件不由本次修改清除 |

独立实际运行 `node orchestrator/process/reconcile.mjs --profile quick --read-only`：exit **1**，**1 ERROR / 13 WARN**。唯一 ERROR 为 `updated_at=2026-10-19` 早于最新 DEC `2026-10-25`。命令明确 full 未执行，不能把 quick 的覆盖范围扩大。`reconcile.mjs:755–767` 确认日期检查要求重新核对阶段，而非签署阶段完成。

看板压缩事实必须单列：当前 **58,866 bytes**，原 apply 记录为 **98,343 → 58,866**；`review-audit-final.txt` 已 PASS，但 `backlog-health-applied.json` 仍为 **errors=1 / exit_code=1 / 12 WARN**，含 30 KiB 上限和 162 条状态文字矛盾。`reconcile.mjs:621–639` 将 health 的 exit 1 投影为 WARN，只有 RUNAWAY exit 2 才上升为 ERROR。因此日期修正后 quick 可能零 ERROR，不意味着 health 全绿。FR-141003 要求保持开放任务及原状态；不得为消掉警告擅改这些状态、删开放项或提高阈值。

## 两处 notes 的具体建议

保留原 notes 内容，在其后以“2026-10-25 本次核对”另起追加文本。原 44ERROR、旧安装与失败历史不能覆盖或删除；新文本明确区分历史数字与本次结果。

`4-build` 追加内容应包含：T1427 组诊断入口修复已在安装版回读成功；T1428 泛402安全诊断与明确额度分类已具本地红绿及安装回执，仍不证明服务恢复；T1410 review receipt/event chain 审计通过，已机械压缩但 health 的剩余硬限/历史矛盾保留；T1411 鉴权传递真实IPC/HTTP红绿共83项、类型/超时/边界与独立代码复核通过，尚待后续提交/打包安装。BUILD 继续 draft。证据指向：

- `docs/verification/t1427/local-package/installed-retest-report.md`
- `docs/verification/t1428/implementation-report.md` 与 `independent-code-review.json`
- `docs/verification/t1410/review-audit-final.txt`、`backlog-health-applied.json`、`backlog-preview-20261025-apply/apply-receipt.json`
- `docs/verification/t1411/implementation-report.md`、`verification-results.json`、`independent-code-review.md`

`5-ship` 追加内容应包含：源码 `778ea4559850b0d8dfbf279c312dc4c21d72866e` 已本机安装，default 最小探针成功；新完整官方 Pi 首轮仍 `waiting_user / CHANNEL_MODEL_PAYMENT_REQUIRED`，未得到正常 assistant 回复，记忆/工具轮未执行，原任务最后一次恢复预算保留；`copilot.assist` 连接测试返回不支持，不能记作模型成功。T1411 尚未在安装版验收，T1427 的全部源码/安装/UI/跨系统条件继续按原任务跟踪。SHIP 继续 draft，不签全平台发布、官方Pi恢复或可推送。

日期值使用本轮真实核对日 `2026-10-25`，不回填到旧失败发生日，不取未来日期。不得改 `reconciliation.date` 等历史字段。

## 变更后的机械复验建议

Root 应保存修改前 manifest 哈希，核对解析后的差异严格只有：`project.updated_at`、`stages.4-build.notes`、`stages.5-ship.notes`；两处 notes 应以原文本为前缀。43 个 stage 的状态/gate/confirmation、artifacts、旧开放项、consistency_gate、局部 change 记录均应相同。再运行正常 pmem sync、quick reconcile 和 diff-check，保留新的实际输出；若独立 backlog-health 仍非零，原样登记，不能写成“所有 Gate 全绿”。

正式复审包为 `spec-review-manifest-delta.json`，`schema=spec-review-round/v2`、`review_kind=recheck`、`findings=[]`。本报告评估本轮精确修改合同，不替代修改后的 diff 核验，也不把当前官方 Pi 的 402 改写为已解决。
