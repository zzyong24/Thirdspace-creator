# T-923 持续执行交付记录

## 已落地

- 新主聊天真正由 Pi 运行工具循环；移除新任务 SDK 步数/重复工具强制收尾，旧冻结任务保留原协议恢复。
- 统一 continuous 预算、空总 deadline、恢复次数策略，贯通 enqueue/prepare、ledger、supervisor、worker、lease 和 outcome；记录真实累计消费，显式用户限制仍有效。
- 主聊天长度/空回复自动续接，自主 Pi length 同会话继续；已确认工具错误交回模型。主聊天与自主 Pi 单次 180 秒无事件检测逐事件刷新。
- 原始用户意图/近期完整工具回合上下文窗口，完整账本不裁剪；宿主和 Worker 同一 canonical 窗口计量。
- 雷达选题拆解/选题持续格式修复、空改写稿自动继续；修复旧阶段检查点回放被最新调用校验拒绝。
- 所有业务方法的公共交付自检明确回到本轮意图；引擎元数据和 length 工具回执投影同步 Pi。

## 实际证据

独立 SPEC 评审：continuous_budget PASS。独立代码复核：continuous_budget、chat_pi_execution；发现的引擎元数据、length 工具投影、空回复、窗口 canonical 计量、单次 idle、检查点回放阻断已修复。最终纯空白正文判空补 trim。

已集成提交：36d61973（持续预算）、3fada816（主聊天 Pi）、f04fa676（聊天上下文与无进展检测）。剩余接线与文档提交见本文件所在版本。

类型检查：pnpm -C frontend exec tsc --noEmit --pretty false，2026-09-08 本轮退出码 0（/tmp/t923-types-final2.log 为空）。git diff --check 无错误。

业务测试、真实模型/浏览器、安装包、全局 reconcile 均未执行，沿用用户授权，accepted-risk。没有操作用户业务数据或参考工程。

## 实际边界

本轮完成 T-923 代码交付，不代表 T-915 全项目完成。新策略只用于新冻结任务，旧包不会自动获得源码修改。script_candidate 短节点仍使用原格式修复策略；普通 stop 依赖 Skill 自检，未增加独立交付判断模型；历史窗口不是模型摘要，超大单条输入仍可能超容量。未知回执、权限/凭据、内容过滤及用户取消仍可暂停/结束。没有宣称所有失败无限自动恢复，也没有证明 AI 延迟或业务成功率已改善。
