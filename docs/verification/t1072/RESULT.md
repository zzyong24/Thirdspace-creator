# T-1072 全局提交钩子修复

只替换本机 `~/.config/git/hooks/commit-msg`；全局 core.hooksPath 与两份 Git LFS、ThirdSpace post-commit 钩子保持原字节/权限/归属。备份在 `/Users/zyongzhu/.config/git/t1072-0mqy07ml/backup`。

旧脚本实际35失败/3通过，新脚本相同38例全部通过；测试覆盖真实Git提交与配置分发边界，工具夹具不代签供应商。官方Lefthook2.1.4发布校验和验证后仅在临时中性仓库执行，成功Git返回0，子检查失败阻断Git/保持HEAD，空格参数及消息读回、钩子未被自动重装；未装入PATH或项目依赖。独立候选复核PASS，仅准单文件替换。

新全局脚本已实际安装并通过本仓直接调用0/无输出；本仓真实提交、pmem sync/reconcile及最终任务收尾待本记录后执行。原错误与门卫注册纠正保留在result.json，不声称全仓通过或修改客户端。
