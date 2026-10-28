# T-1410 对账结果

本任务完成的是历史审核证据修复与看板机械整理；不代表旧产品重新验收、官方 Pi 恢复、全局工程健康或可推送。

16 处错配 snapshot 已在前一提交 `778ea4559` 保全外链原件后按 canonical event 恢复，T-652 通过原迁移命令分离共享 snapshot。随后按本轮用户授权和正式独评，20 项旧链各消费一次精确绑定的 review-cycle capability；T-1072-owned-devices 另建新身份初审。原 finding、原 event 前缀与已消费 nonce 均保留，过程见 `root-serial-record.plan.json`、`serial-record-execution/` 及 `reviews/`。

T-858 的旧竖屏人物断言已按用户既定 T-902/DEC-VIDEO-056 标明适用关系，保留历史原文；T-703 的旧写入口表格已对齐同节确认合同。修改后独立复审分别得到 `2798870c87f4`、`7146b662ddb2`。21 项原审核对账问题均有实际审核和 receipt，`reviewctl audit` exit 0。

主看板机械整理从 98,343 压缩至 58,866 字节，6 项确有完成事件且身份匹配的行通过原归档器迁移。其余 322 个七列任务的原说明完整进入详情，78 个暂停表行逐字保留，ID/顺序/任务名/状态/审核/验收/文档链接目标守恒。执行后另登记 T-1412，故后续字节数稍增；没有恢复旧快照覆盖新任务。应用前后记录见 `backlog-preview-20261025-apply/conservation.json`、`apply-receipt.json`。

阶段日期与追加说明经过正式增量独评 `568fd798a094` 后同步；所有 stage、gate、confirmation、旧风险与阻塞保持原值，核对收据为 `manifest-update-receipt.json`。不是只改日期伪造整体 PASS。

实际已运行 `reviewctl.test.mjs`（exit 0）、`reviewctl audit`（exit 0）、`backlog-health`（exit 1）、`pmem sync`（exit 0）和 quick reconcile；各原日志保留。最终 quick 结果以 `reconcile-quick-after-manifest.log` 为准，不以此文替代工具结果。

看板仍超过 30KiB，`backlog-health` 自身保留 1 ERROR、12 WARN，包括 162 个原状态文字矛盾和历史撞号；现有 reconcile 将该级别映射为 WARN。本次只解除 60KiB RUNAWAY，不抬阈值、不擅改旧任务状态，不称看板全绿。适用 full 检查另发现预算配置、旧端口守卫和测试隔离问题，由 T-1412 继续；这里只跑了 quick，未冒称 full 通过。官方聊天、安装及标准 UI 验收仍由 T-1427 承担。
