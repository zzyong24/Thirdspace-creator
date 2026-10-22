# T-1386 质量门提交与 main 合并

用户明确批准解决与远端 main 的冲突后普通推送；仅提交 tools/quality/**、verify.yml、根 package.json 三个质量门入口与 .gitignore 的 .quality/。其他未提交内容完整保全，必要时 include-untracked stash 并最终 pop，pop 冲突即停。本文及本任务控制面记录保留本地，不混入指定提交。

等待现有 s6-tests.sh（PID 30935），每三分钟检查，最多四十分钟；结束后生成并审核已知失败候选，区分环境缺失、确定断言漂移和疑似 flaky，不能掩盖真实回归，清单另提交。

通过 HTTPS fetch/merge，不 rebase。BACKLOG/PROJECT 沿本地归档结构保留双方内容；events 按时间排序并去重；内容雷达合并双方意图并保留测试。验证串行 6144 MiB 全工作区类型检查、雷达相关测试、quality 自测；reconcile 可运行则记录结果，无须修复全部旧债。

禁止 force push、跳过 hooks、绕过 T1246 PG 守卫或设置 T1332_APPROVED，不改 Git 或 Codex 配置。类型或冲突测试无法修复、hook 拦截即停。推送被远端新提交拒绝时再 fetch/merge，最多重试两次。


## 2026-10-22 剩余改动提交与推送授权

用户明确续授权：在 main / be1078891 上解决 stash pop 的 BACKLOG 冲突，逐文件审查全部恢复改动，按少量逻辑提交并普通推送到 main。本轮取代上文“仅质量门、控制面只留本地”的范围限制；原执行历史保留。

保留两侧任务内容，对重号 UI 任务使用 [明确映射](ui-fixes-2026-10-21/TASK_ID_MAPPING.md)，原 hash-chained 评审及历史事件不改。原 stash cb0b150ece750aa6652274c21b64f0623de74618 和原备份必须保留。备份、临时日志、node_modules、构建产物、.quality 与本机私人数据不提交，原文件或逐字节副本保全；只作必要忽略及隐私元数据清理。

验收：待提交内容 gitleaks 必须 0 发现；node --test tools/quality/quality.test.mjs、pnpm -s boundary；流程工具改动执行 reconcile --profile quick --read-only，错误/警告分别不得超过合并前 22/17。按逻辑中文提交并正常执行 hooks；HTTPS fetch 后如有新提交使用 merge，普通 push，最多重试 fetch+merge 两次。不得修改 Codex 配置、设置 T1332_APPROVED、绕过 T1246 或 drop stash。交付报告写到用户指定的仓库外 terminals/commit-rest/REPORT.md。


### 本轮提交前实际检查

- 初始 190 个文件逐项审查；177 个候选文件进入提交，20 个备份/临时文件原地忽略，3 个 tracked 增量逐字节保全后恢复 HEAD。
- 全部候选暂存内容 gitleaks 8.30.1：0 发现；分组提交前继续扫描各组。
- quality 15/15；boundary 退出 0，既有 5 条基线内违规、无新增；timeout-policy 回归退出 0。
- pmem sync 已运行。quick read-only 首轮 22 ERROR / 18 WARN，多出 UI 长行警告；完整原文保留于编号映射后压缩摘要，最终 22 ERROR / 17 WARN，与原基线逐条相同（只忽略行号/文件大小变化）。全局仍退出 1，未标全绿；完整 reconcile 未运行，旧收据与看板体积问题不属本轮修复。
- 引擎 manifest、规则包 hash、19 个脚本语法检查通过；384 条既有评审事件 hash-chain 验证 0 错误。已冻结 diff 中的一行空白是补丁上下文原字节，保留其证据哈希，不为 whitespace 检查重写。
