# 本地合并与推送准备

2026-10-25。**本地整合与安装复验已完成；未推送，不是完整发布 GO。**

已普通整合远端、原本地主干、无感许可、现安装修复与本次对话修复，本地 `main` 包含最终安装候选 `6daaf71d4d3afe8d5bfa5801cffff7c9b9b345bb`。已合入远端最新 `a33cbbc1f` Windows Pi 核心依赖修复；最终包两条引擎各三轮补测通过。后续只追加验收与状态工件，产品文件继续绑定该安装候选。提交清单保存在 `commits-to-push.txt`，完整文件差异保存在 `merge-diff-files.txt`。

推送前必须重新核对：远端 main 是否继续前进、没有未提交或未合并内容、普通 hooks 与 Git LFS 可用、相关检查与最终接受范围一致。当前已确认的历史源及待处理项不能被省略：

- 官方来源配 Pi 的新任务 `ai-task-5e73167d-401` 停在 `http_402 / waiting_user`，不能按“全部模型可用”推送说明；未核实真实钱包原因。
- 全局 quick/read-only reconcile 仍有 22 ERROR、17 WARN，完整 full/release gate 未执行；本轮不绕过 T-1246、设置 T1332_APPROVED 或用 `--no-verify`。
- 旧来源的视频号报表、自动恢复和部分性能未闭环。本次只保留其已有修复，不替它们签 PASS。
- gitleaks 原 32 命中已证明为合成测试材料，但原扫描结果仍为 exit1；分类证据和生成链均保留，未设置全局忽略。

在明确的后续推送授权下，再经正常 Git 流程执行推送。此次没有创建 tag、GitHub Release、PR，没有触发正式双平台构建或生产放量。当前安装包为本地 ad-hoc 包，没有 Apple 公证声明。

任务状态保持真实：`taskctl complete T-1407` 实际拒绝了普通 CLI 报告，原因是验收列“待验”要求 `frontend-validation` UI 旅程 JSON；本轮没有这份标准 UI 证据，没有伪造或降低验收。已用 taskctl 将 T-1407 标为阻塞，安装和本地合并的实际完成事实、CLI 成功/失败结果仍照实保留。T-1405 因官方 Pi 原任务 HTTP 402 未解决也保持阻塞。
